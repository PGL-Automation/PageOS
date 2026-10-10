// cmd/create_user creates a user account and assigns them to a position.
// Designed for provisioning special-access users on any environment.
//
// Usage (run from repo root on the VPS):
//
//	PAGEOS_DATABASE_URL="postgres://..." \
//	  go run ./cmd/create_user \
//	  -email rogunsipe@pagefinancials.com \
//	  -name "Deremi Ogunsipe" \
//	  -password "Deremi2026!" \
//	  -position FINOPS_RECONCILIATION_OFFICER \
//	  -subsidiary "Page Financials Limited"
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pagegroup/pageos/internal/identity"
)

func main() {
	email     := flag.String("email",      "", "User email address (required)")
	name      := flag.String("name",       "", "Display name (required)")
	password  := flag.String("password",   "", "Initial password (required)")
	posCode   := flag.String("position",   "", "Position code e.g. FINOPS_RECONCILIATION_OFFICER (required)")
	subName   := flag.String("subsidiary", "", "Subsidiary name e.g. 'Page Financials Limited' (required)")
	flag.Parse()

	if *email == "" || *name == "" || *password == "" || *posCode == "" || *subName == "" {
		flag.Usage()
		os.Exit(1)
	}

	dbURL := os.Getenv("PAGEOS_DATABASE_URL")
	if dbURL == "" {
		log.Fatal("PAGEOS_DATABASE_URL not set")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("db ping: %v", err)
	}

	// Hash password using the same argon2id method as the rest of the system.
	hash, err := identity.HashPassword(*password)
	if err != nil {
		log.Fatalf("hash password: %v", err)
	}

	// ── 1. Create identity user ───────────────────────────────────────────────
	var userID string
	// Upsert: insert or update if email already exists (index is on lower(email)).
	err = pool.QueryRow(ctx, `
		WITH ins AS (
		    INSERT INTO identity.users (email, display_name, password_hash, status)
		    VALUES ($1, $2, $3, 'active')
		    ON CONFLICT DO NOTHING
		    RETURNING id
		)
		SELECT id::text FROM ins
		UNION ALL
		SELECT id::text FROM identity.users WHERE lower(email) = lower($1)
		LIMIT 1
	`, *email, *name, hash).Scan(&userID)
	// If the user already existed and we didn't insert, update the password + name.
	if userID != "" {
		_, _ = pool.Exec(ctx, `
			UPDATE identity.users
			SET display_name = $1, password_hash = $2, status = 'active'
			WHERE lower(email) = lower($3)
		`, *name, hash, *email)
	}
	if err != nil {
		log.Fatalf("create user: %v", err)
	}
	fmt.Printf("✓ User created: id=%s  email=%s\n", userID, *email)

	// ── 2. Create or update person record ────────────────────────────────────
	firstName, lastName := splitName(*name)
	var personID string
	// Check if person already exists for this email.
	_ = pool.QueryRow(ctx, `SELECT id::text FROM organization.person WHERE email = $1 LIMIT 1`, *email).Scan(&personID)
	if personID == "" {
		err = pool.QueryRow(ctx, `
			INSERT INTO organization.person (user_id, first_name, last_name, email)
			VALUES ($1, $2, $3, $4)
			RETURNING id::text
		`, userID, firstName, lastName, *email).Scan(&personID)
		if err != nil {
			log.Fatalf("create person: %v", err)
		}
	} else {
		_, _ = pool.Exec(ctx, `
			UPDATE organization.person SET user_id=$1, first_name=$2, last_name=$3 WHERE id=$4
		`, userID, firstName, lastName, personID)
	}
	fmt.Printf("✓ Person record: id=%s\n", personID)

	// ── 3. Resolve position ───────────────────────────────────────────────────
	var positionID, subsidiaryID string
	err = pool.QueryRow(ctx, `
		SELECT p.id::text, p.subsidiary_id::text
		FROM   organization.position p
		JOIN   organization.subsidiary s ON s.id = p.subsidiary_id
		WHERE  p.code = $1 AND s.name = $2
		LIMIT  1
	`, *posCode, *subName).Scan(&positionID, &subsidiaryID)
	if err != nil {
		log.Fatalf("position not found (code=%s subsidiary=%s): %v — run migrations first", *posCode, *subName, err)
	}
	fmt.Printf("✓ Position: %s (subsidiary %s)\n", *posCode, *subName)

	// ── 4. Create assignment ──────────────────────────────────────────────────
	_, err = pool.Exec(ctx, `
		INSERT INTO organization.assignment
		    (person_id, position_id, subsidiary_id, effective_from, is_primary)
		VALUES ($1, $2, $3, $4, true)
		ON CONFLICT DO NOTHING
	`, personID, positionID, subsidiaryID, time.Now().Format("2006-01-02"))
	if err != nil {
		log.Fatalf("create assignment: %v", err)
	}
	fmt.Printf("✓ Assignment created\n")

	fmt.Printf("\n✅ Done. User %q can now log in with password %q — change on first login.\n", *email, *password)
}

func splitName(full string) (first, last string) {
	for i := len(full) - 1; i >= 0; i-- {
		if full[i] == ' ' {
			return full[:i], full[i+1:]
		}
	}
	return full, ""
}
