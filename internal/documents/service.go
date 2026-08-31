package documents

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	documentsdb "github.com/pagegroup/pageos/internal/documents/store/gen"
)

// Document is the public representation of a stored file.
type Document struct {
	ID         uuid.UUID      `json:"id"`
	UploadedBy uuid.UUID      `json:"uploaded_by"`
	StorageKey string         `json:"storage_key"`
	Filename   string         `json:"filename"`
	MimeType   string         `json:"mime_type"`
	SizeBytes  int64          `json:"size_bytes"`
	Checksum   string         `json:"checksum"`
	ScanStatus string         `json:"scan_status"`
	VaultType  string         `json:"vault_type"`
	Category   string         `json:"category,omitempty"`
	Context    map[string]any `json:"context,omitempty"`
	CreatedAt  time.Time      `json:"created_at"`
}

// Service manages document uploads, retrievals, and scan lifecycle.
type Service struct {
	store   *store
	objects ObjectStore
	scanner ScanProvider
}

func NewService(db *pgxpool.Pool, objects ObjectStore, scanner ScanProvider) *Service {
	return &Service{
		store:   newStore(db),
		objects: objects,
		scanner: scanner,
	}
}

// UploadInput carries everything needed to store a document.
type UploadInput struct {
	UploaderID    uuid.UUID      // identity.users.id of the uploader
	Filename      string
	ContentType   string
	Size          int64
	Body          io.Reader
	VaultType     string         // onboarding | hr_employee | personal
	Category      string         // medical | education | employment | referral | compliance | other | ""
	SubjectUserID *uuid.UUID     // for hr_employee uploads: the employee's user ID
	Context       map[string]any // e.g. {"case_id": "...", "requirement_key": "passport_photo"}
}

// Upload stores the file, writes metadata, and triggers a scan.
func (s *Service) Upload(ctx context.Context, in UploadInput) (Document, error) {
	if in.Filename == "" || in.Body == nil {
		return Document{}, fmt.Errorf("documents: filename and body are required")
	}

	data, err := io.ReadAll(io.LimitReader(in.Body, 50<<20))
	if err != nil {
		return Document{}, fmt.Errorf("documents: read body: %w", err)
	}
	sum := sha256.Sum256(data)
	checksum := hex.EncodeToString(sum[:])

	key := fmt.Sprintf("docs/%s/%s", time.Now().UTC().Format("2006/01/02"), uuid.New().String())

	if err := s.objects.Put(ctx, key, bytesReader(data), int64(len(data)), in.ContentType); err != nil {
		return Document{}, fmt.Errorf("documents: store object: %w", err)
	}

	vaultType := in.VaultType
	if vaultType == "" {
		vaultType = "onboarding"
	}

	ctxJSON, _ := json.Marshal(in.Context)

	row, err := s.store.InsertDocumentFull(ctx, insertFullParams{
		UploadedBy:    in.UploaderID,
		StorageKey:    key,
		Filename:      in.Filename,
		MimeType:      in.ContentType,
		SizeBytes:     int64(len(data)),
		Checksum:      checksum,
		ScanStatus:    "pending",
		Context:       ctxJSON,
		VaultType:     vaultType,
		Category:      in.Category,
		SubjectUserID: in.SubjectUserID,
	})
	if err != nil {
		return Document{}, fmt.Errorf("documents: insert metadata: %w", err)
	}

	doc := fromFullDoc(row)

	status, scanErr := s.scanner.Scan(key)
	if scanErr != nil {
		status = "error"
	}
	updated, err := s.store.UpdateScanStatus(ctx, documentsdb.UpdateScanStatusParams{
		ID:         doc.ID,
		ScanStatus: status,
	})
	if err == nil {
		doc.ScanStatus = updated.ScanStatus
	}

	return doc, nil
}

