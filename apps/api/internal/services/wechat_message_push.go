package services

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/pulsewatch/api/internal/config"
)

type WeChatMessagePushService struct {
	cfg *config.Config
}

func NewWeChatMessagePushService(cfg *config.Config) *WeChatMessagePushService {
	return &WeChatMessagePushService{cfg: cfg}
}

func (w *WeChatMessagePushService) Configured() bool {
	return w.cfg.WeChatMiniToken != ""
}

func (w *WeChatMessagePushService) Token() string {
	return w.cfg.WeChatMiniToken
}

func (w *WeChatMessagePushService) AESKey() []byte {
	if w.cfg.WeChatMiniAESKey == "" {
		return nil
	}
	raw, err := base64.StdEncoding.DecodeString(w.cfg.WeChatMiniAESKey + "=")
	if err != nil {
		return nil
	}
	return raw
}

// WeChatMessageXML represents the XML structure for WeChat message push
type WeChatMessageXML struct {
	XMLName      xml.Name `xml:"xml"`
	ToUserName   string   `xml:"ToUserName"`
	FromUserName string   `xml:"FromUserName"`
	CreateTime   int64    `xml:"CreateTime"`
	MsgType      string   `xml:"MsgType"`
	Content      string   `xml:"Content,omitempty"`
	MsgID        string   `xml:"MsgId,omitempty"`
	Event        string   `xml:"Event,omitempty"`
	EventKey     string   `xml:"EventKey,omitempty"`
	Encrypt      string   `xml:"Encrypt,omitempty"`
}

type WeChatMessageJSON struct {
	ToUserName   string `json:"ToUserName"`
	FromUserName string `json:"FromUserName"`
	CreateTime   int64  `json:"CreateTime"`
	MsgType      string `json:"MsgType"`
	Content      string `json:"Content,omitempty"`
	MsgID        string `json:"MsgId,omitempty"`
	Event        string `json:"Event,omitempty"`
	EventKey     string `json:"EventKey,omitempty"`
}

type WeChatEncryptRespJSON struct {
	Encrypt      string `json:"Encrypt"`
	MsgSignature string `json:"MsgSignature"`
	TimeStamp    int64  `json:"TimeStamp"`
	Nonce        string `json:"Nonce"`
}

type WeChatEncryptRespXML struct {
	XMLName      xml.Name `xml:"xml"`
	Encrypt      string   `xml:"Encrypt"`
	MsgSignature string   `xml:"MsgSignature"`
	TimeStamp    int64    `xml:"TimeStamp"`
	Nonce        string   `xml:"Nonce"`
}

func MakeWeChatSignature(token, timestamp, nonce string, extra ...string) string {
	parts := append([]string{token, timestamp, nonce}, extra...)
	sort.Strings(parts)
	joined := strings.Join(parts, "")
	h := sha1.New()
	h.Write([]byte(joined))
	return fmt.Sprintf("%x", h.Sum(nil))
}

func (w *WeChatMessagePushService) VerifySignature(signature, timestamp, nonce string) bool {
	if !w.Configured() {
		return false
	}
	expected := MakeWeChatSignature(w.cfg.WeChatMiniToken, timestamp, nonce)
	return expected == signature
}

func (w *WeChatMessagePushService) VerifyMsgSignature(msgSignature, timestamp, nonce, encrypt string) bool {
	if !w.Configured() {
		return false
	}
	expected := MakeWeChatSignature(w.cfg.WeChatMiniToken, timestamp, nonce, encrypt)
	return expected == msgSignature
}

