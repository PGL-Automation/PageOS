package payout

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/pagegroup/pageos/internal/notification"
)

// PayoutScheduler checks for overdue approval steps every 2 minutes and sends
// reminder or escalation notifications as required.
// Construct it with NewPayoutScheduler and call Run in a dedicated goroutine.
type PayoutScheduler struct {
	svc    *Service
	logger *slog.Logger
}

// NewPayoutScheduler creates a PayoutScheduler backed by the given Service.
func NewPayoutScheduler(svc *Service, logger *slog.Logger) *PayoutScheduler {
	return &PayoutScheduler{svc: svc, logger: logger}
}

// Run starts the payout approval scheduler. It blocks until ctx is cancelled
// and should be called in a dedicated goroutine.
//
// The scheduler fires every 2 minutes and processes all pending steps that have
// passed their due_by time.
func (s *PayoutScheduler) Run(ctx context.Context) {
	s.logger.Info("payout scheduler started")

	ticker := time.NewTicker(2 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			s.logger.Info("payout scheduler stopped")
			return
		case <-ticker.C:
			s.tick(ctx)
			s.checkReconciliationMatches(ctx)
		}
	}
}

// ── Item 15: Reconciliation auto-close ───────────────────────────────────────

// checkReconciliationMatches scans recent bank statement lines for payout
// instruction IDs and auto-confirms any matched requests that are in the
// "sent_to_bank" state.  This replaces the manual "attach bank confirmation"
// step when the reconciliation system finds the payment automatically.
func (s *PayoutScheduler) checkReconciliationMatches(ctx context.Context) {
	const q = `
		SELECT pr.instruction_id,
		       COALESCE(bsl.reference, '') AS bank_ref
		FROM   payout.payment_request pr
		JOIN   reconciliation.bank_statement_line bsl
		          ON (bsl.narration ILIKE '%' || pr.instruction_id || '%'
		           OR bsl.reference ILIKE '%' || pr.instruction_id || '%')
		WHERE  pr.status         = 'sent_to_bank'
		  AND  pr.instruction_id IS NOT NULL
		  AND  pr.instruction_id != ''
		LIMIT  50
	`
	rows, err := s.svc.pool.Query(ctx, q)
	if err != nil {
		s.logger.Warn("payout scheduler: recon match query failed", "err", err)
		return
	}
	defer rows.Close()

	type match struct{ instructionID, bankRef string }
	var matches []match
	for rows.Next() {
		var m match
		if err := rows.Scan(&m.instructionID, &m.bankRef); err != nil {
			s.logger.Warn("payout scheduler: recon match scan", "err", err)
			continue
		}
		matches = append(matches, m)
	}
	rows.Close()

	for _, m := range matches {
		if err := s.svc.CloseByReconciliation(ctx, m.instructionID, m.bankRef); err != nil {
			s.logger.Warn("payout scheduler: CloseByReconciliation failed",
				"instruction_id", m.instructionID, "err", err)
		} else {
			s.logger.Info("payout scheduler: auto-confirmed via reconciliation",
				"instruction_id", m.instructionID, "bank_ref", m.bankRef)
		}
	}
}

