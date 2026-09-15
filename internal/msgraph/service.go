package msgraph

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/pagegroup/pageos/internal/audit"
	msgraphstore "github.com/pagegroup/pageos/internal/msgraph/store"
)

// exchangeEntry holds a short-lived SSO exchange code so the frontend can
// complete the login via a same-site fetch call (avoiding cookie ITP issues).
type exchangeEntry struct {
	userID    uuid.UUID
	expiresAt time.Time
}

const (
	graphBase    = "https://graph.microsoft.com/v1.0"
	tokenRefresh = 5 * time.Minute
)

// Config holds the Azure app registration credentials.
type Config struct {
	ClientID        string
	ClientSecret    string
	TenantID        string
	RedirectURL     string // used by Graph data-access OAuth
	SSORedirectURL  string // used by the login SSO flow
	TokenKey        []byte // 32 bytes, AES-256
}

// ssoScopes are the minimal scopes needed to authenticate a user via Microsoft
// and retrieve their email address. These are used for the login SSO flow only.
var ssoScopes = []string{
	"openid", "email", "profile", "offline_access", "User.Read",
}

// Scopes requested during OAuth authorization.
// Write scopes (Mail.Send, Calendars.ReadWrite, Chat.ReadWrite) enable two-way interaction.
// Users who connected before these scopes were added must disconnect + reconnect.
var oauthScopes = []string{
	"Mail.Read",
	"Mail.Send",
	"Calendars.Read",
	"Calendars.ReadWrite",
	"Chat.Read",
	"Chat.ReadWrite",
	"Presence.Read",
	"Presence.ReadWrite",  // set own availability
	"Presence.Read.All",   // read other users' presence
	"offline_access",
	"User.Read",
	"User.ReadBasic.All", // search for colleagues by name
}

// Service handles Microsoft OAuth and Graph API proxying.
type Service struct {
	cfg           Config
	store         *msgraphstore.Store
	auditWriter   *audit.Writer
	httpClient    *http.Client
	exchangeCodes sync.Map // map[code string]exchangeEntry — short-lived SSO codes
}

func NewService(cfg Config, store *msgraphstore.Store, aw *audit.Writer) *Service {
	return &Service{
		cfg:         cfg,
		store:       store,
		auditWriter: aw,
		httpClient:  &http.Client{Timeout: 15 * time.Second},
	}
}

// IssueExchangeCode creates a single-use 60-second code tied to a userID.
// The frontend uses this to complete SSO login via a same-site fetch call,
// which avoids ITP/ETP blocking of cookies set during OAuth redirect chains.
func (s *Service) IssueExchangeCode(userID uuid.UUID) (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	code := base64.RawURLEncoding.EncodeToString(b)
	s.exchangeCodes.Store(code, exchangeEntry{
		userID:    userID,
		expiresAt: time.Now().Add(60 * time.Second),
	})
	return code, nil
}

// RedeemExchangeCode validates and consumes a code, returning the userID.
// Returns an error if the code is unknown, expired, or already used.
func (s *Service) RedeemExchangeCode(code string) (uuid.UUID, error) {
	v, ok := s.exchangeCodes.LoadAndDelete(code)
	if !ok {
		return uuid.Nil, fmt.Errorf("invalid or already used exchange code")
	}
	entry := v.(exchangeEntry)
	if time.Now().After(entry.expiresAt) {
		return uuid.Nil, fmt.Errorf("exchange code expired")
	}
	return entry.userID, nil
}

// AuthURL returns the Microsoft OAuth2 authorization URL with CSRF state.
func (s *Service) AuthURL(state string) string {
	v := url.Values{}
	v.Set("client_id", s.cfg.ClientID)
	v.Set("response_type", "code")
	v.Set("redirect_uri", s.cfg.RedirectURL)
	v.Set("scope", strings.Join(oauthScopes, " "))
	v.Set("state", state)
	v.Set("response_mode", "query")
	return fmt.Sprintf("https://login.microsoftonline.com/%s/oauth2/v2.0/authorize?%s",
		s.cfg.TenantID, v.Encode())
}

// tokenResponse is the JSON shape returned by the Microsoft token endpoint.
type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	Scope        string `json:"scope"`
	Error        string `json:"error"`
	ErrorDesc    string `json:"error_description"`
}

