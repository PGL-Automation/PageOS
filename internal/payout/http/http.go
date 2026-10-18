// Package payouthttp exposes payout management over HTTP.
package payouthttp

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/pagegroup/pageos/internal/payout"
	identityhttp "github.com/pagegroup/pageos/internal/identity/http"
	"github.com/pagegroup/pageos/internal/platform/httpx"
)

// Handler wires HTTP to the payout service.
type Handler struct {
	svc *payout.Service
}

// New constructs a Handler backed by the given Service.
func New(svc *payout.Service) *Handler {
	return &Handler{svc: svc}
}

// Routes returns the payout router with all routes mounted under the provided
// auth middleware.
func (h *Handler) Routes(authMW func(http.Handler) http.Handler) http.Handler {
	r := chi.NewRouter()
	r.Use(authMW)

	// Beneficiary sub-routes must be registered before /{id} to avoid the
	// chi router matching "beneficiaries" as a UUID parameter.
	r.Get("/beneficiaries", h.listBeneficiaries)
	r.Post("/beneficiaries/check", h.checkBeneficiary)

	// Payment account lookup.
	r.Get("/accounts", h.listAccounts)

	// Pending steps for the current user.
	r.Get("/pending", h.pending)

	// Collection.
	r.Get("/", h.list)
	r.Post("/", h.create)

	// Single request.
	r.Get("/{id}", h.detail)
	r.Post("/{id}/submit", h.submit)
	r.Post("/{id}/approve", h.act("approve"))
	r.Post("/{id}/return", h.act("return"))
	r.Post("/{id}/reject", h.act("reject"))
	r.Post("/{id}/dispatch", h.dispatch)
	r.Post("/{id}/confirm", h.confirmPayment)
	r.Get("/{id}/letter", h.letter)

	return r
}

// ── Handlers ──────────────────────────────────────────────────────────────────

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	user, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}

	var in struct {
		SubsidiaryID     uuid.UUID `json:"subsidiary_id"`
		RequestType      string    `json:"request_type"`
		PaymentAccountID uuid.UUID `json:"payment_account_id"`
		AmountKobo       int64     `json:"amount_kobo"`
		BeneficiaryName  string    `json:"beneficiary_name"`
		BeneficiaryBank  string    `json:"beneficiary_bank"`
		BeneficiaryAcct  string    `json:"beneficiary_account"`
		Purpose          string    `json:"purpose"`
	}
	if !decode(w, r, &in) {
		return
	}

	req, err := h.svc.CreateRequest(
		r.Context(),
		in.SubsidiaryID,
		payout.RequestType(in.RequestType),
		in.PaymentAccountID,
		in.AmountKobo,
		in.BeneficiaryName,
		in.BeneficiaryBank,
		in.BeneficiaryAcct,
		in.Purpose,
		user.ID,
	)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, req)
}

func (h *Handler) submit(w http.ResponseWriter, r *http.Request) {
	user, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}

	id, ok := parseUUID(w, r, "id")
	if !ok {
		return
	}

	req, err := h.svc.SubmitRequest(r.Context(), id, user.ID)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, req)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	var subsidiaryID uuid.UUID
	if sidStr := q.Get("subsidiary_id"); sidStr != "" {
		var err error
		subsidiaryID, err = uuid.Parse(sidStr)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid subsidiary_id")
			return
		}
	}

	status := q.Get("status")
	mine := q.Get("mine") == "true"

	var userID uuid.UUID
	if mine {
		user, ok := identityhttp.UserFrom(r.Context())
		if !ok {
			httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
			return
		}
		userID = user.ID
	}

	reqs, err := h.svc.ListRequests(r.Context(), subsidiaryID, status, mine, userID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, reqs)
}

func (h *Handler) pending(w http.ResponseWriter, r *http.Request) {
	user, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}

	steps, err := h.svc.GetPendingForUser(r.Context(), user.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, steps)
}

func (h *Handler) detail(w http.ResponseWriter, r *http.Request) {
	id, ok := parseUUID(w, r, "id")
	if !ok {
		return
	}

	detail, err := h.svc.GetRequest(r.Context(), id)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, detail)
}

