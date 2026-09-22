// Package reconhttp exposes reconciliation capabilities over HTTP.
package reconhttp

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/pagegroup/pageos/internal/identity"
	identityhttp "github.com/pagegroup/pageos/internal/identity/http"
	"github.com/pagegroup/pageos/internal/platform/httpx"
	"github.com/pagegroup/pageos/internal/reconciliation"
)

// reconStaffRoles are the position codes permitted to access reconciliation.
// Covers Treasury and FinOps staff including their management chain.
var reconStaffRoles = []string{
	"HEAD_OF_OPERATIONS",
	"TREASURY_OPS_FINANCE_MGR",
	"FUND_TREASURY_OPERATIONS",
	"TREASURY_OFFICER",
	"TREASURY_ANALYST",
	"FINOPS_MANAGER",
	"RECONCILIATION_OFFICER",
	"GROUP_ADMIN",
}

// isExcelFile returns true when a filename has an Excel extension.
func isExcelFile(name string) bool {
	lower := strings.ToLower(name)
	return strings.HasSuffix(lower, ".xlsx") || strings.HasSuffix(lower, ".xls")
}

type Handler struct {
	svc  *reconciliation.Service
	pool *pgxpool.Pool
}

func New(svc *reconciliation.Service, pool *pgxpool.Pool) *Handler {
	return &Handler{svc: svc, pool: pool}
}

// isReconStaff returns true when the user holds an active assignment in one of
// the treasury or finops position codes.
func (h *Handler) isReconStaff(ctx context.Context, userID uuid.UUID) (bool, error) {
	const q = `
		SELECT EXISTS (
			SELECT 1
			FROM   organization.assignment a
			JOIN   organization.position   pos ON pos.id  = a.position_id
			JOIN   organization.person     per ON per.id  = a.person_id
			WHERE  per.user_id = $1
			  AND  pos.code = ANY($2::text[])
			  AND  a.effective_from <= CURRENT_DATE
			  AND  (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
		)
	`
	var exists bool
	if err := h.pool.QueryRow(ctx, q, userID, reconStaffRoles).Scan(&exists); err != nil {
		return false, err
	}
	return exists, nil
}

// requireReconStaff extracts the caller, verifies they hold a treasury/finops
// role, and writes 401/403 on failure. Returns (user, true) on success.
func (h *Handler) requireReconStaff(w http.ResponseWriter, r *http.Request) (identity.User, bool) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthenticated", "login required")
		return identity.User{}, false
	}
	allowed, err := h.isReconStaff(r.Context(), caller.ID)
	if err != nil || !allowed {
		httpx.Error(w, http.StatusForbidden, "forbidden", "treasury or finops role required")
		return identity.User{}, false
	}
	return caller, true
}