func (s *Service) fetchToken(ctx context.Context, params url.Values) (*tokenResponse, error) {
	endpoint := fmt.Sprintf("https://login.microsoftonline.com/%s/oauth2/v2.0/token", s.cfg.TenantID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(params.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var tr tokenResponse
	if err := json.Unmarshal(body, &tr); err != nil {
		return nil, fmt.Errorf("parse token response: %w", err)
	}
	if tr.Error != "" {
		return nil, fmt.Errorf("microsoft token error: %s — %s", tr.Error, tr.ErrorDesc)
	}
	return &tr, nil
}

// ExchangeCode exchanges an authorization code for tokens and stores them encrypted.
func (s *Service) ExchangeCode(ctx context.Context, userID uuid.UUID, code string) error {
	params := url.Values{}
	params.Set("client_id", s.cfg.ClientID)
	params.Set("client_secret", s.cfg.ClientSecret)
	params.Set("code", code)
	params.Set("redirect_uri", s.cfg.RedirectURL)
	params.Set("grant_type", "authorization_code")

	tr, err := s.fetchToken(ctx, params)
	if err != nil {
		return err
	}

	// Fetch the Microsoft user's profile to store their ID and email.
	msUser, err := s.fetchMe(ctx, tr.AccessToken)
	if err != nil {
		return fmt.Errorf("fetch microsoft profile: %w", err)
	}

	accessEnc, err := encrypt(s.cfg.TokenKey, []byte(tr.AccessToken))
	if err != nil {
		return err
	}
	refreshEnc, err := encrypt(s.cfg.TokenKey, []byte(tr.RefreshToken))
	if err != nil {
		return err
	}

	rec := msgraphstore.TokenRecord{
		UserID:          userID,
		MicrosoftUserID: msUser.ID,
		MicrosoftEmail:  msUser.Mail,
		AccessTokenEnc:  accessEnc,
		RefreshTokenEnc: refreshEnc,
		ExpiresAt:       time.Now().Add(time.Duration(tr.ExpiresIn) * time.Second),
		Scope:           tr.Scope,
	}
	if err := s.store.Upsert(ctx, rec); err != nil {
		return err
	}

	_ = s.auditWriter.Write(ctx, audit.Entry{
		Actor:        audit.Actor{Type: "user", ID: userID.String()},
		Action:       "msgraph.token.connected",
		ResourceType: "user", ResourceID: userID.String(),
		Context: map[string]any{"microsoft_email": msUser.Mail},
	})
	return nil
}

// Disconnect removes stored tokens, unlinking the user's Microsoft account.
func (s *Service) Disconnect(ctx context.Context, userID uuid.UUID) error {
	if err := s.store.Delete(ctx, userID); err != nil {
		return err
	}
	_ = s.auditWriter.Write(ctx, audit.Entry{
		Actor:        audit.Actor{Type: "user", ID: userID.String()},
		Action:       "msgraph.token.disconnected",
		ResourceType: "user", ResourceID: userID.String(),
	})
	return nil
}

// Status returns whether the user is connected and their Microsoft email.
func (s *Service) Status(ctx context.Context, userID uuid.UUID) (connected bool, msEmail string, err error) {
	rec, err := s.store.Get(ctx, userID)
	if err != nil {
		return false, "", err
	}
	if rec == nil {
		return false, "", nil
	}
	return true, rec.MicrosoftEmail, nil
}

// StatusWithScope returns connection status, email, and the stored scope string.
// Used by the frontend to detect when the user needs to reconnect for new permissions.
func (s *Service) StatusWithScope(ctx context.Context, userID uuid.UUID) (connected bool, msEmail, scope string, err error) {
	rec, err := s.store.Get(ctx, userID)
	if err != nil {
		return false, "", "", err
	}
	if rec == nil {
		return false, "", "", nil
	}
	return true, rec.MicrosoftEmail, rec.Scope, nil
}

// SSOAuthURL returns the Microsoft OAuth2 URL for the login SSO flow.
// Uses minimal scopes (email + profile) — does NOT store tokens afterward.
func (s *Service) SSOAuthURL(state string) string {
	v := url.Values{}
	v.Set("client_id", s.cfg.ClientID)
	v.Set("response_type", "code")
	v.Set("redirect_uri", s.cfg.SSORedirectURL)
	v.Set("scope", strings.Join(ssoScopes, " "))
	v.Set("state", state)
	v.Set("response_mode", "query")
	return fmt.Sprintf("https://login.microsoftonline.com/%s/oauth2/v2.0/authorize?%s",
		s.cfg.TenantID, v.Encode())
}

// ExchangeCodeForEmail exchanges an SSO authorization code and returns the
// Microsoft email address. Does NOT persist any tokens.
func (s *Service) ExchangeCodeForEmail(ctx context.Context, code string) (string, error) {
	params := url.Values{}
	params.Set("client_id", s.cfg.ClientID)
	params.Set("client_secret", s.cfg.ClientSecret)
	params.Set("code", code)
	params.Set("redirect_uri", s.cfg.SSORedirectURL)
	params.Set("grant_type", "authorization_code")

	tr, err := s.fetchToken(ctx, params)
	if err != nil {
		return "", err
	}
	msUser, err := s.fetchMe(ctx, tr.AccessToken)
	if err != nil {
		return "", fmt.Errorf("fetch microsoft profile: %w", err)
	}
	if msUser.Mail == "" {
		return "", fmt.Errorf("microsoft account has no email address")
	}
	return msUser.Mail, nil
}

// accessToken returns a valid (auto-refreshed) plaintext access token.
func (s *Service) accessToken(ctx context.Context, userID uuid.UUID) (string, error) {
	rec, err := s.store.Get(ctx, userID)
	if err != nil {
		return "", err
	}
	if rec == nil {
		return "", fmt.Errorf("microsoft account not connected")
	}

	if time.Until(rec.ExpiresAt) < tokenRefresh {
		if err := s.refreshTokens(ctx, userID, rec); err != nil {
			return "", fmt.Errorf("token refresh: %w", err)
		}
		rec, err = s.store.Get(ctx, userID)
		if err != nil {
			return "", err
		}
	}

	plain, err := decrypt(s.cfg.TokenKey, rec.AccessTokenEnc)
	if err != nil {
		return "", fmt.Errorf("decrypt access token: %w", err)
	}
	return string(plain), nil
}

func (s *Service) refreshTokens(ctx context.Context, userID uuid.UUID, rec *msgraphstore.TokenRecord) error {
	plainRefresh, err := decrypt(s.cfg.TokenKey, rec.RefreshTokenEnc)
	if err != nil {
		return fmt.Errorf("decrypt refresh token: %w", err)
	}

	params := url.Values{}
	params.Set("client_id", s.cfg.ClientID)
	params.Set("client_secret", s.cfg.ClientSecret)
	params.Set("refresh_token", string(plainRefresh))
	params.Set("grant_type", "refresh_token")
	params.Set("scope", strings.Join(oauthScopes, " "))

	tr, err := s.fetchToken(ctx, params)
	if err != nil {
		return err
	}

	accessEnc, err := encrypt(s.cfg.TokenKey, []byte(tr.AccessToken))
	if err != nil {
		return err
	}
	refreshEnc, err := encrypt(s.cfg.TokenKey, []byte(tr.RefreshToken))
	if err != nil {
		return err
	}

	return s.store.UpdateTokens(ctx, userID, accessEnc, refreshEnc,
		time.Now().Add(time.Duration(tr.ExpiresIn)*time.Second))
}

// graphGET performs an authenticated GET to the Graph API and decodes JSON into out.
func (s *Service) graphGET(ctx context.Context, userID uuid.UUID, path string, out any) error {
	token, err := s.accessToken(ctx, userID)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, graphBase+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("graph %s: %d %s", path, resp.StatusCode, string(body))
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// ── Microsoft /me ──────────────────────────────────────────────────────────────

type msUser struct {
	ID   string `json:"id"`
	Mail string `json:"mail"`
}

func (s *Service) fetchMe(ctx context.Context, accessToken string) (*msUser, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, graphBase+"/me?$select=id,mail", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var u msUser
	if err := json.NewDecoder(resp.Body).Decode(&u); err != nil {
		return nil, err
	}
	return &u, nil
}

// graphPOST performs an authenticated POST to the Graph API with a JSON body.
// Pass nil for out if no response body is expected (e.g. 202 Accepted replies).
func (s *Service) graphPOST(ctx context.Context, userID uuid.UUID, path string, body any, out any) error {
	token, err := s.accessToken(ctx, userID)
	if err != nil {
		return err
	}
	encoded, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, graphBase+path, strings.NewReader(string(encoded)))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("graph POST %s: %d %s", path, resp.StatusCode, string(b))
	}
	if out != nil && resp.ContentLength != 0 {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}

// ── Mail ──────────────────────────────────────────────────────────────────────

type MailMessage struct {
	ID          string `json:"id"`
	Subject     string `json:"subject"`
	BodyPreview string `json:"bodyPreview"`
	ReceivedAt  string `json:"receivedDateTime"`
	IsRead      bool   `json:"isRead"`
	SenderName  string `json:"senderName"`
	SenderEmail string `json:"senderEmail"`
}

// mailFolderPath maps user-facing folder names to Graph API folder names.
var mailFolderPath = map[string]string{
	"inbox":  "inbox",
	"sent":   "sentItems",
	"drafts": "drafts",
	"junk":   "junkemail",
}

// GetMail fetches messages from a specific mail folder (inbox, sent, drafts, junk).
func (s *Service) GetMail(ctx context.Context, userID uuid.UUID, folder string) ([]MailMessage, error) {
	fp, ok := mailFolderPath[folder]
	if !ok {
		fp = "inbox"
	}
	var raw struct {
		Value []struct {
			ID          string `json:"id"`
			Subject     string `json:"subject"`
			BodyPreview string `json:"bodyPreview"`
			ReceivedAt  string `json:"receivedDateTime"`
			IsRead      bool   `json:"isRead"`
			From        struct {
				EmailAddress struct {
					Name    string `json:"name"`
					Address string `json:"address"`
				} `json:"emailAddress"`
			} `json:"from"`
		} `json:"value"`
	}
	path := fmt.Sprintf("/me/mailFolders/%s/messages?$top=20&$orderby=receivedDateTime%%20desc&$select=id,subject,bodyPreview,receivedDateTime,isRead,from", fp)
	if err := s.graphGET(ctx, userID, path, &raw); err != nil {
		return nil, err
	}
	out := make([]MailMessage, 0, len(raw.Value))
	for _, m := range raw.Value {
		out = append(out, MailMessage{
			ID:          m.ID,
			Subject:     m.Subject,
			BodyPreview: m.BodyPreview,
			ReceivedAt:  m.ReceivedAt,
			IsRead:      m.IsRead,
			SenderName:  m.From.EmailAddress.Name,
			SenderEmail: m.From.EmailAddress.Address,
		})
	}
	return out, nil
}

// GetEmailBody fetches the full HTML body of a single email message.
func (s *Service) GetEmailBody(ctx context.Context, userID uuid.UUID, messageID string) (string, error) {
	var raw struct {
		Body struct {
			ContentType string `json:"contentType"`
			Content     string `json:"content"`
		} `json:"body"`
	}
	path := fmt.Sprintf("/me/messages/%s?$select=body", url.PathEscape(messageID))
	if err := s.graphGET(ctx, userID, path, &raw); err != nil {
		return "", err
	}
	return raw.Body.Content, nil
}

// ForwardEmail forwards a message to one or more recipients with an optional comment.
func (s *Service) ForwardEmail(ctx context.Context, userID uuid.UUID, messageID, comment string, to []string) error {
	payload := map[string]any{
		"comment":      comment,
		"toRecipients": makeRecipients(to),
	}
	path := fmt.Sprintf("/me/messages/%s/forward", url.PathEscape(messageID))
	if err := s.graphPOST(ctx, userID, path, payload, nil); err != nil {
		return err
	}
	_ = s.auditWriter.Write(ctx, audit.Entry{
		Actor:        audit.Actor{Type: "user", ID: userID.String()},
		Action:       "msgraph.email.forwarded",
		ResourceType: "email", ResourceID: messageID,
		Context: map[string]any{"to": to},
	})
	return nil
}

// ReplyToEmail sends a reply to the sender of a message.
func (s *Service) ReplyToEmail(ctx context.Context, userID uuid.UUID, messageID, comment string) error {
	path := fmt.Sprintf("/me/messages/%s/reply", url.PathEscape(messageID))
	body := map[string]any{
		"message": map[string]any{},
		"comment": comment,
	}
	if err := s.graphPOST(ctx, userID, path, body, nil); err != nil {
		return err
	}
	_ = s.auditWriter.Write(ctx, audit.Entry{
		Actor:  audit.Actor{Type: "user", ID: userID.String()},
		Action: "msgraph.email.replied",
		ResourceType: "email", ResourceID: messageID,
	})
	return nil
}

// ReplyAllToEmail sends a reply-all to a message thread.
func (s *Service) ReplyAllToEmail(ctx context.Context, userID uuid.UUID, messageID, comment string) error {
	path := fmt.Sprintf("/me/messages/%s/replyAll", url.PathEscape(messageID))
	body := map[string]any{
		"message": map[string]any{},
		"comment": comment,
	}
	if err := s.graphPOST(ctx, userID, path, body, nil); err != nil {
		return err
	}
	_ = s.auditWriter.Write(ctx, audit.Entry{
		Actor:  audit.Actor{Type: "user", ID: userID.String()},
		Action: "msgraph.email.replied_all",
		ResourceType: "email", ResourceID: messageID,
	})
	return nil
}

func makeRecipients(emails []string) []map[string]any {
	out := make([]map[string]any, 0, len(emails))
	for _, e := range emails {
		e = strings.TrimSpace(e)
		if e != "" {
			out = append(out, map[string]any{"emailAddress": map[string]string{"address": e}})
		}
	}
	return out
}

// SendEmail composes and sends a new email to one or more recipients with optional CC/BCC.
func (s *Service) SendEmail(ctx context.Context, userID uuid.UUID, to []string, subject, body string, cc, bcc []string) error {
	msg := map[string]any{
		"subject": subject,
		"body":    map[string]string{"contentType": "Text", "content": body},
		"toRecipients": makeRecipients(to),
	}
	if len(cc) > 0 {
		msg["ccRecipients"] = makeRecipients(cc)
	}
	if len(bcc) > 0 {
		msg["bccRecipients"] = makeRecipients(bcc)
	}
	payload := map[string]any{"message": msg, "saveToSentItems": true}
	if err := s.graphPOST(ctx, userID, "/me/sendMail", payload, nil); err != nil {
		return err
	}
	_ = s.auditWriter.Write(ctx, audit.Entry{
		Actor:        audit.Actor{Type: "user", ID: userID.String()},
		Action:       "msgraph.email.sent",
		ResourceType: "email",
		Context:      map[string]any{"to": to, "subject": subject},
	})
	return nil
}

// ── Calendar ──────────────────────────────────────────────────────────────────

type CalendarEvent struct {
	ID       string `json:"id"`
	Subject  string `json:"subject"`
	Start    string `json:"start"`
	End      string `json:"end"`
	Location string `json:"location"`
	IsOnline bool   `json:"isOnlineMeeting"`
	JoinURL  string `json:"onlineMeetingUrl"`
}

func (s *Service) GetCalendar(ctx context.Context, userID uuid.UUID) ([]CalendarEvent, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	end := time.Now().Add(7 * 24 * time.Hour).UTC().Format(time.RFC3339)
	path := fmt.Sprintf(
		"/me/calendarView?startDateTime=%s&endDateTime=%s&$top=10&$orderby=start/dateTime&$select=id,subject,start,end,location,isOnlineMeeting,onlineMeetingUrl",
		url.QueryEscape(now), url.QueryEscape(end),
	)
	var raw struct {
		Value []struct {
			ID       string `json:"id"`
			Subject  string `json:"subject"`
			Start    struct{ DateTime string `json:"dateTime"` } `json:"start"`
			End      struct{ DateTime string `json:"dateTime"` } `json:"end"`
			Location struct{ DisplayName string `json:"displayName"` } `json:"location"`
			IsOnline bool   `json:"isOnlineMeeting"`
			JoinURL  string `json:"onlineMeetingUrl"`
		} `json:"value"`
	}
	if err := s.graphGET(ctx, userID, path, &raw); err != nil {
		return nil, err
	}
	out := make([]CalendarEvent, 0, len(raw.Value))
	for _, e := range raw.Value {
		out = append(out, CalendarEvent{
			ID:       e.ID,
			Subject:  e.Subject,
			Start:    e.Start.DateTime,
			End:      e.End.DateTime,
			Location: e.Location.DisplayName,
			IsOnline: e.IsOnline,
			JoinURL:  e.JoinURL,
		})
	}
	return out, nil
}

// CreateEventReq holds the fields for creating a new calendar event.
type CreateEventReq struct {
	Subject   string   `json:"subject"`
	Body      string   `json:"body"`
	Start     string   `json:"start"`      // ISO 8601 datetime e.g. "2026-09-15T10:00:00"
	End       string   `json:"end"`        // ISO 8601 datetime
	TimeZone  string   `json:"timeZone"`   // e.g. "Africa/Lagos"
	Location  string   `json:"location"`
	IsOnline  bool     `json:"isOnline"`
	Attendees []string `json:"attendees"`  // email addresses
}

// CreateCalendarEvent creates a new event on the user's default calendar.
func (s *Service) CreateCalendarEvent(ctx context.Context, userID uuid.UUID, req CreateEventReq) (*CalendarEvent, error) {
	tz := req.TimeZone
	if tz == "" {
		tz = "Africa/Lagos"
	}
	attendees := make([]map[string]any, 0, len(req.Attendees))
	for _, email := range req.Attendees {
		attendees = append(attendees, map[string]any{
			"emailAddress": map[string]string{"address": email},
			"type":         "required",
		})
	}
	payload := map[string]any{
		"subject": req.Subject,
		"body":    map[string]string{"contentType": "Text", "content": req.Body},
		"start":   map[string]string{"dateTime": req.Start, "timeZone": tz},
		"end":     map[string]string{"dateTime": req.End, "timeZone": tz},
		"location": map[string]string{"displayName": req.Location},
		"attendees": attendees,
		"isOnlineMeeting": req.IsOnline,
	}
	var raw struct {
		ID      string `json:"id"`
		Subject string `json:"subject"`
		Start   struct{ DateTime string `json:"dateTime"` } `json:"start"`
		End     struct{ DateTime string `json:"dateTime"` } `json:"end"`
		Location struct{ DisplayName string `json:"displayName"` } `json:"location"`
		IsOnline bool   `json:"isOnlineMeeting"`
		JoinURL  string `json:"onlineMeetingUrl"`
	}
	if err := s.graphPOST(ctx, userID, "/me/events", payload, &raw); err != nil {
		return nil, err
	}
	_ = s.auditWriter.Write(ctx, audit.Entry{
		Actor:  audit.Actor{Type: "user", ID: userID.String()},
		Action: "msgraph.calendar.event_created",
		ResourceType: "calendar_event", ResourceID: raw.ID,
		Context: map[string]any{"subject": req.Subject},
	})
	ev := &CalendarEvent{
		ID: raw.ID, Subject: raw.Subject,
		Start: raw.Start.DateTime, End: raw.End.DateTime,
		Location: raw.Location.DisplayName,
		IsOnline: raw.IsOnline, JoinURL: raw.JoinURL,
	}
	return ev, nil
}

// SetPresence sets the signed-in user's preferred Teams presence/availability.
// availability: Available | Busy | DoNotDisturb | BeRightBack | Away | Offline
// expirationDuration: ISO 8601 duration e.g. "PT1H" (1 hour), "" = session.
func (s *Service) SetPresence(ctx context.Context, userID uuid.UUID, availability, expirationDuration string) error {
	body := map[string]string{
		"availability": availability,
		"activity":     availability,
	}
	if expirationDuration != "" {
		body["expirationDuration"] = expirationDuration
	}
	return s.graphPOST(ctx, userID, "/me/presence/setUserPreferredPresence", body, nil)
}

// ── Teams Presence ────────────────────────────────────────────────────────────

type Presence struct {
	Availability string `json:"availability"`
	Activity     string `json:"activity"`
}

func (s *Service) GetPresence(ctx context.Context, userID uuid.UUID) (*Presence, error) {
	var p Presence
	if err := s.graphGET(ctx, userID, "/me/presence", &p); err != nil {
		return nil, err
	}
	return &p, nil
}

// ── Teams Chat ────────────────────────────────────────────────────────────────

type TeamsMessage struct {
	ID          string            `json:"id"`
	ChatID      string            `json:"chatId"`
	Body        string            `json:"body"`
	SentAt      string            `json:"sentAt"`
	SenderName  string            `json:"senderName"`
	SenderMSID  string            `json:"senderMsId"`
	Attachments []Attachment      `json:"attachments"`
	Reactions   []MessageReaction `json:"reactions"`
}

// Attachment represents a file or media attached to a Teams message.
type Attachment struct {
	ID          string `json:"id"`
	ContentType string `json:"contentType"`
	ContentURL  string `json:"contentUrl"`
	Name        string `json:"name"`
}

// MessageReaction is a single emoji reaction on a message.
type MessageReaction struct {
	ReactionType string `json:"reactionType"` // like|heart|laugh|surprised|sad|angry
	SenderName   string `json:"senderName"`
	SenderMSID   string `json:"senderMsId"`
}

// ChatSummary is a chat with proper participant name and last message preview.
type ChatSummary struct {
	ID          string       `json:"id"`
	ChatType    string       `json:"chatType"` // "oneOnOne" | "group"
	Topic       string       `json:"topic"`
	WithName    string       `json:"withName"`   // other person's display name
	WithEmail   string       `json:"withEmail"`  // other person's email
	WithMSID    string       `json:"withMsId"`   // other person's Microsoft user ID (for presence)
	LastMessage TeamsMessage `json:"lastMessage"`
}

// ChatReadStatus holds each member's last-read timestamp in a chat.
type ChatReadStatus struct {
	UserID           string `json:"userId"`
	DisplayName      string `json:"displayName"`
	LastReadDateTime string `json:"lastReadDateTime"` // ISO 8601, empty = never read
}

// ChatPage is a paginated page of chat messages.
type ChatPage struct {
	Messages []TeamsMessage `json:"messages"`
	NextLink string         `json:"nextLink"` // empty string when no more pages
}

// UserProfile holds extended information about a Microsoft 365 user.
type UserProfile struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
	Mail        string `json:"mail"`
	JobTitle    string `json:"jobTitle"`
	Department  string `json:"department"`
	Phone       string `json:"phone"`
}

// GetUserProfile fetches extended profile info for a user by their MS ID.
func (s *Service) GetUserProfile(ctx context.Context, userID uuid.UUID, targetMSID string) (*UserProfile, error) {
	var raw struct {
		ID             string   `json:"id"`
		DisplayName    string   `json:"displayName"`
		Mail           string   `json:"mail"`
		JobTitle       string   `json:"jobTitle"`
		Department     string   `json:"department"`
		BusinessPhones []string `json:"businessPhones"`
	}
	path := fmt.Sprintf("/users/%s?$select=id,displayName,mail,jobTitle,department,businessPhones",
		url.PathEscape(targetMSID))
	if err := s.graphGET(ctx, userID, path, &raw); err != nil {
		return nil, err
	}
	phone := ""
	if len(raw.BusinessPhones) > 0 {
		phone = raw.BusinessPhones[0]
	}
	return &UserProfile{
		ID: raw.ID, DisplayName: raw.DisplayName, Mail: raw.Mail,
		JobTitle: raw.JobTitle, Department: raw.Department, Phone: phone,
	}, nil
}

// GetUserPhoto fetches a user's profile photo bytes and content type.
// Returns nil bytes when the user has no photo (404 from Graph).
func (s *Service) GetUserPhoto(ctx context.Context, userID uuid.UUID, targetMSID string) ([]byte, string, error) {
	token, err := s.accessToken(ctx, userID)
	if err != nil {
		return nil, "", err
	}
	photoURL := fmt.Sprintf("%s/users/%s/photo/$value", graphBase, url.PathEscape(targetMSID))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, photoURL, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, "", nil // user has no photo — not an error
	}
	if resp.StatusCode >= 400 {
		return nil, "", fmt.Errorf("photo fetch: %d", resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", err
	}
	ct := resp.Header.Get("Content-Type")
	if ct == "" {
		ct = "image/jpeg"
	}
	return data, ct, nil
}

// OrgUser is a colleague returned by a people search.
type OrgUser struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
	Mail        string `json:"mail"`
}

