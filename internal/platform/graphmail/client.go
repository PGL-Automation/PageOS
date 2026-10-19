// Package graphmail provides a minimal Microsoft Graph API client for reading
// and processing emails from shared mailboxes using app-only (client
// credentials) authentication — no user sign-in required.
//
// The application must have been granted Mail.Read (or Mail.ReadWrite)
// application permission in Azure AD, scoped to the target mailboxes via an
// Exchange ApplicationAccessPolicy.
package graphmail

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

const graphBase = "https://graph.microsoft.com/v1.0"

// Client holds app-only credentials and a cached bearer token.
// Construct with New and call methods concurrently — token refresh is
// protected by a mutex.
type Client struct {
	tenantID     string
	clientID     string
	clientSecret string

	mu          sync.Mutex
	cachedToken string
	tokenExpiry time.Time

	http *http.Client
}

// New creates a Client for the given Azure AD application credentials.
func New(tenantID, clientID, clientSecret string) *Client {
	return &Client{
		tenantID:     tenantID,
		clientID:     clientID,
		clientSecret: clientSecret,
		http:         &http.Client{Timeout: 30 * time.Second},
	}
}

// Configured reports whether all three credentials are non-empty.
func (c *Client) Configured() bool {
	return c.tenantID != "" && c.clientID != "" && c.clientSecret != ""
}

// ── Domain types ──────────────────────────────────────────────────────────────

// Message is a simplified representation of a Graph mail message.
type Message struct {
	ID             string
	Subject        string
	FromAddress    string // sender email address, lower-cased
	BodyText       string // plain text (HTML stripped if needed)
	HasAttachments bool
}

// Attachment holds a decoded file attachment from a mail message.
type Attachment struct {
	ID          string
	Name        string
	ContentType string
	Data        []byte
}

// ── Public API ────────────────────────────────────────────────────────────────

// ListUnread returns all unread messages in the given mailbox (up to 50).
func (c *Client) ListUnread(ctx context.Context, mailbox string) ([]Message, error) {
	tok, err := c.getToken(ctx)
	if err != nil {
		return nil, err
	}

	endpoint := fmt.Sprintf(
		"%s/users/%s/messages?$filter=isRead eq false"+
			"&$select=id,subject,from,body,hasAttachments&$top=50",
		graphBase, url.PathEscape(mailbox),
	)

	var resp struct {
		Value []struct {
			ID      string `json:"id"`
			Subject string `json:"subject"`
			From    struct {
				EmailAddress struct {
					Address string `json:"address"`
				} `json:"emailAddress"`
			} `json:"from"`
			Body struct {
				ContentType string `json:"contentType"`
				Content     string `json:"content"`
			} `json:"body"`
			HasAttachments bool `json:"hasAttachments"`
		} `json:"value"`
	}
	if err := c.get(ctx, tok, endpoint, &resp); err != nil {
		return nil, fmt.Errorf("graphmail: list unread [%s]: %w", mailbox, err)
	}

	msgs := make([]Message, 0, len(resp.Value))
	for _, v := range resp.Value {
		body := v.Body.Content
		if strings.EqualFold(v.Body.ContentType, "html") {
			body = stripHTML(body)
		}
		msgs = append(msgs, Message{
			ID:             v.ID,
			Subject:        v.Subject,
			FromAddress:    strings.ToLower(strings.TrimSpace(v.From.EmailAddress.Address)),
			BodyText:       body,
			HasAttachments: v.HasAttachments,
		})
	}
	return msgs, nil
}

