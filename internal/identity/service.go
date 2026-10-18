package identity

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"regexp"
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
	ID          uuid.UUID `json:"ID"`
	Email       string    `json:"Email"`
	DisplayName string    `json:"DisplayName"`
	Status      string    `json:"Status"`
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
	if row.Status != "active" {
		return User{}, ErrSessionInvalid
	}
	return toUser(row), nil
}

// FindByEmail looks up an active user by email. Used by Microsoft SSO to map
// a Microsoft account to an existing PageOS user without verifying a password.
func (s *Service) FindByEmail(ctx context.Context, email string) (User, error) {
	row, err := s.store.GetUserByEmail(ctx, strings.TrimSpace(strings.ToLower(email)))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return User{}, ErrInvalidCredentials
		}
		return User{}, err
	}
	if row.Status != "active" {
		return User{}, ErrInvalidCredentials
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

// PIN authentication constants.
const (
	pinMaxAttempts = 5
	pinLockDuration = 15 * time.Minute
)

var pinPattern = regexp.MustCompile(`^\d{4,6}$`)

// SetPIN hashes and stores a 4-6 digit PIN for a user, resetting any lockout.
func (s *Service) SetPIN(ctx context.Context, userID uuid.UUID, pin string) error {
	if !pinPattern.MatchString(pin) {
		return errors.New("identity: pin must be 4-6 digits")
	}
	hash, err := HashPassword(pin)
	if err != nil {
		return err
	}
	_, err = s.store.Pool.Exec(ctx,
		`UPDATE identity.users
		    SET pin_hash=$1, pin_attempts=0, pin_locked_until=NULL
		  WHERE id=$2`,
		hash, userID,
	)
	return err
}

// pinRow is the data we need from identity.users for PIN authentication.
type pinRow struct {
	id             uuid.UUID
	email          string
	displayName    string
	status         string
	pinHash        *string
	pinAttempts    int
	pinLockedUntil *time.Time
}

// AuthenticateByPIN verifies a user's PIN and returns the user on success.
// It enforces brute-force lockout (pinMaxAttempts) and provides no user enumeration.
func (s *Service) AuthenticateByPIN(ctx context.Context, email, pin string) (User, error) {
	row := s.store.Pool.QueryRow(ctx,
		`SELECT id, email, display_name, status,
		        pin_hash, pin_attempts, pin_locked_until
		   FROM identity.users
		  WHERE lower(email) = lower($1)`,
		email,
	)
	var pr pinRow
	if err := row.Scan(
		&pr.id, &pr.email, &pr.displayName, &pr.status,
		&pr.pinHash, &pr.pinAttempts, &pr.pinLockedUntil,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return User{}, ErrInvalidCredentials
		}
		return User{}, err
	}

	if pr.status != "active" {
		return User{}, ErrInvalidCredentials
	}

	// Check lockout before attempting verification.
	if pr.pinLockedUntil != nil && time.Now().Before(*pr.pinLockedUntil) {
		return User{}, ErrInvalidCredentials
	}

	// Missing PIN hash means the user has never set a PIN.
	if pr.pinHash == nil || *pr.pinHash == "" {
		return User{}, ErrInvalidCredentials
	}

	if err := VerifyPassword(pin, *pr.pinHash); err != nil {
		// Increment failed attempts; lock if threshold reached.
		newAttempts := pr.pinAttempts + 1
		if newAttempts >= pinMaxAttempts {
			lockedUntil := time.Now().Add(pinLockDuration)
			_, _ = s.store.Pool.Exec(ctx,
				`UPDATE identity.users
				    SET pin_attempts=$1, pin_locked_until=$2
				  WHERE id=$3`,
				newAttempts, lockedUntil, pr.id,
			)
		} else {
			_, _ = s.store.Pool.Exec(ctx,
				`UPDATE identity.users
				    SET pin_attempts=$1
				  WHERE id=$2`,
				newAttempts, pr.id,
			)
		}
		return User{}, ErrInvalidCredentials
	}

	// Success — reset attempt counter.
	_, err := s.store.Pool.Exec(ctx,
		`UPDATE identity.users
		    SET pin_attempts=0, pin_locked_until=NULL
		  WHERE id=$1`,
		pr.id,
	)
	if err != nil {
		return User{}, err
	}

	return User{
		ID:          pr.id,
		Email:       pr.email,
		DisplayName: pr.displayName,
		Status:      pr.status,
	}, nil
}
