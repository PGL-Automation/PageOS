package reconciliation

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/pagegroup/pageos/internal/audit"
	recondb "github.com/pagegroup/pageos/internal/reconciliation/store/gen"
)

// ── Mono API client ───────────────────────────────────────────────────────────

const monoBaseURL = "https://api.withmono.com"

// MonoClient handles communication with the Mono Connect API.
// Use NewMonoClient to construct one; the zero value is not usable.
type MonoClient struct {
	secretKey  string
	httpClient *http.Client
	baseURL    string
}

// NewMonoClient creates a MonoClient using the given Mono secret key.
// It configures a 30-second timeout on the underlying HTTP client.
func NewMonoClient(secretKey string) *MonoClient {
	return &MonoClient{
		secretKey:  secretKey,
		httpClient: &http.Client{Timeout: 30 * time.Second},
		baseURL:    monoBaseURL,
	}
}

// MonoTransaction is a single transaction returned by the Mono API.
// Mono returns amounts in kobo for NGN accounts.
type MonoTransaction struct {
	ID        string    `json:"_id"`
	Amount    int64     `json:"amount"` // kobo
	Date      time.Time `json:"date"`
	Narration string    `json:"narration"`
	Type      string    `json:"type"` // "debit" | "credit"
	Balance   int64     `json:"balance"` // kobo
}

// monoTransactionRaw handles the date unmarshalling: Mono sends dates as RFC3339
// strings ("2006-01-02T15:04:05.000Z") or plain date strings ("2006-01-02").
type monoTransactionRaw struct {
	ID        string `json:"_id"`
	Amount    int64  `json:"amount"`
	Date      string `json:"date"`
	Narration string `json:"narration"`
	Type      string `json:"type"`
	Balance   int64  `json:"balance"`
}

func (r monoTransactionRaw) toMonoTransaction() (MonoTransaction, error) {
	t, err := parseMonoDate(r.Date)
	if err != nil {
		return MonoTransaction{}, fmt.Errorf("mono: parse date %q: %w", r.Date, err)
	}
	return MonoTransaction{
		ID:        r.ID,
		Amount:    r.Amount,
		Date:      t,
		Narration: r.Narration,
		Type:      r.Type,
		Balance:   r.Balance,
	}, nil
}

var monoDateLayouts = []string{
	time.RFC3339,
	"2006-01-02T15:04:05.000Z",
	"2006-01-02T15:04:05Z",
	"2006-01-02",
}

func parseMonoDate(s string) (time.Time, error) {
	for _, layout := range monoDateLayouts {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC(), nil
		}
	}
	return time.Time{}, fmt.Errorf("unrecognised date format: %q", s)
}

// monoTxnPage is one page of the Mono transaction list response.
type monoTxnPage struct {
	Status string `json:"status"`
	Data   struct {
		Paging struct {
			Total    int    `json:"total"`
			Page     int    `json:"page"`
			Previous string `json:"previous"`
			Next     string `json:"next"`
		} `json:"paging"`
		Data []monoTransactionRaw `json:"data"`
	} `json:"data"`
}

// FetchTransactions calls GET /v2/accounts/{accountId}/transactions and returns
// all transactions within [from, to] inclusive, handling pagination automatically.
func (c *MonoClient) FetchTransactions(ctx context.Context, accountID string, from, to time.Time) ([]MonoTransaction, error) {
	var all []MonoTransaction
	page := 1

	for {
		q := url.Values{}
		q.Set("start", from.Format("2006-01-02"))
		q.Set("end", to.Format("2006-01-02"))
		q.Set("page", fmt.Sprintf("%d", page))
		q.Set("limit", "100")

		endpoint := fmt.Sprintf("%s/v2/accounts/%s/transactions?%s", c.baseURL, accountID, q.Encode())

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
		if err != nil {
			return nil, fmt.Errorf("mono: build request: %w", err)
		}
		req.Header.Set("Authorization", "Bearer "+c.secretKey)
		req.Header.Set("Accept", "application/json")
		req.Header.Set("mono-sec-key", c.secretKey)

		resp, err := c.httpClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("mono: http request (page %d): %w", page, err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("mono: unexpected status %d on page %d", resp.StatusCode, page)
		}

		var pg monoTxnPage
		if err := json.NewDecoder(resp.Body).Decode(&pg); err != nil {
			return nil, fmt.Errorf("mono: decode response (page %d): %w", page, err)
		}

		for _, raw := range pg.Data.Data {
			txn, err := raw.toMonoTransaction()
			if err != nil {
				// Skip individual transactions with unparseable dates rather than
				// aborting the whole fetch — log-worthy but not fatal.
				continue
			}
			all = append(all, txn)
		}

		// Stop when there is no next page or this page returned no data.
		if pg.Data.Paging.Next == "" || len(pg.Data.Data) == 0 {
			break
		}
		page++
	}

	return all, nil
}

