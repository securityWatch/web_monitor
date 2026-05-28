package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/pulsewatch/api/internal/config"
	"github.com/pulsewatch/api/internal/database"
	"github.com/pulsewatch/api/internal/router"
)

func main() {
	cfg := config.Load()
	ctx := context.Background()

	db, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer db.Close()

	r := router.Setup(cfg, db)

	go func() {
		addr := ":" + cfg.Port
		log.Printf("PulseWatch API listening on %s", addr)
		if err := r.Run(addr); err != nil {
			log.Fatalf("server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down...")
	time.Sleep(time.Second)
}