func (w *WeChatMessagePushService) AESDecrypt(encryptData string) ([]byte, error) {
	key := w.AESKey()
	if key == nil {
		return nil, fmt.Errorf("aes key not configured")
	}

	ciphertext, err := base64.StdEncoding.DecodeString(encryptData)
	if err != nil {
		return nil, fmt.Errorf("base64 decode: %w", err)
	}

	block, err := aes.NewCipher(key[:32]) // AES-256 key is 32 bytes after base64 decode
	if err != nil {
		return nil, fmt.Errorf("aes new cipher: %w", err)
	}

	if len(ciphertext) < aes.BlockSize {
		return nil, fmt.Errorf("ciphertext too short")
	}

	iv := key[16:32] // AES key for IV is bytes 16-31
	mode := cipher.NewCBCDecrypter(block, iv)
	plaintext := make([]byte, len(ciphertext))
	mode.CryptBlocks(plaintext, ciphertext)

	// Remove PKCS#7 padding
	padding := int(plaintext[len(plaintext)-1])
	if padding > aes.BlockSize || padding == 0 {
		return nil, fmt.Errorf("invalid padding")
	}
	plaintext = plaintext[:len(plaintext)-padding]

	// Parse: random(16B) + msg_len(4B network byte order) + msg + appid
	if len(plaintext) < 20 {
		return nil, fmt.Errorf("plaintext too short")
	}
	msgLen := binary.BigEndian.Uint32(plaintext[16:20])
	if int(msgLen) > len(plaintext)-20 {
		return nil, fmt.Errorf("msg length exceeds plaintext")
	}
	msg := plaintext[20 : 20+msgLen]
	appID := string(plaintext[20+msgLen:])
	if appID != w.cfg.WeChatMiniAppID {
		return nil, fmt.Errorf("appid mismatch: got %s, want %s", appID, w.cfg.WeChatMiniAppID)
	}
	return msg, nil
}

func (w *WeChatMessagePushService) AESEncrypt(plaintext []byte) (string, error) {
	key := w.AESKey()
	if key == nil {
		return "", fmt.Errorf("aes key not configured")
	}

	// Build full string: random(16B) + msg_len(4B) + msg + appid
	random := make([]byte, 16)
	for i := range random {
		random[i] = byte(time.Now().UnixNano() >> (i * 3))
	}
	msgLen := make([]byte, 4)
	binary.BigEndian.PutUint32(msgLen, uint32(len(plaintext)))
	full := append(random, msgLen...)
	full = append(full, plaintext...)
	full = append(full, []byte(w.cfg.WeChatMiniAppID)...)

	// PKCS#7 padding
	blockSize := aes.BlockSize
	paddingLen := blockSize - len(full)%blockSize
	padding := make([]byte, paddingLen)
	for i := range padding {
		padding[i] = byte(paddingLen)
	}
	full = append(full, padding...)

	block, err := aes.NewCipher(key[:32])
	if err != nil {
		return "", fmt.Errorf("aes new cipher: %w", err)
	}

	iv := key[16:32]
	mode := cipher.NewCBCEncrypter(block, iv)
	ciphertext := make([]byte, len(full))
	mode.CryptBlocks(ciphertext, full)

	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

func (w *WeChatMessagePushService) BuildEncryptResp(msg []byte, nonce string) (*WeChatEncryptRespJSON, error) {
	encrypted, err := w.AESEncrypt(msg)
	if err != nil {
		return nil, err
	}
	ts := time.Now().Unix()
	msgSig := MakeWeChatSignature(w.cfg.WeChatMiniToken, fmt.Sprintf("%d", ts), nonce, encrypted)
	return &WeChatEncryptRespJSON{
		Encrypt:      encrypted,
		MsgSignature: msgSig,
		TimeStamp:    ts,
		Nonce:        nonce,
	}, nil
}

// ParseWeChatMessage tries JSON first, then XML
func ParseWeChatMessage(body []byte) (*WeChatMessageXML, error) {
	var msg WeChatMessageXML
	// Try JSON
	var jsonMsg WeChatMessageJSON
	if err := json.Unmarshal(body, &jsonMsg); err == nil && jsonMsg.MsgType != "" {
		msg.ToUserName = jsonMsg.ToUserName
		msg.FromUserName = jsonMsg.FromUserName
		msg.CreateTime = jsonMsg.CreateTime
		msg.MsgType = jsonMsg.MsgType
		msg.Content = jsonMsg.Content
		msg.MsgID = jsonMsg.MsgID
		msg.Event = jsonMsg.Event
		msg.EventKey = jsonMsg.EventKey
		return &msg, nil
	}
	// Try XML
	if err := xml.Unmarshal(body, &msg); err != nil {
		return nil, fmt.Errorf("unmarshal message: %w", err)
	}
	return &msg, nil
}
