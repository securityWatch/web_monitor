package handlers

import (
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

type timeRange struct {
	From   time.Time
	To     time.Time
	Bucket string
}

func parseTimeRange(c *gin.Context) timeRange {
	to := time.Now().UTC()
	rangeParam := c.DefaultQuery("range", "24h")

	var from time.Time
	var bucket string
	switch rangeParam {
	case "1h":
		from = to.Add(-1 * time.Hour)
		bucket = "minute"
	case "7d":
		from = to.Add(-7 * 24 * time.Hour)
		bucket = "hour"
	case "30d":
		from = to.Add(-30 * 24 * time.Hour)
		bucket = "day"
	default:
		from = to.Add(-24 * time.Hour)
		bucket = "hour"
	}

	if fromStr := c.Query("from"); fromStr != "" {
		if t, err := time.Parse(time.RFC3339, fromStr); err == nil {
			from = t.UTC()
		}
	}
	if toStr := c.Query("to"); toStr != "" {
		if t, err := time.Parse(time.RFC3339, toStr); err == nil {
			to = t.UTC()
		}
	}

	return timeRange{From: from, To: to, Bucket: bucket}
}

func bucketTruncExpr(bucket string) string {
	switch bucket {
	case "minute":
		return "date_trunc('minute', checked_at)"
	case "day":
		return "date_trunc('day', checked_at)"
	default:
		return "date_trunc('hour', checked_at)"
	}
}

func parsePagination(c *gin.Context) (page, limit, offset int) {
	page = 1
	limit = 200
	if p, err := strconv.Atoi(c.DefaultQuery("page", "1")); err == nil && p > 0 {
		page = p
	}
	if l, err := strconv.Atoi(c.DefaultQuery("limit", "200")); err == nil && l > 0 {
		limit = l
		if limit > 200 {
			limit = 200
		}
	}
	offset = (page - 1) * limit
	return page, limit, offset
}
