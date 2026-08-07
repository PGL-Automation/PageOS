// Command api is the PageOS backend entrypoint.
package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	migrations "github.com/pagegroup/pageos/db/migrations"
	"github.com/pagegroup/pageos/internal/audit"
	"github.com/pagegroup/pageos/internal/appraisal"
	appraisalhttp "github.com/pagegroup/pageos/internal/appraisal/http"
	"github.com/pagegroup/pageos/internal/broker"
	brokerhttp "github.com/pagegroup/pageos/internal/broker/http"
	"github.com/pagegroup/pageos/internal/documents"
	documentshttp "github.com/pagegroup/pageos/internal/documents/http"
	"github.com/pagegroup/pageos/internal/identity"
	identityhttp "github.com/pagegroup/pageos/internal/identity/http"
	identitystore "github.com/pagegroup/pageos/internal/identity/store"
	"github.com/pagegroup/pageos/internal/approval"
	approvalhttp "github.com/pagegroup/pageos/internal/approval/http"
	"github.com/pagegroup/pageos/internal/reconciliation"
	reconhttp "github.com/pagegroup/pageos/internal/reconciliation/http"
	"github.com/pagegroup/pageos/internal/notification"
	"github.com/pagegroup/pageos/internal/onboarding"
	onboardinghttp "github.com/pagegroup/pageos/internal/onboarding/http"
	"github.com/pagegroup/pageos/internal/organization"
	orghttp "github.com/pagegroup/pageos/internal/organization/http"
	orgstore "github.com/pagegroup/pageos/internal/organization/store"
	"github.com/pagegroup/pageos/internal/platform/config"
	"github.com/pagegroup/pageos/internal/platform/db"
	"github.com/pagegroup/pageos/internal/platform/httpx"
	"github.com/pagegroup/pageos/internal/platform/observability"
)

