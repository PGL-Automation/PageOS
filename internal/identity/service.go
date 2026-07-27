package identity

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/pagegroup/pageos/internal/audit"
	identitydb "github.com/pagegroup/pageos/internal/identity/store/gen"
	"github.com/pagegroup/pageos/internal/identity/store"
)

// sessionTTL is how long a session is valid after creation.
const sessionTTL = 12 * time.Hour

var (
	// ErrInvalidCredentials is returned for both unknown email and wrong
	// password (no user enumeration).
	ErrInvalidCredentials = errors.New("identity: invalid credentials")
	// ErrSessionInvalid is returned for missing, expired, or revoked sessions.
	ErrSessionInvalid = errors.New("identity: session invalid")
)

// User is the identity module's public representation of an account.
type User struct {
	ID          uuid.UUID `json:"id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"display_name"`
	Status      string    `json:"status"`
}

// Service holds the identity capabilities.
type Service struct {
	store *store.Store
	audit *audit.Writer
}

func NewService(s *store.Store, a *audit.Writer) *Service {
	return &Service{store: s, audit: a}
}

// Register creates a new user account with an argon2id-hashed password.
func (s *Service) Register(ctx context.Context, email, password, displayName string) (User, error) {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" || password == "" {
		return User{}, errors.New("identity: email and password are required")
	}
	hash, err := HashPassword(password)
	if err != nil {
		return User{}, err
	}
	row, err := s.store.CreateUser(ctx, identitydb.CreateUserParams{
		Email:        email,
		PasswordHash: hash,
		DisplayName:  displayName,
	})
	if err != nil {
		return User{}, err
	}
	u := toUser(row)
	_ = s.audit.Write(ctx, audit.Entry{
		Actor:        audit.Actor{Type: "system"},
		Action:       "identity.user.registered",
		ResourceType: "user",
		ResourceID:   u.ID.String(),
	})
	return u, nil
}

// Authenticate verifies credentials and returns the user on success.
func (s *Service) Authenticate(ctx context.Context, email, password string) (User, error) {
	row, err := s.store.GetUserByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return User{}, ErrInvalidCredentials
		}
		return User{}, err
	}
	if row.Status != "active" {
		return User{}, ErrInvalidCredentials
	}
	if err := VerifyPassword(password, row.PasswordHash); err != nil {
		return User{}, ErrInvalidCredentials
	}
	return toUser(row), nil
}

// CreateSession issues an opaque session token for a user. Only the token's
// SHA-256 is stored; the raw token is returned once to the caller.
func (s *Service) CreateSession(ctx context.Context, userID uuid.UUID) (token string, expiresAt time.Time, err error) {
	raw := make([]byte, 32)
	if _, err = rand.Read(raw); err != nil {
		return "", time.Time{}, err
	}
	token = base64.RawURLEncoding.EncodeToString(raw)
	expiresAt = time.Now().Add(sessionTTL)

	_, err = s.store.CreateSession(ctx, identitydb.CreateSessionParams{
		UserID:    userID,
		TokenHash: hashToken(token),
		ExpiresAt: pgtype.Timestamptz{Time: expiresAt, Valid: true},
	})
	if err != nil {
		return "", time.Time{}, err
	}
	return token, expiresAt, nil
}

// ResolveSession returns the user for a valid, unexpired, unrevoked token.
func (s *Service) ResolveSession(ctx context.Context, token string) (User, error) {
	sess, err := s.store.GetSessionByTokenHash(ctx, hashToken(token))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return User{}, ErrSessionInvalid
		}
		return User{}, err
	}
	if sess.RevokedAt.Valid || !sess.ExpiresAt.Valid || time.Now().After(sess.ExpiresAt.Time) {
		return User{}, ErrSessionInvalid
	}
	row, err := s.store.GetUserByID(ctx, sess.UserID)
	if err != nil {
		return User{}, ErrSessionInvalid
	}
	return toUser(row), nil
}

// RevokeSession invalidates a session token (logout).
func (s *Service) RevokeSession(ctx context.Context, token string) error {
	return s.store.RevokeSession(ctx, hashToken(token))
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func toUser(row identitydb.IdentityUser) User {
	return User{
		ID:          row.ID,
		Email:       row.Email,
		DisplayName: row.DisplayName,
		Status:      row.Status,
	}
}
