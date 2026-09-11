// Package documentshttp exposes the documents capabilities over HTTP.
package documentshttp

import (
	"context"
	"fmt"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/pagegroup/pageos/internal/documents"
	identityhttp "github.com/pagegroup/pageos/internal/identity/http"
	"github.com/pagegroup/pageos/internal/platform/httpx"
)

const maxUploadSize = 20 << 20 // 20 MB

// RoleChecker can report whether a user holds any of the given role codes.
type RoleChecker interface {
	HasRole(ctx context.Context, userID uuid.UUID, codes ...string) (bool, error)
}

type Handler struct {
	svc   *documents.Service
	roles RoleChecker
}

func New(svc *documents.Service, roles RoleChecker) *Handler {
	return &Handler{svc: svc, roles: roles}
}

func (h *Handler) Routes(authMW func(http.Handler) http.Handler) http.Handler {
	r := chi.NewRouter()
	r.Use(authMW)
	r.Post("/", h.upload)
	r.Get("/", h.list)
	r.Get("/{id}/download", h.download)
	r.Get("/{id}", h.get)
	r.Delete("/{id}", h.deleteDoc)
	return r
}

// isHROrAdmin returns true if the caller holds an HR manager, HR officer, or group-admin role.
func (h *Handler) isHROrAdmin(ctx context.Context, userID uuid.UUID) bool {
	ok, err := h.roles.HasRole(ctx, userID, "HR_MANAGER", "HR_OFFICER", "GROUP_ADMIN")
	return err == nil && ok
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

	vaultType := r.FormValue("vault_type")
	if vaultType == "" {
		vaultType = "onboarding"
	}
	category := r.FormValue("category")

	ctx := map[string]any{}
	var subjectUserID *uuid.UUID

	switch vaultType {
	case "hr_employee":
		empIDStr := r.FormValue("for_employee_id")
		if empIDStr != "" {
			ctx["for_employee_id"] = empIDStr
			if parsed, err := uuid.Parse(empIDStr); err == nil {
				subjectUserID = &parsed
			}
		}
	case "onboarding":
		if v := r.FormValue("case_id"); v != "" {
			ctx["case_id"] = v
		}
		if v := r.FormValue("requirement_key"); v != "" {
			ctx["requirement_key"] = v
		}
		if v := r.FormValue("for_employee_id"); v != "" {
			ctx["for_employee_id"] = v
			if parsed, err := uuid.Parse(v); err == nil {
				subjectUserID = &parsed
			}
		}
	}

	doc, err := h.svc.Upload(r.Context(), documents.UploadInput{
		UploaderID:    user.ID,
		Filename:      header.Filename,
		ContentType:   header.Header.Get("Content-Type"),
		Size:          header.Size,
		Body:          file,
		VaultType:     vaultType,
		Category:      category,
		SubjectUserID: subjectUserID,
		Context:       ctx,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "upload_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, doc)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	user, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}

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

	// FIX 2: caller must be HR/admin OR own the document.
	if !h.isHROrAdmin(r.Context(), user.ID) && !docBelongsToCaller(doc, user.ID) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "access denied")
		return
	}

	httpx.JSON(w, http.StatusOK, doc)
}

func (h *Handler) deleteDoc(w http.ResponseWriter, r *http.Request) {
	user, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}

	// FIX 4: only HR/admin may delete documents.
	if !h.isHROrAdmin(r.Context(), user.ID) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "HR or admin access required")
		return
	}

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid document id")
		return
	}
	if err := h.svc.DeleteDocument(r.Context(), id); err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "document not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) download(w http.ResponseWriter, r *http.Request) {
	user, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid document id")
		return
	}

	// FIX 3: ownership check before streaming.
	doc, err := h.svc.GetDocument(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "document not found")
		return
	}
	if !h.isHROrAdmin(r.Context(), user.ID) && !docBelongsToCaller(doc, user.ID) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "access denied")
		return
	}

	rc, filename, mimeType, err := h.svc.StreamDocument(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "document not found")
		return
	}
	defer rc.Close()
	if mimeType != "" {
		w.Header().Set("Content-Type", mimeType)
	}
	w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename=%q`, filename))
	io.Copy(w, rc) //nolint:errcheck
}

// list handles two modes:
//   - ?vault_type=personal  → caller's own private vault
//   - ?for_employee_id=UUID → HR vault for a specific employee (HR/admin only, or self)
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	user, ok := identityhttp.UserFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}

	vaultType := r.URL.Query().Get("vault_type")
	if vaultType == "personal" {
		docs, err := h.svc.ListPersonalDocuments(r.Context(), user.ID)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
			return
		}
		if docs == nil {
			docs = []documents.Document{}
		}
		httpx.JSON(w, http.StatusOK, docs)
		return
	}

	empIDStr := r.URL.Query().Get("for_employee_id")
	if empIDStr == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "vault_type=personal or for_employee_id required")
		return
	}
	employeeID, err := uuid.Parse(empIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid for_employee_id")
		return
	}

	// FIX 1: non-HR/admin callers may only list their own employee documents.
	if !h.isHROrAdmin(r.Context(), user.ID) && employeeID != user.ID {
		httpx.Error(w, http.StatusForbidden, "forbidden", "access denied")
		return
	}

	docs, err := h.svc.ListDocumentsByEmployee(r.Context(), employeeID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if docs == nil {
		docs = []documents.Document{}
	}
	httpx.JSON(w, http.StatusOK, docs)
}

// docBelongsToCaller returns true if the document was uploaded by the caller
// or its subject is the caller.
func docBelongsToCaller(doc documents.Document, callerID uuid.UUID) bool {
	if doc.UploadedBy == callerID {
		return true
	}
	if doc.SubjectUserID != nil && *doc.SubjectUserID == callerID {
		return true
	}
	// Also check the context map for for_employee_id (for documents stored before
	// subject_user_id was populated).
	if empID, ok := doc.Context["for_employee_id"].(string); ok && empID == callerID.String() {
		return true
	}
	return false
}
