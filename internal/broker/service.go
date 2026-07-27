// Package broker manages external parties who introduce clients to Page Group.
// Commission is stored as integer basis points; calculation is deferred until
// investment flows are live (see docs/onboarding-slice-plan.md §17).
package broker

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/pagegroup/pageos/internal/audit"
	brokerdb "github.com/pagegroup/pageos/internal/broker/store/gen"
)

// Broker is the public representation of an introducing broker.
type Broker struct {
	ID                uuid.UUID `json:"id"`
	SubsidiaryID      uuid.UUID `json:"subsidiary_id"`
	Code              string    `json:"code"`
	Name              string    `json:"name"`
	Type              string    `json:"type"`
	Email             string    `json:"email"`
	Phone             string    `json:"phone"`
	CommissionRateBps int32     `json:"commission_rate_bps"`
	// CommissionRatePct is a convenience display field (not stored).
	CommissionRatePct float64   `json:"commission_rate_pct"`
	Status            string    `json:"status"`
}

type service struct {
	q     *brokerdb.Queries
	audit *audit.Writer
}

// Service holds the broker capabilities.
type Service = service

func NewService(db *pgxpool.Pool, a *audit.Writer) *Service {
	return &service{q: brokerdb.New(db), audit: a}
}

func (s *service) Create(ctx context.Context, subsidiaryID uuid.UUID, code, name, typ, email, phone string, commissionBps int32) (Broker, error) {
	row, err := s.q.CreateBroker(ctx, brokerdb.CreateBrokerParams{
		SubsidiaryID:      subsidiaryID,
		Code:              code,
		Name:              name,
		Type:              typ,
		Email:             email,
		Phone:             phone,
		CommissionRateBps: commissionBps,
	})
	if err != nil {
		return Broker{}, fmt.Errorf("broker: create: %w", err)
	}
	b := toBroker(row)
	_ = s.audit.Write(ctx, audit.Entry{
		Actor: audit.Actor{Type: "system"}, Action: "broker.created",
		ResourceType: "broker", ResourceID: b.ID.String(),
	})
	return b, nil
}

func (s *service) Get(ctx context.Context, id uuid.UUID) (Broker, error) {
	row, err := s.q.GetBroker(ctx, id)
	if err != nil {
		return Broker{}, fmt.Errorf("broker: not found: %w", err)
	}
	return toBroker(row), nil
}

func (s *service) List(ctx context.Context, subsidiaryID uuid.UUID) ([]Broker, error) {
	rows, err := s.q.ListBrokers(ctx, subsidiaryID)
	if err != nil {
		return nil, err
	}
	out := make([]Broker, 0, len(rows))
	for _, r := range rows {
		out = append(out, toBroker(r))
	}
	return out, nil
}

func (s *service) UpdateCommission(ctx context.Context, id uuid.UUID, bps int32) (Broker, error) {
	row, err := s.q.UpdateBrokerCommission(ctx, brokerdb.UpdateBrokerCommissionParams{
		ID:                id,
		CommissionRateBps: bps,
	})
	if err != nil {
		return Broker{}, fmt.Errorf("broker: update commission: %w", err)
	}
	b := toBroker(row)
	_ = s.audit.Write(ctx, audit.Entry{
		Actor: audit.Actor{Type: "system"}, Action: "broker.commission_updated",
		ResourceType: "broker", ResourceID: b.ID.String(),
		Context: map[string]any{"commission_rate_bps": bps},
	})
	return b, nil
}

func toBroker(r brokerdb.OnboardingBroker) Broker {
	return Broker{
		ID: r.ID, SubsidiaryID: r.SubsidiaryID, Code: r.Code, Name: r.Name,
		Type: r.Type, Email: r.Email, Phone: r.Phone,
		CommissionRateBps: r.CommissionRateBps,
		CommissionRatePct: float64(r.CommissionRateBps) / 100.0,
		Status:            r.Status,
	}
}
