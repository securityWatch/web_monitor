package router

import (
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pulsewatch/api/internal/config"
	"github.com/pulsewatch/api/internal/handlers"
	"github.com/pulsewatch/api/internal/middleware"
	"github.com/pulsewatch/api/internal/services"
)

func Setup(cfg *config.Config, db *pgxpool.Pool) *gin.Engine {
	if cfg.CorsOrigin != "http://localhost:3000" || cfg.CorsOrigin == "" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOriginFunc: func(origin string) bool {
			if origin == "" {
				return true
			}
			for _, allowed := range cfg.CorsOrigins {
				if origin == allowed {
					return true
				}
			}
			return false
		},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "X-Org-Id"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	emailSvc := services.NewEmailService(cfg)
	notifier := services.NewNotifier(cfg)
	otpSvc := services.NewEmailOTPService(db, cfg, emailSvc)
	authSvc := services.NewAuthService(db, cfg, notifier, otpSvc)
	oauthSvc := services.NewOAuthService(authSvc, cfg)
	totpSvc := services.NewTOTPService(db)
	twilioSvc := services.NewTwilioService(cfg)
	oncallSvc := services.NewOnCallService(db)
	incidentSvc := services.NewIncidentService(db)
	alertSvc := services.NewAlertService(db, emailSvc, twilioSvc, oncallSvc)
	billingSvc := services.NewBillingService(cfg)
	hbSvc := services.NewHeartbeatService(db)

	authH := handlers.NewAuthHandler(authSvc, emailSvc, otpSvc, cfg)
	oauthH := handlers.NewOAuthHandler(oauthSvc, cfg.WebURL)
	meH := handlers.NewMeHandler(db, authSvc, totpSvc)
	monitorH := handlers.NewMonitorHandler(db, notifier)
	dashH := handlers.NewDashboardHandler(db)
	incH := handlers.NewIncidentHandler(db, incidentSvc)
	oncallH := handlers.NewOnCallHandler(db)
	alertH := handlers.NewAlertHandler(db, alertSvc)
	statusH := handlers.NewStatusPageHandler(db, emailSvc, cfg.WebURL)
	maintH := handlers.NewMaintenanceHandler(db)
	hbH := handlers.NewHeartbeatHandler(hbSvc)
	billingH := handlers.NewBillingHandler(db, billingSvc, cfg)
	inviteH := handlers.NewInviteHandler(db)
	reportH := handlers.NewReportHandler(db)
	apiKeyH := handlers.NewAPIKeyHandler(db)
	toolsH := handlers.NewToolsHandler(db)
	auditH := handlers.NewAuditHandler(db)
	openAPIH := handlers.NewOpenAPIHandler()
	probeDispatch := services.NewProbeDispatch(db)
	probeH := handlers.NewProbeHandler(probeDispatch, cfg.ProbeSecret)
	ssoSvc := services.NewSSOService(authSvc, cfg, db)
	ssoH := handlers.NewSSOHandler(db, ssoSvc, cfg.WebURL)
	wechatSvc := services.NewWeChatMiniProgramService(cfg)
	wechatH := handlers.NewWeChatAuthHandler(authSvc, wechatSvc)
	wechatPushSvc := services.NewWeChatMessagePushService(cfg)
	wechatPushH := handlers.NewWeChatMessagePushHandler(wechatPushSvc)

	rateLimit := middleware.NewRateLimiter(120, time.Minute)

	r.GET("/health", authH.Health)
	r.GET("/api/v1/openapi.json", openAPIH.Spec)
	r.GET("/api/v1/public/founding-count", meH.FoundingCount)
	r.GET("/api/v1/public/status-domain", statusH.PublicGetByDomain)
	r.GET("/api/v1/public/status/:slug", statusH.PublicGet)
	r.POST("/api/v1/public/status/:slug/subscribe", statusH.PublicSubscribe)
	r.POST("/api/v1/public/status/:slug/subscribe/confirm", statusH.PublicSubscribeConfirm)
	r.POST("/api/v1/heartbeat/:token", hbH.Ping)
	r.POST("/api/v1/billing/webhook", billingH.Webhook)
	r.GET("/api/v1/public/ssl-check", toolsH.SSLCheck)
	r.GET("/api/v1/public/http-check", toolsH.HTTPCheck)
	r.GET("/api/v1/public/dns-lookup", toolsH.DNSLookup)
	r.GET("/api/v1/public/ping", toolsH.PingTest)
	r.GET("/api/v1/public/port-check", toolsH.PortCheck)
	r.GET("/api/v1/public/http-headers", toolsH.HTTPHeaders)
	r.GET("/api/v1/public/redirect-check", toolsH.RedirectCheck)
	r.GET("/api/v1/public/badge/:token.svg", toolsH.BadgeSVG)
	r.Any("/api/v1/public/wechat/message-push", wechatPushH.Handle)

	internal := r.Group("/api/internal/probe")
	{
		internal.POST("/claim", probeH.Claim)
		internal.POST("/complete", probeH.Complete)
	}

	v1 := r.Group("/api/v1")
	{
		auth := v1.Group("/auth")
		auth.POST("/register", middleware.LoginRateLimit(), authH.Register)
		auth.POST("/register/send-code", middleware.LoginRateLimit(), authH.SendRegisterCode)
		auth.POST("/login", middleware.LoginRateLimit(), authH.Login)
		auth.POST("/refresh", authH.Refresh)
		auth.POST("/forgot-password", authH.ForgotPassword)
		auth.POST("/forgot-password/send-code", middleware.LoginRateLimit(), authH.SendForgotPasswordCode)
		auth.POST("/reset-password", authH.ResetPassword)
		auth.GET("/verify-email", authH.VerifyEmail)
		auth.POST("/magic-link", authH.MagicLinkRequest)
		auth.GET("/magic", authH.MagicLinkVerify)
		auth.POST("/totp", authH.TotpLogin)
		auth.GET("/oauth/:provider", oauthH.Start)
		auth.GET("/oauth/:provider/callback", oauthH.Callback)
		auth.GET("/providers", authH.OAuthProviders)
		auth.GET("/sso/start", ssoH.LoginStart)
		auth.GET("/sso/callback", ssoH.Callback)
		auth.GET("/sso/status", ssoH.Status)
		auth.GET("/wechat/miniprogram/status", wechatH.MiniprogramStatus)
		auth.POST("/wechat/miniprogram", middleware.LoginRateLimit(), wechatH.MiniprogramLogin)

		protected := v1.Group("")
		protected.Use(middleware.AuthMiddleware(cfg.JWTSecret, db))
		protected.Use(rateLimit.Middleware())
		{
			protected.GET("/me", meH.GetMe)
			protected.PATCH("/me/profile", meH.UpdateProfile)
			protected.POST("/me/password/change", meH.ChangePassword)
			protected.POST("/me/email/change-request", meH.ChangeEmailRequest)
			protected.POST("/me/email/confirm", meH.ConfirmEmailChange)
			protected.PATCH("/me/notifications", meH.UpdateNotifications)
			protected.POST("/me/onboarding/complete", meH.CompleteOnboarding)
			protected.POST("/me/verify-email/resend", meH.ResendVerification)
			protected.POST("/me/switch-org", meH.SwitchOrg)
			protected.GET("/me/totp", meH.TotpStatus)
			protected.POST("/me/totp/setup", meH.TotpSetup)
			protected.POST("/me/totp/enable", meH.TotpEnable)
			protected.POST("/me/totp/disable", meH.TotpDisable)
			protected.GET("/me/sessions", meH.ListSessions)
			protected.DELETE("/me/sessions/:id", meH.RevokeSession)
			protected.POST("/me/sessions/revoke-others", meH.RevokeOtherSessions)
			protected.POST("/me/wechat/miniprogram/bind", wechatH.MiniprogramBind)
			protected.POST("/invites/accept", inviteH.Accept)

			org := protected.Group("/orgs/:orgId")
			{
				org.GET("/dashboard", dashH.Get)
				org.GET("/incidents", incH.List)
				org.GET("/incidents/:incidentId", incH.Get)
				org.PATCH("/incidents/:incidentId", incH.Update)
				org.POST("/incidents/:incidentId/notes", incH.AddNote)
				org.POST("/incidents/:incidentId/ai-summary", incH.AISummary)

				org.GET("/on-call/schedules", oncallH.ListSchedules)
				org.POST("/on-call/schedules", oncallH.CreateSchedule)
				org.GET("/on-call/schedules/:scheduleId/rotations", oncallH.GetRotations)
				org.GET("/on-call/alerts", oncallH.PendingAlerts)
				org.POST("/on-call/alerts/:alertId/ack", oncallH.Ack)

				org.PATCH("/monitors/batch", monitorH.Batch)
				org.POST("/monitors/ai-draft", monitorH.AIDraft)
				org.GET("/monitors", monitorH.List)
				org.POST("/monitors", monitorH.Create)
				org.GET("/monitors/:id", monitorH.Get)
				org.PATCH("/monitors/:id", monitorH.Update)
				org.DELETE("/monitors/:id", monitorH.Delete)
				org.POST("/monitors/:id/regenerate-badge-token", monitorH.RegenerateBadgeToken)
				org.GET("/monitors/:id/checks", monitorH.GetChecks)
				org.GET("/monitors/:id/artifacts", monitorH.GetArtifacts)
				org.POST("/monitors/:id/ai-visual", monitorH.AIVisualExplain)
				org.POST("/monitors/:id/baseline", monitorH.CaptureBaseline)
				org.GET("/monitors/:id/stats", monitorH.GetStats)

				org.GET("/alert-channels", alertH.ListChannels)
				org.POST("/alert-channels", alertH.CreateChannel)
				org.PATCH("/alert-channels/:channelId", alertH.UpdateChannel)
				org.DELETE("/alert-channels/:channelId", alertH.DeleteChannel)
				org.POST("/alert-channels/:channelId/test", alertH.TestChannel)

				org.GET("/status-pages", statusH.List)
				org.POST("/status-pages", statusH.Create)
				org.GET("/status-pages/:pageId", statusH.Get)
				org.PATCH("/status-pages/:pageId", statusH.Update)
				org.DELETE("/status-pages/:pageId", statusH.Delete)
				org.GET("/status-pages/:pageId/announcements", statusH.ListAnnouncements)
				org.POST("/status-pages/:pageId/announcements", statusH.CreateAnnouncement)
				org.DELETE("/status-pages/:pageId/announcements/:announcementId", statusH.DeleteAnnouncement)

				org.GET("/sso", ssoH.Get)
				org.PUT("/sso", ssoH.Upsert)

				org.GET("/maintenance-windows", maintH.List)
				org.POST("/maintenance-windows", maintH.Create)
				org.DELETE("/maintenance-windows/:windowId", maintH.Delete)

				org.POST("/billing/checkout", billingH.CreateCheckout)

				org.GET("/members", inviteH.ListMembers)
				org.GET("/invitations", inviteH.List)
				org.POST("/invitations", inviteH.Create)

				org.GET("/reports/sla.csv", reportH.SLAExport)
				org.GET("/reports/sla.html", reportH.SLAReportHTML)
				org.GET("/reports/system", reportH.SystemReport)
				org.POST("/reports/ai-security", reportH.AISecurityReport)

				org.GET("/api-keys", apiKeyH.List)
				org.POST("/api-keys", apiKeyH.Create)
				org.DELETE("/api-keys/:keyId", apiKeyH.Delete)

				org.GET("/audit-logs", auditH.List)
			}
		}
	}

	scheduler := services.NewScheduler(db, cfg, emailSvc, alertSvc, incidentSvc)
	scheduler.Start()

	return r
}
