package msgraphstore

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TokenRecord is the stored representation of a user's Microsoft OAuth tokens.
type TokenRecord struct {
	ID               uuid.UUID
	UserID           uuid.UUID
	MicrosoftUserID  string
	MicrosoftEmail   string
	AccessTokenEnc   []byte
	RefreshTokenEnc  []byte
	ExpiresAt        time.Time
	Scope            string
}

type Store struct{ db *pgxpool.Pool }

func New(db *pgxpool.Pool) *Store { return &Store{db: db} }

// Upsert inserts or updates the token row for the given user.
func (s *Store) Upsert(ctx context.Context, r TokenRecord) error {
	const q = `
		INSERT INTO msgraph.user_token
		    (user_id, microsoft_user_id, microsoft_email, access_token_enc, refresh_token_enc, expires_at, scope)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (user_id) DO UPDATE SET
		    microsoft_user_id = EXCLUDED.microsoft_user_id,
		    microsoft_email   = EXCLUDED.microsoft_email,
		    access_token_enc  = EXCLUDED.access_token_enc,
		    refresh_token_enc = EXCLUDED.refresh_token_enc,
		    expires_at        = EXCLUDED.expires_at,
		    scope             = EXCLUDED.scope,
		    updated_at        = now()
	`
	_, err := s.db.Exec(ctx, q,
		r.UserID, r.MicrosoftUserID, r.MicrosoftEmail,
		r.AccessTokenEnc, r.RefreshTokenEnc, r.ExpiresAt, r.Scope)
	return err
}

// Get returns the token record for userID, or nil if not connected.
func (s *Store) Get(ctx context.Context, userID uuid.UUID) (*TokenRecord, error) {
	const q = `
		SELECT id, user_id, microsoft_user_id, microsoft_email,
		       access_token_enc, refresh_token_enc, expires_at, scope
		FROM   msgraph.user_token
		WHERE  user_id = $1
	`
	var r TokenRecord
	err := s.db.QueryRow(ctx, q, userID).Scan(
		&r.ID, &r.UserID, &r.MicrosoftUserID, &r.MicrosoftEmail,
		&r.AccessTokenEnc, &r.RefreshTokenEnc, &r.ExpiresAt, &r.Scope,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &r, nil
}

// UpdateTokens refreshes the access and refresh tokens after a token refresh.
func (s *Store) UpdateTokens(ctx context.Context, userID uuid.UUID, accessEnc, refreshEnc []byte, expiresAt time.Time) error {
	const q = `
		UPDATE msgraph.user_token
		SET    access_token_enc  = $2,
		       refresh_token_enc = $3,
		       expires_at        = $4,
		       updated_at        = now()
		WHERE  user_id = $1
	`
	_, err := s.db.Exec(ctx, q, userID, accessEnc, refreshEnc, expiresAt)
	return err
}

// Delete removes the token row, disconnecting the user from Microsoft.
func (s *Store) Delete(ctx context.Context, userID uuid.UUID) error {
	_, err := s.db.Exec(ctx, `DELETE FROM msgraph.user_token WHERE user_id = $1`, userID)
	return err
}
