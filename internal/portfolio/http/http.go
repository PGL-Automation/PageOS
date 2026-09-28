// Package portfoliohttp exposes investment portfolio management over HTTP.
package portfoliohttp

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	identityhttp "github.com/pagegroup/pageos/internal/identity/http"
	"github.com/pagegroup/pageos/internal/organization"
	"github.com/pagegroup/pageos/internal/platform/httpx"
	"github.com/pagegroup/pageos/internal/portfolio"
)

type Handler struct {
	svc    *portfolio.Service
	pool   *pgxpool.Pool
	capSvc *organization.CapabilityService
}

func New(svc *portfolio.Service, pool *pgxpool.Pool, capSvc *organization.CapabilityService) *Handler {
	return &Handler{svc: svc, pool: pool, capSvc: capSvc}
}

// withCap wraps a handler with a capability check.
// Any authenticated user whose effective capabilities include code is allowed;
// all others receive 401 (unauthenticated) or 403 (forbidden).
func (h *Handler) withCap(code string, fn http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := identityhttp.UserFrom(r.Context())
		if !ok {
			httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
			return
		}
		allowed, err := h.capSvc.CheckCapability(r.Context(), caller.ID, code)
		if err != nil || !allowed {
			httpx.Error(w, http.StatusForbidden, "forbidden", "capability required: "+code)
			return
		}
		fn(w, r)
	}
}

func (h *Handler) Routes(authMW func(http.Handler) http.Handler) http.Handler {
	r := chi.NewRouter()
	r.Use(authMW)

	// Instruments (securities master)
	r.Get("/instruments", h.withCap("portfolio.view", h.listInstruments))
	r.Post("/instruments", h.withCap("portfolio.book_trades", h.createInstrument))

	// Funds / mandates
	r.Get("/funds", h.withCap("portfolio.view", h.listFunds))
	r.Post("/funds", h.withCap("portfolio.book_trades", h.createFund))
	r.Get("/funds/{id}", h.withCap("portfolio.view", h.getFund))
	r.Get("/funds/{id}/holdings", h.withCap("portfolio.view", h.getHoldings))
	r.Get("/funds/{id}/summary", h.withCap("portfolio.view", h.getPortfolioSummary))

	// Trades & income
	r.Post("/trades", h.withCap("portfolio.book_trades", h.bookTrade))
	r.Post("/income", h.withCap("portfolio.book_trades", h.recordIncome))

	// Transactions blotter
	r.Get("/transactions", h.withCap("portfolio.view", h.listTransactions))

	// Pricing
	r.Post("/prices", h.withCap("portfolio.book_trades", h.updatePrices))

	// NAV
	r.Post("/funds/{id}/nav", h.withCap("portfolio.calculate_nav", h.calculateNAV))
	r.Get("/funds/{id}/nav", h.withCap("portfolio.view", h.getNAVHistory))
	r.Post("/nav/run-all", h.withCap("portfolio.calculate_nav", h.runAllNAVs))

	// Corporate actions
	r.Get("/corporate-actions", h.withCap("portfolio.view", h.listCorporateActions))
	r.Post("/corporate-actions", h.withCap("portfolio.corporate_actions", h.createCorporateAction))
	r.Get("/corporate-actions/{id}", h.withCap("portfolio.view", h.getCorporateAction))
	r.Post("/corporate-actions/{id}/process", h.withCap("portfolio.corporate_actions", h.processCorporateAction))
	r.Delete("/corporate-actions/{id}", h.withCap("portfolio.corporate_actions", h.cancelCorporateAction))

	// Client accounts
	r.Get("/accounts", h.withCap("portfolio.view", h.listClientAccounts))
	r.Post("/accounts", h.withCap("portfolio.subscribe", h.openClientAccount))
	r.Get("/accounts/{id}", h.withCap("portfolio.view", h.getClientAccount))
	r.Get("/accounts/{id}/statement", h.withCap("portfolio.view_client_reports", h.getClientStatement))
	r.Post("/accounts/{id}/subscribe", h.withCap("portfolio.subscribe", h.processSubscription))
	r.Post("/accounts/{id}/redeem", h.withCap("portfolio.redeem", h.processRedemption))
	r.Get("/accounts/{id}/redemption-preview", h.withCap("portfolio.view", h.redemptionPreview))
	r.Post("/accounts/{id}/redeem-confirmed", h.withCap("portfolio.redeem", h.processRedemptionWithPenalty))

	// ── Performance Analytics ────────────────────────────────────────────────────
	r.Get("/funds/{id}/performance", h.withCap("portfolio.view_performance", h.calculatePerformance))
	r.Get("/funds/{id}/performance/history", h.withCap("portfolio.view_performance", h.getPerformanceHistory))
	r.Get("/funds/{id}/performance/clients", h.withCap("portfolio.view_performance", h.getClientPerformance))

	// ── Compliance ───────────────────────────────────────────────────────────────
	r.Post("/compliance/rules", h.withCap("portfolio.manage_compliance", h.createComplianceRule))
	r.Get("/compliance/rules", h.withCap("portfolio.view", h.listComplianceRules))
	r.Delete("/compliance/rules/{id}", h.withCap("portfolio.manage_compliance", h.deleteComplianceRule))
	r.Post("/compliance/check", h.withCap("portfolio.view", h.checkCompliance))
	r.Get("/compliance/breaches", h.withCap("portfolio.view", h.listBreaches))
	r.Post("/compliance/breaches/{id}/acknowledge", h.withCap("portfolio.acknowledge_breaches", h.acknowledgeBreach))
	r.Post("/compliance/breaches/{id}/resolve", h.withCap("portfolio.acknowledge_breaches", h.resolveBreach))

	// ── Rebalancing ──────────────────────────────────────────────────────────────
	r.Get("/rebalancing/targets", h.withCap("portfolio.view", h.listTargetAllocations))
	r.Post("/rebalancing/targets", h.withCap("portfolio.rebalance", h.setTargetAllocation))
	r.Delete("/rebalancing/targets/{id}", h.withCap("portfolio.rebalance", h.deleteTargetAllocation))
	r.Get("/rebalancing/drift", h.withCap("portfolio.view", h.analyseDrift))
	r.Get("/rebalancing/suggestions", h.withCap("portfolio.view", h.generateRebalancingTrades))
	r.Post("/rebalancing/execute", h.withCap("portfolio.rebalance", h.executeRebalancing))

	// ── Client Reports ───────────────────────────────────────────────────────────
	r.Get("/accounts/{id}/report", h.withCap("portfolio.view_client_reports", h.getClientReport))
	r.Get("/accounts/{id}/report/export", h.withCap("portfolio.export_client_reports", h.exportClientReport))

	return r
}

func (h *Handler) listInstruments(w http.ResponseWriter, r *http.Request) {
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
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
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
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
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
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
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
	caller, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
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
