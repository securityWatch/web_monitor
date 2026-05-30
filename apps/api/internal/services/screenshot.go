package services

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"log"
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
	pngBytes := renderErrorPNG(targetURL, errMsg)
	dataURI := "data:image/png;base64," + base64.StdEncoding.EncodeToString(pngBytes)
	expires := time.Now().UTC().AddDate(0, 0, retention)
	_, err := s.db.Exec(ctx, `
		INSERT INTO check_artifacts (id, org_id, monitor_id, check_id, kind, storage_url, content_type, expires_at)
		VALUES ($1, $2, $3, NULLIF($4,''), 'screenshot', $5, 'image/png', $6)
	`, uuid.New().String(), orgID, monitorID, checkID, dataURI, expires)
	if err != nil {
		log.Printf("screenshot artifact: %v", err)
	}
	diagnostic := base64.StdEncoding.EncodeToString([]byte(FormatCaptureLabel(targetURL, errMsg)))
	_, _ = s.db.Exec(ctx, `
		INSERT INTO check_artifacts (id, org_id, monitor_id, check_id, kind, storage_url, content_type, expires_at)
		VALUES ($1, $2, $3, NULLIF($4,''), 'diagnostic', $5, 'text/plain', $6)
	`, uuid.New().String(), orgID, monitorID, checkID, "data:text/plain;base64,"+diagnostic, expires)
}

func renderErrorPNG(url, errMsg string) []byte {
	img := image.NewRGBA(image.Rect(0, 0, 800, 450))
	bg := color.RGBA{24, 24, 27, 255}
	for y := 0; y < 450; y++ {
		for x := 0; x < 800; x++ {
			img.Set(x, y, bg)
		}
	}
	// Simple bar header
	hdr := color.RGBA{239, 68, 68, 255}
	for y := 0; y < 48; y++ {
		for x := 0; x < 800; x++ {
			img.Set(x, y, hdr)
		}
	}
	_ = url
	_ = errMsg
	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	if buf.Len() == 0 {
		return []byte{}
	}
	return buf.Bytes()
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
