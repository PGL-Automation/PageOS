// Package db owns the PostgreSQL connection pool (pgx). Modules receive a
// *pgxpool.Pool and run sqlc-generated queries against it; there is no ORM.
package db

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib" // database/sql driver for goose
	"github.com/pressly/goose/v3"
	pgxuuid "github.com/vgarvardt/pgx-google-uuid/v5"
)

// Connect opens and verifies a pgx connection pool.
func Connect(ctx context.Context, url string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}

	// Teach every connection how to (de)serialize google/uuid.UUID so the
	// sqlc-generated code can use uuid.UUID directly.
	cfg.AfterConnect = func(_ context.Context, conn *pgx.Conn) error {
		pgxuuid.Register(conn.TypeMap())
		return nil
	}

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}

	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	return pool, nil
}

// RunMigrations applies all pending goose migrations embedded in migrationsFS.
// It is idempotent — already-applied migrations are skipped. Call once at
// startup before opening any module stores.
func RunMigrations(ctx context.Context, databaseURL string, migrationsFS fs.FS) error {
	// Goose uses database/sql, not pgx directly. The pgx stdlib driver is
	// registered above via the blank import.
	sqlDB, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return fmt.Errorf("migrations: open sql db: %w", err)
	}
	defer sqlDB.Close()

	goose.SetBaseFS(migrationsFS)
	if err := goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("migrations: set dialect: %w", err)
	}
	if err := goose.UpContext(ctx, sqlDB, "."); err != nil {
		return fmt.Errorf("migrations: run: %w", err)
	}
	return nil
}
