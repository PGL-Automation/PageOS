// Command api is the PageOS backend entrypoint: a modular monolith exposing
// the HTTP API. Wiring of modules happens here; business logic lives in
// internal/<module>.
package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/pagegroup/pageos/internal/platform/config"
	"github.com/pagegroup/pageos/internal/platform/db"
	"github.com/pagegroup/pageos/internal/platform/httpx"
	"github.com/pagegroup/pageos/internal/platform/observability"
)

func main() {
	if err := run(); err != nil {
		observability.NewLogger("error").Error("startup failed", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	logger := observability.NewLogger(cfg.LogLevel)
	logger.Info("starting pageos api", "env", cfg.Env, "addr", cfg.HTTPAddr)

	// Root context cancelled on SIGINT/SIGTERM for graceful shutdown.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	router := httpx.NewRouter(logger, httpx.Deps{DB: pool})

	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
	}

	// Serve in the background so we can wait for the shutdown signal.
	serveErr := make(chan error, 1)
	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveErr <- err
		}
	}()

	select {
	case err := <-serveErr:
		return err
	case <-ctx.Done():
		logger.Info("shutdown signal received")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
}