// SearchUsers searches the organisation directory for users matching query.
func (s *Service) SearchUsers(ctx context.Context, userID uuid.UUID, query string) ([]OrgUser, error) {
	token, err := s.accessToken(ctx, userID)
	if err != nil {
		return nil, err
	}
	path := fmt.Sprintf("%s/users?$filter=startsWith(displayName,'%s')&$select=id,displayName,mail&$top=10",
		graphBase, url.QueryEscape(query))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var raw struct {
		Value []OrgUser `json:"value"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}
	return raw.Value, nil
}

// CreateOneOnOneChat creates (or retrieves existing) 1:1 Teams chat with a recipient.
func (s *Service) CreateOneOnOneChat(ctx context.Context, userID uuid.UUID, recipientMSID string) (string, error) {
	return s.createChat(ctx, userID, "oneOnOne", "", []string{recipientMSID})
}

// CreateGroupChat creates a new Teams group chat with multiple recipients and an optional topic.
func (s *Service) CreateGroupChat(ctx context.Context, userID uuid.UUID, topic string, memberMSIDs []string) (string, error) {
	return s.createChat(ctx, userID, "group", topic, memberMSIDs)
}

func (s *Service) createChat(ctx context.Context, userID uuid.UUID, chatType, topic string, memberMSIDs []string) (string, error) {
	rec, err := s.store.Get(ctx, userID)
	if err != nil || rec == nil {
		return "", fmt.Errorf("microsoft account not connected")
	}
	members := []map[string]any{
		{
			"@odata.type":     "#microsoft.graph.aadUserConversationMember",
			"roles":           []string{"owner"},
			"user@odata.bind": fmt.Sprintf("https://graph.microsoft.com/v1.0/users/%s", rec.MicrosoftUserID),
		},
	}
	for _, id := range memberMSIDs {
		members = append(members, map[string]any{
			"@odata.type":     "#microsoft.graph.aadUserConversationMember",
			"roles":           []string{"owner"},
			"user@odata.bind": fmt.Sprintf("https://graph.microsoft.com/v1.0/users/%s", id),
		})
	}
	payload := map[string]any{"chatType": chatType, "members": members}
	if topic != "" {
		payload["topic"] = topic
	}
	var result struct{ ID string `json:"id"` }
	if err := s.graphPOST(ctx, userID, "/chats", payload, &result); err != nil {
		return "", err
	}
	return result.ID, nil
}

func (s *Service) GetTeamsChats(ctx context.Context, userID uuid.UUID, limit int) ([]TeamsMessage, error) {
	if limit <= 0 {
		limit = 20
	}
	// Fetch the most recent chats.
	var chats struct {
		Value []struct {
			ID string `json:"id"`
		} `json:"value"`
	}
	if err := s.graphGET(ctx, userID, fmt.Sprintf("/me/chats?$top=%d", limit), &chats); err != nil {
		return nil, err
	}

	out := make([]TeamsMessage, 0, len(chats.Value))
	for _, chat := range chats.Value {
		var msgs struct {
			Value []struct {
				ID   string `json:"id"`
				Body struct {
					Content string `json:"content"`
				} `json:"body"`
				CreatedAt string `json:"createdDateTime"`
				From      struct {
					User struct{ DisplayName string `json:"displayName"` } `json:"user"`
				} `json:"from"`
			} `json:"value"`
		}
		path := fmt.Sprintf("/me/chats/%s/messages?$top=1&$orderby=createdDateTime%%20desc", chat.ID)
		if err := s.graphGET(ctx, userID, path, &msgs); err != nil {
			continue // skip chats we can't read, don't fail the whole request
		}
		if len(msgs.Value) == 0 {
			continue
		}
		m := msgs.Value[0]
		out = append(out, TeamsMessage{
			ID:         m.ID,
			ChatID:     chat.ID,
			Body:       m.Body.Content,
			SentAt:     m.CreatedAt,
			SenderName: m.From.User.DisplayName,
		})
	}
	return out, nil
}

// GetChatSummaries fetches chats with member info so the correct person's name is shown.
func (s *Service) GetChatSummaries(ctx context.Context, userID uuid.UUID, limit int) ([]ChatSummary, error) {
	if limit <= 0 {
		limit = 20
	}
	rec, err := s.store.Get(ctx, userID)
	if err != nil || rec == nil {
		return nil, fmt.Errorf("microsoft account not connected")
	}
	myMSID := rec.MicrosoftUserID

	// Fetch chats with members expanded so we can get participant names.
	var raw struct {
		Value []struct {
			ID       string `json:"id"`
			ChatType string `json:"chatType"`
			Topic    string `json:"topic"`
			Members  []struct {
				DisplayName      string `json:"displayName"`
				Email            string `json:"email"`
				UserID           string `json:"userId"`
				VisibleHistoryStartDateTime string `json:"visibleHistoryStartDateTime"`
			} `json:"members"`
		} `json:"value"`
	}
	path := fmt.Sprintf("/me/chats?$top=%d&$expand=members&$select=id,chatType,topic", limit)
	if err := s.graphGET(ctx, userID, path, &raw); err != nil {
		return nil, err
	}

	out := make([]ChatSummary, 0, len(raw.Value))
	for _, chat := range raw.Value {
		var withName, withEmail, withMSID string
		if chat.ChatType == "group" {
			// Group chat: use topic or list all other member names
			if chat.Topic != "" {
				withName = chat.Topic
			} else {
				var names []string
				for _, m := range chat.Members {
					if m.UserID != myMSID && m.DisplayName != "" {
						names = append(names, m.DisplayName)
					}
				}
				withName = strings.Join(names, ", ")
			}
		} else {
			// 1:1 chat: find the other person
			for _, m := range chat.Members {
				if m.UserID != myMSID {
					withName = m.DisplayName
					withEmail = m.Email
					withMSID = m.UserID
					break
				}
			}
		}

		// Fetch the last message preview.
		var msgs struct {
			Value []struct {
				ID   string `json:"id"`
				Body struct{ Content string `json:"content"` } `json:"body"`
				CreatedAt string `json:"createdDateTime"`
				From struct {
					User struct{ DisplayName string `json:"displayName"` } `json:"user"`
				} `json:"from"`
			} `json:"value"`
		}
		msgPath := fmt.Sprintf("/me/chats/%s/messages?$top=1&$orderby=createdDateTime%%20desc", url.PathEscape(chat.ID))
		_ = s.graphGET(ctx, userID, msgPath, &msgs) // skip error — just show empty preview

		var last TeamsMessage
		if len(msgs.Value) > 0 {
			m := msgs.Value[0]
			last = TeamsMessage{
				ID: m.ID, ChatID: chat.ID,
				Body:       m.Body.Content,
				SentAt:     m.CreatedAt,
				SenderName: m.From.User.DisplayName,
			}
		}

		out = append(out, ChatSummary{
			ID: chat.ID, ChatType: chat.ChatType, Topic: chat.Topic,
			WithName: withName, WithEmail: withEmail, WithMSID: withMSID, LastMessage: last,
		})
	}
	return out, nil
}

// GetChatPage returns a page of messages for a chat, newest first then reversed for display.
// Pass an empty nextLink for the first page; subsequent pages use the nextLink from the previous response.
func (s *Service) GetChatPage(ctx context.Context, userID uuid.UUID, chatID string, top int, nextLink string) (*ChatPage, error) {
	if top <= 0 {
		top = 50
	}
	token, err := s.accessToken(ctx, userID)
	if err != nil {
		return nil, err
	}

	var fetchURL string
	if nextLink != "" {
		fetchURL = nextLink // Graph provides the full URL for next page
	} else {
		fetchURL = fmt.Sprintf("%s/me/chats/%s/messages?$top=%d&$orderby=createdDateTime%%20desc",
			graphBase, url.PathEscape(chatID), top)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fetchURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var raw struct {
		NextLink string `json:"@odata.nextLink"`
		Value    []struct {
			ID        string `json:"id"`
			Body      struct{ Content string `json:"content"` } `json:"body"`
			CreatedAt string `json:"createdDateTime"`
			From      struct {
				User struct {
					DisplayName string `json:"displayName"`
					ID          string `json:"id"`
				} `json:"user"`
			} `json:"from"`
			Attachments []struct {
				ID          string `json:"id"`
				ContentType string `json:"contentType"`
				ContentURL  string `json:"contentUrl"`
				Name        string `json:"name"`
			} `json:"attachments"`
			Reactions []struct {
				ReactionType string `json:"reactionType"`
				User         struct {
					DisplayName string `json:"displayName"`
					ID          string `json:"id"`
				} `json:"user"`
			} `json:"reactions"`
		} `json:"value"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}

	// Messages come newest-first from Graph; reverse so display is oldest-at-top.
	msgs := make([]TeamsMessage, 0, len(raw.Value))
	for i := len(raw.Value) - 1; i >= 0; i-- {
		m := raw.Value[i]
		attachments := make([]Attachment, 0, len(m.Attachments))
		for _, a := range m.Attachments {
			attachments = append(attachments, Attachment{
				ID: a.ID, ContentType: a.ContentType, ContentURL: a.ContentURL, Name: a.Name,
			})
		}
		reactions := make([]MessageReaction, 0, len(m.Reactions))
		for _, r := range m.Reactions {
			reactions = append(reactions, MessageReaction{
				ReactionType: r.ReactionType,
				SenderName:   r.User.DisplayName,
				SenderMSID:   r.User.ID,
			})
		}
		msgs = append(msgs, TeamsMessage{
			ID:          m.ID,
			ChatID:      chatID,
			Body:        m.Body.Content,
			SentAt:      m.CreatedAt,
			SenderName:  m.From.User.DisplayName,
			SenderMSID:  m.From.User.ID,
			Attachments: attachments,
			Reactions:   reactions,
		})
	}
	return &ChatPage{Messages: msgs, NextLink: raw.NextLink}, nil
}

