package services

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/pulsewatch/api/internal/config"
)

type TwilioService struct {
	cfg    *config.Config
	client *http.Client
}

func NewTwilioService(cfg *config.Config) *TwilioService {
	return &TwilioService{cfg: cfg, client: &http.Client{Timeout: 15 * time.Second}}
}

func (t *TwilioService) Enabled() bool {
	return t.cfg.TwilioAccountSID != "" && t.cfg.TwilioAuthToken != "" && t.cfg.TwilioFromNumber != ""
}

func (t *TwilioService) SendSMS(to, body string) error {
	if !t.Enabled() {
		return fmt.Errorf("twilio not configured")
	}
	form := url.Values{}
	form.Set("To", to)
	form.Set("From", t.cfg.TwilioFromNumber)
	form.Set("Body", body)

	apiURL := fmt.Sprintf("https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json", t.cfg.TwilioAccountSID)
	req, err := http.NewRequest(http.MethodPost, apiURL, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.SetBasicAuth(t.cfg.TwilioAccountSID, t.cfg.TwilioAuthToken)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := t.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("twilio error %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

func (t *TwilioService) SendVoice(to, message string) error {
	if !t.Enabled() {
		return fmt.Errorf("twilio not configured")
	}
	twiml := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>%s</Say></Response>`, escapeXML(message))
	form := url.Values{}
	form.Set("To", to)
	form.Set("From", t.cfg.TwilioFromNumber)
	form.Set("Twiml", twiml)

	apiURL := fmt.Sprintf("https://api.twilio.com/2010-04-01/Accounts/%s/Calls.json", t.cfg.TwilioAccountSID)
	req, err := http.NewRequest(http.MethodPost, apiURL, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.SetBasicAuth(t.cfg.TwilioAccountSID, t.cfg.TwilioAuthToken)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := t.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("twilio voice error %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

func escapeXML(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, "\"", "&quot;")
	return s
}
