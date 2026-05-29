package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AuditHandler struct {
	db *pgxpool.Pool
}

func NewAuditHandler(db *pgxpool.Pool) *AuditHandler {
	return &AuditHandler{db: db}
}

func (h *AuditHandler) List(c *gin.Context) {
	orgID := c.Param("orgId")
	userID := GetUserID(c)
	var role string
	err := h.db.QueryRow(c.Request.Context(), `
		SELECT role::text FROM organization_members WHERE user_id = $1 AND org_id = $2
	`, userID, orgID).Scan(&role)
	if err != nil || (role != "owner" && role != "admin") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	rows, err := h.db.Query(c.Request.Context(), `
		SELECT al.id, al.action, al.details, al.ip_address, al.created_at, u.email
		FROM audit_logs al
		LEFT JOIN users u ON u.id = al.user_id
		WHERE al.org_id = $1
		ORDER BY al.created_at DESC
		LIMIT 100
	`, orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	type entry struct {
		ID        string    `json:"id"`
		Action    string    `json:"action"`
		Details   []byte    `json:"details,omitempty"`
		IP        *string   `json:"ip,omitempty"`
		CreatedAt time.Time `json:"createdAt"`
		UserEmail *string   `json:"userEmail,omitempty"`
	}
	var list []entry
	for rows.Next() {
		var e entry
		if err := rows.Scan(&e.ID, &e.Action, &e.Details, &e.IP, &e.CreatedAt, &e.UserEmail); err != nil {
			continue
		}
		list = append(list, e)
	}
	if list == nil {
		list = []entry{}
	}
	c.JSON(http.StatusOK, gin.H{"logs": list})
}