// GetEmailThread returns all emails in a conversation thread, oldest first.
func (s *Service) GetEmailThread(ctx context.Context, userID uuid.UUID, conversationID string) ([]MailMessage, error) {
	var raw struct {
		Value []struct {
			ID          string `json:"id"`
			Subject     string `json:"subject"`
			BodyPreview string `json:"bodyPreview"`
			ReceivedAt  string `json:"receivedDateTime"`
			IsRead      bool   `json:"isRead"`
			From        struct {
				EmailAddress struct {
					Name    string `json:"name"`
					Address string `json:"address"`
				} `json:"emailAddress"`
			} `json:"from"`
		} `json:"value"`
	}
	filter := url.QueryEscape(fmt.Sprintf("conversationId eq '%s'", conversationID))
	path := fmt.Sprintf("/me/messages?$filter=%s&$orderby=receivedDateTime&$select=id,subject,bodyPreview,receivedDateTime,isRead,from&$top=50", filter)
	if err := s.graphGET(ctx, userID, path, &raw); err != nil {
		return nil, err
	}
	out := make([]MailMessage, 0, len(raw.Value))
	for _, m := range raw.Value {
		out = append(out, MailMessage{
			ID: m.ID, Subject: m.Subject, BodyPreview: m.BodyPreview,
			ReceivedAt: m.ReceivedAt, IsRead: m.IsRead,
			SenderName: m.From.EmailAddress.Name, SenderEmail: m.From.EmailAddress.Address,
		})
	}
	return out, nil
}

