// Package financehttp exposes the general ledger journal API over HTTP.
package financehttp

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/pagegroup/pageos/internal/finance"
	identityhttp "github.com/pagegroup/pageos/internal/identity/http"
	"github.com/pagegroup/pageos/internal/platform/httpx"
)

type Handler struct {
	svc *finance.Service
}

func New(svc *finance.Service) *Handler { return &Handler{svc: svc} }

func (h *Handler) Routes(authMW func(http.Handler) http.Handler) http.Handler {
	r := chi.NewRouter()
	r.Use(authMW)

	// Journals
	r.Get("/journals", h.listJournals)
	r.Post("/journals", h.createJournal)
	r.Get("/journals/{id}", h.getJournal)
	r.Post("/journals/{id}/post", h.postJournal)
	r.Post("/journals/{id}/submit", h.submitForApproval)
	r.Post("/journals/{id}/approve", h.approveJournal)
	r.Post("/journals/{id}/reject", h.rejectJournal)
	r.Post("/journals/{id}/reverse", h.reverseJournal)
	r.Delete("/journals/{id}", h.deleteDraft)

	// Financial Reports
	r.Get("/reports/pl", h.profitAndLoss)
	r.Get("/reports/balance-sheet", h.balanceSheet)
	r.Get("/reports/cash-flow", h.cashFlow)

	// Budget vs Actual
	r.Get("/budget", h.listBudgets)
	r.Put("/budget", h.upsertBudgets)
	r.Get("/budget/variance", h.budgetVariance)

	// Tax compliance
	r.Get("/vat/return", h.vatReturn)
	r.Get("/wht/register", h.whtRegister)

	// Fixed Asset Register
	r.Get("/assets/fixed", h.listAssets)
	r.Post("/assets/fixed", h.createAsset)
	r.Get("/assets/fixed/{id}", h.getAsset)
	r.Post("/assets/fixed/{id}/depreciate", h.depreciateAsset)
	r.Post("/assets/fixed/depreciate-all", h.depreciateAll)
	r.Post("/assets/fixed/{id}/dispose", h.disposeAsset)

	// Vendors
	r.Get("/vendors", h.listVendors)
	r.Post("/vendors", h.createVendor)
	r.Get("/vendors/{id}", h.getVendor)
	r.Patch("/vendors/{id}", h.updateVendor)

	// Accounts Payable
	r.Get("/payables", h.listPayables)
	r.Post("/payables", h.createPayable)
	r.Get("/payables/{id}", h.getPayable)
	r.Post("/payables/{id}/approve", h.approvePayable)
	r.Post("/payables/{id}/pay", h.payPayable)
	r.Get("/payables/aging", h.apAging)

	// Accounts Receivable
	r.Get("/receivables", h.listReceivables)
	r.Post("/receivables", h.createReceivable)
	r.Get("/receivables/{id}", h.getReceivable)
	r.Post("/receivables/{id}/receive", h.recordReceipt)
	r.Get("/receivables/aging", h.arAging)

	// Chart of Accounts
	r.Get("/accounts", h.listAccounts)
	r.Post("/accounts", h.createAccount)
	r.Patch("/accounts/{code}", h.updateAccount)
	r.Post("/accounts/{code}/toggle", h.toggleAccount)

	// Accounting Periods
	r.Get("/periods", h.listPeriods)
	r.Post("/periods", h.createPeriod)
	r.Post("/periods/{id}/close", h.closePeriod)
	r.Post("/periods/{id}/reopen", h.reopenPeriod)
	r.Post("/periods/{id}/lock", h.lockPeriod)

	// Reports
	r.Get("/trial-balance", h.trialBalance)
	r.Get("/ledger", h.accountLedger)

	return r
}

// ── List ──────────────────────────────────────────────────────────────────────

func (h *Handler) listJournals(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	var subsidiaryID *uuid.UUID
	if s := q.Get("subsidiary_id"); s != "" {
		id, err := uuid.Parse(s)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid subsidiary_id")
			return
		}
		subsidiaryID = &id
	}

	journals, err := h.svc.ListJournals(r.Context(), subsidiaryID, q.Get("status"))
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if journals == nil {
		journals = []finance.JournalHeader{}
	}
	httpx.JSON(w, http.StatusOK, journals)
}