// act returns a handler closure that processes approve / return / reject actions.
func (h *Handler) act(action string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, ok := identityhttp.UserFrom(r.Context())
		if !ok {
			httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
			return
		}

		id, ok := parseUUID(w, r, "id")
		if !ok {
			return
		}

		var in struct {
			Notes string `json:"notes"`
		}
		// Notes are optional; ignore decode failure for empty bodies.
		_ = json.NewDecoder(r.Body).Decode(&in)

		req, err := h.svc.ActOnStep(r.Context(), id, user.ID, action, in.Notes)
		if err != nil {
			writeServiceError(w, err)
			return
		}
		httpx.JSON(w, http.StatusOK, req)
	}
}

func (h *Handler) dispatch(w http.ResponseWriter, r *http.Request) {
	user, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}

	id, ok := parseUUID(w, r, "id")
	if !ok {
		return
	}

	var in struct {
		BankReference string `json:"bank_reference"`
	}
	if !decode(w, r, &in) {
		return
	}

	req, err := h.svc.DispatchRequest(r.Context(), id, user.ID, in.BankReference)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, req)
}

func (h *Handler) confirmPayment(w http.ResponseWriter, r *http.Request) {
	user, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}

	id, ok := parseUUID(w, r, "id")
	if !ok {
		return
	}

	var in struct {
		ConfirmationDocPath string `json:"confirmation_doc_path"`
	}
	if !decode(w, r, &in) {
		return
	}

	req, err := h.svc.ConfirmRequest(r.Context(), id, user.ID, in.ConfirmationDocPath)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, req)
}

func (h *Handler) letter(w http.ResponseWriter, r *http.Request) {
	id, ok := parseUUID(w, r, "id")
	if !ok {
		return
	}

	html, err := h.svc.GetLetter(r.Context(), id)
	if err != nil {
		writeServiceError(w, err)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(html))
}

func (h *Handler) listBeneficiaries(w http.ResponseWriter, r *http.Request) {
	sidStr := r.URL.Query().Get("subsidiary_id")
	if sidStr == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "subsidiary_id query param required")
		return
	}
	sid, err := uuid.Parse(sidStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid subsidiary_id")
		return
	}

	beneficiaries, err := h.svc.ListBeneficiaries(r.Context(), sid)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, beneficiaries)
}

func (h *Handler) checkBeneficiary(w http.ResponseWriter, r *http.Request) {
	var in struct {
		AccountNumber string    `json:"account_number"`
		SubsidiaryID  uuid.UUID `json:"subsidiary_id"`
	}
	if !decode(w, r, &in) {
		return
	}

	onRegister, err := h.svc.CheckBeneficiary(r.Context(), in.SubsidiaryID, in.AccountNumber)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"on_register": onRegister})
}

func (h *Handler) listAccounts(w http.ResponseWriter, r *http.Request) {
	sidStr := r.URL.Query().Get("subsidiary_id")
	if sidStr == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "subsidiary_id query param required")
		return
	}
	sid, err := uuid.Parse(sidStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid subsidiary_id")
		return
	}

	accounts, err := h.svc.ListPaymentAccounts(r.Context(), sid)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, accounts)
}

// ── Error mapping ─────────────────────────────────────────────────────────────

// writeServiceError maps payout sentinel errors to HTTP status codes.
func writeServiceError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, payout.ErrNotFound):
		httpx.Error(w, http.StatusNotFound, "not_found", err.Error())
	case errors.Is(err, payout.ErrForbidden):
		httpx.Error(w, http.StatusForbidden, "forbidden", err.Error())
	case errors.Is(err, payout.ErrNotYourStep):
		httpx.Error(w, http.StatusForbidden, "not_your_step", err.Error())
	case errors.Is(err, payout.ErrLocked):
		httpx.Error(w, http.StatusConflict, "locked", err.Error())
	case errors.Is(err, payout.ErrAlreadyActed):
		httpx.Error(w, http.StatusConflict, "already_acted", err.Error())
	default:
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// decode decodes the JSON request body into dst, writing a 400 response and
// returning false on failure.
func decode[T any](w http.ResponseWriter, r *http.Request, dst *T) bool {
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON body")
		return false
	}
	return true
}

// parseUUID extracts a chi URL parameter by name and parses it as a UUID,
// writing a 400 response and returning false on failure.
func parseUUID(w http.ResponseWriter, r *http.Request, param string) (uuid.UUID, bool) {
	raw := chi.URLParam(r, param)
	id, err := uuid.Parse(raw)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid "+param)
		return uuid.UUID{}, false
	}
	return id, true
}
