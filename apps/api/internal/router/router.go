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
	authSvc := services.NewAuthService(db, cfg)
	oauthSvc := services.NewOAuthService(authSvc, cfg)
	alertSvc := services.NewAlertService(db, emailSvc)
	billingSvc := services.NewBillingService(cfg)
	hbSvc := services.NewHeartbeatService(db)

	authH := handlers.NewAuthHandler(authSvc, emailSvc, cfg)
	oauthH := handlers.NewOAuthHandler(oauthSvc, cfg.WebURL)
	meH := handlers.NewMeHandler(db)
	monitorH := handlers.NewMonitorHandler(db)
	dashH := handlers.NewDashboardHandler(db)
	incH := handlers.NewIncidentHandler(db)
	alertH := handlers.NewAlertHandler(db, alertSvc)
	statusH := handlers.NewStatusPageHandler(db)
	maintH := handlers.NewMaintenanceHandler(db)
	hbH := handlers.NewHeartbeatHandler(hbSvc)
	billingH := handlers.NewBillingHandler(db, billingSvc, cfg)
	inviteH := handlers.NewInviteHandler(db)
	reportH := handlers.NewReportHandler(db)
	apiKeyH := handlers.NewAPIKeyHandler(db)
	toolsH := handlers.NewToolsHandler()

	rateLimit := middleware.NewRateLimiter(120, time.Minute)

	r.GET("/health", authH.Health)
	r.GET("/api/v1/public/founding-count", meH.FoundingCount)
	r.GET("/api/v1/public/status/:slug", statusH.PublicGet)
	r.POST("/api/v1/heartbeat/:token", hbH.Ping)
	r.POST("/api/v1/billing/webhook", billingH.Webhook)
	r.GET("/api/v1/public/ssl-check", toolsH.SSLCheck)

	v1 := r.Group("/api/v1")
	{
		auth := v1.Group("/auth")
		auth.POST("/register", middleware.LoginRateLimit(), authH.Register)
		auth.POST("/login", middleware.LoginRateLimit(), authH.Login)
		auth.POST("/refresh", authH.Refresh)
		auth.POST("/forgot-password", authH.ForgotPassword)
		auth.POST("/reset-password", authH.ResetPassword)
		auth.GET("/oauth/:provider", oauthH.Start)
		auth.GET("/oauth/:provider/callback", oauthH.Callback)
		auth.GET("/providers", authH.OAuthProviders)

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
			protected.POST("/invites/accept", inviteH.Accept)

			org := protected.Group("/orgs/:orgId")
			{
				org.GET("/dashboard", dashH.Get)
				org.GET("/incidents", incH.List)
				org.GET("/monitors", monitorH.List)
				org.POST("/monitors", monitorH.Create)
				org.GET("/monitors/:id", monitorH.Get)
				org.PATCH("/monitors/:id", monitorH.Update)
				org.DELETE("/monitors/:id", monitorH.Delete)
				org.GET("/monitors/:id/checks", monitorH.GetChecks)
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

				org.GET("/maintenance-windows", maintH.List)
				org.POST("/maintenance-windows", maintH.Create)
				org.DELETE("/maintenance-windows/:windowId", maintH.Delete)

				org.POST("/billing/checkout", billingH.CreateCheckout)

				org.GET("/members", inviteH.ListMembers)
				org.GET("/invitations", inviteH.List)
				org.POST("/invitations", inviteH.Create)

				org.GET("/reports/sla.csv", reportH.SLAExport)

				org.GET("/api-keys", apiKeyH.List)
				org.POST("/api-keys", apiKeyH.Create)
				org.DELETE("/api-keys/:keyId", apiKeyH.Delete)
			}
		}
	}

	scheduler := services.NewScheduler(db, cfg, emailSvc, alertSvc)
	scheduler.Start()

	return r
}
