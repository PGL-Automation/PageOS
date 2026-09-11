// Package portfoliohttp exposes investment portfolio management over HTTP.
package portfoliohttp

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/pagegroup/pageos/internal/identity"
	identityhttp "github.com/pagegroup/pageos/internal/identity/http"
	"github.com/pagegroup/pageos/internal/platform/httpx"
	"github.com/pagegroup/pageos/internal/portfolio"
)

type Handler struct {
	svc  *portfolio.Service
	pool *pgxpool.Pool
}

func New(svc *portfolio.Service, pool *pgxpool.Pool) *Handler {
	return &Handler{svc: svc, pool: pool}
}

// portfolioStaffRoles may read all portfolio data and perform non-mutating actions.
var portfolioStaffRoles = []string{
	"HEAD_OF_INVESTMENT",
	"HEAD_INVESTMENT_MGMT",
	"GROUP_HEAD_WEALTH_MGMT",
	"PORTFOLIO_MANAGER",
	"PORTFOLIO_MGMT_ASSISTANT",
	"EQUITY_TRADER",
	"GROUP_ADMIN",
}

// portfolioWriteRoles may initiate trades, subscriptions, and redemptions.
var portfolioWriteRoles = []string{
	"HEAD_OF_INVESTMENT",
	"HEAD_INVESTMENT_MGMT",
	"GROUP_HEAD_WEALTH_MGMT",
	"PORTFOLIO_MANAGER",
	"EQUITY_TRADER",
	"GROUP_ADMIN",
}

// hasAnyRole returns true when the user holds at least one of the provided
// position codes in an active organisation.assignment.
func (h *Handler) hasAnyRole(ctx context.Context, userID uuid.UUID, codes []string) (bool, error) {
	const q = `
		SELECT EXISTS (
			SELECT 1
			FROM organization.assignment a
			JOIN organization.position pos ON pos.id = a.position_id
			JOIN organization.person   per ON per.id = a.person_id
			WHERE per.user_id = $1
			  AND pos.code = ANY($2::text[])
			  AND a.effective_from <= CURRENT_DATE
			  AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
		)
	`
	var exists bool
	if err := h.pool.QueryRow(ctx, q, userID, codes).Scan(&exists); err != nil {
		return false, err
	}
	return exists, nil
}

// requirePortfolioStaff checks that the caller holds any portfolio-staff role.
// Returns (caller, true) on success; writes 401/403 and returns (_, false) on failure.
func (h *Handler) requirePortfolioStaff(w http.ResponseWriter, r *http.Request) (identity.User, bool) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return identity.User{}, false
	}
	if ok2, err := h.hasAnyRole(r.Context(), caller.ID, portfolioStaffRoles); err != nil || !ok2 {
		httpx.Error(w, http.StatusForbidden, "forbidden", "portfolio staff role required")
		return identity.User{}, false
	}
	return caller, true
}

// requirePortfolioWrite checks that the caller holds a write-capable portfolio role.
// Returns (caller, true) on success; writes 401/403 and returns (_, false) on failure.
func (h *Handler) requirePortfolioWrite(w http.ResponseWriter, r *http.Request) (identity.User, bool) {
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return identity.User{}, false
	}
	if ok2, err := h.hasAnyRole(r.Context(), caller.ID, portfolioWriteRoles); err != nil || !ok2 {
		httpx.Error(w, http.StatusForbidden, "forbidden", "portfolio write role required (manager/trader/head)")
		return identity.User{}, false
	}
	return caller, true
}

