package notification

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Scheduler runs periodic checks and generates time-based in-app notifications:
//   - Client birthday reminders (3 days ahead) → assigned WM RM
//   - CRM follow-up reminders (due today) → assigned WM RM
//   - CRM task due-today reminders → assigned person
//   - Leave request approval reminders (pending > 2 days) → HR managers
//   - Journal pending approval reminders (pending > 1 day) → Finance managers
type Scheduler struct {
	pool   *pgxpool.Pool
	logger *slog.Logger
}

func NewScheduler(pool *pgxpool.Pool, logger *slog.Logger) *Scheduler {
	return &Scheduler{pool: pool, logger: logger}
}

// Run fires all scheduled checks once at startup, then every hour.
// Cancel the context to stop cleanly.
func (s *Scheduler) Run(ctx context.Context) {
	s.logger.Info("notification scheduler started")
	s.runAll(ctx)

	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			s.logger.Info("notification scheduler stopped")
			return
		case <-ticker.C:
			s.runAll(ctx)
		}
	}
}

func (s *Scheduler) runAll(ctx context.Context) {
	jobs := []struct {
		name string
		fn   func(context.Context) error
	}{
		{"birthday reminders", s.birthdayReminders},
		{"followup reminders", s.followupReminders},
		{"task due reminders", s.taskDueReminders},
		{"pending leave reminders", s.pendingLeaveReminders},
		{"pending journal reminders", s.pendingJournalReminders},
		{"vault note reminders", s.vaultNoteReminders},
	}
	for _, job := range jobs {
		if err := job.fn(ctx); err != nil {
			s.logger.Warn("scheduled notification job failed", "job", job.name, "err", err)
		}
	}
}

// ── Birthday reminders ────────────────────────────────────────────────────────
// Fires 3 days before a contact's date_of_birth (same month/day, any year).
// Sent to the assigned RM's user account.