// GetInboxUnreadCount returns the number of unread emails in the inbox.
func (s *Service) GetInboxUnreadCount(ctx context.Context, userID uuid.UUID) (int, error) {
	var raw struct {
		UnreadItemCount int `json:"unreadItemCount"`
	}
	if err := s.graphGET(ctx, userID, "/me/mailFolders/inbox?$select=unreadItemCount", &raw); err != nil {
		return 0, err
	}
	return raw.UnreadItemCount, nil
}

// GetChatMessages returns the last 20 messages in a specific chat (ascending order).
func (s *Service) GetChatMessages(ctx context.Context, userID uuid.UUID, chatID string) ([]TeamsMessage, error) {
	var msgs struct {
		Value []struct {
			ID   string `json:"id"`
			Body struct {
				Content string `json:"content"`
			} `json:"body"`
			CreatedAt string `json:"createdDateTime"`
			From      struct {
				User struct{ DisplayName string `json:"displayName"` } `json:"user"`
			} `json:"from"`
		} `json:"value"`
	}
	path := fmt.Sprintf("/me/chats/%s/messages?$top=20&$orderby=createdDateTime%%20asc", url.PathEscape(chatID))
	if err := s.graphGET(ctx, userID, path, &msgs); err != nil {
		return nil, err
	}
	out := make([]TeamsMessage, 0, len(msgs.Value))
	for _, m := range msgs.Value {
		out = append(out, TeamsMessage{
			ID:         m.ID,
			ChatID:     chatID,
			Body:       m.Body.Content,
			SentAt:     m.CreatedAt,
			SenderName: m.From.User.DisplayName,
		})
	}
	return out, nil
}

