package reconciliation

// BankStatementEmailPoller polls a dedicated mailbox (bankstatement@pageaml.com)
// for inbound bank statement files (Excel or CSV attachments) and automatically
// imports them into the reconciliation system.
//
// Flow:
//  1. Connect to IMAP server via TLS
//  2. Search INBOX for unseen messages
//  3. For each message: extract Excel/CSV attachments via MIME parsing
//  4. Identify the matching reconciliation bank account from the NUBAN or
//     account number found in the email subject or attachment filename
//  5. Call Service.UploadStatement with the attachment bytes
//  6. Mark the email as seen
//
// Required environment variables:
//
//	PAGEOS_BANKSTMT_IMAP_HOST  — IMAP server, e.g. "imap.zoho.com"
//	PAGEOS_BANKSTMT_EMAIL_USER — mailbox, e.g. "bankstatement@pageaml.com"
//	PAGEOS_BANKSTMT_EMAIL_PASS — password
//
// The bank account is identified by searching the email subject and attachment
// filename for a 10-digit NUBAN that matches a registered bank account.
// If no NUBAN is found, the email is logged and skipped — never silently
// imported to the wrong account.

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
)

var stmtNubanRE = regexp.MustCompile(`\b\d{10}\b`)

// BankStatementEmailPoller polls a mailbox for inbound bank statements.
type BankStatementEmailPoller struct {
	svc    *Service
	logger *slog.Logger
	host   string
	user   string
	pass   string
}

// NewBankStatementEmailPoller creates a poller from environment variables.
func NewBankStatementEmailPoller(svc *Service, logger *slog.Logger) *BankStatementEmailPoller {
	return &BankStatementEmailPoller{
		svc:    svc,
		logger: logger,
		host:   os.Getenv("PAGEOS_BANKSTMT_IMAP_HOST"),
		user:   os.Getenv("PAGEOS_BANKSTMT_EMAIL_USER"),
		pass:   os.Getenv("PAGEOS_BANKSTMT_EMAIL_PASS"),
	}
}

// Run starts the polling loop. Blocks until ctx is cancelled.
func (p *BankStatementEmailPoller) Run(ctx context.Context) {
	if p.host == "" || p.user == "" || p.pass == "" {
		p.logger.Warn("bank statement email poller: IMAP credentials not configured — set PAGEOS_BANKSTMT_IMAP_HOST, _EMAIL_USER, _EMAIL_PASS")
		return
	}
	p.logger.Info("bank statement email poller started", "mailbox", p.user)

	// Poll immediately then every 15 minutes (statements arrive daily, not constantly).
	p.poll(ctx)
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			p.logger.Info("bank statement email poller stopped")
			return
		case <-ticker.C:
			p.poll(ctx)
		}
	}
}

// ── IMAP session ──────────────────────────────────────────────────────────────

type stmtImapClient struct {
	conn net.Conn
	r    *bufio.Reader
	seq  int
}

