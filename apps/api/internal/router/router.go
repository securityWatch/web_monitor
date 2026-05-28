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
		AllowOrigins:     []string{cfg.CorsOrigin, "http://localhost:3000", "http://49.234.112.108:3000"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "X-Org-Id"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	emailSvc := services.NewEmailService(cfg)
	authSvc := services.NewAuthService(db, cfg)
	alertSvc := services.NewAlertService(db, emailSvc)

	authH := handlers.NewAuthHandler(authSvc, emailSvc, cfg)
	meH := handlers.NewMeHandler(db)
	monitorH := handlers.NewMonitorHandler(db)
	dashH := handlers.NewDashboardHandler(db)
	incH := handlers.NewIncidentHandler(db)

	rateLimit := middleware.NewRateLimiter(120, time.Minute)

	r.GET("/health", authH.Health)
	r.GET("/api/v1/public/founding-count", meH.FoundingCount)

	v1 := r.Group("/api/v1")
	{
		auth := v1.Group("/auth")
		auth.POST("/register", middleware.LoginRateLimit(), authH.Register)
		auth.POST("/login", middleware.LoginRateLimit(), authH.Login)
		auth.POST("/refresh", authH.Refresh)
		auth.POST("/forgot-password", authH.ForgotPassword)

		protected := v1.Group("")
		protected.Use(middleware.AuthMiddleware(cfg.JWTSecret))
		protected.Use(rateLimit.Middleware())
		{
			protected.GET("/me", meH.GetMe)
			protected.PATCH("/me/profile", meH.UpdateProfile)
			protected.POST("/me/password/change", meH.ChangePassword)
			protected.POST("/me/email/change-request", meH.ChangeEmailRequest)
			protected.POST("/me/email/confirm", meH.ConfirmEmailChange)
			protected.PATCH("/me/notifications", meH.UpdateNotifications)

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
			}
		}
	}

	// Start scheduler
	scheduler := services.NewScheduler(db, cfg, emailSvc, alertSvc)
	scheduler.Start()

	return r
}
