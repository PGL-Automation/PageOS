package msgraph

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/pagegroup/pageos/internal/audit"
	msgraphstore "github.com/pagegroup/pageos/internal/msgraph/store"
)

const (
	graphBase    = "https://graph.microsoft.com/v1.0"
	tokenRefresh = 5 * time.Minute
)

// Config holds the Azure app registration credentials.
type Config struct {
	ClientID     string
	ClientSecret string
	TenantID     string
	RedirectURL  string
	TokenKey     []byte // 32 bytes, AES-256
}

// Scopes requested during OAuth authorization.
var oauthScopes = []string{
	"Mail.Read",
	"Calendars.Read",
	"Chat.Read",
	"Presence.Read",
	"offline_access",
	"User.Read",
}

// Service handles Microsoft OAuth and Graph API proxying.
type Service struct {
	cfg         Config
	store       *msgraphstore.Store
	auditWriter *audit.Writer
	httpClient  *http.Client
}

func NewService(cfg Config, store *msgraphstore.Store, aw *audit.Writer) *Service {
	return &Service{
		cfg:         cfg,
		store:       store,
		auditWriter: aw,
		httpClient:  &http.Client{Timeout: 15 * time.Second},
	}
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

func (s *Service) GetMail(ctx context.Context, userID uuid.UUID) ([]MailMessage, error) {
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
	path := "/me/mailFolders/inbox/messages?$top=10&$orderby=receivedDateTime%20desc" +
		"&$select=id,subject,bodyPreview,receivedDateTime,isRead,from"
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
	ID         string `json:"id"`
	ChatID     string `json:"chatId"`
	Body       string `json:"body"`
	SentAt     string `json:"sentAt"`
	SenderName string `json:"senderName"`
}

func (s *Service) GetTeamsChats(ctx context.Context, userID uuid.UUID) ([]TeamsMessage, error) {
	// Fetch the 5 most recent chats.
	var chats struct {
		Value []struct {
			ID string `json:"id"`
		} `json:"value"`
	}
	if err := s.graphGET(ctx, userID, "/me/chats?$top=5", &chats); err != nil {
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