func main() {
	if err := run(); err != nil {
		observability.NewLogger("error").Error("startup failed", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	logger := observability.NewLogger(cfg.LogLevel)
	logger.Info("starting pageos api", "env", cfg.Env, "addr", cfg.HTTPAddr)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Run migrations before opening any module stores. Idempotent — already-
	// applied migrations are skipped. Keeps Docker startup zero-config.
	logger.Info("running database migrations")
	if err := db.RunMigrations(ctx, cfg.DatabaseURL, migrations.FS); err != nil {
		return fmt.Errorf("database migrations: %w", err)
	}
	logger.Info("migrations up to date")

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	// --- Object storage ---
	objStore, err := documents.NewS3Store(ctx, documents.S3Config{
		Endpoint:        cfg.S3Endpoint,
		Bucket:          cfg.S3Bucket,
		Region:          cfg.S3Region,
		AccessKeyID:     cfg.S3AccessKeyID,
		SecretAccessKey: cfg.S3SecretAccessKey,
		ForcePathStyle:  cfg.S3ForcePathStyle,
	})
	if err != nil {
		return err
	}

	// --- Email sender ---
	var emailSender notification.EmailSender
	if cfg.SMTPHost == "" {
		logger.Warn("PAGEOS_SMTP_HOST not set — email notifications disabled")
		emailSender = notification.NoOpSender{}
	} else {
		emailSender = notification.NewSMTPSender(notification.SMTPConfig{
			Host:     cfg.SMTPHost,
			Port:     cfg.SMTPPort,
			Username: cfg.SMTPUser,
			Password: cfg.SMTPPass,
			From:     cfg.SMTPFrom,
		})
	}

	// --- Compose modules ---
	auditWriter := audit.NewWriter(pool)

	identitySvc := identity.NewService(identitystore.New(pool), auditWriter)
	identityH := identityhttp.New(identitySvc)

	orgSvc := organization.NewService(orgstore.New(pool), auditWriter)
	orgH := orghttp.New(orgSvc)

	docSvc := documents.NewService(pool, objStore, documents.StubScanProvider{})
	docH := documentshttp.New(docSvc)

	brokerSvc := broker.NewService(pool, auditWriter)
	brokerH := brokerhttp.New(brokerSvc)

	// Approval service needs an OrgPositionResolver interface; org.Service satisfies
	// it directly (GetActivePositionsForUser signature matches).
	approvalSvc := approval.NewService(pool, orgSvc, auditWriter)
	approvalH := approvalhttp.New(approvalSvc)

	onboardingSvc := onboarding.NewService(pool, auditWriter)
	// Wire approval + org into onboarding (post-construction to avoid circular deps).
	onboardingSvc.SetApprovalService(approvalSvc)
	onboardingSvc.SetOrgService(&orgPositionAdapter{orgSvc})
	// Register onboarding as a terminal-event handler for the approval service.
	approvalSvc.OnTerminalEvent(onboardingSvc.HandleApprovalEvent)

	onboardingH := onboardinghttp.New(onboardingSvc, docSvc)

	reconSvc := reconciliation.NewService(pool, auditWriter)
	reconH := reconhttp.New(reconSvc)

	appraisalSvc := appraisal.NewService(pool)
	appraisalH   := appraisalhttp.New(appraisalSvc)

	// --- Bootstrap: create super-admin and initial HR user if they don't exist ---
	if err := seedBootstrap(ctx, pool, identitySvc, orgSvc, logger); err != nil {
		logger.Warn("bootstrap seed failed (non-fatal)", "err", err)
	}

	// --- Notification dispatcher (background) ---
	dispatcher := notification.NewDispatcher(pool, emailSender, logger)
	go dispatcher.Run(ctx)

	// --- HTTP router ---
	router := httpx.NewRouter(logger, httpx.Deps{DB: pool}, func(api chi.Router) {
		api.Mount("/auth", identityH.Routes())
		api.Mount("/org", orgH.Routes(identityH.Authenticator))
		api.Mount("/documents", docH.Routes(identityH.Authenticator))
		api.Mount("/brokers", brokerH.Routes(identityH.Authenticator))
		api.Mount("/onboarding", onboardingH.Routes(identityH.Authenticator))
		api.Mount("/approval", approvalH.Routes(identityH.Authenticator))
		api.Mount("/reconciliation", reconH.Routes(identityH.Authenticator))
		api.Mount("/appraisal", appraisalH.Routes(identityH.Authenticator))
		// Admin endpoints: user lifecycle management (HR / GROUP_ADMIN).
		api.With(identityH.Authenticator).Post("/admin/provision-user",
			provisionUserHandler(identitySvc, orgSvc))
		api.With(identityH.Authenticator).Post("/admin/users/{userId}/reset-password",
			resetPasswordHandler(pool, auditWriter))
		api.With(identityH.Authenticator).Post("/admin/users/{userId}/deactivate",
			deactivateUserHandler(pool, auditWriter))
		api.With(identityH.Authenticator).Post("/admin/users/{userId}/reactivate",
			reactivateUserHandler(pool, auditWriter))
		api.With(identityH.Authenticator).Get("/admin/users/{userId}",
			getUserDetailHandler(pool, orgSvc))
		api.With(identityH.Authenticator).Post("/admin/users/{userId}/transfer",
			transferEmployeeHandler(pool, orgSvc, auditWriter))
	})

	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
	}

	serveErr := make(chan error, 1)
	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveErr <- err
		}
	}()

	select {
	case err := <-serveErr:
		return err
	case <-ctx.Done():
		logger.Info("shutdown signal received")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	_ = srv.Shutdown(shutdownCtx)
	logger.Info("shutdown complete")
	return nil
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────

// seedBootstrap creates the super-admin user and an initial HR Manager if they
// do not yet exist. Runs at every startup but is idempotent.
func seedBootstrap(ctx context.Context, pool *pgxpool.Pool, identitySvc *identity.Service, orgSvc *organization.Service, log *slog.Logger) error {
	type seedUser struct{ email, password, displayName, positionCode string }
	seeds := []seedUser{
		{"admin@pagegroup.ng", "Admin@PageOS!2026", "System Administrator", "GROUP_ADMIN"},
		{"hr@pagegroup.ng",    "HR@PageOS!2026",    "HR Manager",           "HR_MANAGER"},
	}

	for _, s := range seeds {
		// ── 1. Get or create identity user ──────────────────────────────────
		var userID uuid.UUID
		scanErr := pool.QueryRow(ctx,
			"SELECT id FROM identity.users WHERE email = $1", s.email).Scan(&userID)
		if errors.Is(scanErr, pgx.ErrNoRows) {
			user, err := identitySvc.Register(ctx, s.email, s.password, s.displayName)
			if err != nil {
				log.Warn("bootstrap: could not register user", "email", s.email, "err", err)
				continue
			}
			userID = user.ID
			log.Info("bootstrap: created user", "email", s.email)
		} else if scanErr != nil {
			log.Warn("bootstrap: error checking user", "email", s.email, "err", scanErr)
			continue
		} else {
			log.Info("bootstrap: user exists, checking assignments", "email", s.email)
		}

		// ── 2. Get or create person record ───────────────────────────────────
		var personID uuid.UUID
		if err := pool.QueryRow(ctx,
			"SELECT id FROM organization.person WHERE user_id = $1", userID).Scan(&personID); errors.Is(err, pgx.ErrNoRows) {
			first, last := splitName(s.displayName)
			person, err := orgSvc.CreatePerson(ctx, &userID, first, last, s.email)
			if err != nil {
				log.Warn("bootstrap: could not create person", "email", s.email, "err", err)
				continue
			}
			personID = person.ID
		} else if err != nil {
			log.Warn("bootstrap: error checking person", "email", s.email, "err", err)
			continue
		}

		// ── 3. Resolve group-level position ─────────────────────────────────
		var posID uuid.UUID
		if err := pool.QueryRow(ctx,
			"SELECT id FROM organization.position WHERE code = $1 AND subsidiary_id IS NULL LIMIT 1",
			s.positionCode).Scan(&posID); err != nil {
			log.Warn("bootstrap: group position not found", "code", s.positionCode, "err", err)
			continue
		}

		// ── 4. Assign to every subsidiary that doesn't have this assignment ──
		subs, err := pool.Query(ctx, "SELECT id FROM organization.subsidiary")
		if err != nil {
			log.Warn("bootstrap: could not list subsidiaries", "err", err)
			continue
		}
		var subIDs []uuid.UUID
		for subs.Next() {
			var id uuid.UUID
			if e := subs.Scan(&id); e == nil {
				subIDs = append(subIDs, id)
			}
		}
		subs.Close()

		assigned := 0
		for i, subID := range subIDs {
			var exists int
			_ = pool.QueryRow(ctx,
				`SELECT COUNT(*) FROM organization.assignment
				 WHERE person_id = $1 AND position_id = $2 AND subsidiary_id = $3`,
				personID, posID, subID).Scan(&exists)
			if exists > 0 {
				continue
			}
			if _, err := orgSvc.AssignPosition(ctx, personID, posID, subID, nil, time.Now(), i == 0, nil); err != nil {
				log.Warn("bootstrap: assignment failed", "email", s.email, "subsidiary", subID, "err", err)
			} else {
				assigned++
			}
		}
		if assigned > 0 {
			log.Info("bootstrap: created new assignments", "email", s.email, "count", assigned)
		}
	}
	return nil
}

func splitName(displayName string) (first, last string) {
	parts := strings.Fields(displayName)
	if len(parts) == 0 {
		return "User", "Unknown"
	}
	if len(parts) == 1 {
		return parts[0], ""
	}
	return parts[0], strings.Join(parts[1:], " ")
}

// ── Access control helpers ─────────────────────────────────────────────────────

// isHROrAdmin returns true if the calling user holds an HR or group-admin position.
func isHROrAdmin(ctx context.Context, pool *pgxpool.Pool, callerID uuid.UUID) bool {
	const q = `
		SELECT EXISTS (
			SELECT 1
			FROM organization.assignment a
			JOIN organization.position pos ON pos.id = a.position_id
			JOIN organization.person per ON per.id = a.person_id
			WHERE per.user_id = $1
			  AND pos.code = ANY(ARRAY['HR_MANAGER','HR_OFFICER','GROUP_ADMIN','IT_ADMIN'])
			  AND a.effective_from <= CURRENT_DATE
			  AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
		)
	`
	var exists bool
	_ = pool.QueryRow(ctx, q, callerID).Scan(&exists)
	return exists
}

// ── Provision user (HR / admin) ────────────────────────────────────────────────

type provisionInput struct {
	FirstName               string     `json:"first_name"`
	LastName                string     `json:"last_name"`
	Email                   string     `json:"email"`
	Password                string     `json:"password"`
	PositionCode            string     `json:"position_code"`
	SubsidiaryIDs           []string   `json:"subsidiary_ids"` // empty = group-level position
	EffectiveFrom           string     `json:"effective_from"` // YYYY-MM-DD; empty = today
	ManagerOverridePersonID *uuid.UUID `json:"manager_override_person_id"`
}

// provisionUserHandler atomically creates a user, person record, and assignment(s).
// Called by HR when onboarding a new employee into PageOS.
func provisionUserHandler(identitySvc *identity.Service, orgSvc *organization.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := identityhttp.UserFrom(r.Context())
		if !ok {
			httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
			return
		}
		hasAccess, _ := orgSvc.HasRole(r.Context(), caller.ID, "HR_MANAGER", "HR_OFFICER", "GROUP_ADMIN")
		if !hasAccess {
			httpx.Error(w, http.StatusForbidden, "forbidden", "HR or admin access required")
			return
		}

		var in provisionInput
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
			return
		}
		if in.FirstName == "" || in.LastName == "" || in.Email == "" || in.Password == "" || in.PositionCode == "" {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "first_name, last_name, email, password and position_code are required")
			return
		}

		displayName := in.FirstName + " " + in.LastName

		// 1. Create identity user
		user, err := identitySvc.Register(r.Context(), in.Email, in.Password, displayName)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "create_user_failed", err.Error())
			return
		}

		// 2. Create person
		person, err := orgSvc.CreatePerson(r.Context(), &user.ID, in.FirstName, in.LastName, in.Email)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "create_person_failed", err.Error())
			return
		}

		// 3. Resolve position by code (group-level first, then subsidiary-scoped)
		// We look for a position with the given code; if SubsidiaryIDs are provided
		// we look for both group-level and subsidiary-scoped versions.
		from := time.Now()
		if in.EffectiveFrom != "" {
			if t, parseErr := time.Parse("2006-01-02", in.EffectiveFrom); parseErr == nil {
				from = t
			}
		}

		var assignments []organization.Assignment

		if len(in.SubsidiaryIDs) == 0 {
			// Group-level: position must be a group-level one (subsidiary_id IS NULL)
			pos, err := orgSvc.GetGroupPosition(r.Context(), in.PositionCode)
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "position_not_found",
					fmt.Sprintf("Position '%s' does not exist at group level. Group-level positions are: GROUP_ADMIN, HR_MANAGER, HR_OFFICER, IT_ADMIN, GROUP_FINANCE, COMPLIANCE_MANAGER.", in.PositionCode))
				return
			}
			subs, err := orgSvc.ListSubsidiaries(r.Context())
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
				return
			}
			for i, sub := range subs {
				a, err := orgSvc.AssignPosition(r.Context(), person.ID, pos.ID, sub.ID, nil, from, i == 0, in.ManagerOverridePersonID)
				if err == nil {
					assignments = append(assignments, a)
				}
			}
		} else {
			for i, sidStr := range in.SubsidiaryIDs {
				sid, err := uuid.Parse(sidStr)
				if err != nil {
					httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid subsidiary_id: "+sidStr)
					return
				}
				// Try subsidiary-specific position first, then group-level fallback
				pos, err := orgSvc.GetPositionByCode(r.Context(), sid, in.PositionCode)
				if err != nil {
					pos, err = orgSvc.GetGroupPosition(r.Context(), in.PositionCode)
					if err != nil {
						httpx.Error(w, http.StatusBadRequest, "position_not_found",
							fmt.Sprintf("Position '%s' does not exist in the selected subsidiary or at group level. Check the position code and ensure positions are seeded for that subsidiary.", in.PositionCode))
						return
					}
				}
				a, err := orgSvc.AssignPosition(r.Context(), person.ID, pos.ID, sid, nil, from, i == 0, in.ManagerOverridePersonID)
				if err == nil {
					assignments = append(assignments, a)
				}
			}
		}

		if len(assignments) == 0 {
			httpx.Error(w, http.StatusBadRequest, "no_assignments_created",
				"User was created but no org assignments could be made. This should not happen — check server logs.")
			return
		}

		httpx.JSON(w, http.StatusCreated, map[string]any{
			"user":        user,
			"person":      person,
			"assignments": assignments,
		})
	}
}