func (s *Scheduler) birthdayReminders(ctx context.Context) error {
	type row struct {
		ContactID   uuid.UUID
		FullName    string
		DateOfBirth time.Time
		RMPersonID  uuid.UUID
	}

	rows, err := s.pool.Query(ctx, `
		SELECT c.id, c.first_name || ' ' || c.last_name, c.date_of_birth, c.rm_person_id
		FROM crm.contact c
		WHERE c.date_of_birth IS NOT NULL
		  AND c.rm_person_id IS NOT NULL
		  AND c.is_active = true
		  AND to_char(c.date_of_birth, 'MM-DD') =
		      to_char(CURRENT_DATE + INTERVAL '3 days', 'MM-DD')`)
	if err != nil {
		return fmt.Errorf("birthdayReminders query: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var r row
		if err := rows.Scan(&r.ContactID, &r.FullName, &r.DateOfBirth, &r.RMPersonID); err != nil {
			return err
		}
		dob := r.DateOfBirth.AddDate(time.Now().Year()-r.DateOfBirth.Year(), 0, 0)
		_ = SendToUser(ctx, s.pool, r.RMPersonID, InApp{
			Type:       "crm.client_birthday",
			Title:      "Client Birthday in 3 Days",
			Body:       fmt.Sprintf("%s's birthday is on %s. Consider sending a personalised message or gift.", r.FullName, dob.Format("2 January")),
			Link:       fmt.Sprintf("/crm/contacts/%s", r.ContactID),
			Priority:   "medium",
			EntityType: "contact",
			EntityID:   &r.ContactID,
		})
	}
	return rows.Err()
}

// ── Follow-up reminders ───────────────────────────────────────────────────────

func (s *Scheduler) followupReminders(ctx context.Context) error {
	type row struct {
		ContactID  uuid.UUID
		FullName   string
		RMPersonID uuid.UUID
	}

	rows, err := s.pool.Query(ctx, `
		SELECT c.id, c.first_name || ' ' || c.last_name, c.rm_person_id
		FROM crm.contact c
		WHERE c.next_followup_date = CURRENT_DATE
		  AND c.rm_person_id IS NOT NULL
		  AND c.is_active = true`)
	if err != nil {
		return fmt.Errorf("followupReminders query: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var r row
		if err := rows.Scan(&r.ContactID, &r.FullName, &r.RMPersonID); err != nil {
			return err
		}
		_ = SendToUser(ctx, s.pool, r.RMPersonID, InApp{
			Type:       "crm.followup_due",
			Title:      "Client Follow-up Due Today",
			Body:       fmt.Sprintf("Today is your scheduled follow-up date with %s. Log an interaction to keep the relationship active.", r.FullName),
			Link:       fmt.Sprintf("/crm/contacts/%s", r.ContactID),
			Priority:   "high",
			EntityType: "contact",
			EntityID:   &r.ContactID,
		})
	}
	return rows.Err()
}

// ── Task due reminders ────────────────────────────────────────────────────────

func (s *Scheduler) taskDueReminders(ctx context.Context) error {
	type row struct {
		TaskID      uuid.UUID
		Title       string
		ContactName *string
		AssignedTo  uuid.UUID
	}

	rows, err := s.pool.Query(ctx, `
		SELECT t.id, t.title,
		       c.first_name || ' ' || c.last_name,
		       t.assigned_to
		FROM crm.task t
		LEFT JOIN crm.contact c ON c.id = t.contact_id
		WHERE t.due_date = CURRENT_DATE
		  AND t.status IN ('open','in_progress')
		  AND t.assigned_to IS NOT NULL`)
	if err != nil {
		return fmt.Errorf("taskDueReminders query: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var r row
		if err := rows.Scan(&r.TaskID, &r.Title, &r.ContactName, &r.AssignedTo); err != nil {
			return err
		}
		body := fmt.Sprintf(`"%s" is due today.`, r.Title)
		if r.ContactName != nil {
			body = fmt.Sprintf(`"%s" for %s is due today.`, r.Title, *r.ContactName)
		}
		_ = SendToUser(ctx, s.pool, r.AssignedTo, InApp{
			Type:       "crm.task_due",
			Title:      "CRM Task Due Today",
			Body:       body,
			Link:       "/crm/tasks",
			Priority:   "high",
			EntityType: "task",
			EntityID:   &r.TaskID,
		})
	}
	return rows.Err()
}

// ── Pending leave reminders (> 48 h unreviewed) ───────────────────────────────

func (s *Scheduler) pendingLeaveReminders(ctx context.Context) error {
	type row struct {
		RequestID   uuid.UUID
		EmployeeName string
		StartDate   time.Time
	}

	rows, err := s.pool.Query(ctx, `
		SELECT lr.id,
		       p.first_name || ' ' || p.last_name,
		       lr.start_date
		FROM hr.leave_request lr
		JOIN organization.person p ON p.id = lr.person_id
		WHERE lr.status = 'pending'
		  AND lr.created_at < now() - INTERVAL '48 hours'`)
	if err != nil {
		return fmt.Errorf("pendingLeaveReminders query: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var r row
		if err := rows.Scan(&r.RequestID, &r.EmployeeName, &r.StartDate); err != nil {
			return err
		}
		_ = SendToRole(ctx, s.pool, uuid.Nil,
			[]string{"HR_MANAGER", "HR_OFFICER", "HEAD_HR"},
			InApp{
				Type:       "hr.leave_pending_reminder",
				Title:      "Leave Request Awaiting Review",
				Body:       fmt.Sprintf("%s's leave request (starting %s) has been pending for over 48 hours.", r.EmployeeName, r.StartDate.Format("2 Jan 2006")),
				Link:       "/hr",
				Priority:   "medium",
				EntityType: "leave_request",
				EntityID:   &r.RequestID,
			})
	}
	return rows.Err()
}

// ── Pending journal reminders (> 24 h unreviewed) ────────────────────────────

func (s *Scheduler) pendingJournalReminders(ctx context.Context) error {
	type row struct {
		JournalID uuid.UUID
		Reference string
		SubID     uuid.UUID
	}

	rows, err := s.pool.Query(ctx, `
		SELECT id, reference, subsidiary_id
		FROM finance.journal_header
		WHERE status = 'pending_approval'
		  AND updated_at < now() - INTERVAL '24 hours'`)
	if err != nil {
		return fmt.Errorf("pendingJournalReminders query: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var r row
		if err := rows.Scan(&r.JournalID, &r.Reference, &r.SubID); err != nil {
			return err
		}
		_ = SendToRole(ctx, s.pool, r.SubID,
			[]string{"FINANCE_MANAGER", "FINANCE_CONTROLLER", "CFO", "MANAGING_DIRECTOR"},
			InApp{
				Type:       "finance.journal_pending_reminder",
				Title:      "Journal Awaiting Approval",
				Body:       fmt.Sprintf("Journal %s has been awaiting approval for over 24 hours. Please review.", r.Reference),
				Link:       "/finance/journals",
				Priority:   "high",
				EntityType: "journal",
				EntityID:   &r.JournalID,
			})
	}
	return rows.Err()
}

// ── Vault note reminders ──────────────────────────────────────────────────────
// Fires when a note's notify_at is in the past and it hasn't been notified yet.

func (s *Scheduler) vaultNoteReminders(ctx context.Context) error {
	type row struct {
		NoteID uuid.UUID
		UserID uuid.UUID
		Title  string
		Body   string
	}

	rows, err := s.pool.Query(ctx, `
		SELECT id, user_id, title, body
		FROM vault.note
		WHERE notify_at <= now()
		  AND NOT notified`)
	if err != nil {
		return fmt.Errorf("vaultNoteReminders query: %w", err)
	}
	defer rows.Close()

	var pending []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.NoteID, &r.UserID, &r.Title, &r.Body); err != nil {
			return err
		}
		pending = append(pending, r)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for _, r := range pending {
		title := r.Title
		if title == "" {
			title = "Untitled Note"
		}
		body := "Reminder: " + title
		if len(r.Body) > 0 {
			preview := r.Body
			if len(preview) > 80 {
				preview = preview[:80] + "…"
			}
			body = fmt.Sprintf("Reminder: %s\n%s", title, preview)
		}
		noteID := r.NoteID
		_ = SendToUserByID(ctx, s.pool, r.UserID, InApp{
			Type:       "vault_note_reminder",
			Title:      "📌 Note Reminder: " + title,
			Body:       body,
			Link:       "/vault",
			Priority:   "high",
			EntityType: "vault_note",
			EntityID:   &noteID,
		})
		// Mark as notified so it doesn't fire again.
		_, _ = s.pool.Exec(ctx,
			`UPDATE vault.note SET notified = true WHERE id = $1`, r.NoteID)
	}
	return nil
}
