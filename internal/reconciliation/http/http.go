// Package reconhttp exposes reconciliation capabilities over HTTP.
package reconhttp

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	identityhttp "github.com/pagegroup/pageos/internal/identity/http"
	"github.com/pagegroup/pageos/internal/platform/httpx"
	"github.com/pagegroup/pageos/internal/reconciliation"
)

// isExcelFile returns true when a filename has an Excel extension.
func isExcelFile(name string) bool {
	lower := strings.ToLower(name)
	return strings.HasSuffix(lower, ".xlsx") || strings.HasSuffix(lower, ".xls")
}

type Handler struct {
	svc *reconciliation.Service
}

func New(svc *reconciliation.Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) Routes(authMW func(http.Handler) http.Handler) http.Handler {
	r := chi.NewRouter()
	r.Use(authMW)

	r.Post("/accounts", h.createAccount)
	r.Get("/accounts", h.listAccounts)
	r.Get("/accounts/{id}/statements", h.listStatements)
	r.Post("/accounts/{id}/statements", h.uploadStatement)
	r.Post("/accounts/{id}/ledger", h.uploadLedger)

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
		ColMap        map[string]string `json:"parser_column_map"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Currency == "" {
		in.Currency = "NGN"
	}
	acct, err := h.svc.CreateBankAccount(r.Context(), in.SubsidiaryID, in.BankName, in.AccountNumber, in.AccountName, in.Currency, in.ColMap)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, acct)
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

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON body")
		return false
	}
	return true
}