func (c *stmtImapClient) cmd(format string, args ...any) ([]string, error) {
	c.seq++
	tag := fmt.Sprintf("S%04d", c.seq)
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

func (p *BankStatementEmailPoller) poll(ctx context.Context) {
	conn, err := tls.DialWithDialer(
		&net.Dialer{Timeout: 15 * time.Second},
		"tcp", p.host+":993",
		&tls.Config{ServerName: p.host},
	)
	if err != nil {
		p.logger.Warn("bank statement poller: connect failed", "err", err)
		return
	}
	defer conn.Close()

	c := &stmtImapClient{conn: conn, r: bufio.NewReader(conn)}
	if _, err := c.r.ReadString('\n'); err != nil { // greeting
		return
	}
	if _, err := c.cmd(`LOGIN "%s" "%s"`, p.user, p.pass); err != nil {
		p.logger.Warn("bank statement poller: LOGIN failed", "err", err)
		return
	}
	defer c.cmd("LOGOUT") //nolint:errcheck

	if _, err := c.cmd("SELECT INBOX"); err != nil {
		p.logger.Warn("bank statement poller: SELECT INBOX", "err", err)
		return
	}

	lines, err := c.cmd("SEARCH UNSEEN")
	if err != nil {
		return
	}
	ids := stmtParseIDs(lines)
	if len(ids) == 0 {
		return
	}
	p.logger.Info("bank statement poller: unseen messages found", "count", len(ids))

	for _, id := range ids {
		raw, err := stmtFetchMessage(c, id)
		if err != nil {
			p.logger.Warn("bank statement poller: fetch", "id", id, "err", err)
			_, _ = c.cmd("STORE %d +FLAGS (\\Seen)", id)
			continue
		}
		processed, err := p.processEmail(ctx, raw)
		if err != nil {
			p.logger.Warn("bank statement poller: processEmail", "id", id, "err", err)
		} else if processed {
			p.logger.Info("bank statement poller: statement imported", "email_id", id)
		} else {
			p.logger.Info("bank statement poller: no importable attachment found", "email_id", id)
		}
		_, _ = c.cmd("STORE %d +FLAGS (\\Seen)", id)
	}
}

// processEmail parses the raw RFC822 email, extracts statement attachments,
// identifies the target bank account, and calls UploadStatement.
// Returns true if at least one attachment was successfully imported.
func (p *BankStatementEmailPoller) processEmail(ctx context.Context, raw string) (bool, error) {
	msg, err := mail.ReadMessage(strings.NewReader(raw))
	if err != nil {
		return false, fmt.Errorf("parse email: %w", err)
	}

	subject := msg.Header.Get("Subject")

	// Extract attachments from the MIME body.
	attachments, err := extractAttachments(msg)
	if err != nil {
		return false, fmt.Errorf("extract attachments: %w", err)
	}
	if len(attachments) == 0 {
		return false, nil
	}

	imported := false
	for _, att := range attachments {
		if !isStatementFile(att.filename) {
			continue
		}
		bankAccountID, err := p.identifyBankAccount(ctx, subject, att.filename)
		if err != nil {
			p.logger.Warn("bank statement poller: could not identify bank account",
				"filename", att.filename, "subject", subject, "err", err)
			continue
		}

		format := "csv"
		if isExcelFilename(att.filename) {
			format = "xlsx"
		}

		// Use a zero-value period — the statement parser reads dates from the file.
		// importedBy: query the GROUP_ADMIN user id, or use uuid.Nil as "system".
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

		// Period dates: try to parse from filename, default to current month.
		periodStart, periodEnd := inferPeriod(att.filename)

		_, err = p.svc.UploadStatement(ctx, bankAccountID, importedBy,
			periodStart, periodEnd,
			0, 0, // opening/closing balance — unknown from email; Finance updates manually
			format, bytes.NewReader(att.data),
		)
		if err != nil {
			p.logger.Warn("bank statement poller: UploadStatement failed",
				"bank_account_id", bankAccountID, "filename", att.filename, "err", err)
			continue
		}

		p.logger.Info("bank statement poller: statement imported",
			"bank_account_id", bankAccountID, "filename", att.filename, "format", format)
		imported = true
	}
	return imported, nil
}

// identifyBankAccount finds the bank account whose NUBAN or account number
// appears in the email subject or attachment filename.
func (p *BankStatementEmailPoller) identifyBankAccount(ctx context.Context, subject, filename string) (uuid.UUID, error) {
	// Load all active bank accounts.
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

	// Extract all 10-digit NUBANs from subject + filename.
	search := subject + " " + filename
	nubans := stmtNubanRE.FindAllString(search, -1)

	for _, n := range nubans {
		for _, a := range accounts {
			if a.number == n {
				return a.id, nil
			}
		}
	}

	return uuid.Nil, fmt.Errorf("no registered bank account matches NUBANs %v in subject/filename", nubans)
}

// ── MIME attachment extraction ────────────────────────────────────────────────

type attachment struct {
	filename string
	data     []byte
}

// extractAttachments walks the MIME tree and returns all file attachments.
func extractAttachments(msg *mail.Message) ([]attachment, error) {
	ct := msg.Header.Get("Content-Type")
	mediaType, params, err := mime.ParseMediaType(ct)
	if err != nil {
		// No Content-Type or not parseable — single-part email, no attachments.
		return nil, nil
	}

	if !strings.HasPrefix(mediaType, "multipart/") {
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

		filename := partFilename(part)
		if filename == "" {
			continue // not an attachment
		}

		data, err := io.ReadAll(part)
		if err != nil {
			continue
		}

		// Decode base64 if encoded.
		enc := strings.ToLower(part.Header.Get("Content-Transfer-Encoding"))
		if enc == "base64" {
			cleaned := strings.ReplaceAll(strings.ReplaceAll(string(data), "\r\n", ""), "\n", "")
			decoded, err := base64.StdEncoding.DecodeString(cleaned)
			if err != nil {
				continue
			}
			data = decoded
		}

		atts = append(atts, attachment{filename: filename, data: data})
	}
	return atts, nil
}

// partFilename returns the filename for a MIME part, or "" if not an attachment.
func partFilename(part *multipart.Part) string {
	cd := part.Header.Get("Content-Disposition")
	if cd == "" {
		return ""
	}
	_, params, err := mime.ParseMediaType(cd)
	if err != nil {
		return ""
	}
	if name := params["filename"]; name != "" {
		decoded, err := new(mime.WordDecoder).DecodeHeader(name)
		if err != nil {
			return name
		}
		return decoded
	}
	// Fall back to Content-Type name parameter.
	ct := part.Header.Get("Content-Type")
	_, ctParams, err := mime.ParseMediaType(ct)
	if err != nil {
		return ""
	}
	return ctParams["name"]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func isStatementFile(filename string) bool {
	low := strings.ToLower(filename)
	return strings.HasSuffix(low, ".xlsx") ||
		strings.HasSuffix(low, ".xls") ||
		strings.HasSuffix(low, ".csv")
}

func isExcelFilename(filename string) bool {
	low := strings.ToLower(filename)
	return strings.HasSuffix(low, ".xlsx") || strings.HasSuffix(low, ".xls")
}

// inferPeriod tries to extract a YYYY-MM date from the filename.
// Falls back to the first and last day of the current calendar month.
func inferPeriod(filename string) (start, end time.Time) {
	now := time.Now().UTC()
	// Default: current month.
	start = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	end = start.AddDate(0, 1, -1) // last day of month

	// Try to parse YYYY-MM or YYYY_MM from filename.
	re := regexp.MustCompile(`(\d{4})[-_](\d{2})`)
	m := re.FindStringSubmatch(filename)
	if len(m) == 3 {
		t, err := time.Parse("2006-01", m[1]+"-"+m[2])
		if err == nil {
			start = time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
			end = start.AddDate(0, 1, -1)
		}
	}
	return
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

// Ensure textproto and net/textproto are used (needed for MIME header handling).
var _ = textproto.MIMEHeader{}
