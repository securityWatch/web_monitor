package handlers

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type ToolsHandler struct{}

func NewToolsHandler() *ToolsHandler {
	return &ToolsHandler{}
}

func (h *ToolsHandler) SSLCheck(c *gin.Context) {
	host := strings.TrimSpace(c.Query("host"))
	if host == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "host is required"})
		return
	}
	host = strings.TrimPrefix(strings.TrimPrefix(host, "https://"), "http://")
	host = strings.Split(host, "/")[0]

	addr := host
	if !strings.Contains(addr, ":") {
		addr += ":443"
	}
	conn, err := tls.DialWithDialer(&net.Dialer{Timeout: 10 * time.Second}, "tcp", addr, &tls.Config{ServerName: host})
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"host": host, "valid": false, "error": err.Error()})
		return
	}
	defer conn.Close()
	state := conn.ConnectionState()
	if len(state.PeerCertificates) == 0 {
		c.JSON(http.StatusOK, gin.H{"host": host, "valid": false, "error": "no certificate"})
		return
	}
	cert := state.PeerCertificates[0]
	daysLeft := int(time.Until(cert.NotAfter).Hours() / 24)
	c.JSON(http.StatusOK, gin.H{
		"host":       host,
		"valid":      time.Now().Before(cert.NotAfter),
		"issuer":     cert.Issuer.CommonName,
		"subject":    cert.Subject.CommonName,
		"expiresAt":  cert.NotAfter.Format(time.RFC3339),
		"daysLeft":   daysLeft,
		"tlsVersion": tlsVersionName(state.Version),
	})
}

func tlsVersionName(v uint16) string {
	switch v {
	case tls.VersionTLS10:
		return "TLS 1.0"
	case tls.VersionTLS11:
		return "TLS 1.1"
	case tls.VersionTLS12:
		return "TLS 1.2"
	case tls.VersionTLS13:
		return "TLS 1.3"
	default:
		return fmt.Sprintf("0x%x", v)
	}
}