// GetAttachments returns the file attachments for a specific message.
// Only file attachments (not inline images or nested messages) are returned.
func (c *Client) GetAttachments(ctx context.Context, mailbox, messageID string) ([]Attachment, error) {
	tok, err := c.getToken(ctx)
	if err != nil {
		return nil, err
	}

	endpoint := fmt.Sprintf(
		"%s/users/%s/messages/%s/attachments?$select=id,name,contentType,contentBytes",
		graphBase, url.PathEscape(mailbox), url.PathEscape(messageID),
	)

	var resp struct {
		Value []struct {
			ID           string `json:"id"`
			Name         string `json:"name"`
			ContentType  string `json:"contentType"`
			ContentBytes string `json:"contentBytes"` // base64-encoded
			ODataType    string `json:"@odata.type"`
		} `json:"value"`
	}
	if err := c.get(ctx, tok, endpoint, &resp); err != nil {
		return nil, fmt.Errorf("graphmail: get attachments [%s]: %w", messageID, err)
	}

	var atts []Attachment
	for _, v := range resp.Value {
		// Skip inline reference attachments — only file attachments.
		if v.ODataType == "#microsoft.graph.referenceAttachment" {
			continue
		}
		data, err := base64.StdEncoding.DecodeString(v.ContentBytes)
		if err != nil {
			continue
		}
		atts = append(atts, Attachment{
			ID:          v.ID,
			Name:        v.Name,
			ContentType: v.ContentType,
			Data:        data,
		})
	}
	return atts, nil
}

// MarkRead marks a message as read so it is not processed again on the next poll.
func (c *Client) MarkRead(ctx context.Context, mailbox, messageID string) error {
	tok, err := c.getToken(ctx)
	if err != nil {
		return err
	}

	endpoint := fmt.Sprintf(
		"%s/users/%s/messages/%s",
		graphBase, url.PathEscape(mailbox), url.PathEscape(messageID),
	)

	body := bytes.NewBufferString(`{"isRead":true}`)
	req, err := http.NewRequestWithContext(ctx, http.MethodPatch, endpoint, body)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("graphmail: mark read %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

// ── App-only token (client credentials flow) ──────────────────────────────────

func (c *Client) getToken(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Return cached token if valid for at least 2 more minutes.
	if c.cachedToken != "" && time.Now().Add(2*time.Minute).Before(c.tokenExpiry) {
		return c.cachedToken, nil
	}

	tokenURL := fmt.Sprintf(
		"https://login.microsoftonline.com/%s/oauth2/v2.0/token",
		c.tenantID,
	)
	form := url.Values{
		"grant_type":    {"client_credentials"},
		"client_id":     {c.clientID},
		"client_secret": {c.clientSecret},
		"scope":         {"https://graph.microsoft.com/.default"},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL,
		strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("graphmail: token request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("graphmail: token %d: %s", resp.StatusCode, string(b))
	}

	var tok struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"` // seconds
	}
	if err := json.NewDecoder(resp.Body).Decode(&tok); err != nil {
		return "", fmt.Errorf("graphmail: decode token: %w", err)
	}

	c.cachedToken = tok.AccessToken
	c.tokenExpiry = time.Now().Add(time.Duration(tok.ExpiresIn) * time.Second)
	return c.cachedToken, nil
}

// ── Internal helpers ──────────────────────────────────────────────────────────

func (c *Client) get(ctx context.Context, token, endpoint string, dst any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("graph %d: %s", resp.StatusCode, string(b))
	}
	return json.NewDecoder(resp.Body).Decode(dst)
}

// htmlTagRE strips HTML tags for plain-text body extraction.
var htmlTagRE = regexp.MustCompile(`<[^>]+>`)

// stripHTML removes HTML tags and decodes common entities.
func stripHTML(s string) string {
	s = htmlTagRE.ReplaceAllString(s, " ")
	s = strings.ReplaceAll(s, "&nbsp;", " ")
	s = strings.ReplaceAll(s, "&amp;", "&")
	s = strings.ReplaceAll(s, "&lt;", "<")
	s = strings.ReplaceAll(s, "&gt;", ">")
	s = strings.ReplaceAll(s, "&quot;", `"`)
	// Collapse whitespace.
	lines := strings.Split(s, "\n")
	var out []string
	for _, l := range lines {
		if t := strings.TrimSpace(l); t != "" {
			out = append(out, t)
		}
	}
	return strings.Join(out, "\n")
}
