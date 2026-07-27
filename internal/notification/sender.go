package notification

import (
	"fmt"
	"net/smtp"
	"strings"
)

// EmailSender delivers a single email. Swap the implementation for any
// provider (AWS SES, Mailgun, etc.) without changing the dispatcher.
type EmailSender interface {
	Send(to, subject, body string) error
}

// SMTPConfig holds connection settings for the SMTP sender.
type SMTPConfig struct {
	Host     string
	Port     int
	Username string
	Password string
	From     string
}

type smtpSender struct {
	cfg SMTPConfig
}

// NewSMTPSender returns an EmailSender backed by SMTP.
func NewSMTPSender(cfg SMTPConfig) EmailSender {
	return &smtpSender{cfg: cfg}
}

func (s *smtpSender) Send(to, subject, body string) error {
	addr := fmt.Sprintf("%s:%d", s.cfg.Host, s.cfg.Port)
	auth := smtp.PlainAuth("", s.cfg.Username, s.cfg.Password, s.cfg.Host)

	msg := strings.Join([]string{
		fmt.Sprintf("From: %s", s.cfg.From),
		fmt.Sprintf("To: %s", to),
		fmt.Sprintf("Subject: %s", subject),
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=utf-8",
		"",
		body,
	}, "\r\n")

	return smtp.SendMail(addr, auth, s.cfg.From, []string{to}, []byte(msg))
}

// NoOpSender discards all messages. Used when SMTP is not configured.
type NoOpSender struct{}

func (NoOpSender) Send(_, _, _ string) error { return nil }