// ── Bank connectivity ─────────────────────────────────────────────────────────

// BankConnectivity holds the configuration needed to pull statements from an
// external banking connectivity provider (Mono, Okra, SFTP, etc.) for one
// bank account. It maps to the reconciliation.bank_connectivity table.
type BankConnectivity struct {
	ID                 uuid.UUID  `json:"id"`
	BankAccountID      uuid.UUID  `json:"bank_account_id"`
	Provider           string     `json:"provider"` // "mono" | "okra" | "sftp" | "manual"
	ProviderAccountID  string     `json:"provider_account_id"`
	ProviderCustomerID string     `json:"provider_customer_id"`
	IsActive           bool       `json:"is_active"`
	LastPulledAt       *time.Time `json:"last_pulled_at,omitempty"`
	LastPullStatus     string     `json:"last_pull_status"`
	LastPullError      string     `json:"last_pull_error"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

// SetConnectivityInput is the payload for SetBankConnectivity.
type SetConnectivityInput struct {
	BankAccountID      uuid.UUID
	Provider           string
	ProviderAccountID  string
	ProviderCustomerID string
}

// SetBankConnectivity upserts a bank_connectivity record. If a row already
// exists for the given bank_account_id it is updated in-place; otherwise a
// new row is inserted.
func (s *Service) SetBankConnectivity(ctx context.Context, in SetConnectivityInput) (BankConnectivity, error) {
	const q = `
		INSERT INTO reconciliation.bank_connectivity
		    (bank_account_id, provider, provider_account_id, provider_customer_id,
		     is_active, last_pull_status)
		VALUES ($1, $2, $3, $4, true, '')
		ON CONFLICT (bank_account_id)
		DO UPDATE SET
		    provider             = EXCLUDED.provider,
		    provider_account_id  = EXCLUDED.provider_account_id,
		    provider_customer_id = EXCLUDED.provider_customer_id,
		    is_active            = true,
		    updated_at           = NOW()
		RETURNING
		    id, bank_account_id, provider, provider_account_id, provider_customer_id,
		    is_active, last_pulled_at, last_pull_status, last_pull_error,
		    created_at, updated_at
	`
	row := s.store.Pool().QueryRow(ctx, q,
		in.BankAccountID,
		in.Provider,
		in.ProviderAccountID,
		in.ProviderCustomerID,
	)
	return scanConnectivity(row)
}

// GetBankConnectivity returns the connectivity record for one bank account.
func (s *Service) GetBankConnectivity(ctx context.Context, bankAccountID uuid.UUID) (BankConnectivity, error) {
	const q = `
		SELECT id, bank_account_id, provider, provider_account_id, provider_customer_id,
		       is_active, last_pulled_at, last_pull_status, last_pull_error,
		       created_at, updated_at
		FROM   reconciliation.bank_connectivity
		WHERE  bank_account_id = $1
	`
	row := s.store.Pool().QueryRow(ctx, q, bankAccountID)
	conn, err := scanConnectivity(row)
	if err != nil {
		return BankConnectivity{}, fmt.Errorf("reconciliation: get connectivity: %w", err)
	}
	return conn, nil
}

// ListBankConnectivities returns all connectivity records whose bank_account
// belongs to the given subsidiary.
func (s *Service) ListBankConnectivities(ctx context.Context, subsidiaryID uuid.UUID) ([]BankConnectivity, error) {
	const q = `
		SELECT c.id, c.bank_account_id, c.provider, c.provider_account_id, c.provider_customer_id,
		       c.is_active, c.last_pulled_at, c.last_pull_status, c.last_pull_error,
		       c.created_at, c.updated_at
		FROM   reconciliation.bank_connectivity c
		JOIN   reconciliation.bank_account      a ON a.id = c.bank_account_id
		WHERE  a.subsidiary_id = $1
		ORDER  BY a.bank_name, a.account_number
	`
	rows, err := s.store.Pool().Query(ctx, q, subsidiaryID)
	if err != nil {
		return nil, fmt.Errorf("reconciliation: list connectivities: %w", err)
	}
	defer rows.Close()

	var out []BankConnectivity
	for rows.Next() {
		conn, err := scanConnectivityRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, conn)
	}
	return out, rows.Err()
}

// ── Pull statement from Mono ──────────────────────────────────────────────────

// PullStatementFromMono fetches transactions for forDate from the Mono API and
// imports them as bank_statement + bank_statement_line records. It then triggers
// SyncFromJournals and auto-creates a reconciliation run for the period.
//
// forDate is typically yesterday's date, called from a nightly cron job.
// Pass time.Now().AddDate(0,0,-1) from the caller when scheduling.
//
// Returns the UUID of the newly-created reconciliation run (uuid.Nil when no
// transactions were fetched and no run was created) and any error.
func (s *Service) PullStatementFromMono(ctx context.Context, bankAccountID uuid.UUID, monoClient *MonoClient, forDate time.Time) (uuid.UUID, error) {
	// Normalise to midnight UTC so date comparisons are clean.
	forDate = time.Date(forDate.Year(), forDate.Month(), forDate.Day(), 0, 0, 0, 0, time.UTC)

	// 1. Load bank account.
	acctRow, err := s.store.GetBankAccount(ctx, bankAccountID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("mono pull: bank account not found: %w", err)
	}
	_ = acctRow // subsidiaryID is embedded in the run via bankAccountID FK

	// 2. Load connectivity — must be configured for Mono.
	conn, err := s.GetBankConnectivity(ctx, bankAccountID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("mono pull: connectivity not found: %w", err)
	}
	if conn.Provider != "mono" {
		return uuid.Nil, fmt.Errorf("mono pull: provider is %q, expected \"mono\"", conn.Provider)
	}
	if !conn.IsActive {
		return uuid.Nil, fmt.Errorf("mono pull: connectivity for account %s is inactive", bankAccountID)
	}

	// Helper: persist pull status back to the connectivity row.
	updateStatus := func(status, pullErr string) {
		const uq = `
			UPDATE reconciliation.bank_connectivity
			SET    last_pulled_at    = NOW(),
			       last_pull_status  = $1,
			       last_pull_error   = $2,
			       updated_at        = NOW()
			WHERE  bank_account_id   = $3
		`
		_, _ = s.store.Pool().Exec(ctx, uq, status, pullErr, bankAccountID)
	}

	// 3. Fetch transactions from Mono.
	txns, err := monoClient.FetchTransactions(ctx, conn.ProviderAccountID, forDate, forDate)
	if err != nil {
		updateStatus("failed", err.Error())
		return uuid.Nil, fmt.Errorf("mono pull: fetch transactions: %w", err)
	}

	// 4. Nothing to do — still mark the pull as successful so callers know
	//    the API call completed and the account had no activity that day.
	if len(txns) == 0 {
		updateStatus("success", "")
		_ = s.audit.Write(ctx, audit.Entry{
			Actor:        audit.Actor{Type: "system"},
			Action:       "reconciliation.mono.pull.empty",
			ResourceType: "bank_account", ResourceID: bankAccountID.String(),
			Context: map[string]any{"date": forDate.Format("2006-01-02")},
		})
		return uuid.Nil, nil
	}

	// 5. Create bank_statement record for the day.
	//    Opening/closing balances are derived from the first/last transaction
	//    balance values that Mono returns; fall back to 0 if unavailable.
	openingBalance := int64(0)
	closingBalance := int64(0)
	// Mono lists transactions newest-first by default; compute from extremes.
	closingBalance = txns[0].Balance
	openingBalance = txns[len(txns)-1].Balance

	// Use a synthetic importedBy = zero UUID to signal a system import.
	systemUser := uuid.Nil

	stmt, err := s.store.CreateBankStatement(ctx, recondb.CreateBankStatementParams{
		BankAccountID:  bankAccountID,
		PeriodStart:    toPGDate(forDate),
		PeriodEnd:      toPGDate(forDate),
		OpeningBalance: openingBalance,
		ClosingBalance: closingBalance,
		ImportedBy:     systemUser,
	})
	if err != nil {
		updateStatus("failed", err.Error())
		return uuid.Nil, fmt.Errorf("mono pull: create bank statement: %w", err)
	}

	// 6. Create bank_statement_line for each transaction.
	for _, t := range txns {
		var debitKobo, creditKobo int64
		if t.Type == "debit" {
			debitKobo = t.Amount
		} else {
			creditKobo = t.Amount
		}

		balance := t.Balance
		_, err := s.store.CreateBankStatementLine(ctx, recondb.CreateBankStatementLineParams{
			StatementID: stmt.ID,
			TxnDate:     toPGDate(t.Date),
			ValueDate:   pgtype.Date{}, // Mono does not return a separate value date
			DebitKobo:   debitKobo,
			CreditKobo:  creditKobo,
			BalanceKobo: &balance,
			Narration:   t.Narration,
			Reference:   t.ID, // use Mono's transaction _id as the reference
			Raw:         monoRaw(t),
		})
		if err != nil {
			updateStatus("failed", err.Error())
			return uuid.Nil, fmt.Errorf("mono pull: create statement line for txn %s: %w", t.ID, err)
		}
	}

	// 7. Sync internal transactions from finance journal lines for the same day.
	//    SyncFromJournals expects YYYY-MM-DD string range args.
	dateStr := forDate.Format("2006-01-02")
	if _, err := s.SyncFromJournals(ctx, bankAccountID, systemUser, dateStr, dateStr); err != nil {
		// Non-fatal: the GL may not have entries for this date yet.
		_ = s.audit.Write(ctx, audit.Entry{
			Actor:        audit.Actor{Type: "system"},
			Action:       "reconciliation.mono.sync_journals.skipped",
			ResourceType: "bank_account", ResourceID: bankAccountID.String(),
			Context: map[string]any{"date": dateStr, "reason": err.Error()},
		})
	}

	// 8. Auto-create a reconciliation run for the period using SmartMatcher.
	//    Capture the run ID so the caller can attempt TryAutoClose.
	var runID uuid.UUID
	run, err := s.CreateRun(ctx, bankAccountID, systemUser, forDate, forDate)
	if err != nil {
		// Non-fatal: a run may already exist for this date.
		_ = s.audit.Write(ctx, audit.Entry{
			Actor:        audit.Actor{Type: "system"},
			Action:       "reconciliation.mono.create_run.skipped",
			ResourceType: "bank_account", ResourceID: bankAccountID.String(),
			Context: map[string]any{"date": dateStr, "reason": err.Error()},
		})
	} else {
		runID = run.ID
	}

	// 9. Update connectivity status to success.
	updateStatus("success", "")

	_ = s.audit.Write(ctx, audit.Entry{
		Actor:        audit.Actor{Type: "system"},
		Action:       "reconciliation.mono.pull.success",
		ResourceType: "bank_account", ResourceID: bankAccountID.String(),
		Context: map[string]any{
			"date":           dateStr,
			"lines_imported": len(txns),
			"statement_id":   stmt.ID.String(),
		},
	})
	return runID, nil
}

// ── scan helpers ──────────────────────────────────────────────────────────────

// scanner abstracts pgx.Row and pgx.Rows so we can reuse the scan logic.
type scanner interface {
	Scan(dest ...any) error
}

func scanConnectivity(row scanner) (BankConnectivity, error) {
	var c BankConnectivity
	var lastPulledAt *time.Time
	var createdAt, updatedAt pgtype.Timestamptz

	err := row.Scan(
		&c.ID,
		&c.BankAccountID,
		&c.Provider,
		&c.ProviderAccountID,
		&c.ProviderCustomerID,
		&c.IsActive,
		&lastPulledAt,
		&c.LastPullStatus,
		&c.LastPullError,
		&createdAt,
		&updatedAt,
	)
	if err != nil {
		return BankConnectivity{}, err
	}
	c.LastPulledAt = lastPulledAt
	if createdAt.Valid {
		c.CreatedAt = createdAt.Time
	}
	if updatedAt.Valid {
		c.UpdatedAt = updatedAt.Time
	}
	return c, nil
}

// scanConnectivityRow scans from pgx.Rows (used in ListBankConnectivities).
func scanConnectivityRow(rows interface{ Scan(...any) error }) (BankConnectivity, error) {
	return scanConnectivity(rows)
}

// monoRaw serialises a MonoTransaction as a compact JSON string for the raw
// column of bank_statement_line, keeping an audit trail of the source data.
func monoRaw(t MonoTransaction) string {
	b, _ := json.Marshal(map[string]any{
		"_id":       t.ID,
		"amount":    t.Amount,
		"date":      t.Date.Format(time.RFC3339),
		"narration": t.Narration,
		"type":      t.Type,
		"balance":   t.Balance,
	})
	return string(b)
}
