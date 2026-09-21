package reconhttp

import (
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/pagegroup/pageos/internal/platform/httpx"
	"github.com/pagegroup/pageos/internal/reconciliation"
)

// setBankConnectivity upserts a bank connectivity record for the given account.
//
// POST /accounts/{id}/connectivity
//
//	{
//	  "provider":             "mono" | "okra" | "sftp" | "manual",
//	  "provider_account_id":  "...",
//	  "provider_customer_id": "..."
//	}
func (h *Handler) setBankConnectivity(w http.ResponseWriter, r *http.Request) {
	bankAccountID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid account id")
		return
	}

	var in struct {
		Provider           string `json:"provider"`
		ProviderAccountID  string `json:"provider_account_id"`
		ProviderCustomerID string `json:"provider_customer_id"`
	}
	if !decode(w, r, &in) {
		return
	}

	if in.Provider == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "provider is required")
		return
	}

	switch in.Provider {
	case "mono", "okra", "sftp", "manual":
		// valid
	default:
		httpx.Error(w, http.StatusBadRequest, "bad_request", "provider must be one of: mono, okra, sftp, manual")
		return
	}

	conn, err := h.svc.SetBankConnectivity(r.Context(), reconciliation.SetConnectivityInput{
		BankAccountID:      bankAccountID,
		Provider:           in.Provider,
		ProviderAccountID:  in.ProviderAccountID,
		ProviderCustomerID: in.ProviderCustomerID,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "set_connectivity_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, conn)
}

// getBankConnectivity returns the connectivity config for the given account.
//
// GET /accounts/{id}/connectivity
func (h *Handler) getBankConnectivity(w http.ResponseWriter, r *http.Request) {
	bankAccountID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid account id")
		return
	}

	conn, err := h.svc.GetBankConnectivity(r.Context(), bankAccountID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "connectivity not configured for this account")
		return
	}
	httpx.JSON(w, http.StatusOK, conn)
}

// triggerManualPull manually triggers a Mono statement pull for the given account.
//
// POST /accounts/{id}/pull
//
//	{ "for_date": "YYYY-MM-DD" }   // optional — defaults to yesterday
func (h *Handler) triggerManualPull(w http.ResponseWriter, r *http.Request) {
	bankAccountID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid account id")
		return
	}

	var in struct {
		ForDate string `json:"for_date"`
	}
	// Body is optional — ignore decode errors (empty body is fine).
	_ = decode(w, r, &in)

	var forDate time.Time
	if in.ForDate != "" {
		forDate, err = time.Parse("2006-01-02", in.ForDate)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "for_date must be YYYY-MM-DD")
			return
		}
	} else {
		// Default: yesterday (most common use-case for nightly pulls).
		forDate = time.Now().UTC().AddDate(0, 0, -1)
	}

	secretKey := os.Getenv("MONO_SECRET_KEY")
	if secretKey == "" {
		httpx.Error(w, http.StatusInternalServerError, "misconfigured", "MONO_SECRET_KEY environment variable is not set")
		return
	}

	monoClient := reconciliation.NewMonoClient(secretKey)

	runID, err := h.svc.PullStatementFromMono(r.Context(), bankAccountID, monoClient, forDate)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "pull_failed", err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{"message": "pull completed", "run_id": runID})
}
