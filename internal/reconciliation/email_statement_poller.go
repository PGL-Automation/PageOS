// Package reconciliation — BankStatementEmailPoller.
// Polls bankstatements@pageaml.com for inbound bank statement attachments
// and imports them automatically into the reconciliation system.
//
// Transport priority:
//  1. Microsoft Graph (app-only) — preferred; uses the same Azure AD app
//     registration as the payout approval poller.
//  2. Raw IMAP/TLS — fallback when Graph credentials are absent.
//
// The bank account is identified by matching a 10-digit NUBAN found in the
// email subject or attachment filename against reconciliation.bank_account.
// If no NUBAN matches, the email is skipped — the system never imports a
// statement to the wrong account.
package reconciliation

import (
	"bufio"
	"bytes"
	"context"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"mime/multipart"
	"net"
	"net/mail"
	"net/textproto"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/pagegroup/pageos/internal/platform/graphmail"
)

var stmtNubanRE = regexp.MustCompile(`\b\d{10}\b`)

// BankStatementEmailPoller polls a mailbox for inbound bank statements.
type BankStatementEmailPoller struct {
	svc     *Service
	logger  *slog.Logger
	mailbox string
	graph   *graphmail.Client // nil when Graph credentials are absent

	// IMAP fallback
	imapHost string
	imapPass string
}

// NewBankStatementEmailPoller creates a poller from environment variables.
func NewBankStatementEmailPoller(svc *Service, logger *slog.Logger) *BankStatementEmailPoller {
	mailbox := os.Getenv("PAGEOS_BANKSTMT_EMAIL_USER")
	if mailbox == "" {
		mailbox = "bankstatements@pageaml.com" // correct plural form
	}

	p := &BankStatementEmailPoller{
		svc:      svc,
		logger:   logger,
		mailbox:  mailbox,
		imapHost: os.Getenv("PAGEOS_BANKSTMT_IMAP_HOST"),
		imapPass: os.Getenv("PAGEOS_BANKSTMT_EMAIL_PASS"),
	}

	clientID := os.Getenv("PAGEOS_MSGRAPH_CLIENT_ID")
	tenantID := os.Getenv("PAGEOS_MSGRAPH_TENANT_ID")
	secret   := os.Getenv("PAGEOS_MSGRAPH_CLIENT_SECRET")
	if clientID != "" && tenantID != "" && secret != "" {
		p.graph = graphmail.New(tenantID, clientID, secret)
	}
	return p
}

// Run starts the polling loop. Blocks until ctx is cancelled.
func (p *BankStatementEmailPoller) Run(ctx context.Context) {
	useGraph := p.graph != nil && p.graph.Configured()
	useIMAP  := p.imapHost != "" && p.imapPass != ""

	if !useGraph && !useIMAP {
		p.logger.Warn("bank statement poller: no transport configured",
			"hint", "set PAGEOS_MSGRAPH_CLIENT_ID/TENANT_ID/CLIENT_SECRET or PAGEOS_BANKSTMT_IMAP_HOST")
		return
	}

	if useGraph {
		p.logger.Info("bank statement poller started (Microsoft Graph)", "mailbox", p.mailbox)
	} else {
		p.logger.Info("bank statement poller started (IMAP fallback)", "mailbox", p.mailbox)
	}

	p.poll(ctx)
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			p.logger.Info("bank statement poller stopped")
			return
		case <-ticker.C:
			p.poll(ctx)
		}
	}
}

func (p *BankStatementEmailPoller) poll(ctx context.Context) {
	if p.graph != nil && p.graph.Configured() {
		p.pollGraph(ctx)
	} else {
		p.pollIMAP(ctx)
	}
}

// ── Graph path ────────────────────────────────────────────────────────────────

func (p *BankStatementEmailPoller) pollGraph(ctx context.Context) {
	msgs, err := p.graph.ListUnread(ctx, p.mailbox)
	if err != nil {
		p.logger.Warn("bank statement poller: graph list unread", "err", err)
		return
	}
	if len(msgs) == 0 {
		return
	}
	p.logger.Info("bank statement poller: unread messages", "count", len(msgs))

	for _, msg := range msgs {
		if !msg.HasAttachments {
			_ = p.graph.MarkRead(ctx, p.mailbox, msg.ID)
			continue
		}

		atts, err := p.graph.GetAttachments(ctx, p.mailbox, msg.ID)
		if err != nil {
			p.logger.Warn("bank statement poller: get attachments", "msg_id", msg.ID, "err", err)
			_ = p.graph.MarkRead(ctx, p.mailbox, msg.ID)
			continue
		}

		imported := false
		for _, att := range atts {
			if !isStatementFile(att.Name) {
				continue
			}
			ok, err := p.importAttachment(ctx, msg.Subject, att.Name, att.Data)
			if err != nil {
				p.logger.Warn("bank statement poller: import", "filename", att.Name, "err", err)
			} else if ok {
				p.logger.Info("bank statement poller: imported", "filename", att.Name)
				imported = true
			}
		}

		if !imported {
			p.logger.Info("bank statement poller: no importable attachment", "subject", msg.Subject)
		}
		_ = p.graph.MarkRead(ctx, p.mailbox, msg.ID)
	}
}