// DeleteTeamsMessage soft-deletes a message (shows "This message was deleted").
// Uses /me/chats/ — consistent with the read path which is known to work.
func (s *Service) DeleteTeamsMessage(ctx context.Context, userID uuid.UUID, chatID, messageID string) error {
	token, err := s.accessToken(ctx, userID)
	if err != nil {
		return err
	}
	path := fmt.Sprintf("%s/me/chats/%s/messages/%s", graphBase, url.PathEscape(chatID), url.PathEscape(messageID))
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("graph DELETE message: %d %s", resp.StatusCode, string(b))
	}
	_ = s.auditWriter.Write(ctx, audit.Entry{
		Actor:        audit.Actor{Type: "user", ID: userID.String()},
		Action:       "msgraph.teams.message_deleted",
		ResourceType: "teams_message", ResourceID: messageID,
	})
	return nil
}

// ReactToMessage stores a reaction locally (Graph API doesn't support reactions
// for all Teams chat types, e.g. @unq.gbl.spaces). Reactions are scoped to PageOS.
func (s *Service) ReactToMessage(ctx context.Context, userID uuid.UUID, chatID, messageID, reactionType string) error {
	// Get the user's MS info for display
	rec, _ := s.store.Get(ctx, userID)
	msUserID, displayName := "", ""
	if rec != nil {
		msUserID = rec.MicrosoftUserID
		displayName = rec.MicrosoftEmail
	}
	_, err := s.store.DB().Exec(ctx, `
		INSERT INTO msgraph.chat_reaction (user_id, ms_user_id, display_name, chat_id, message_id, reaction_type)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (user_id, chat_id, message_id, reaction_type) DO NOTHING
	`, userID, msUserID, displayName, chatID, messageID, reactionType)
	return err
}