// ── Create ────────────────────────────────────────────────────────────────────

func (h *Handler) createJournal(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}

	var in finance.CreateJournalInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	if in.Date == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "date is required")
		return
	}

	journal, err := h.svc.CreateJournal(r.Context(), caller.ID, caller.DisplayName, in)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, journal)
}

// ── Get single ────────────────────────────────────────────────────────────────

func (h *Handler) getJournal(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	journal, err := h.svc.GetJournal(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, journal)
}

// ── Post ──────────────────────────────────────────────────────────────────────

func (h *Handler) postJournal(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	if err := h.svc.PostJournal(r.Context(), id, caller.ID); err != nil {
		httpx.Error(w, http.StatusBadRequest, "post_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "posted"})
}

// ── Reverse ───────────────────────────────────────────────────────────────────

func (h *Handler) reverseJournal(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	reversal, err := h.svc.ReverseJournal(r.Context(), id, caller.ID, caller.DisplayName)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "reverse_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, reversal)
}

// ── Delete draft ──────────────────────────────────────────────────────────────

func (h *Handler) deleteDraft(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	if err := h.svc.DeleteDraft(r.Context(), id); err != nil {
		httpx.Error(w, http.StatusBadRequest, "delete_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"deleted": id.String()})
}

// ── Approval workflow ─────────────────────────────────────────────────────────

func (h *Handler) submitForApproval(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	if err := h.svc.SubmitForApproval(r.Context(), id, caller.ID, caller.DisplayName); err != nil {
		httpx.Error(w, http.StatusBadRequest, "submit_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "pending_approval"})
}

func (h *Handler) approveJournal(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	if err := h.svc.ApproveJournal(r.Context(), id, caller.ID); err != nil {
		httpx.Error(w, http.StatusBadRequest, "approve_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "posted"})
}

func (h *Handler) rejectJournal(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	var body struct {
		Note string `json:"note"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if err := h.svc.RejectJournal(r.Context(), id, caller.ID, body.Note); err != nil {
		httpx.Error(w, http.StatusBadRequest, "reject_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "draft"})
}

// ── Financial Reports ─────────────────────────────────────────────────────────

func (h *Handler) profitAndLoss(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	var subID *uuid.UUID
	if s := q.Get("subsidiary_id"); s != "" {
		id, err := uuid.Parse(s)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid subsidiary_id")
			return
		}
		subID = &id
	}
	report, err := h.svc.GetProfitAndLoss(r.Context(), q.Get("from"), q.Get("to"), subID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, report)
}

func (h *Handler) balanceSheet(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	var subID *uuid.UUID
	if s := q.Get("subsidiary_id"); s != "" {
		id, err := uuid.Parse(s)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid subsidiary_id")
			return
		}
		subID = &id
	}
	report, err := h.svc.GetBalanceSheet(r.Context(), q.Get("as_of"), subID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, report)
}

// ── Budget ────────────────────────────────────────────────────────────────────

func (h *Handler) listBudgets(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	year, month, subID, ok := parseBudgetParams(w, q)
	if !ok {
		return
	}
	entries, err := h.svc.ListBudgets(r.Context(), subID, year, month)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if entries == nil {
		entries = []finance.BudgetEntry{}
	}
	httpx.JSON(w, http.StatusOK, entries)
}

func (h *Handler) upsertBudgets(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	year, month, subID, ok := parseBudgetParams(w, q)
	if !ok {
		return
	}
	var body struct {
		Entries []finance.UpsertBudgetInput `json:"entries"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	user, _ := identityhttp.UserFrom(r.Context())
	if err := h.svc.UpsertBudgets(r.Context(), subID, year, month, body.Entries, user.ID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]int{"saved": len(body.Entries)})
}

func (h *Handler) budgetVariance(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	year, month, subID, ok := parseBudgetParams(w, q)
	if !ok {
		return
	}
	report, err := h.svc.GetBudgetVariance(r.Context(), subID, year, month)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, report)
}

// parseBudgetParams extracts year, month, and optional subsidiary_id from query.
func parseBudgetParams(w http.ResponseWriter, q interface{ Get(string) string }) (int, int, *uuid.UUID, bool) {
	year, month := 0, 0
	if y := q.Get("year"); y != "" {
		fmt.Sscanf(y, "%d", &year)
	}
	if m := q.Get("month"); m != "" {
		fmt.Sscanf(m, "%d", &month)
	}
	now := time.Now()
	if year == 0 {
		year = now.Year()
	}
	if month == 0 {
		month = int(now.Month())
	}
	var subID *uuid.UUID
	if s := q.Get("subsidiary_id"); s != "" {
		id, err := uuid.Parse(s)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid subsidiary_id")
			return 0, 0, nil, false
		}
		subID = &id
	}
	return year, month, subID, true
}

func (h *Handler) cashFlow(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	var subID *uuid.UUID
	if s := q.Get("subsidiary_id"); s != "" {
		id, err := uuid.Parse(s)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid subsidiary_id")
			return
		}
		subID = &id
	}
	report, err := h.svc.GetCashFlow(r.Context(), q.Get("from"), q.Get("to"), subID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, report)
}

// ── Chart of Accounts ─────────────────────────────────────────────────────────

func (h *Handler) listAccounts(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	activeOnly := q.Get("active") != "false"
	accounts, err := h.svc.ListAccounts(r.Context(), q.Get("q"), activeOnly)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if accounts == nil {
		accounts = []finance.Account{}
	}
	httpx.JSON(w, http.StatusOK, accounts)
}

func (h *Handler) createAccount(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Code string `json:"code"`
		finance.AccountInput
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	acc, err := h.svc.CreateAccount(r.Context(), in.Code, in.AccountInput)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, acc)
}

func (h *Handler) updateAccount(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	var in finance.AccountInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	acc, err := h.svc.UpdateAccount(r.Context(), code, in)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "update_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, acc)
}

func (h *Handler) toggleAccount(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	acc, err := h.svc.ToggleAccountActive(r.Context(), code)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "toggle_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, acc)
}

// ── Accounting Periods ────────────────────────────────────────────────────────

func (h *Handler) listPeriods(w http.ResponseWriter, r *http.Request) {
	year := 0
	if y := r.URL.Query().Get("year"); y != "" {
		fmt.Sscanf(y, "%d", &year)
	}
	periods, err := h.svc.ListPeriods(r.Context(), year)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if periods == nil {
		periods = []finance.Period{}
	}
	httpx.JSON(w, http.StatusOK, periods)
}

func (h *Handler) createPeriod(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Year  int    `json:"year"`
		Month int    `json:"month"`
		Name  string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	p, err := h.svc.CreatePeriod(r.Context(), in.Year, in.Month, in.Name)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, p)
}

func (h *Handler) closePeriod(w http.ResponseWriter, r *http.Request) {
	h.setPeriodStatus(w, r, "closed")
}
func (h *Handler) reopenPeriod(w http.ResponseWriter, r *http.Request) {
	h.setPeriodStatus(w, r, "open")
}
func (h *Handler) lockPeriod(w http.ResponseWriter, r *http.Request) {
	h.setPeriodStatus(w, r, "locked")
}

func (h *Handler) setPeriodStatus(w http.ResponseWriter, r *http.Request, status string) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	p, err := h.svc.SetPeriodStatus(r.Context(), id, status, caller.ID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "update_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, p)
}

// ── Trial Balance ─────────────────────────────────────────────────────────────

func (h *Handler) trialBalance(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	var subsidiaryID *uuid.UUID
	if s := q.Get("subsidiary_id"); s != "" {
		id, err := uuid.Parse(s)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid subsidiary_id")
			return
		}
		subsidiaryID = &id
	}
	rows, err := h.svc.GetTrialBalance(r.Context(), subsidiaryID, q.Get("as_of"))
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if rows == nil {
		rows = []finance.TrialBalanceRow{}
	}
	httpx.JSON(w, http.StatusOK, rows)
}

// ── Vendors ───────────────────────────────────────────────────────────────────

func (h *Handler) listVendors(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	vendors, err := h.svc.ListVendors(r.Context(), q.Get("q"), q.Get("active") != "false")
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if vendors == nil {
		vendors = []finance.Vendor{}
	}
	httpx.JSON(w, http.StatusOK, vendors)
}

func (h *Handler) createVendor(w http.ResponseWriter, r *http.Request) {
	var in finance.VendorInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	vendor, err := h.svc.CreateVendor(r.Context(), in)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, vendor)
}

func (h *Handler) getVendor(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	vendor, err := h.svc.GetVendor(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, vendor)
}

func (h *Handler) updateVendor(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	var in finance.VendorInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	vendor, err := h.svc.UpdateVendor(r.Context(), id, in)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "update_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, vendor)
}

// ── Accounts Payable ──────────────────────────────────────────────────────────

func (h *Handler) listPayables(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	var subID *uuid.UUID
	if s := q.Get("subsidiary_id"); s != "" {
		id, _ := uuid.Parse(s)
		subID = &id
	}
	payables, err := h.svc.ListPayables(r.Context(), q.Get("status"), subID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if payables == nil {
		payables = []finance.Payable{}
	}
	httpx.JSON(w, http.StatusOK, payables)
}

func (h *Handler) createPayable(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	var in finance.CreatePayableInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	payable, err := h.svc.CreatePayable(r.Context(), caller.ID, caller.DisplayName, in)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, payable)
}

func (h *Handler) getPayable(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	payable, err := h.svc.GetPayable(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, payable)
}

func (h *Handler) approvePayable(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	payable, err := h.svc.ApprovePayable(r.Context(), id, caller.ID, caller.DisplayName)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "approve_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, payable)
}

func (h *Handler) payPayable(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	var body struct {
		PaymentDate     string `json:"payment_date"`
		BankAccountCode string `json:"bank_account_code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.PaymentDate == "" {
		body.PaymentDate = time.Now().Format("2006-01-02")
	}
	if body.BankAccountCode == "" {
		body.BankAccountCode = "1110"
	}
	payable, err := h.svc.PayPayable(r.Context(), id, caller.ID, caller.DisplayName, body.PaymentDate, body.BankAccountCode)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "pay_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, payable)
}

func (h *Handler) apAging(w http.ResponseWriter, r *http.Request) {
	var subID *uuid.UUID
	if s := r.URL.Query().Get("subsidiary_id"); s != "" {
		id, _ := uuid.Parse(s)
		subID = &id
	}
	buckets, err := h.svc.GetAPAging(r.Context(), subID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if buckets == nil {
		buckets = []finance.AgingBucket{}
	}
	httpx.JSON(w, http.StatusOK, buckets)
}

// ── Accounts Receivable ───────────────────────────────────────────────────────

func (h *Handler) listReceivables(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	var subID *uuid.UUID
	if s := q.Get("subsidiary_id"); s != "" {
		id, _ := uuid.Parse(s)
		subID = &id
	}
	receivables, err := h.svc.ListReceivables(r.Context(), q.Get("status"), subID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if receivables == nil {
		receivables = []finance.Receivable{}
	}
	httpx.JSON(w, http.StatusOK, receivables)
}

func (h *Handler) createReceivable(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	var in finance.CreateReceivableInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	rec, err := h.svc.CreateReceivable(r.Context(), caller.ID, caller.DisplayName, in)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, rec)
}

func (h *Handler) getReceivable(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	rec, err := h.svc.GetReceivable(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, rec)
}

func (h *Handler) recordReceipt(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	var in finance.RecordReceiptInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	if in.ReceiptDate == "" {
		in.ReceiptDate = time.Now().Format("2006-01-02")
	}
	if in.BankAccountCode == "" {
		in.BankAccountCode = "1110"
	}
	rec, err := h.svc.RecordReceipt(r.Context(), id, caller.ID, caller.DisplayName, in)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "receipt_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, rec)
}

func (h *Handler) arAging(w http.ResponseWriter, r *http.Request) {
	var subID *uuid.UUID
	if s := r.URL.Query().Get("subsidiary_id"); s != "" {
		id, _ := uuid.Parse(s)
		subID = &id
	}
	buckets, err := h.svc.GetARAging(r.Context(), subID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if buckets == nil {
		buckets = []finance.AgingBucket{}
	}
	httpx.JSON(w, http.StatusOK, buckets)
}

// ── VAT Return ────────────────────────────────────────────────────────────────

func (h *Handler) vatReturn(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	var subID *uuid.UUID
	if s := q.Get("subsidiary_id"); s != "" {
		id, _ := uuid.Parse(s)
		subID = &id
	}
	report, err := h.svc.GetVATReturn(r.Context(), q.Get("from"), q.Get("to"), subID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, report)
}

// ── WHT Register ──────────────────────────────────────────────────────────────

func (h *Handler) whtRegister(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	var subID *uuid.UUID
	if s := q.Get("subsidiary_id"); s != "" {
		id, _ := uuid.Parse(s)
		subID = &id
	}
	register, err := h.svc.GetWHTRegister(r.Context(), q.Get("from"), q.Get("to"), subID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, register)
}

// ── Fixed Assets ──────────────────────────────────────────────────────────────

func (h *Handler) listAssets(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	var subID *uuid.UUID
	if s := q.Get("subsidiary_id"); s != "" {
		id, _ := uuid.Parse(s)
		subID = &id
	}
	assets, err := h.svc.ListAssets(r.Context(), subID, q.Get("status"))
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if assets == nil {
		assets = []finance.Asset{}
	}
	httpx.JSON(w, http.StatusOK, assets)
}

func (h *Handler) createAsset(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	var in finance.CreateAssetInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	asset, err := h.svc.CreateAsset(r.Context(), caller.ID, caller.DisplayName, in)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, asset)
}

func (h *Handler) getAsset(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	asset, err := h.svc.GetAsset(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, asset)
}

func (h *Handler) depreciateAsset(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	var body struct {
		Period string `json:"period"` // "2026-08"
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Period == "" {
		body.Period = fmt.Sprintf("%d-%02d", time.Now().Year(), int(time.Now().Month()))
	}
	run, err := h.svc.DepreciateAsset(r.Context(), id, body.Period, caller.ID, caller.DisplayName)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "depreciate_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, run)
}

func (h *Handler) depreciateAll(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	q := r.URL.Query()
	var subID *uuid.UUID
	if s := q.Get("subsidiary_id"); s != "" {
		id, _ := uuid.Parse(s)
		subID = &id
	}
	period := q.Get("period")
	if period == "" {
		period = fmt.Sprintf("%d-%02d", time.Now().Year(), int(time.Now().Month()))
	}
	runs, err := h.svc.DepreciateAll(r.Context(), subID, period, caller.ID, caller.DisplayName)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if runs == nil {
		runs = []finance.AssetDepRun{}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"period": period, "runs": runs, "count": len(runs)})
}

func (h *Handler) disposeAsset(w http.ResponseWriter, r *http.Request) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	var body struct {
		DisposalDate string  `json:"disposal_date"`
		Proceeds     float64 `json:"proceeds"`
		Notes        string  `json:"notes"`
		BankCode     string  `json:"bank_account_code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	if body.DisposalDate == "" {
		body.DisposalDate = time.Now().Format("2006-01-02")
	}
	if body.BankCode == "" {
		body.BankCode = "1110"
	}
	if err := h.svc.DisposeAsset(r.Context(), id, caller.ID, caller.DisplayName,
		body.DisposalDate, body.Proceeds, body.Notes, body.BankCode); err != nil {
		httpx.Error(w, http.StatusBadRequest, "dispose_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "disposed"})
}

// ── Account Ledger ────────────────────────────────────────────────────────────

func (h *Handler) accountLedger(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	code := q.Get("account_code")
	if code == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "account_code is required")
		return
	}
	entries, openingBalance, err := h.svc.GetAccountLedger(r.Context(), code, q.Get("from"), q.Get("to"))
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if entries == nil {
		entries = []finance.LedgerEntry{}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"account_code":    code,
		"opening_balance": openingBalance,
		"entries":         entries,
	})
}