func (h *Handler) Routes(authMW func(http.Handler) http.Handler) http.Handler {
	r := chi.NewRouter()
	r.Use(authMW)

	// Instruments (securities master)
	r.Get("/instruments", h.listInstruments)
	r.Post("/instruments", h.createInstrument)

	// Funds / mandates
	r.Get("/funds", h.listFunds)
	r.Post("/funds", h.createFund)
	r.Get("/funds/{id}", h.getFund)
	r.Get("/funds/{id}/holdings", h.getHoldings)
	r.Get("/funds/{id}/summary", h.getPortfolioSummary)

	// Trades & income
	r.Post("/trades", h.bookTrade)
	r.Post("/income", h.recordIncome)

	// Transactions blotter
	r.Get("/transactions", h.listTransactions)

	// Pricing
	r.Post("/prices", h.updatePrices)

	// Client accounts
	r.Get("/accounts", h.listClientAccounts)
	r.Post("/accounts", h.openClientAccount)
	r.Get("/accounts/{id}", h.getClientAccount)
	r.Get("/accounts/{id}/statement", h.getClientStatement)
	r.Post("/accounts/{id}/subscribe", h.processSubscription)
	r.Post("/accounts/{id}/redeem", h.processRedemption)                 // legacy simple
	r.Get("/accounts/{id}/redemption-preview", h.redemptionPreview)       // preview before confirm
	r.Post("/accounts/{id}/redeem-confirmed", h.processRedemptionWithPenalty) // full workflow

	return r
}

func (h *Handler) listInstruments(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioStaff(w, r); !ok {
		return
	}
	q := r.URL.Query()
	instruments, err := h.svc.ListInstruments(r.Context(), q.Get("asset_class"), q.Get("active") != "false")
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if instruments == nil {
		instruments = []portfolio.Instrument{}
	}
	httpx.JSON(w, http.StatusOK, instruments)
}

func (h *Handler) createInstrument(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioWrite(w, r); !ok {
		return
	}
	var in portfolio.CreateInstrumentInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	inst, err := h.svc.CreateInstrument(r.Context(), in)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, inst)
}

func (h *Handler) listFunds(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioStaff(w, r); !ok {
		return
	}
	var subID *uuid.UUID
	if s := r.URL.Query().Get("subsidiary_id"); s != "" {
		id, err := uuid.Parse(s)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid subsidiary_id")
			return
		}
		subID = &id
	}
	funds, err := h.svc.ListFunds(r.Context(), subID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if funds == nil {
		funds = []portfolio.Fund{}
	}
	httpx.JSON(w, http.StatusOK, funds)
}

func (h *Handler) createFund(w http.ResponseWriter, r *http.Request) {
	caller, ok := h.requirePortfolioWrite(w, r)
	if !ok {
		return
	}
	var in portfolio.CreateFundInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	fund, err := h.svc.CreateFund(r.Context(), in, caller.ID, caller.DisplayName)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, fund)
}

func (h *Handler) getFund(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioStaff(w, r); !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	fund, err := h.svc.GetFundByID(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "fund not found")
		return
	}
	httpx.JSON(w, http.StatusOK, fund)
}

func (h *Handler) getHoldings(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioStaff(w, r); !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	holdings, err := h.svc.GetHoldings(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if holdings == nil {
		holdings = []portfolio.Holding{}
	}
	httpx.JSON(w, http.StatusOK, holdings)
}

func (h *Handler) getPortfolioSummary(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioStaff(w, r); !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	summary, err := h.svc.GetPortfolioSummary(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, summary)
}

func (h *Handler) bookTrade(w http.ResponseWriter, r *http.Request) {
	caller, ok := h.requirePortfolioWrite(w, r)
	if !ok {
		return
	}
	var in portfolio.TradeInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	txn, err := h.svc.BookTrade(r.Context(), in, caller.ID, caller.DisplayName)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "trade_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, txn)
}

func (h *Handler) recordIncome(w http.ResponseWriter, r *http.Request) {
	caller, ok := h.requirePortfolioWrite(w, r)
	if !ok {
		return
	}
	var in portfolio.IncomeInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	txn, err := h.svc.RecordIncome(r.Context(), in, caller.ID, caller.DisplayName)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "income_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, txn)
}

func (h *Handler) listTransactions(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioStaff(w, r); !ok {
		return
	}
	q := r.URL.Query()
	var fundID *uuid.UUID
	if s := q.Get("fund_id"); s != "" {
		id, err := uuid.Parse(s)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid fund_id")
			return
		}
		fundID = &id
	}
	limit := 100
	if l := q.Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 {
			limit = n
		}
	}
	txns, err := h.svc.ListTransactions(r.Context(), fundID, q.Get("type"), limit)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if txns == nil {
		txns = []portfolio.Transaction{}
	}
	httpx.JSON(w, http.StatusOK, txns)
}