// tick processes all overdue pending steps: sending reminder or escalation emails.
func (s *PayoutScheduler) tick(ctx context.Context) {
	st := newStore(s.svc.pool)

	steps, err := st.getOverdueSteps(ctx)
	if err != nil {
		s.logger.Warn("payout scheduler: getOverdueSteps failed", "err", err)
		return
	}

	if len(steps) == 0 {
		return
	}

	s.logger.Info("payout scheduler: processing overdue steps", "count", len(steps))

	now := time.Now()

	for _, step := range steps {
		step := step // capture loop variable

		// ── Reminder ──────────────────────────────────────────────────────────
		// Send reminder when the step is overdue and no reminder has been sent yet.
		if step.ReminderSentAt == nil && now.After(step.DueBy) {
			email, name, err := st.getUserEmail(ctx, step.AssignedTo)
			if err != nil {
				s.logger.Warn("payout scheduler: getUserEmail for reminder",
					"step_id", step.ID, "user_id", step.AssignedTo, "err", err)
			} else {
				if sendErr := s.enqueueReminder(ctx, step.RequestInstID, step.ID.String(), email, name, step.RequestID.String()); sendErr != nil {
					s.logger.Warn("payout scheduler: enqueue reminder failed",
						"step_id", step.ID, "err", sendErr)
				} else {
					if markErr := st.markReminderSent(ctx, step.ID); markErr != nil {
						s.logger.Warn("payout scheduler: markReminderSent failed",
							"step_id", step.ID, "err", markErr)
					} else {
						s.logger.Info("payout scheduler: reminder sent",
							"step_id", step.ID,
							"instruction_id", step.RequestInstID,
							"assigned_to", step.AssignedTo)
					}
				}
			}
		}

		// ── Escalation ────────────────────────────────────────────────────────
		// Escalate when now > due_by + step_limit (i.e. 2× the step window)
		// and the step has not already been escalated.
		escalateAfter := step.DueBy.Add(time.Duration(step.StepLimitMinutes) * time.Minute)
		if step.EscalatedAt == nil && now.After(escalateAfter) {
			coverUserID, found, err := st.getStandIn(ctx, step.AssignedTo)
			if err != nil {
				s.logger.Warn("payout scheduler: getStandIn failed",
					"step_id", step.ID, "user_id", step.AssignedTo, "err", err)
				continue
			}

			if found {
				// Reassign step to cover user and notify both parties.
				if escErr := st.escalateStep(ctx, step.ID, coverUserID); escErr != nil {
					s.logger.Warn("payout scheduler: escalateStep failed",
						"step_id", step.ID, "cover_user_id", coverUserID, "err", escErr)
					continue
				}

				origEmail, origName, err := st.getUserEmail(ctx, step.AssignedTo)
				if err != nil {
					s.logger.Warn("payout scheduler: getUserEmail (original) for escalation",
						"user_id", step.AssignedTo, "err", err)
				}
				coverEmail, coverName, err := st.getUserEmail(ctx, coverUserID)
				if err != nil {
					s.logger.Warn("payout scheduler: getUserEmail (cover) for escalation",
						"user_id", coverUserID, "err", err)
				}

				if origEmail != "" {
					_ = s.enqueueEscalationOriginal(ctx, step.RequestInstID, step.ID.String(), origEmail, origName, coverName, step.RequestID.String())
				}
				if coverEmail != "" {
					_ = s.enqueueEscalationCover(ctx, step.RequestInstID, step.ID.String(), coverEmail, coverName, origName, step.RequestID.String())
				}

				s.logger.Info("payout scheduler: step escalated",
					"step_id", step.ID,
					"instruction_id", step.RequestInstID,
					"original_user", step.AssignedTo,
					"cover_user", coverUserID)
			} else {
				// No stand-in configured — send an additional reminder to the original assignee.
				email, name, err := st.getUserEmail(ctx, step.AssignedTo)
				if err != nil {
					s.logger.Warn("payout scheduler: getUserEmail for escalation-fallback reminder",
						"step_id", step.ID, "user_id", step.AssignedTo, "err", err)
					continue
				}
				if sendErr := s.enqueueUrgentReminder(ctx, step.RequestInstID, step.ID.String(), email, name, step.RequestID.String()); sendErr != nil {
					s.logger.Warn("payout scheduler: enqueue urgent reminder failed",
						"step_id", step.ID, "err", sendErr)
				} else {
					s.logger.Info("payout scheduler: urgent reminder sent (no stand-in configured)",
						"step_id", step.ID,
						"instruction_id", step.RequestInstID,
						"assigned_to", step.AssignedTo)
				}
			}
		}
	}
}

// ── Notification helpers ──────────────────────────────────────────────────────