// ── User lifecycle handlers ────────────────────────────────────────────────────

func generateTempPassword() string {
	const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#"
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	for i, v := range b {
		b[i] = chars[int(v)%len(chars)]
	}
	return string(b)
}

// resetPasswordHandler generates a new temporary password and updates the user record.
// The new password is returned in the response for HR to communicate to the employee.
func resetPasswordHandler(pool *pgxpool.Pool, auditWriter *audit.Writer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := identityhttp.UserFrom(r.Context())
		if !ok || !isHROrAdmin(r.Context(), pool, caller.ID) {
			httpx.Error(w, http.StatusForbidden, "forbidden", "HR or admin access required")
			return
		}
		userID, err := uuid.Parse(chi.URLParam(r, "userId"))
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid user id")
			return
		}
		temp := generateTempPassword()
		hash, err := identity.HashPassword(temp)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
			return
		}
		_, err = pool.Exec(r.Context(),
			"UPDATE identity.users SET password_hash = $1 WHERE id = $2", hash, userID)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
			return
		}
		_ = auditWriter.Write(r.Context(), audit.Entry{
			Actor:        audit.Actor{Type: "user", ID: caller.ID.String()},
			Action:       "identity.user.password_reset",
			ResourceType: "user", ResourceID: userID.String(),
		})
		httpx.JSON(w, http.StatusOK, map[string]string{"temporary_password": temp})
	}
}

