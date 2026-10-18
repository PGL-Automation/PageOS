// Package payout — Item 12: IMAP email reply poller.
// Polls approvals@pageaml.com every 2 minutes and processes APPROVE / REJECT
// replies so approvers can act without opening the web app.
package payout

import (
	"bufio"
	"context"
	"crypto/tls"
	"fmt"
	"log/slog"
	"net"
	"net/mail"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
)

// instructionIDRE matches PAM-APR-2026-000001 or PCL-APR-2026-000001.
var instructionIDRE = regexp.MustCompile(`[A-Z]{2,3}-APR-\d{4}-\d{6}`)

// EmailPoller polls an IMAP mailbox for approval reply emails.
//
// Env vars (all required; poller is a no-op if any is empty):
//
//	PAGEOS_APPROVALS_IMAP_HOST  — IMAP server hostname, e.g. "imap.zoho.com"
//	PAGEOS_APPROVALS_EMAIL_USER — mailbox address,     e.g. "approvals@pageaml.com"
//	PAGEOS_APPROVALS_EMAIL_PASS — mailbox password,    e.g. "Aml4page"
type EmailPoller struct {
	svc    *Service
	logger *slog.Logger
	host   string
	user   string
	pass   string
}

// NewEmailPoller builds an EmailPoller from environment variables.
func NewEmailPoller(svc *Service, logger *slog.Logger) *EmailPoller {
	return &EmailPoller{
		svc:    svc,
		logger: logger,
		host:   os.Getenv("PAGEOS_APPROVALS_IMAP_HOST"),
		user:   os.Getenv("PAGEOS_APPROVALS_EMAIL_USER"),
		pass:   os.Getenv("PAGEOS_APPROVALS_EMAIL_PASS"),
	}
}

// Run starts the polling loop. Blocks until ctx is cancelled.
func (p *EmailPoller) Run(ctx context.Context) {
	if p.host == "" || p.user == "" || p.pass == "" {
		p.logger.Warn("payout email poller: IMAP credentials not configured — email reply approvals disabled")
		return
	}
	p.logger.Info("payout email poller started", "mailbox", p.user)

	// Poll immediately on startup.
	p.poll(ctx)

	ticker := time.NewTicker(2 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			p.logger.Info("payout email poller stopped")
			return
		case <-ticker.C:
			p.poll(ctx)
		}
	}
}

// ── Minimal IMAP client (no external dependency) ──────────────────────────────

type imapClient struct {
	conn net.Conn
	r    *bufio.Reader
	seq  int
}

// cmd sends one tagged IMAP command and collects all response lines until the
// tagged OK/NO/BAD completion line.
func (c *imapClient) cmd(format string, args ...any) ([]string, error) {
	c.seq++
	tag := fmt.Sprintf("A%04d", c.seq)
	line := fmt.Sprintf("%s %s\r\n", tag, fmt.Sprintf(format, args...))
	if _, err := c.conn.Write([]byte(line)); err != nil {
		return nil, err
	}
	var out []string
	for {
		l, err := c.r.ReadString('\n')
		if err != nil {
			return nil, err
		}
		l = strings.TrimRight(l, "\r\n")
		if strings.HasPrefix(l, tag+" OK") {
			return out, nil
		}
		if strings.HasPrefix(l, tag+" NO") || strings.HasPrefix(l, tag+" BAD") {
			return nil, fmt.Errorf("imap: %s", l)
		}
		out = append(out, l)
	}
}

// ── poll: one IMAP session per tick ──────────────────────────────────────────

func (p *EmailPoller) poll(ctx context.Context) {
	conn, err := tls.DialWithDialer(
		&net.Dialer{Timeout: 15 * time.Second},
		"tcp", p.host+":993",
		&tls.Config{ServerName: p.host},
	)
	if err != nil {
		p.logger.Warn("payout email poller: connect failed", "host", p.host, "err", err)
		return
	}
	defer conn.Close()

	c := &imapClient{conn: conn, r: bufio.NewReader(conn)}

	// Discard server greeting.
	if _, err := c.r.ReadString('\n'); err != nil {
		p.logger.Warn("payout email poller: read greeting", "err", err)
		return
	}

	if _, err := c.cmd(`LOGIN "%s" "%s"`, p.user, p.pass); err != nil {
		p.logger.Warn("payout email poller: LOGIN failed", "err", err)
		return
	}
	defer c.cmd("LOGOUT") //nolint:errcheck

	if _, err := c.cmd("SELECT INBOX"); err != nil {
		p.logger.Warn("payout email poller: SELECT INBOX", "err", err)
		return
	}

	lines, err := c.cmd("SEARCH UNSEEN")
	if err != nil {
		p.logger.Warn("payout email poller: SEARCH UNSEEN", "err", err)
		return
	}
	ids := parseSearchIDs(lines)
	if len(ids) == 0 {
		return
	}
	p.logger.Info("payout email poller: processing unseen messages", "count", len(ids))

	for _, id := range ids {
		raw, err := fetchMessage(c, id)
		if err != nil {
			p.logger.Warn("payout email poller: fetch", "id", id, "err", err)
			_, _ = c.cmd("STORE %d +FLAGS (\\Seen)", id)
			continue
		}

		from, instID, action, notes := parseApprovalReply(raw)
		if instID == "" || action == "" {
			_, _ = c.cmd("STORE %d +FLAGS (\\Seen)", id)
			continue
		}

		if err := p.applyEmailAction(ctx, from, instID, action, notes); err != nil {
			p.logger.Warn("payout email poller: apply action",
				"from", from, "instruction_id", instID, "action", action, "err", err)
		} else {
			p.logger.Info("payout email poller: action applied",
				"from", from, "instruction_id", instID, "action", action)
		}
		_, _ = c.cmd("STORE %d +FLAGS (\\Seen)", id)
	}
}