// enqueueReminder sends a "action overdue" reminder email to the current assignee.
// It wraps the outbox enqueue in its own short transaction.
func (s *PayoutScheduler) enqueueReminder(
	ctx context.Context,
	instructionID, stepID, email, name, requestID string,
) error {
	subject := fmt.Sprintf("[%s] Reminder – action overdue", instructionID)
	body := fmt.Sprintf(
		"Dear %s,\n\nThis is a reminder that your approval is overdue on payment request %s.\n\n"+
			"Please action immediately at: https://app.pageos.org/approvals/%s\n\n"+
			"If you are unable to act, please ensure your stand-in is configured.\n\n"+
			"PageOS Payout System",
		name, instructionID, requestID,
	)
	return s.enqueueEmail(ctx, email, subject, body, "payout.reminder", instructionID, stepID)
}

// enqueueUrgentReminder sends a second reminder when escalation is due but no stand-in exists.
func (s *PayoutScheduler) enqueueUrgentReminder(
	ctx context.Context,
	instructionID, stepID, email, name, requestID string,
) error {
	subject := fmt.Sprintf("[%s] URGENT – Approval critically overdue, no stand-in configured", instructionID)
	body := fmt.Sprintf(
		"Dear %s,\n\nYour approval on payment request %s is critically overdue and no stand-in has been "+
			"configured to cover you.\n\n"+
			"Please action immediately at: https://app.pageos.org/approvals/%s\n\n"+
			"PageOS Payout System",
		name, instructionID, requestID,
	)
	return s.enqueueEmail(ctx, email, subject, body, "payout.urgent_reminder", instructionID, stepID)
}

// enqueueEscalationOriginal notifies the original assignee that the step was escalated.
func (s *PayoutScheduler) enqueueEscalationOriginal(
	ctx context.Context,
	instructionID, stepID, email, name, coverName, requestID string,
) error {
	subject := fmt.Sprintf("[%s] Your approval has been escalated to your stand-in", instructionID)
	body := fmt.Sprintf(
		"Dear %s,\n\nYour approval on payment request %s was overdue and has been escalated to your "+
			"stand-in (%s) for action.\n\n"+
			"You can view the request at: https://app.pageos.org/approvals/%s\n\n"+
			"PageOS Payout System",
		name, instructionID, coverName, requestID,
	)
	return s.enqueueEmail(ctx, email, subject, body, "payout.escalation_original", instructionID, stepID)
}

// enqueueEscalationCover notifies the stand-in that they have been assigned an escalated step.
func (s *PayoutScheduler) enqueueEscalationCover(
	ctx context.Context,
	instructionID, stepID, email, name, originalName, requestID string,
) error {
	subject := fmt.Sprintf("[%s] Action required – Escalated approval assigned to you", instructionID)
	body := fmt.Sprintf(
		"Dear %s,\n\nYou are covering for %s. The approval on payment request %s has been escalated to "+
			"you as their stand-in because it is critically overdue.\n\n"+
			"Please action immediately at: https://app.pageos.org/approvals/%s\n\n"+
			"PageOS Payout System",
		name, originalName, instructionID, requestID,
	)
	return s.enqueueEmail(ctx, email, subject, body, "payout.escalation_cover", instructionID, stepID)
}

// enqueueEmail opens a short transaction, enqueues one outbox message, and commits.
func (s *PayoutScheduler) enqueueEmail(
	ctx context.Context,
	toAddr, subject, body, eventType, instructionID, stepID string,
) error {
	tx, err := s.svc.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("payout scheduler: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	msg := notification.Message{
		EventType:     eventType,
		TargetAddress: toAddr,
		Subject:       subject,
		BodyText:      body,
		Payload: map[string]any{
			"instruction_id": instructionID,
			"step_id":        stepID,
		},
	}

	if err := s.svc.notif.Enqueue(ctx, tx, msg); err != nil {
		return fmt.Errorf("payout scheduler: enqueue: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("payout scheduler: commit: %w", err)
	}

	return nil
}