// ── Client accounts ────────────────────────────────────────────────────────────

func (h *Handler) listClientAccounts(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioStaff(w, r); !ok {
		return
	}
	q := r.URL.Query()
	var clientID, fundID *uuid.UUID
	if s := q.Get("client_id"); s != "" {
		id, err := uuid.Parse(s)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid client_id")
			return
		}
		clientID = &id
	}
	if s := q.Get("fund_id"); s != "" {
		id, err := uuid.Parse(s)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid fund_id")
			return
		}
		fundID = &id
	}
	accounts, err := h.svc.ListClientAccounts(r.Context(), clientID, fundID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if accounts == nil {
		accounts = []portfolio.ClientAccount{}
	}
	httpx.JSON(w, http.StatusOK, accounts)
}

func (h *Handler) openClientAccount(w http.ResponseWriter, r *http.Request) {
	caller, ok := h.requirePortfolioWrite(w, r)
	if !ok {
		return
	}
	var in portfolio.OpenAccountInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	acc, err := h.svc.OpenClientAccount(r.Context(), in, caller.ID, caller.DisplayName)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, acc)
}

func (h *Handler) getClientAccount(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioStaff(w, r); !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	accounts, err := h.svc.ListClientAccounts(r.Context(), nil, nil)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	for _, a := range accounts {
		if a.ID == id {
			httpx.JSON(w, http.StatusOK, a)
			return
		}
	}
	httpx.Error(w, http.StatusNotFound, "not_found", "account not found")
}

func (h *Handler) getClientStatement(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioStaff(w, r); !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	q := r.URL.Query()
	txns, err := h.svc.GetClientStatement(r.Context(), id, q.Get("from"), q.Get("to"))
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if txns == nil {
		txns = []portfolio.ClientTransaction{}
	}
	httpx.JSON(w, http.StatusOK, txns)
}

func (h *Handler) processSubscription(w http.ResponseWriter, r *http.Request) {
	caller, ok := h.requirePortfolioWrite(w, r)
	if !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	var in portfolio.SubscriptionInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	in.AccountID = id
	txn, err := h.svc.ProcessSubscription(r.Context(), in, caller.ID, caller.DisplayName)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "subscription_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, txn)
}

func (h *Handler) processRedemption(w http.ResponseWriter, r *http.Request) {
	caller, ok := h.requirePortfolioWrite(w, r)
	if !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	var in portfolio.RedemptionInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	in.AccountID = id
	txn, err := h.svc.ProcessRedemption(r.Context(), in, caller.ID, caller.DisplayName)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "redemption_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, txn)
}

func (h *Handler) redemptionPreview(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioStaff(w, r); !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	q := r.URL.Query()
	amount := 0.0
	nav := 1.0
	if s := q.Get("amount"); s != "" {
		fmt.Sscanf(s, "%f", &amount)
	}
	if s := q.Get("nav_per_unit"); s != "" {
		fmt.Sscanf(s, "%f", &nav)
	}
	date := q.Get("date")
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}
	preview, err := h.svc.GetRedemptionPreview(r.Context(), id, amount, nav, date)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "preview_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, preview)
}

func (h *Handler) processRedemptionWithPenalty(w http.ResponseWriter, r *http.Request) {
	caller, ok := h.requirePortfolioWrite(w, r)
	if !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}
	var in portfolio.ConfirmedRedemptionInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	in.AccountID = id
	txn, preview, err := h.svc.ProcessRedemptionWithPenalty(r.Context(), in, caller.ID, caller.DisplayName)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "redemption_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{
		"transaction": txn,
		"summary":     preview,
	})
}

func (h *Handler) updatePrices(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePortfolioWrite(w, r); !ok {
		return
	}
	var prices []portfolio.PriceInput
	if err := json.NewDecoder(r.Body).Decode(&prices); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if err := h.svc.UpdatePrices(r.Context(), prices); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]int{"updated": len(prices)})
}