// reconStaffMiddleware enforces that the authenticated caller holds a treasury
// or finops role. It must run after authMW (which sets the user in context).
func (h *Handler) reconStaffMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := h.requireReconStaff(w, r); !ok {
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (h *Handler) Routes(authMW func(http.Handler) http.Handler) http.Handler {
	r := chi.NewRouter()
	r.Use(authMW)
	r.Use(h.reconStaffMiddleware)

	r.Post("/accounts", h.createAccount)
	r.Get("/accounts", h.listAccounts)
	r.Patch("/accounts/{id}/gl-code", h.setGLCode)
	r.Get("/accounts/{id}/statements", h.listStatements)
	r.Post("/accounts/{id}/statements", h.uploadStatement)
	r.Post("/accounts/{id}/ledger", h.uploadLedger)
	r.Post("/accounts/{id}/sync-gl", h.syncGL)
	r.Post("/accounts/{id}/connectivity", h.setBankConnectivity)
	r.Get("/accounts/{id}/connectivity", h.getBankConnectivity)
	r.Post("/accounts/{id}/pull", h.triggerManualPull)

	r.Post("/transactions", h.createInternalTxn)

	r.Post("/runs", h.createRun)
	r.Get("/runs", h.listRuns)
	r.Get("/runs/{id}", h.getRun)
	// Full match view: every match with bank + ledger details joined in.
	r.Get("/runs/{id}/full", h.getRunFull)
	r.Get("/runs/{id}/unmatched", h.listUnmatched)
	r.Post("/runs/{id}/match", h.recordManualMatch)
	r.Post("/runs/{id}/unmatched-bank", h.markBankUnmatched)
	r.Post("/runs/{id}/unmatched-internal", h.markInternalUnmatched)
	r.Post("/runs/{id}/close", h.closeRun)
	// Un-match a previously matched pair, returning both sides to unmatched state.
	r.Post("/runs/{id}/matches/{matchId}/unmatch", h.unmatchRecord)
	// Export a full reconciliation result as an Excel workbook.
	r.Get("/runs/{id}/export", h.exportRun)
	// Validate that the run's matched totals balance against statement balances.
	r.Get("/runs/{id}/balance", h.validateBalance)
	// Attempt to auto-close a run when all items are matched.
	r.Post("/runs/{id}/auto-close", h.tryAutoClose)
	// Exception summary across all accounts for a subsidiary.
	r.Get("/exceptions", h.getExceptions)
	// Dashboard: all run summaries for a subsidiary.
	r.Get("/dashboard", h.getDashboard)
	return r
}

// ── Accounts ──────────────────────────────────────────────────────────────────

func (h *Handler) createAccount(w http.ResponseWriter, r *http.Request) {
	var in struct {
		SubsidiaryID  uuid.UUID         `json:"subsidiary_id"`
		BankName      string            `json:"bank_name"`
		AccountNumber string            `json:"account_number"`
		AccountName   string            `json:"account_name"`
		Currency      string            `json:"currency"`
		GLAccountCode string            `json:"gl_account_code"`
		ColMap        map[string]string `json:"parser_column_map"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Currency == "" {
		in.Currency = "NGN"
	}
	acct, err := h.svc.CreateBankAccount(r.Context(), in.SubsidiaryID, in.BankName, in.AccountNumber, in.AccountName, in.Currency, in.GLAccountCode, in.ColMap)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, acct)
}

func (h *Handler) setGLCode(w http.ResponseWriter, r *http.Request) {
	accountID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid account id")
		return
	}
	var in struct {
		GLAccountCode string `json:"gl_account_code"`
	}
	if !decode(w, r, &in) {
		return
	}
	if err := h.svc.SetGLAccountCode(r.Context(), accountID, in.GLAccountCode); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"gl_account_code": in.GLAccountCode})
}

func (h *Handler) listAccounts(w http.ResponseWriter, r *http.Request) {
	sid, err := uuid.Parse(r.URL.Query().Get("subsidiary_id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "subsidiary_id required")
		return
	}
	accounts, err := h.svc.ListBankAccounts(r.Context(), sid)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, accounts)
}

// ── Statements ────────────────────────────────────────────────────────────────

func (h *Handler) listStatements(w http.ResponseWriter, r *http.Request) {
	accountID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid account id")
		return
	}
	stmts, err := h.svc.ListStatements(r.Context(), accountID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, stmts)
}

func (h *Handler) uploadStatement(w http.ResponseWriter, r *http.Request) {
	accountID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid account id")
		return
	}
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "multipart parse failed")
		return
	}
	file, fileHeader, err := r.FormFile("file")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "missing file field")
		return
	}
	defer file.Close()

	// Detect format from filename (CSV default, Excel if .xlsx/.xls)
	_ = fileHeader // used below for format detection

	periodStart, err := time.Parse("2006-01-02", r.FormValue("period_start"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "period_start must be YYYY-MM-DD")
		return
	}
	periodEnd, err := time.Parse("2006-01-02", r.FormValue("period_end"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "period_end must be YYYY-MM-DD")
		return
	}

	openingBalance, _ := strconv.ParseInt(r.FormValue("opening_balance"), 10, 64)
	closingBalance, _ := strconv.ParseInt(r.FormValue("closing_balance"), 10, 64)

	// Auto-detect file format from the uploaded filename
	format := "csv"
	if fileHeader != nil && isExcelFile(fileHeader.Filename) {
		format = "excel"
	}

	user, _ := identityhttp.UserFrom(r.Context())
	stmt, err := h.svc.UploadStatement(r.Context(), accountID, user.ID, periodStart, periodEnd, openingBalance, closingBalance, format, file)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "upload_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, stmt)
}

// uploadLedger accepts a GL export file (xlsx or csv) and creates
// internal_transaction rows. The parser is chosen from the "format" form field:
// "providus_gl" (default) → ProvidusGLParser.
func (h *Handler) uploadLedger(w http.ResponseWriter, r *http.Request) {
	accountID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid account id")
		return
	}

	sidStr := r.URL.Query().Get("subsidiary_id")
	subsidiaryID, err := uuid.Parse(sidStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "subsidiary_id query param required")
		return
	}

	if err := r.ParseMultipartForm(32 << 20); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "multipart parse failed")
		return
	}
	file, fh, err := r.FormFile("file")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "missing file field")
		return
	}
	defer file.Close()

	// Auto-detect format from filename extension; allow "format" form override.
	// "providus_gl" (Excel, default) or "csv" (comma-separated, same column layout).
	format := r.FormValue("format")
	if format == "" {
		if fh != nil && isExcelFile(fh.Filename) {
			format = "providus_gl"
		} else {
			format = "csv"
		}
	}

	var parser reconciliation.LedgerParser
	switch format {
	case "providus_gl":
		parser = reconciliation.ProvidusGLParser{}
	case "csv":
		parser = reconciliation.CSVLedgerParser{}
	default:
		httpx.Error(w, http.StatusBadRequest, "unsupported_format", "unknown ledger format: "+format)
		return
	}

	user, _ := identityhttp.UserFrom(r.Context())
	count, err := h.svc.UploadLedger(r.Context(), accountID, user.ID, subsidiaryID, parser, file)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "upload_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{
		"rows_imported": count,
		"account_id":    accountID,
		"format":        format,
	})
}

// syncGL derives internal transactions for a bank account from its posted
// finance journal lines, replacing the need to upload a GL export file.
// Body: { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" }
func (h *Handler) syncGL(w http.ResponseWriter, r *http.Request) {
	accountID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid account id")
		return
	}
	var in struct {
		From string `json:"from"`
		To   string `json:"to"`
	}
	if !decode(w, r, &in) {
		return
	}
	user, _ := identityhttp.UserFrom(r.Context())
	count, err := h.svc.SyncFromJournals(r.Context(), accountID, user.ID, in.From, in.To)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "sync_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"rows_synced": count,
		"from":        in.From,
		"to":          in.To,
	})
}

// ── Internal transactions ─────────────────────────────────────────────────────

func (h *Handler) createInternalTxn(w http.ResponseWriter, r *http.Request) {
	var in struct {
		SubsidiaryID  uuid.UUID  `json:"subsidiary_id"`
		BankAccountID *uuid.UUID `json:"bank_account_id"`
		Type          string     `json:"type"`
		Direction     string     `json:"direction"`
		AmountKobo    int64      `json:"amount_kobo"`
		Currency      string     `json:"currency"`
		Reference     string     `json:"reference"`
		ClientID      *uuid.UUID `json:"client_id"`
		TxnDate       string     `json:"txn_date"`
	}
	if !decode(w, r, &in) {
		return
	}
	txnDate, err := time.Parse("2006-01-02", in.TxnDate)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "txn_date must be YYYY-MM-DD")
		return
	}
	if in.Currency == "" {
		in.Currency = "NGN"
	}
	txn, err := h.svc.CreateInternalTransaction(r.Context(), in.SubsidiaryID, in.BankAccountID, in.Type, in.Direction, in.AmountKobo, in.Currency, in.Reference, in.ClientID, txnDate)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, txn)
}

// ── Runs ──────────────────────────────────────────────────────────────────────

func (h *Handler) createRun(w http.ResponseWriter, r *http.Request) {
	var in struct {
		BankAccountID uuid.UUID `json:"bank_account_id"`
		PeriodStart   string    `json:"period_start"`
		PeriodEnd     string    `json:"period_end"`
	}
	if !decode(w, r, &in) {
		return
	}
	start, err := time.Parse("2006-01-02", in.PeriodStart)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "period_start must be YYYY-MM-DD")
		return
	}
	end, err := time.Parse("2006-01-02", in.PeriodEnd)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "period_end must be YYYY-MM-DD")
		return
	}
	user, _ := identityhttp.UserFrom(r.Context())
	run, err := h.svc.CreateRun(r.Context(), in.BankAccountID, user.ID, start, end)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, run)
}

func (h *Handler) listRuns(w http.ResponseWriter, r *http.Request) {
	accountID, err := uuid.Parse(r.URL.Query().Get("bank_account_id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "bank_account_id required")
		return
	}
	runs, err := h.svc.ListRuns(r.Context(), accountID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, runs)
}

func (h *Handler) getRun(w http.ResponseWriter, r *http.Request) {
	runID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid run id")
		return
	}
	details, err := h.svc.GetRunDetails(r.Context(), runID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "run not found")
		return
	}
	httpx.JSON(w, http.StatusOK, details)
}

// getRunFull returns every match with full bank line and ledger txn details.
// Used by the frontend reconciliation table to show descriptions and amounts.
func (h *Handler) getRunFull(w http.ResponseWriter, r *http.Request) {
	runID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid run id")
		return
	}
	rows, err := h.svc.GetRunFullView(r.Context(), runID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if rows == nil {
		rows = []reconciliation.FullMatchRow{}
	}
	httpx.JSON(w, http.StatusOK, rows)
}

func (h *Handler) listUnmatched(w http.ResponseWriter, r *http.Request) {
	runID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid run id")
		return
	}
	items, err := h.svc.ListUnmatched(r.Context(), runID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, items)
}

func (h *Handler) recordManualMatch(w http.ResponseWriter, r *http.Request) {
	runID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid run id")
		return
	}
	var in struct {
		BankLineID    uuid.UUID `json:"bank_line_id"`
		InternalTxnID uuid.UUID `json:"internal_txn_id"`
		Notes         string    `json:"notes"`
	}
	if !decode(w, r, &in) {
		return
	}
	user, _ := identityhttp.UserFrom(r.Context())
	m, err := h.svc.RecordManualMatch(r.Context(), runID, in.BankLineID, in.InternalTxnID, user.ID, in.Notes)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "match_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, m)
}

func (h *Handler) markBankUnmatched(w http.ResponseWriter, r *http.Request) {
	runID, _ := uuid.Parse(chi.URLParam(r, "id"))
	var in struct {
		BankLineID uuid.UUID `json:"bank_line_id"`
		Notes      string    `json:"notes"`
	}
	if !decode(w, r, &in) {
		return
	}
	user, _ := identityhttp.UserFrom(r.Context())
	m, err := h.svc.MarkBankLineUnmatched(r.Context(), runID, in.BankLineID, user.ID, in.Notes)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "mark_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, m)
}

func (h *Handler) markInternalUnmatched(w http.ResponseWriter, r *http.Request) {
	runID, _ := uuid.Parse(chi.URLParam(r, "id"))
	var in struct {
		InternalTxnID uuid.UUID `json:"internal_txn_id"`
		Notes         string    `json:"notes"`
	}
	if !decode(w, r, &in) {
		return
	}
	user, _ := identityhttp.UserFrom(r.Context())
	m, err := h.svc.MarkInternalTxnUnmatched(r.Context(), runID, in.InternalTxnID, user.ID, in.Notes)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "mark_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, m)
}

func (h *Handler) closeRun(w http.ResponseWriter, r *http.Request) {
	runID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid run id")
		return
	}
	user, _ := identityhttp.UserFrom(r.Context())
	run, err := h.svc.CloseRun(r.Context(), runID, user.ID)
	if err != nil {
		code := http.StatusBadRequest
		errCode := "close_failed"
		if err == reconciliation.ErrOpenUnmatched {
			errCode = "open_unmatched"
		}
		httpx.Error(w, code, errCode, err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, run)
}

func (h *Handler) unmatchRecord(w http.ResponseWriter, r *http.Request) {
	runID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid run id")
		return
	}
	matchID, err := uuid.Parse(chi.URLParam(r, "matchId"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid match id")
		return
	}
	user, _ := identityhttp.UserFrom(r.Context())
	if err := h.svc.UnmatchRecord(r.Context(), runID, matchID, user.ID); err != nil {
		httpx.Error(w, http.StatusBadRequest, "unmatch_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "unmatched"})
}

func (h *Handler) exportRun(w http.ResponseWriter, r *http.Request) {
	runID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid run id")
		return
	}
	f, filename, err := h.svc.ExportRunExcel(r.Context(), runID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	defer f.Close()
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	if err := f.Write(w); err != nil {
		return
	}
}

// validateBalance checks that the matched totals for a run are consistent with
// the statement opening/closing balances and returns the validation result.
func (h *Handler) validateBalance(w http.ResponseWriter, r *http.Request) {
	runID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid run id")
		return
	}
	result, err := h.svc.ValidateBalance(r.Context(), runID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, result)
}

// tryAutoClose attempts to close the run automatically when every bank line and
// internal transaction has been matched. Returns {"auto_closed": true/false}.
func (h *Handler) tryAutoClose(w http.ResponseWriter, r *http.Request) {
	runID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid run id")
		return
	}
	closed, err := h.svc.TryAutoClose(r.Context(), runID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "auto_close_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"auto_closed": closed})
}

// getExceptions returns a summary of unresolved reconciliation exceptions
// (unmatched lines marked as exceptions) for the given subsidiary.
func (h *Handler) getExceptions(w http.ResponseWriter, r *http.Request) {
	subsidiaryID, err := uuid.Parse(r.URL.Query().Get("subsidiary_id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "subsidiary_id required")
		return
	}
	exceptions, err := h.svc.GetExceptionSummary(r.Context(), subsidiaryID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if exceptions == nil {
		exceptions = []reconciliation.RunSummaryFull{}
	}
	httpx.JSON(w, http.StatusOK, exceptions)
}

// getDashboard returns aggregated run summaries for all bank accounts belonging
// to the given subsidiary, suitable for a high-level reconciliation overview.
func (h *Handler) getDashboard(w http.ResponseWriter, r *http.Request) {
	subsidiaryID, err := uuid.Parse(r.URL.Query().Get("subsidiary_id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "subsidiary_id required")
		return
	}
	summaries, err := h.svc.GetAllRunSummaries(r.Context(), subsidiaryID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if summaries == nil {
		summaries = []reconciliation.RunSummaryFull{}
	}
	httpx.JSON(w, http.StatusOK, summaries)
}

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON body")
		return false
	}
	return true
}