// UnreactToMessage removes a locally stored reaction.
func (s *Service) UnreactToMessage(ctx context.Context, userID uuid.UUID, chatID, messageID, reactionType string) error {
	_, err := s.store.DB().Exec(ctx, `
		DELETE FROM msgraph.chat_reaction
		WHERE user_id = $1 AND chat_id = $2 AND message_id = $3 AND reaction_type = $4
	`, userID, chatID, messageID, reactionType)
	return err
}

// GetAllLocalReactions returns all local reactions for an entire chat, keyed by messageID.
// More efficient than per-message queries when rendering a full thread.
func (s *Service) GetAllLocalReactions(ctx context.Context, chatID string) (map[string][]MessageReaction, error) {
	rows, err := s.store.DB().Query(ctx, `
		SELECT message_id, reaction_type, display_name, ms_user_id
		FROM msgraph.chat_reaction
		WHERE chat_id = $1
	`, chatID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[string][]MessageReaction)
	for rows.Next() {
		var msgID string
		var r MessageReaction
		if err := rows.Scan(&msgID, &r.ReactionType, &r.SenderName, &r.SenderMSID); err == nil {
			out[msgID] = append(out[msgID], r)
		}
	}
	return out, rows.Err()
}

// GetLocalReactions returns all PageOS reactions for a specific message.
func (s *Service) GetLocalReactions(ctx context.Context, chatID, messageID string) ([]MessageReaction, error) {
	rows, err := s.store.DB().Query(ctx, `
		SELECT reaction_type, display_name, ms_user_id
		FROM msgraph.chat_reaction
		WHERE chat_id = $1 AND message_id = $2
	`, chatID, messageID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []MessageReaction
	for rows.Next() {
		var r MessageReaction
		if err := rows.Scan(&r.ReactionType, &r.SenderName, &r.SenderMSID); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// LocalReadEntry is one user's read status from our local DB.
type LocalReadEntry struct {
	UserID           string `json:"userId"`
	DisplayName      string `json:"displayName"`
	LastReadDateTime string `json:"lastReadDateTime"`
}

// GetLocalReadStatus returns read timestamps for all OTHER users who have
// opened this chat in PageOS. Used instead of the Graph API members endpoint
// which doesn't reliably support lastMessageReadDateTime for all chat types.
func (s *Service) GetLocalReadStatus(ctx context.Context, callerID uuid.UUID, chatID string) ([]LocalReadEntry, error) {
	rows, err := s.store.DB().Query(ctx, `
		SELECT ms_user_id, display_name, last_read_at
		FROM msgraph.chat_read
		WHERE chat_id = $1 AND user_id != $2
	`, chatID, callerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []LocalReadEntry
	for rows.Next() {
		var e LocalReadEntry
		var ts interface{}
		if err := rows.Scan(&e.UserID, &e.DisplayName, &ts); err == nil {
			if t, ok := ts.(interface{ Format(string) string }); ok {
				e.LastReadDateTime = t.Format("2006-01-02T15:04:05Z07:00")
			}
			out = append(out, e)
		}
	}
	if out == nil {
		out = []LocalReadEntry{}
	}
	return out, rows.Err()
}

// MarkChatRead records the current user's last-read timestamp for a chat.
// Called when the user opens or focuses a chat in PageOS.
func (s *Service) MarkChatRead(ctx context.Context, userID uuid.UUID, chatID string) error {
	rec, _ := s.store.Get(ctx, userID)
	msUserID, displayName := "", ""
	if rec != nil {
		msUserID = rec.MicrosoftUserID
		displayName = rec.MicrosoftEmail
	}
	_, err := s.store.DB().Exec(ctx, `
		INSERT INTO msgraph.chat_read (user_id, ms_user_id, display_name, chat_id, last_read_at)
		VALUES ($1, $2, $3, $4, now())
		ON CONFLICT (user_id, chat_id) DO UPDATE SET last_read_at = now(), ms_user_id = EXCLUDED.ms_user_id
	`, userID, msUserID, displayName, chatID)
	return err
}

// GetChatReadStatus returns each member's last-read datetime for the chat.
// This lets the frontend show an eye icon on messages the other person has read.
func (s *Service) GetChatReadStatus(ctx context.Context, userID uuid.UUID, chatID string) ([]ChatReadStatus, error) {
	var raw struct {
		Value []struct {
			UserID               string `json:"userId"`
			DisplayName          string `json:"displayName"`
			LastMessageReadDateTime string `json:"lastMessageReadDateTime"`
		} `json:"value"`
	}
	path := fmt.Sprintf("/chats/%s/members?$select=userId,displayName,lastMessageReadDateTime", url.PathEscape(chatID))
	if err := s.graphGET(ctx, userID, path, &raw); err != nil {
		return nil, err
	}
	out := make([]ChatReadStatus, 0, len(raw.Value))
	for _, m := range raw.Value {
		out = append(out, ChatReadStatus{
			UserID:           m.UserID,
			DisplayName:      m.DisplayName,
			LastReadDateTime: m.LastMessageReadDateTime,
		})
	}
	return out, nil
}

// GetOtherUserPresence fetches the presence of another user by their Microsoft user ID.
// Requires Presence.Read.All scope (admin consent needed).
func (s *Service) GetOtherUserPresence(ctx context.Context, userID uuid.UUID, targetMSID string) (*Presence, error) {
	var p Presence
	path := fmt.Sprintf("/users/%s/presence", url.PathEscape(targetMSID))
	if err := s.graphGET(ctx, userID, path, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

// SendTeamsMessage sends a message to an existing chat.
func (s *Service) SendTeamsMessage(ctx context.Context, userID uuid.UUID, chatID, content string) error {
	path := fmt.Sprintf("/me/chats/%s/messages", url.PathEscape(chatID))
	payload := map[string]any{
		"body": map[string]string{
			"contentType": "text",
			"content":     content,
		},
	}
	if err := s.graphPOST(ctx, userID, path, payload, nil); err != nil {
		return err
	}
	_ = s.auditWriter.Write(ctx, audit.Entry{
		Actor:        audit.Actor{Type: "user", ID: userID.String()},
		Action:       "msgraph.teams.message_sent",
		ResourceType: "teams_chat", ResourceID: chatID,
	})
	return nil
}
