package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AdminHandler struct {
	db *pgxpool.Pool
}

func NewAdminHandler(db *pgxpool.Pool) *AdminHandler {
	return &AdminHandler{db: db}
}

// AdminAuth 检查当前用户是否为管理员
func (h *AdminHandler) AdminAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := GetUserID(c)
		if userID == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized", "code": "UNAUTHORIZED"})
			return
		}
		var isAdmin bool
		err := h.db.QueryRow(c.Request.Context(),
			`SELECT is_admin FROM users WHERE id = $1`, userID).Scan(&isAdmin)
		if err != nil || !isAdmin {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "admin access required", "code": "FORBIDDEN"})
			return
		}
		c.Next()
	}
}

type AdminUserRow struct {
	ID             string  `json:"id"`
	Email          string  `json:"email"`
	DisplayName    *string `json:"displayName"`
	EmailVerified  bool    `json:"emailVerified"`
	IsAdmin        bool    `json:"isAdmin"`
	OrgCount       int     `json:"orgCount"`
	MonitorCount   int     `json:"monitorCount"`
	CreatedAt      time.Time `json:"createdAt"`
}

// ListUsers 列出所有注册用户
func (h *AdminHandler) ListUsers(c *gin.Context) {
	search := c.Query("search")

	query := `
		SELECT
			u.id, u.email, u.display_name,
			u.email_verified_at IS NOT NULL AS email_verified,
			u.is_admin,
			(SELECT COUNT(*) FROM organization_members om WHERE om.user_id = u.id) AS org_count,
			(SELECT COUNT(*) FROM monitors m
			 JOIN organization_members om ON om.org_id = m.org_id
			 WHERE om.user_id = u.id) AS monitor_count,
			u.created_at
		FROM users u
	`
	args := []interface{}{}
	if search != "" {
		query += ` WHERE u.email ILIKE $1 OR COALESCE(u.display_name, '') ILIKE $1`
		args = append(args, "%"+search+"%")
	}
	query += ` ORDER BY u.created_at DESC`

	rows, err := h.db.Query(c.Request.Context(), query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var users []AdminUserRow
	for rows.Next() {
		var u AdminUserRow
		if err := rows.Scan(&u.ID, &u.Email, &u.DisplayName, &u.EmailVerified, &u.IsAdmin, &u.OrgCount, &u.MonitorCount, &u.CreatedAt); err != nil {
			continue
		}
		users = append(users, u)
	}
	if users == nil {
		users = []AdminUserRow{}
	}
	c.JSON(http.StatusOK, gin.H{"users": users})
}

type AdminUserOrg struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Slug         string `json:"slug"`
	PlanTier     string `json:"planTier"`
	Role         string `json:"role"`
	MonitorCount int    `json:"monitorCount"`
}

type AdminUserDetail struct {
	ID            string          `json:"id"`
	Email         string          `json:"email"`
	DisplayName   *string         `json:"displayName"`
	EmailVerified bool            `json:"emailVerified"`
	IsAdmin       bool           `json:"isAdmin"`
	CreatedAt     time.Time      `json:"createdAt"`
	Organizations []AdminUserOrg  `json:"organizations"`
}

// GetUser 获取用户详情（包含其组织和监控）
func (h *AdminHandler) GetUser(c *gin.Context) {
	userID := c.Param("userId")

	// 获取用户基本信息
	var detail AdminUserDetail
	err := h.db.QueryRow(c.Request.Context(), `
		SELECT id, email, display_name, email_verified_at IS NOT NULL, is_admin, created_at
		FROM users WHERE id = $1
	`, userID).Scan(&detail.ID, &detail.Email, &detail.DisplayName, &detail.EmailVerified, &detail.IsAdmin, &detail.CreatedAt)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	// 获取用户所属组织和角色
	rows, err := h.db.Query(c.Request.Context(), `
		SELECT o.id, o.name, o.slug, o.plan_tier, om.role::text,
		       (SELECT COUNT(*) FROM monitors WHERE org_id = o.id) AS monitor_count
		FROM organizations o
		JOIN organization_members om ON om.org_id = o.id
		WHERE om.user_id = $1
		ORDER BY o.name
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	for rows.Next() {
		var org AdminUserOrg
		if err := rows.Scan(&org.ID, &org.Name, &org.Slug, &org.PlanTier, &org.Role, &org.MonitorCount); err != nil {
			continue
		}
		detail.Organizations = append(detail.Organizations, org)
	}
	if detail.Organizations == nil {
		detail.Organizations = []AdminUserOrg{}
	}

	c.JSON(http.StatusOK, detail)
}

type AdminMonitorRow struct {
	ID              string  `json:"id"`
	OrgID           string  `json:"orgId"`
	OrgName         string  `json:"orgName"`
	Name            string  `json:"name"`
	Type            string  `json:"type"`
	TargetURL       string  `json:"targetUrl"`
	Status          string  `json:"status"`
	IntervalSeconds int     `json:"intervalSeconds"`
	LastResponseMs  *int      `json:"lastResponseMs"`
	CreatedAt       time.Time `json:"createdAt"`
}

// ListUserMonitors 获取用户在某个组织下的监控列表
func (h *AdminHandler) ListUserMonitors(c *gin.Context) {
	userID := c.Param("userId")
	orgID := c.Query("orgId")

	if orgID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "orgId is required"})
		return
	}

	// 验证用户是否属于该组织
	var exists bool
	_ = h.db.QueryRow(c.Request.Context(), `
		SELECT EXISTS(SELECT 1 FROM organization_members WHERE user_id = $1 AND org_id = $2)
	`, userID, orgID).Scan(&exists)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "user is not a member of this organization"})
		return
	}

	rows, err := h.db.Query(c.Request.Context(), `
		SELECT m.id, m.org_id, o.name, m.name, m.type, m.target_url, m.status,
		       m.interval_seconds, m.last_response_ms, m.created_at
		FROM monitors m
		JOIN organizations o ON o.id = m.org_id
		WHERE m.org_id = $1
		ORDER BY m.created_at DESC
	`, orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var monitors []AdminMonitorRow
	for rows.Next() {
		var m AdminMonitorRow
		if err := rows.Scan(&m.ID, &m.OrgID, &m.OrgName, &m.Name, &m.Type, &m.TargetURL, &m.Status,
			&m.IntervalSeconds, &m.LastResponseMs, &m.CreatedAt); err != nil {
			continue
		}
		monitors = append(monitors, m)
	}
	if monitors == nil {
		monitors = []AdminMonitorRow{}
	}
	c.JSON(http.StatusOK, gin.H{"monitors": monitors})
}
