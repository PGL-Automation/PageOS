// Package documentshttp exposes the documents capabilities over HTTP.
package documentshttp

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/pagegroup/pageos/internal/documents"
	identityhttp "github.com/pagegroup/pageos/internal/identity/http"
	"github.com/pagegroup/pageos/internal/platform/httpx"
)

const maxUploadSize = 20 << 20 // 20 MB per file

// Handler wires HTTP to the documents service.
type Handler struct {
	svc *documents.Service
}

func New(svc *documents.Service) *Handler {
	return &Handler{svc: svc}
}

// Routes returns the documents router protected by authMW.
func (h *Handler) Routes(authMW func(http.Handler) http.Handler) http.Handler {
	r := chi.NewRouter()
	r.Use(authMW)
	r.Post("/", h.upload)
	r.Get("/{id}/download", h.download)
	r.Get("/{id}", h.get)
	return r
}

func (h *Handler) upload(w http.ResponseWriter, r *http.Request) {
	user, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}

	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "could not parse multipart form")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "missing file field")
		return
	}
	defer file.Close()

	// Optional context fields (e.g. case_id, requirement_key) from form values.
	ctx := map[string]any{}
	if v := r.FormValue("case_id"); v != "" {
		ctx["case_id"] = v
	}
	if v := r.FormValue("requirement_key"); v != "" {
		ctx["requirement_key"] = v
	}

	doc, err := h.svc.Upload(r.Context(), documents.UploadInput{
		UploaderID:  user.ID,
		Filename:    header.Filename,
		ContentType: header.Header.Get("Content-Type"),
		Size:        header.Size,
		Body:        file,
		Context:     ctx,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "upload_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, doc)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid document id")
		return
	}
	doc, err := h.svc.GetDocument(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "document not found")
		return
	}
	httpx.JSON(w, http.StatusOK, doc)
}

func (h *Handler) download(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid document id")
		return
	}
	url, err := h.svc.GetSignedURL(r.Context(), id, 15*time.Minute)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "document not found")
		return
	}
	http.Redirect(w, r, url, http.StatusFound)
}
