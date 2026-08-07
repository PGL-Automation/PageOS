package documents

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	documentsdb "github.com/pagegroup/pageos/internal/documents/store/gen"
)

type store struct {
	*documentsdb.Queries
	pool *pgxpool.Pool
}

func newStore(db *pgxpool.Pool) *store {
	return &store{Queries: documentsdb.New(db), pool: db}
}

// fullDoc includes the new vault metadata columns returned by raw queries.
type fullDoc struct {
	ID         uuid.UUID
	UploadedBy uuid.UUID
	StorageKey string
	Filename   string
	MimeType   string
	SizeBytes  int64
	Checksum   string
	ScanStatus string
	Context    []byte
	VaultType  string
	Category   string
	CreatedAt  pgtype.Timestamptz
}

type insertFullParams struct {
	UploadedBy    uuid.UUID
	StorageKey    string
	Filename      string
	MimeType      string
	SizeBytes     int64
	Checksum      string
	ScanStatus    string
	Context       []byte
	VaultType     string
	Category      string
	SubjectUserID *uuid.UUID
}

const fullDocCols = `id, uploaded_by, storage_key, filename, mime_type, size_bytes, checksum, scan_status, context, vault_type, category, created_at`

func (s *store) InsertDocumentFull(ctx context.Context, p insertFullParams) (fullDoc, error) {
	const q = `
		INSERT INTO documents.document
			(uploaded_by, storage_key, filename, mime_type, size_bytes, checksum, scan_status, context, vault_type, category, subject_user_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		RETURNING ` + fullDocCols
	row := s.pool.QueryRow(ctx, q,
		p.UploadedBy, p.StorageKey, p.Filename, p.MimeType,
		p.SizeBytes, p.Checksum, p.ScanStatus, p.Context,
		p.VaultType, p.Category, p.SubjectUserID,
	)
	var d fullDoc
	err := row.Scan(
		&d.ID, &d.UploadedBy, &d.StorageKey, &d.Filename, &d.MimeType,
		&d.SizeBytes, &d.Checksum, &d.ScanStatus, &d.Context,
		&d.VaultType, &d.Category, &d.CreatedAt,
	)
	return d, err
}

// ListByEmployee returns HR vault documents for an employee (by user ID).
func (s *store) ListByEmployee(ctx context.Context, employeeUserID uuid.UUID) ([]fullDoc, error) {
	const q = `
		SELECT ` + fullDocCols + `
		FROM documents.document
		WHERE (subject_user_id = $1 OR context->>'for_employee_id' = $2)
		  AND vault_type IN ('hr_employee','onboarding')
		ORDER BY created_at DESC
	`
	rows, err := s.pool.Query(ctx, q, employeeUserID, employeeUserID.String())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []fullDoc
	for rows.Next() {
		var d fullDoc
		if err := rows.Scan(
			&d.ID, &d.UploadedBy, &d.StorageKey, &d.Filename, &d.MimeType,
			&d.SizeBytes, &d.Checksum, &d.ScanStatus, &d.Context,
			&d.VaultType, &d.Category, &d.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// ListPersonal returns personal vault documents for the caller (privacy-enforced by caller's ID).
func (s *store) ListPersonal(ctx context.Context, userID uuid.UUID) ([]fullDoc, error) {
	const q = `
		SELECT ` + fullDocCols + `
		FROM documents.document
		WHERE vault_type = 'personal' AND uploaded_by = $1
		ORDER BY created_at DESC
	`
	rows, err := s.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []fullDoc
	for rows.Next() {
		var d fullDoc
		if err := rows.Scan(
			&d.ID, &d.UploadedBy, &d.StorageKey, &d.Filename, &d.MimeType,
			&d.SizeBytes, &d.Checksum, &d.ScanStatus, &d.Context,
			&d.VaultType, &d.Category, &d.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}