// applyEmailAction resolves the instruction ID to a request UUID, verifies the
// sender is the active step assignee, and calls ActOnStepByEmail.
func (p *EmailPoller) applyEmailAction(ctx context.Context, from, instID, action, notes string) error {
	// Resolve instruction ID → request UUID.
	var requestID uuid.UUID
	err := p.svc.pool.QueryRow(ctx,
		`SELECT id FROM payout.payment_request WHERE instruction_id = $1`, instID,
	).Scan(&requestID)
	if err != nil {
		return fmt.Errorf("instruction_id %q not found: %w", instID, err)
	}
	return p.svc.ActOnStepByEmail(ctx, requestID, from, action, notes)
}

// ── RFC822 fetch ──────────────────────────────────────────────────────────────

func fetchMessage(c *imapClient, id int) (string, error) {
	c.seq++
	tag := fmt.Sprintf("A%04d", c.seq)
	cmd := fmt.Sprintf("%s FETCH %d RFC822\r\n", tag, id)
	if _, err := c.conn.Write([]byte(cmd)); err != nil {
		return "", err
	}

	var body strings.Builder
	inLiteral := false
	for {
		l, err := c.r.ReadString('\n')
		if err != nil {
			return "", err
		}
		stripped := strings.TrimRight(l, "\r\n")
		// FETCH response contains: * N FETCH (RFC822 {length})
		if !inLiteral && strings.Contains(stripped, "RFC822") {
			inLiteral = true
			continue
		}
		if strings.HasPrefix(stripped, tag+" OK") || strings.HasPrefix(stripped, tag+" NO") {
			break
		}
		if inLiteral {
			if stripped == ")" {
				break
			}
			body.WriteString(l)
		}
	}
	return body.String(), nil
}

// ── Email parsing ─────────────────────────────────────────────────────────────

// parseApprovalReply extracts the sender email, payout instruction ID, and
// action (approve/reject + optional reason) from a raw RFC822 email string.
// Returns empty strings if the email is not a valid approval reply.
func parseApprovalReply(raw string) (from, instID, action, notes string) {
	msg, err := mail.ReadMessage(strings.NewReader(raw))
	if err != nil {
		return
	}

	// Sender.
	addr, err := mail.ParseAddress(msg.Header.Get("From"))
	if err != nil {
		return
	}
	from = strings.ToLower(strings.TrimSpace(addr.Address))

	// Instruction ID from Subject — look for [PAM-APR-2026-000123].
	subject := msg.Header.Get("Subject")
	instID = instructionIDRE.FindString(subject)
	if instID == "" {
		return // not a payout approval subject
	}

	// Read body.
	var rawBody strings.Builder
	buf := make([]byte, 1<<16) // 64 KiB max
	for {
		n, readErr := msg.Body.Read(buf)
		if n > 0 {
			rawBody.Write(buf[:n])
		}
		if readErr != nil {
			break
		}
	}
	cleaned := stripQuotedReply(rawBody.String())
	action, notes = extractAction(cleaned)
	return
}

// stripQuotedReply keeps only the lines the user actually typed — it stops at
// the first quoted-reply block ("> ..."), Outlook separator, or "X wrote:" line.
func stripQuotedReply(body string) string {
	var out []string
	for _, line := range strings.Split(body, "\n") {
		t := strings.TrimSpace(line)
		if strings.HasPrefix(t, ">") ||
			strings.HasPrefix(t, "-----") ||
			strings.HasPrefix(t, "_____") ||
			(strings.Contains(strings.ToLower(t), " wrote:") && strings.HasPrefix(t, "On ")) {
			break
		}
		out = append(out, t)
	}
	return strings.Join(out, "\n")
}

// extractAction returns "approve"|"reject" and the optional reason from the
// first meaningful line of the email body.
func extractAction(body string) (action, notes string) {
	for _, line := range strings.Split(body, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		up := strings.ToUpper(line)
		if up == "APPROVE" || up == "APPROVED" {
			return "approve", ""
		}
		if strings.HasPrefix(up, "REJECT") {
			return "reject", strings.TrimSpace(line[6:])
		}
		break // Only the first non-blank line matters
	}
	return "", ""
}

// parseSearchIDs extracts integer message IDs from IMAP SEARCH response lines.
func parseSearchIDs(lines []string) []int {
	var ids []int
	for _, l := range lines {
		if !strings.HasPrefix(l, "* SEARCH") {
			continue
		}
		for _, part := range strings.Fields(strings.TrimPrefix(l, "* SEARCH")) {
			var n int
			if _, err := fmt.Sscanf(part, "%d", &n); err == nil && n > 0 {
				ids = append(ids, n)
			}
		}
	}
	return ids
}