// ── IMAP fallback path ────────────────────────────────────────────────────────

func (p *BankStatementEmailPoller) pollIMAP(ctx context.Context) {
	conn, err := tls.DialWithDialer(
		&net.Dialer{Timeout: 15 * time.Second},
		"tcp", p.imapHost+":993",
		&tls.Config{ServerName: p.imapHost},
	)
	if err != nil {
		p.logger.Warn("bank statement poller: IMAP connect", "err", err)
		return
	}
	defer conn.Close()

	c := &stmtImapClient{conn: conn, r: bufio.NewReader(conn)}
	if _, err := c.r.ReadString('\n'); err != nil {
		return
	}
	if _, err := c.cmd(`LOGIN "%s" "%s"`, p.mailbox, p.imapPass); err != nil {
		p.logger.Warn("bank statement poller: IMAP LOGIN", "err", err)
		return
	}
	defer c.cmd("LOGOUT") //nolint:errcheck

	if _, err := c.cmd("SELECT INBOX"); err != nil {
		return
	}
	lines, _ := c.cmd("SEARCH UNSEEN")
	ids := stmtParseIDs(lines)
	if len(ids) == 0 {
		return
	}
	p.logger.Info("bank statement poller: IMAP unread", "count", len(ids))

	for _, id := range ids {
		raw, err := stmtFetchMessage(c, id)
		if err != nil {
			_, _ = c.cmd("STORE %d +FLAGS (\\Seen)", id)
			continue
		}
		processed, err := p.processRawEmail(ctx, raw)
		if err != nil {
			p.logger.Warn("bank statement poller: processEmail", "err", err)
		} else if processed {
			p.logger.Info("bank statement poller: IMAP statement imported")
		}
		_, _ = c.cmd("STORE %d +FLAGS (\\Seen)", id)
	}
}

// processRawEmail is used by the IMAP path — parses a raw RFC822 email and
// imports any statement attachments.
func (p *BankStatementEmailPoller) processRawEmail(ctx context.Context, raw string) (bool, error) {
	msg, err := mail.ReadMessage(strings.NewReader(raw))
	if err != nil {
		return false, err
	}
	subject := msg.Header.Get("Subject")
	atts, err := extractAttachments(msg)
	if err != nil {
		return false, err
	}
	imported := false
	for _, att := range atts {
		if !isStatementFile(att.filename) {
			continue
		}
		ok, err := p.importAttachment(ctx, subject, att.filename, att.data)
		if err != nil {
			p.logger.Warn("bank statement poller: import", "filename", att.filename, "err", err)
		} else if ok {
			imported = true
		}
	}
	return imported, nil
}

// ── Shared import logic ───────────────────────────────────────────────────────

// importAttachment identifies the target bank account from the filename /
// subject and calls UploadStatement.
func (p *BankStatementEmailPoller) importAttachment(ctx context.Context, subject, filename string, data []byte) (bool, error) {
	bankAccountID, err := p.identifyBankAccount(ctx, subject, filename)
	if err != nil {
		return false, err
	}

	format := "csv"
	if isExcelFilename(filename) {
		format = "xlsx"
	}

	// Resolve the "system" importer — GROUP_ADMIN user in the org.
	var importedBy uuid.UUID
	_ = p.svc.store.Pool().QueryRow(ctx, `
		SELECT per.user_id
		FROM   organization.assignment a
		JOIN   organization.position pos ON pos.id = a.position_id
		JOIN   organization.person   per ON per.id = a.person_id
		WHERE  pos.code = 'GROUP_ADMIN'
		  AND  a.effective_from <= CURRENT_DATE
		  AND  (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
		  AND  per.user_id IS NOT NULL
		LIMIT 1
	`).Scan(&importedBy)

	periodStart, periodEnd := inferPeriod(filename)

	_, err = p.svc.UploadStatement(ctx, bankAccountID, importedBy,
		periodStart, periodEnd,
		0, 0,
		format, bytes.NewReader(data),
	)
	if err != nil {
		return false, err
	}
	p.logger.Info("bank statement poller: statement imported",
		"bank_account_id", bankAccountID, "filename", filename)
	return true, nil
}

