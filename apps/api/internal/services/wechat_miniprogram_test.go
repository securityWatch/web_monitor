package services

import "testing"

func TestWeChatPlaceholderEmail(t *testing.T) {
	email := WeChatPlaceholderEmail("oAbC-123_xyz")
	if !ValidateEmail(email) {
		t.Fatalf("expected valid email, got %q", email)
	}
	if !IsWeChatPlaceholderEmail(email) {
		t.Fatal("expected placeholder detection")
	}
	if IsWeChatPlaceholderEmail("user@example.com") {
		t.Fatal("should not mark real email as placeholder")
	}
}

func TestWeChatMiniDisplayName(t *testing.T) {
	name := WeChatMiniDisplayName("oABCDEF123456")
	if name == "" || len(name) < 4 {
		t.Fatalf("unexpected display name: %q", name)
	}
}