// deactivateUserHandler sets a user's status to "inactive".
func deactivateUserHandler(pool *pgxpool.Pool, auditWriter *audit.Writer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := identityhttp.UserFrom(r.Context())
		if !ok || !isHROrAdmin(r.Context(), pool, caller.ID) {
			httpx.Error(w, http.StatusForbidden, "forbidden", "HR or admin access required")
			return
		}
		userID, err := uuid.Parse(chi.URLParam(r, "userId"))
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid user id")
			return
		}
		_, err = pool.Exec(r.Context(),
			"UPDATE identity.users SET status = 'inactive' WHERE id = $1", userID)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
			return
		}
		_ = auditWriter.Write(r.Context(), audit.Entry{
			Actor:        audit.Actor{Type: "user", ID: caller.ID.String()},
			Action:       "identity.user.deactivated",
			ResourceType: "user", ResourceID: userID.String(),
		})
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "inactive"})
	}
}

// reactivateUserHandler sets a user's status back to "active".
func reactivateUserHandler(pool *pgxpool.Pool, auditWriter *audit.Writer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := identityhttp.UserFrom(r.Context())
		if !ok || !isHROrAdmin(r.Context(), pool, caller.ID) {
			httpx.Error(w, http.StatusForbidden, "forbidden", "HR or admin access required")
			return
		}
		userID, err := uuid.Parse(chi.URLParam(r, "userId"))
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid user id")
			return
		}
		_, err = pool.Exec(r.Context(),
			"UPDATE identity.users SET status = 'active' WHERE id = $1", userID)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "active"})
	}
}

