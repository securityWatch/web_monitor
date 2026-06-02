package services

import (
	"encoding/json"
	"testing"

	"github.com/pulsewatch/api/internal/config"
)

func TestMakeWeChatSignature(t *testing.T) {
	// Example from WeChat docs: token="AAAAA", timestamp="1714036504", nonce="1514711492"
	// Sorted: ["1514711492", "1714036504", "AAAAA"] → joined "15147114921714036504AAAAA"
	// sha1: f464b24fc39322e44b38aa78f5edd27bd1441696
	sig := MakeWeChatSignature("AAAAA", "1714036504", "1514711492")
	expected := "f464b24fc39322e44b38aa78f5edd27bd1441696"
	if sig != expected {
		t.Fatalf("signature = %s, want %s", sig, expected)
	}
}

func TestMakeWeChatSignatureWithExtra(t *testing.T) {
	// With Encrypt field added
	token := "AAAAA"
	ts := "1714112445"
	nonce := "415670741"
	encrypt := "+qdx1OKCy+5JPCBFWw70tm0fJGb2Jmeia4FCB7kao+/Q5c/ohsOzQHi8khUOb05JCpj0JB4RvQMkUyus8TPxLKJGQqcvZqzDpVzazhZv6JsXUnnR8XGT740XgXZUXQ7vJVnAG+tE8NUd4yFyjPy7GgiaviNrlCTj+l5kdfMuFUPpRSrfMZuMcp3Fn2Pede2IuQrKEYwKSqFIZoNqJ4M8EajAsjLY2km32IIjdf8YL/P50F7mStwntrA2cPDrM1kb6mOcfBgRtWygb3VIYnSeOBrebufAlr7F9mFUPAJGj04="
	sig := MakeWeChatSignature(token, ts, nonce, encrypt)
	expected := "046e02f8204d34f8ba5fa3b1db94908f3df2e9b3"
	if sig != expected {
		t.Fatalf("signature = %s, want %s", sig, expected)
	}
}

func TestParseWeChatMessageJSON(t *testing.T) {
	input := `{"ToUserName":"gh_97417a04a28d","FromUserName":"o9AgO5Kd5ggOC-bXrbNODIiE3bGY","CreateTime":1714037059,"MsgType":"event","Event":"debug_demo","debug_str":"hello world"}`
	msg, err := ParseWeChatMessage([]byte(input))
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}
	if msg.MsgType != "event" {
		t.Fatalf("msgType = %s, want event", msg.MsgType)
	}
	if msg.FromUserName != "o9AgO5Kd5ggOC-bXrbNODIiE3bGY" {
		t.Fatalf("from = %s", msg.FromUserName)
	}
}

func TestParseWeChatMessageXML(t *testing.T) {
	input := `<xml><ToUserName><![CDATA[gh_xxx]]></ToUserName><FromUserName><![CDATA[oUser]]></FromUserName><CreateTime>1714037059</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[hello]]></Content><MsgId>12345</MsgId></xml>`
	msg, err := ParseWeChatMessage([]byte(input))
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}
	if msg.MsgType != "text" {
		t.Fatalf("msgType = %s, want text", msg.MsgType)
	}
	if msg.Content != "hello" {
		t.Fatalf("content = %s, want hello", msg.Content)
	}
}

func TestWeChatAESKeyParsing(t *testing.T) {
	svc := NewWeChatMessagePushService(&config.Config{
		WeChatMiniAESKey: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
	})
	key := svc.AESKey()
	if key == nil {
		t.Fatal("aes key should not be nil")
	}
	if len(key) != 32 {
		t.Fatalf("aes key length = %d, want 32", len(key))
	}
}

func TestWeChatConfigured(t *testing.T) {
	svc := NewWeChatMessagePushService(&config.Config{WeChatMiniToken: "mytoken"})
	if !svc.Configured() {
		t.Fatal("should be configured")
	}
	svc2 := NewWeChatMessagePushService(&config.Config{})
	if svc2.Configured() {
		t.Fatal("should not be configured")
	}
}

func TestWeChatMessageJSONSerialization(t *testing.T) {
	msg := WeChatMessageJSON{
		ToUserName:   "gh_test",
		FromUserName: "oUser",
		CreateTime:   1714037059,
		MsgType:      "text",
		Content:      "hello",
		MsgID:        "123",
	}
	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatal(err)
	}
	var decoded WeChatMessageJSON
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.Content != "hello" {
		t.Fatalf("content = %s", decoded.Content)
	}
}
