package store

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/pagegroup/pageos/internal/onboarding/domain"
	onboardingdb "github.com/pagegroup/pageos/internal/onboarding/store/gen"
)

type Store struct {
	*onboardingdb.Queries
	pool *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Store {
	return &Store{Queries: onboardingdb.New(db), pool: db}
}

// Pool returns the underlying connection pool for raw queries.
func (s *Store) Pool() *pgxpool.Pool { return s.pool }

func (s *Store) ExecTx(ctx context.Context, fn func(*onboardingdb.Queries, pgx.Tx) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	q := onboardingdb.New(tx)
	if err := fn(q, tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ListComplianceChecksWithNames returns all compliance checks for a case, joined
// with the performer's display_name from identity.users.
func (s *Store) ListComplianceChecksWithNames(ctx context.Context, caseID uuid.UUID) ([]domain.ComplianceCheckWithName, error) {
	const q = `
		SELECT cc.id, cc.case_id, cc.check_type, cc.outcome, cc.notes, cc.source,
		       cc.performed_by, cc.performed_at,
		       COALESCE(u.display_name, '') AS performer_name
		FROM onboarding.compliance_check cc
		LEFT JOIN identity.users u ON u.id = cc.performed_by
		WHERE cc.case_id = $1
		ORDER BY cc.performed_at
	`
	rows, err := s.pool.Query(ctx, q, caseID)
	if err != nil {
		return nil, fmt.Errorf("store: list compliance checks with names: %w", err)
	}
	defer rows.Close()

	var out []domain.ComplianceCheckWithName
	for rows.Next() {
		var c domain.ComplianceCheckWithName
		var performedAt time.Time
		if err := rows.Scan(
			&c.ID, &c.CaseID, &c.CheckType, &c.Outcome, &c.Notes, &c.Source,
			&c.PerformedBy, &performedAt, &c.PerformerName,
		); err != nil {
			return nil, fmt.Errorf("store: scan compliance check: %w", err)
		}
		c.PerformedAt = performedAt
		out = append(out, c)
	}
	return out, rows.Err()
}

// AddCaseNote inserts a new follow-up note for a case.
func (s *Store) AddCaseNote(ctx context.Context, caseID, authorID uuid.UUID, noteType, content string) (domain.CaseNote, error) {
	const q = `
		INSERT INTO onboarding.case_note (case_id, author_id, note_type, content)
		VALUES ($1, $2, $3, $4)
		RETURNING id, case_id, author_id, note_type, content, created_at
	`
	var n domain.CaseNote
	err := s.pool.QueryRow(ctx, q, caseID, authorID, noteType, content).Scan(
		&n.ID, &n.CaseID, &n.AuthorID, &n.NoteType, &n.Content, &n.CreatedAt,
	)
	if err != nil {
		return domain.CaseNote{}, fmt.Errorf("store: add case note: %w", err)
	}
	return n, nil
}

// ListCaseNotes returns all notes for a case, newest first, with author names.
func (s *Store) ListCaseNotes(ctx context.Context, caseID uuid.UUID) ([]domain.CaseNote, error) {
	const q = `
		SELECT cn.id, cn.case_id, cn.author_id,
		       COALESCE(u.display_name, '') AS author_name,
		       cn.note_type, cn.content, cn.created_at
		FROM onboarding.case_note cn
		LEFT JOIN identity.users u ON u.id = cn.author_id
		WHERE cn.case_id = $1
		ORDER BY cn.created_at DESC
	`
	rows, err := s.pool.Query(ctx, q, caseID)
	if err != nil {
		return nil, fmt.Errorf("store: list case notes: %w", err)
	}
	defer rows.Close()

	var out []domain.CaseNote
	for rows.Next() {
		var n domain.CaseNote
		if err := rows.Scan(
			&n.ID, &n.CaseID, &n.AuthorID, &n.AuthorName,
			&n.NoteType, &n.Content, &n.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("store: scan case note: %w", err)
		}
		out = append(out, n)
	}
	return out, rows.Err()
}