// getUserDetailHandler returns a user with all their current org assignments.
func getUserDetailHandler(pool *pgxpool.Pool, orgSvc *organization.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, err := uuid.Parse(chi.URLParam(r, "userId"))
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid user id")
			return
		}
		type UserDetail struct {
			ID          uuid.UUID `json:"id"`
			Email       string    `json:"email"`
			DisplayName string    `json:"display_name"`
			Status      string    `json:"status"`
			CreatedAt   string    `json:"created_at"`
		}
		var u UserDetail
		err = pool.QueryRow(r.Context(),
			"SELECT id, email, display_name, status, created_at::text FROM identity.users WHERE id = $1",
			userID).Scan(&u.ID, &u.Email, &u.DisplayName, &u.Status, &u.CreatedAt)
		if err != nil {
			httpx.Error(w, http.StatusNotFound, "not_found", "user not found")
			return
		}
		positions, _ := orgSvc.GetUserPositionsInSubsidiary(r.Context(), userID, uuid.Nil)
		httpx.JSON(w, http.StatusOK, map[string]any{"user": u, "positions": positions})
	}
}

// transferInput describes a staff transfer request.
type transferInput struct {
	PersonID                uuid.UUID  `json:"person_id"`
	NewPositionCode         string     `json:"new_position_code"`
	NewSubsidiaryIDs        []string   `json:"new_subsidiary_ids"` // one or more, not necessarily group-wide
	EffectiveFrom           string     `json:"effective_from"`      // YYYY-MM-DD
	EndCurrent              bool       `json:"end_current"`         // close all active assignments
	ManagerOverridePersonID *uuid.UUID `json:"manager_override_person_id"`
}

