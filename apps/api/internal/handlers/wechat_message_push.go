package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/pulsewatch/api/internal/services"
)

type WeChatMessagePushHandler struct {
	push *services.WeChatMessagePushService
}

func NewWeChatMessagePushHandler(push *services.WeChatMessagePushService) *WeChatMessagePushHandler {
	return &WeChatMessagePushHandler{push: push}
}

// WeChatMessagePush handles both GET (URL verification) and POST (message receive).
func (h *WeChatMessagePushHandler) Handle(c *gin.Context) {
	if !h.push.Configured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "wechat message push not configured"})
		return
	}

	switch c.Request.Method {
	case http.MethodGet:
		h.verifyURL(c)
	case http.MethodPost:
		h.receiveMessage(c)
	default:
		c.JSON(http.StatusMethodNotAllowed, gin.H{"error": "method not allowed"})
	}
}

// verifyURL handles the WeChat URL verification GET request.
// WeChat sends: signature, timestamp, nonce, echostr
// We verify signature, return echostr text if valid.
func (h *WeChatMessagePushHandler) verifyURL(c *gin.Context) {
	signature := c.Query("signature")
	timestamp := c.Query("timestamp")
	nonce := c.Query("nonce")
	echostr := c.Query("echostr")

	if signature == "" || timestamp == "" || nonce == "" || echostr == "" {
		c.String(http.StatusBadRequest, "missing parameters")
		return
	}

	if !h.push.VerifySignature(signature, timestamp, nonce) {
		c.String(http.StatusForbidden, "signature verification failed")
		return
	}

	// Return echostr as plain text
	c.String(http.StatusOK, echostr)
}

// receiveMessage handles WeChat message push POST.
// Supports plaintext mode, or encrypted (AES) with msg_signature check.
func (h *WeChatMessagePushHandler) receiveMessage(c *gin.Context) {
	timestamp := c.Query("timestamp")
	nonce := c.Query("nonce")
	msgSignature := c.Query("msg_signature")
	encryptType := c.Query("encrypt_type")

	body, err := io.ReadAll(io.LimitReader(c.Request.Body, 64*1024))
	if err != nil {
		c.String(http.StatusBadRequest, "read body error")
		return
	}

	var msg *services.WeChatMessageXML

	if encryptType == "aes" {
		// Encrypted mode (security mode)
		if msgSignature == "" {
			c.String(http.StatusBadRequest, "missing msg_signature")
			return
		}

		// Parse the envelope to get the Encrypt field
		envelope, err := services.ParseWeChatMessage(body)
		if err != nil || envelope.Encrypt == "" {
			c.String(http.StatusBadRequest, "invalid encrypted message")
			return
		}

		// Verify msg_signature
		if !h.push.VerifyMsgSignature(msgSignature, timestamp, nonce, envelope.Encrypt) {
			c.String(http.StatusForbidden, "msg signature verification failed")
			return
		}

		// Decrypt
		decrypted, err := h.push.AESDecrypt(envelope.Encrypt)
		if err != nil {
			c.String(http.StatusBadRequest, fmt.Sprintf("decrypt error: %s", err.Error()))
			return
		}

		// Parse inner message
		msg, err = services.ParseWeChatMessage(decrypted)
		if err != nil {
			c.String(http.StatusBadRequest, fmt.Sprintf("parse decrypted message error: %s", err.Error()))
			return
		}
	} else {
		// Plaintext or compatible mode
		msg, err = services.ParseWeChatMessage(body)
		if err != nil {
			c.String(http.StatusBadRequest, fmt.Sprintf("parse message error: %s", err.Error()))
			return
		}
	}

	// Process the message (async)
	go h.processMessage(msg)

	// Always respond success to WeChat
	respondFormat := c.Query("data_format")
	if strings.EqualFold(respondFormat, "json") || c.GetHeader("Content-Type") == "application/json" {
		c.JSON(http.StatusOK, gin.H{"code": 0})
	} else {
		c.String(http.StatusOK, "success")
	}
}

func (h *WeChatMessagePushHandler) processMessage(msg *services.WeChatMessageXML) {
	// Log the message for now
	msgType := msg.MsgType
	event := msg.Event
	fromUser := msg.FromUserName

	if data, err := json.Marshal(msg); err == nil {
		fmt.Printf("[wechat-push] type=%s event=%s from=%s body=%s\n", msgType, event, fromUser, string(data))
	}

	// @todo: handle different message types:
	// - text: customer service message from user
	// - event: subscribe_msg_popup, user_enter_tempsession, etc.
	// - miniprogrampage: card message from user

	switch msgType {
	case "event":
		h.handleEvent(msg)
	case "text":
		h.handleText(msg)
	}
}

func (h *WeChatMessagePushHandler) handleText(msg *services.WeChatMessageXML) {
	// Placeholder for future: reply to customer service messages
	_ = time.Now()
}

func (h *WeChatMessagePushHandler) handleEvent(msg *services.WeChatMessageXML) {
	switch msg.Event {
	case "user_enter_tempsession":
		// User entered customer service session
		_ = time.Now()
	case "subscribe_msg_popup":
		// Subscribe message popup event
		_ = time.Now()
	}
}