// identifyBankAccount finds the bank account whose NUBAN appears in the
// email subject or attachment filename.
func (p *BankStatementEmailPoller) identifyBankAccount(ctx context.Context, subject, filename string) (uuid.UUID, error) {
	rows, err := p.svc.store.Pool().Query(ctx, `
		SELECT id, account_number FROM reconciliation.bank_account WHERE status = 'active'
	`)
	if err != nil {
		return uuid.Nil, err
	}
	defer rows.Close()

	type acct struct {
		id     uuid.UUID
		number string
	}
	var accounts []acct
	for rows.Next() {
		var a acct
		if err := rows.Scan(&a.id, &a.number); err != nil {
			continue
		}
		accounts = append(accounts, a)
	}

	search := subject + " " + filename
	for _, n := range stmtNubanRE.FindAllString(search, -1) {
		for _, a := range accounts {
			if a.number == n {
				return a.id, nil
			}
		}
	}
	return uuid.Nil, fmt.Errorf("no registered bank account matches NUBANs in %q / %q", subject, filename)
}

// ── MIME attachment extraction (IMAP path) ────────────────────────────────────

type attachment struct {
	filename string
	data     []byte
}

func extractAttachments(msg *mail.Message) ([]attachment, error) {
	ct := msg.Header.Get("Content-Type")
	mediaType, params, err := mime.ParseMediaType(ct)
	if err != nil || !strings.HasPrefix(mediaType, "multipart/") {
		return nil, nil
	}
	var atts []attachment
	mr := multipart.NewReader(msg.Body, params["boundary"])
	for {
		part, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			return atts, err
		}
		name := partFilename(part)
		if name == "" {
			continue
		}
		data, err := io.ReadAll(part)
		if err != nil {
			continue
		}
		if enc := strings.ToLower(part.Header.Get("Content-Transfer-Encoding")); enc == "base64" {
			cleaned := strings.ReplaceAll(strings.ReplaceAll(string(data), "\r\n", ""), "\n", "")
			if decoded, err := base64.StdEncoding.DecodeString(cleaned); err == nil {
				data = decoded
			}
		}
		atts = append(atts, attachment{filename: name, data: data})
	}
	return atts, nil
}

func partFilename(part *multipart.Part) string {
	cd := part.Header.Get("Content-Disposition")
	if cd != "" {
		if _, params, err := mime.ParseMediaType(cd); err == nil {
			if name := params["filename"]; name != "" {
				if decoded, err := new(mime.WordDecoder).DecodeHeader(name); err == nil {
					return decoded
				}
				return name
			}
		}
	}
	ct := part.Header.Get("Content-Type")
	if _, params, err := mime.ParseMediaType(ct); err == nil {
		return params["name"]
	}
	return ""
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func isStatementFile(filename string) bool {
	low := strings.ToLower(filename)
	return strings.HasSuffix(low, ".xlsx") || strings.HasSuffix(low, ".xls") || strings.HasSuffix(low, ".csv")
}

func isExcelFilename(filename string) bool {
	low := strings.ToLower(filename)
	return strings.HasSuffix(low, ".xlsx") || strings.HasSuffix(low, ".xls")
}

func inferPeriod(filename string) (start, end time.Time) {
	now := time.Now().UTC()
	start = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	end = start.AddDate(0, 1, -1)
	re := regexp.MustCompile(`(\d{4})[-_](\d{2})`)
	if m := re.FindStringSubmatch(filename); len(m) == 3 {
		if t, err := time.Parse("2006-01", m[1]+"-"+m[2]); err == nil {
			start = time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
			end = start.AddDate(0, 1, -1)
		}
	}
	return
}

// ── Minimal IMAP client (fallback only) ──────────────────────────────────────

type stmtImapClient struct {
	conn net.Conn
	r    *bufio.Reader
	seq  int
}

func (c *stmtImapClient) cmd(format string, args ...any) ([]string, error) {
	c.seq++
	tag := fmt.Sprintf("S%04d", c.seq)
	if _, err := c.conn.Write([]byte(fmt.Sprintf("%s %s\r\n", tag, fmt.Sprintf(format, args...)))); err != nil {
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

func stmtParseIDs(lines []string) []int {
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

func stmtFetchMessage(c *stmtImapClient, id int) (string, error) {
	c.seq++
	tag := fmt.Sprintf("S%04d", c.seq)
	if _, err := c.conn.Write([]byte(fmt.Sprintf("%s FETCH %d RFC822\r\n", tag, id))); err != nil {
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

// Ensure net/textproto import is used.
var _ = textproto.MIMEHeader{}