// transferEmployeeHandler ends the employee's current assignments and opens new ones.
// The new role can span one or more specific subsidiaries (not necessarily group-wide).
func transferEmployeeHandler(pool *pgxpool.Pool, orgSvc *organization.Service, auditWriter *audit.Writer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := identityhttp.UserFrom(r.Context())
		if !ok || !isHROrAdmin(r.Context(), pool, caller.ID) {
			httpx.Error(w, http.StatusForbidden, "forbidden", "HR or admin access required")
			return
		}
		targetUserID, err := uuid.Parse(chi.URLParam(r, "userId"))
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid user id")
			return
		}
		var in transferInput
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
			return
		}
		if in.NewPositionCode == "" || len(in.NewSubsidiaryIDs) == 0 {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "new_position_code and at least one new_subsidiary_id are required")
			return
		}

		from := time.Now()
		if in.EffectiveFrom != "" {
			if t, parseErr := time.Parse("2006-01-02", in.EffectiveFrom); parseErr == nil {
				from = t
			}
		}

		// Get person_id from user_id
		var personID uuid.UUID
		if err := pool.QueryRow(r.Context(),
			"SELECT id FROM organization.person WHERE user_id = $1", targetUserID).Scan(&personID); err != nil {
			httpx.Error(w, http.StatusNotFound, "person_not_found", "no person record for this user")
			return
		}

		// Optionally end all active assignments
		if in.EndCurrent {
			_, err = pool.Exec(r.Context(), `
				UPDATE organization.assignment
				SET effective_to = $1
				WHERE person_id = $2
				  AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
				  AND effective_from <= $1`,
				from, personID)
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, "internal", fmt.Sprintf("end current: %v", err))
				return
			}
		}

		// Create new assignments
		var newAssignments []organization.Assignment
		for i, sidStr := range in.NewSubsidiaryIDs {
			sid, err := uuid.Parse(sidStr)
			if err != nil {
				continue
			}
			pos, err := orgSvc.GetPositionByCode(r.Context(), sid, in.NewPositionCode)
			if err != nil {
				pos, err = orgSvc.GetGroupPosition(r.Context(), in.NewPositionCode)
				if err != nil {
					continue
				}
			}
			a, err := orgSvc.AssignPosition(r.Context(), personID, pos.ID, sid, nil, from, i == 0, in.ManagerOverridePersonID)
			if err == nil {
				newAssignments = append(newAssignments, a)
			}
		}

		if len(newAssignments) == 0 {
			httpx.Error(w, http.StatusBadRequest, "no_assignments_created",
				"Could not create any new assignments. Check position code and subsidiary IDs.")
			return
		}

		_ = auditWriter.Write(r.Context(), audit.Entry{
			Actor:        audit.Actor{Type: "user", ID: caller.ID.String()},
			Action:       "organization.employee.transferred",
			ResourceType: "user", ResourceID: targetUserID.String(),
			Context: map[string]any{
				"new_position":     in.NewPositionCode,
				"subsidiaries":     in.NewSubsidiaryIDs,
				"effective_from":   in.EffectiveFrom,
				"ended_current":    in.EndCurrent,
			},
		})
		httpx.JSON(w, http.StatusOK, map[string]any{"assignments": newAssignments})
	}
}

// orgPositionAdapter adapts organization.Service to the onboarding.OrgPositionLookup
// interface, bridging the two module's Position types.
type orgPositionAdapter struct{ svc *organization.Service }

func (a *orgPositionAdapter) GetPositionByCode(ctx context.Context, subsidiaryID uuid.UUID, code string) (onboarding.OrgPosition, error) {
	pos, err := a.svc.GetPositionByCode(ctx, subsidiaryID, code)
	if err != nil {
		return onboarding.OrgPosition{}, err
	}
	return onboarding.OrgPosition{ID: pos.ID, Code: pos.Code, Title: pos.Title}, nil
}

// ensure logger is used before first module call
var _ = slog.Default