// GetSignedURL returns a temporary download URL for a document.
func (s *Service) GetSignedURL(ctx context.Context, id uuid.UUID, expires time.Duration) (string, error) {
	row, err := s.store.GetDocument(ctx, id)
	if err != nil {
		return "", fmt.Errorf("documents: not found: %w", err)
	}
	return s.objects.SignedURL(ctx, row.StorageKey, expires)
}

// StreamDocument fetches the raw file bytes from object storage so the API can
// pipe them directly to the browser. This avoids presigned-URL redirects which
// use an internal hostname (minio:9000) the browser cannot reach.
func (s *Service) StreamDocument(ctx context.Context, id uuid.UUID) (body io.ReadCloser, filename, mimeType string, err error) {
	row, err := s.store.GetDocument(ctx, id)
	if err != nil {
		return nil, "", "", fmt.Errorf("documents: not found: %w", err)
	}
	rc, err := s.objects.Get(ctx, row.StorageKey)
	if err != nil {
		return nil, "", "", fmt.Errorf("documents: fetch object: %w", err)
	}
	return rc, row.Filename, row.MimeType, nil
}

// GetDocument returns document metadata by ID.
func (s *Service) GetDocument(ctx context.Context, id uuid.UUID) (Document, error) {
	row, err := s.store.GetDocument(ctx, id)
	if err != nil {
		return Document{}, fmt.Errorf("documents: not found: %w", err)
	}
	return toDocument(row), nil
}

// ListDocumentsByEmployee returns all HR vault documents for a specific employee.
func (s *Service) ListDocumentsByEmployee(ctx context.Context, employeeUserID uuid.UUID) ([]Document, error) {
	rows, err := s.store.ListByEmployee(ctx, employeeUserID)
	if err != nil {
		return nil, fmt.Errorf("documents: list by employee: %w", err)
	}
	out := make([]Document, 0, len(rows))
	for _, r := range rows {
		out = append(out, fromFullDoc(r))
	}
	return out, nil
}

// ListPersonalDocuments returns documents from the caller's private vault.
func (s *Service) ListPersonalDocuments(ctx context.Context, userID uuid.UUID) ([]Document, error) {
	rows, err := s.store.ListPersonal(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("documents: list personal: %w", err)
	}
	out := make([]Document, 0, len(rows))
	for _, r := range rows {
		out = append(out, fromFullDoc(r))
	}
	return out, nil
}

func fromFullDoc(fd fullDoc) Document {
	d := Document{
		ID:         fd.ID,
		UploadedBy: fd.UploadedBy,
		StorageKey: fd.StorageKey,
		Filename:   fd.Filename,
		MimeType:   fd.MimeType,
		SizeBytes:  fd.SizeBytes,
		Checksum:   fd.Checksum,
		ScanStatus: fd.ScanStatus,
		VaultType:  fd.VaultType,
		Category:   fd.Category,
		CreatedAt:  fd.CreatedAt.Time,
	}
	if len(fd.Context) > 0 {
		_ = json.Unmarshal(fd.Context, &d.Context)
	}
	return d
}

func toDocument(row documentsdb.DocumentsDocument) Document {
	d := Document{
		ID:         row.ID,
		UploadedBy: row.UploadedBy,
		StorageKey: row.StorageKey,
		Filename:   row.Filename,
		MimeType:   row.MimeType,
		SizeBytes:  row.SizeBytes,
		Checksum:   row.Checksum,
		ScanStatus: row.ScanStatus,
		VaultType:  "onboarding",
		CreatedAt:  row.CreatedAt.Time,
	}
	if len(row.Context) > 0 {
		_ = json.Unmarshal(row.Context, &d.Context)
	}
	return d
}

// bytesReaderImpl wraps a byte slice as an io.Reader.
type bytesReaderImpl struct {
	data []byte
	pos  int
}

func bytesReader(b []byte) io.Reader { return &bytesReaderImpl{data: b} }
func (r *bytesReaderImpl) Read(p []byte) (int, error) {
	if r.pos >= len(r.data) {
		return 0, io.EOF
	}
	n := copy(p, r.data[r.pos:])
	r.pos += n
	return n, nil
}
