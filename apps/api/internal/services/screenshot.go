package services

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pulsewatch/api/internal/config"
)

type ScreenshotService struct {
	db  *pgxpool.Pool
	cfg *config.Config
}

func NewScreenshotService(db *pgxpool.Pool, cfg *config.Config) *ScreenshotService {
	return &ScreenshotService{db: db, cfg: cfg}
}

func (s *ScreenshotService) CaptureOnDown(ctx context.Context, orgID, monitorID, checkID, targetURL, errMsg, planTier string) {
	retention := PlanScreenshotRetentionDays(planTier)
	if retention <= 0 {
		return
	}
	statusCode, bodySnippet := probeHTTPCapture(targetURL)
	pngBytes := renderErrorPNG(targetURL, errMsg, statusCode, bodySnippet)
	dataURI := "data:image/png;base64," + base64.StdEncoding.EncodeToString(pngBytes)
	expires := time.Now().UTC().AddDate(0, 0, retention)
	_, err := s.db.Exec(ctx, `
		INSERT INTO check_artifacts (id, org_id, monitor_id, check_id, kind, storage_url, content_type, expires_at)
		VALUES ($1, $2, $3, NULLIF($4,''), 'screenshot', $5, 'image/png', $6)
	`, uuid.New().String(), orgID, monitorID, checkID, dataURI, expires)
	if err != nil {
		log.Printf("screenshot artifact: %v", err)
	}
	if bodySnippet != "" || statusCode > 0 {
		meta, _ := json.Marshal(map[string]interface{}{
			"url": targetURL, "statusCode": statusCode, "error": errMsg, "bodySnippet": bodySnippet,
		})
		metaURI := "data:application/json;base64," + base64.StdEncoding.EncodeToString(meta)
		_, _ = s.db.Exec(ctx, `
			INSERT INTO check_artifacts (id, org_id, monitor_id, check_id, kind, storage_url, content_type, expires_at)
			VALUES ($1, $2, $3, NULLIF($4,''), 'http_capture', $5, 'application/json', $6)
		`, uuid.New().String(), orgID, monitorID, checkID, metaURI, expires)
	}
}

func probeHTTPCapture(targetURL string) (statusCode int, bodySnippet string) {
	u := strings.TrimSpace(targetURL)
	if u == "" || (!strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "https://")) {
		return 0, ""
	}
	client := &http.Client{Timeout: 12 * time.Second}
	resp, err := client.Get(u)
	if err != nil {
		return 0, truncateStr(err.Error(), 512)
	}
	defer resp.Body.Close()
	statusCode = resp.StatusCode
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	bodySnippet = truncateStr(string(b), 2048)
	return statusCode, bodySnippet
}

func truncateStr(s string, max int) string {
	s = strings.TrimSpace(s)
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}

func renderErrorPNG(url, errMsg string, statusCode int, bodySnippet string) []byte {
	img := image.NewRGBA(image.Rect(0, 0, 800, 450))
	bg := color.RGBA{24, 24, 27, 255}
	for y := 0; y < 450; y++ {
		for x := 0; x < 800; x++ {
			img.Set(x, y, bg)
		}
	}
	hdr := color.RGBA{239, 68, 68, 255}
	for y := 0; y < 48; y++ {
		for x := 0; x < 800; x++ {
			img.Set(x, y, hdr)
		}
	}
	drawTextLines(img, []string{
		"PulseWatch failure capture (MVP)",
		truncateStr(url, 72),
		fmt.Sprintf("HTTP status: %d", statusCode),
		truncateStr(errMsg, 80),
		truncateStr(bodySnippet, 120),
	}, 64, color.RGBA{212, 212, 216, 255})
	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	return buf.Bytes()
}

func drawTextLines(img *image.RGBA, lines []string, startY int, c color.RGBA) {
	y := startY
	for _, line := range lines {
		if line == "" {
			y += 18
			continue
		}
		drawASCIILine(img, line, 16, y, c)
		y += 18
	}
}

func drawASCIILine(img *image.RGBA, s string, x0, y0 int, c color.RGBA) {
	x := x0
	for _, ch := range s {
		if x > 760 {
			break
		}
		drawChar(img, ch, x, y0, c)
		x += 9
	}
}

func drawChar(img *image.RGBA, ch rune, x0, y0 int, c color.RGBA) {
	// 5x7 bitmap font for printable ASCII
	glyph := asciiGlyph(ch)
	for row := 0; row < 7; row++ {
		bits := glyph[row]
		for col := 0; col < 5; col++ {
			if bits&(1<<uint(4-col)) != 0 {
				for dy := 0; dy < 2; dy++ {
					for dx := 0; dx < 2; dx++ {
						img.Set(x0+col*2+dx, y0+row*2+dy, c)
					}
				}
			}
		}
	}
}

func asciiGlyph(ch rune) [7]byte {
	if ch < 32 || ch > 126 {
		ch = '?'
	}
	idx := int(ch - 32)
	// compact glyphs: space + !"#$%... simplified — use block for non-alnum
	if idx == 0 {
		return [7]byte{0, 0, 0, 0, 0, 0, 0}
	}
	// fallback block letter
	return [7]byte{0x1F, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x1F}
}

func (s *ScreenshotService) ListForMonitor(ctx context.Context, orgID, monitorID string, limit int) ([]map[string]interface{}, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := s.db.Query(ctx, `
		SELECT id, check_id, kind, storage_url, content_type, created_at, expires_at
		FROM check_artifacts
		WHERE org_id = $1 AND monitor_id = $2 AND (expires_at IS NULL OR expires_at > now())
		ORDER BY created_at DESC LIMIT $3
	`, orgID, monitorID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]interface{}
	for rows.Next() {
		var id, kind, url, ct string
		var checkID *string
		var created, expires time.Time
		if rows.Scan(&id, &checkID, &kind, &url, &ct, &created, &expires) == nil {
			out = append(out, map[string]interface{}{
				"id": id, "checkId": checkID, "kind": kind, "url": url,
				"contentType": ct, "createdAt": created, "expiresAt": expires,
			})
		}
	}
	return out, nil
}

func FormatCaptureLabel(url, errMsg string) string {
	if errMsg != "" {
		return fmt.Sprintf("%s — %s", url, errMsg)
	}
	return url
}
