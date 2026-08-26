// Package crm manages wealth manager relationship data: contacts, interactions,
// tasks, and opportunities.
package crm

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct{ pool *pgxpool.Pool }

func NewService(pool *pgxpool.Pool) *Service { return &Service{pool: pool} }

// ── Domain types ──────────────────────────────────────────────────────────────

type Contact struct {
	ID                   uuid.UUID  `json:"id"`
	SubsidiaryID         *uuid.UUID `json:"subsidiary_id,omitempty"`
	RMPersonID           *uuid.UUID `json:"rm_person_id,omitempty"`
	RMName               string     `json:"rm_name"`
	FirstName            string     `json:"first_name"`
	LastName             string     `json:"last_name"`
	FullName             string     `json:"full_name"`
	Company              string     `json:"company"`
	JobTitle             string     `json:"job_title"`
	Email                string     `json:"email"`
	Phone                string     `json:"phone"`
	WhatsApp             string     `json:"whatsapp"`
	LinkedInURL          string     `json:"linkedin_url"`
	Address              string     `json:"address"`
	ContactType          string     `json:"contact_type"`
	Segment              string     `json:"segment"`
	Stage                string     `json:"stage"`
	Source               string     `json:"source"`
	SourceDetail         string     `json:"source_detail"`
	EstimatedAUM         *float64   `json:"estimated_aum,omitempty"`
	AnnualIncome         *float64   `json:"annual_income,omitempty"`
	RiskAppetite         string     `json:"risk_appetite"`
	InvestmentGoals      []string   `json:"investment_goals"`
	PreferredProducts    []string   `json:"preferred_products"`
	OnboardingClientID   *uuid.UUID `json:"onboarding_client_id,omitempty"`
	ReferredByContactID  *uuid.UUID `json:"referred_by_contact_id,omitempty"`
	ReferredByName       string     `json:"referred_by_name,omitempty"`
	BackgroundNotes      string     `json:"background_notes"`
	Tags                 []string   `json:"tags"`
	Priority             string     `json:"priority"`
	LastInteractionAt    *time.Time `json:"last_interaction_at,omitempty"`
	NextFollowupDate     *string    `json:"next_followup_date,omitempty"`
	IsActive             bool       `json:"is_active"`
	CreatedByName        string     `json:"created_by_name"`
	CreatedAt            time.Time  `json:"created_at"`
	UpdatedAt            time.Time  `json:"updated_at"`
	// Computed aggregates
	InteractionCount int     `json:"interaction_count"`
	OpenTaskCount    int     `json:"open_task_count"`
	PipelineValue    float64 `json:"pipeline_value"`
}

type Interaction struct {
	ID              uuid.UUID  `json:"id"`
	ContactID       uuid.UUID  `json:"contact_id"`
	ContactName     string     `json:"contact_name"`
	RMPersonID      *uuid.UUID `json:"rm_person_id,omitempty"`
	RMName          string     `json:"rm_name"`
	Type            string     `json:"type"`
	Direction       string     `json:"direction"`
	Subject         string     `json:"subject"`
	Notes           string     `json:"notes"`
	Outcome         string     `json:"outcome"`
	DurationMins    *int       `json:"duration_mins,omitempty"`
	Location        string     `json:"location"`
	InteractionDate time.Time  `json:"interaction_date"`
	NextAction      string     `json:"next_action"`
	NextActionDate  *string    `json:"next_action_date,omitempty"`
	CreatedByName   string     `json:"created_by_name"`
	CreatedAt       time.Time  `json:"created_at"`
}

type Task struct {
	ID              uuid.UUID  `json:"id"`
	ContactID       *uuid.UUID `json:"contact_id,omitempty"`
	ContactName     string     `json:"contact_name,omitempty"`
	AssignedTo      *uuid.UUID `json:"assigned_to,omitempty"`
	AssignedName    string     `json:"assigned_name"`
	Title           string     `json:"title"`
	Description     string     `json:"description"`
	TaskType        string     `json:"task_type"`
	Priority        string     `json:"priority"`
	Status          string     `json:"status"`
	DueDate         *string    `json:"due_date,omitempty"`
	CompletedAt     *time.Time `json:"completed_at,omitempty"`
	CompletionNotes string     `json:"completion_notes"`
	CreatedByName   string     `json:"created_by_name"`
	CreatedAt       time.Time  `json:"created_at"`
}

type Opportunity struct {
	ID             uuid.UUID  `json:"id"`
	ContactID      uuid.UUID  `json:"contact_id"`
	ContactName    string     `json:"contact_name"`
	RMPersonID     *uuid.UUID `json:"rm_person_id,omitempty"`
	RMName         string     `json:"rm_name"`
	Title          string     `json:"title"`
	Product        string     `json:"product"`
	EstimatedValue *float64   `json:"estimated_value,omitempty"`
	Probability    int        `json:"probability"`
	WeightedValue  float64    `json:"weighted_value"`
	Stage          string     `json:"stage"`
	ExpectedClose  *string    `json:"expected_close,omitempty"`
	ActualClose    *string    `json:"actual_close,omitempty"`
	Notes          string     `json:"notes"`
	LostReason     string     `json:"lost_reason"`
	CreatedByName  string     `json:"created_by_name"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

type DashboardStats struct {
	TotalContacts      int     `json:"total_contacts"`
	NewThisMonth       int     `json:"new_this_month"`
	PipelineValue      float64 `json:"pipeline_value"`
	WeightedPipeline   float64 `json:"weighted_pipeline"`
	TasksDueToday      int     `json:"tasks_due_today"`
	TasksOverdue       int     `json:"tasks_overdue"`
	InteractionsToday  int     `json:"interactions_today"`
	ConversionRate     float64 `json:"conversion_rate"`
	StageBreakdown     []StageCount `json:"stage_breakdown"`
	RecentInteractions []Interaction `json:"recent_interactions"`
	MyOpenTasks        []Task        `json:"my_open_tasks"`
}

type StageCount struct {
	Stage string `json:"stage"`
	Count int    `json:"count"`
}

// ── Input types ───────────────────────────────────────────────────────────────

type CreateContactInput struct {
	SubsidiaryID        *uuid.UUID `json:"subsidiary_id"`
	RMPersonID          *uuid.UUID `json:"rm_person_id"`
	RMName              string     `json:"rm_name"`
	FirstName           string     `json:"first_name"`
	LastName            string     `json:"last_name"`
	Company             string     `json:"company"`
	JobTitle            string     `json:"job_title"`
	Email               string     `json:"email"`
	Phone               string     `json:"phone"`
	WhatsApp            string     `json:"whatsapp"`
	LinkedInURL         string     `json:"linkedin_url"`
	Address             string     `json:"address"`
	ContactType         string     `json:"contact_type"`
	Segment             string     `json:"segment"`
	Stage               string     `json:"stage"`
	Source              string     `json:"source"`
	SourceDetail        string     `json:"source_detail"`
	EstimatedAUM        *float64   `json:"estimated_aum"`
	AnnualIncome        *float64   `json:"annual_income"`
	RiskAppetite        string     `json:"risk_appetite"`
	InvestmentGoals     []string   `json:"investment_goals"`
	PreferredProducts   []string   `json:"preferred_products"`
	ReferredByContactID *uuid.UUID `json:"referred_by_contact_id"`
	BackgroundNotes     string     `json:"background_notes"`
	Tags                []string   `json:"tags"`
	Priority            string     `json:"priority"`
}

type LogInteractionInput struct {
	ContactID       uuid.UUID  `json:"contact_id"`
	RMPersonID      *uuid.UUID `json:"rm_person_id"`
	RMName          string     `json:"rm_name"`
	Type            string     `json:"type"`
	Direction       string     `json:"direction"`
	Subject         string     `json:"subject"`
	Notes           string     `json:"notes"`
	Outcome         string     `json:"outcome"`
	DurationMins    *int       `json:"duration_mins"`
	Location        string     `json:"location"`
	InteractionDate string     `json:"interaction_date"`
	NextAction      string     `json:"next_action"`
	NextActionDate  string     `json:"next_action_date"`
}

type CreateTaskInput struct {
	ContactID   *uuid.UUID `json:"contact_id"`
	AssignedTo  *uuid.UUID `json:"assigned_to"`
	AssignedName string    `json:"assigned_name"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	TaskType    string     `json:"task_type"`
	Priority    string     `json:"priority"`
	DueDate     string     `json:"due_date"`
}

type CreateOpportunityInput struct {
	ContactID      uuid.UUID  `json:"contact_id"`
	RMPersonID     *uuid.UUID `json:"rm_person_id"`
	RMName         string     `json:"rm_name"`
	Title          string     `json:"title"`
	Product        string     `json:"product"`
	EstimatedValue *float64   `json:"estimated_value"`
	Probability    int        `json:"probability"`
	Stage          string     `json:"stage"`
	ExpectedClose  string     `json:"expected_close"`
	Notes          string     `json:"notes"`
}

// ── Contacts ──────────────────────────────────────────────────────────────────

func (s *Service) CreateContact(ctx context.Context, in CreateContactInput, byID uuid.UUID, byName string) (Contact, error) {
	if in.FirstName == "" || in.LastName == "" {
		return Contact{}, fmt.Errorf("crm: first_name and last_name are required")
	}
	if in.ContactType == "" { in.ContactType = "prospect" }
	if in.Segment    == "" { in.Segment    = "retail" }
	if in.Stage      == "" { in.Stage      = "new" }
	if in.Priority   == "" { in.Priority   = "medium" }
	if in.InvestmentGoals  == nil { in.InvestmentGoals  = []string{} }
	if in.PreferredProducts == nil { in.PreferredProducts = []string{} }
	if in.Tags == nil { in.Tags = []string{} }

	var id uuid.UUID
	if err := s.pool.QueryRow(ctx, `
		INSERT INTO crm.contact
		    (subsidiary_id, rm_person_id, rm_name,
		     first_name, last_name, company, job_title,
		     email, phone, whatsapp, linkedin_url, address,
		     contact_type, segment, stage, source, source_detail,
		     estimated_aum, annual_income, risk_appetite,
		     investment_goals, preferred_products,
		     referred_by_contact_id, background_notes, tags, priority,
		     created_by, created_by_name)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
		RETURNING id
	`, in.SubsidiaryID, in.RMPersonID, in.RMName,
		in.FirstName, in.LastName, in.Company, in.JobTitle,
		in.Email, in.Phone, in.WhatsApp, in.LinkedInURL, in.Address,
		in.ContactType, in.Segment, in.Stage, in.Source, in.SourceDetail,
		in.EstimatedAUM, in.AnnualIncome, in.RiskAppetite,
		in.InvestmentGoals, in.PreferredProducts,
		in.ReferredByContactID, in.BackgroundNotes, in.Tags, in.Priority,
		byID, byName,
	).Scan(&id); err != nil {
		return Contact{}, fmt.Errorf("crm: create contact: %w", err)
	}
	return s.GetContact(ctx, id)
}

func (s *Service) ListContacts(ctx context.Context, rmPersonID *uuid.UUID, subsidiaryID *uuid.UUID, contactType, stage, search string) ([]Contact, error) {
	const q = `
		SELECT
			c.id, c.subsidiary_id, c.rm_person_id, c.rm_name,
			c.first_name, c.last_name, c.first_name || ' ' || c.last_name,
			c.company, c.job_title, c.email, c.phone, c.whatsapp, c.linkedin_url, c.address,
			c.contact_type, c.segment, c.stage, c.source, c.source_detail,
			c.estimated_aum, c.annual_income, c.risk_appetite,
			c.investment_goals, c.preferred_products,
			c.onboarding_client_id, c.referred_by_contact_id,
			COALESCE(ref.first_name || ' ' || ref.last_name, '') AS referred_by_name,
			c.background_notes, c.tags, c.priority,
			c.last_interaction_at, c.next_followup_date::text,
			c.is_active, c.created_by_name, c.created_at, c.updated_at,
			COALESCE(ic.cnt, 0) AS interaction_count,
			COALESCE(tc.cnt, 0) AS open_task_count,
			COALESCE(oc.pipeline, 0)::float8 AS pipeline_value
		FROM crm.contact c
		LEFT JOIN crm.contact ref ON ref.id = c.referred_by_contact_id
		LEFT JOIN LATERAL (
			SELECT COUNT(*)::int AS cnt FROM crm.interaction WHERE contact_id = c.id
		) ic ON true
		LEFT JOIN LATERAL (
			SELECT COUNT(*)::int AS cnt FROM crm.task WHERE contact_id = c.id AND status = 'open'
		) tc ON true
		LEFT JOIN LATERAL (
			SELECT COALESCE(SUM(COALESCE(estimated_value,0) * probability / 100), 0) AS pipeline
			FROM crm.opportunity WHERE contact_id = c.id AND stage NOT IN ('closed_won','closed_lost')
		) oc ON true
		WHERE c.is_active = true
		  AND ($1::uuid IS NULL OR c.rm_person_id   = $1)
		  AND ($2::uuid IS NULL OR c.subsidiary_id  = $2)
		  AND ($3::text = ''   OR c.contact_type    = $3)
		  AND ($4::text = ''   OR c.stage           = $4)
		  AND ($5::text = ''   OR (
			     c.first_name  ILIKE '%' || $5 || '%'
			  OR c.last_name   ILIKE '%' || $5 || '%'
			  OR c.email       ILIKE '%' || $5 || '%'
			  OR c.company     ILIKE '%' || $5 || '%'
			  OR c.phone       ILIKE '%' || $5 || '%'
		  ))
		ORDER BY c.updated_at DESC
	`
	rows, err := s.pool.Query(ctx, q, rmPersonID, subsidiaryID, contactType, stage, search)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanContacts(rows)
}

func (s *Service) GetContact(ctx context.Context, id uuid.UUID) (Contact, error) {
	const q = `
		SELECT
			c.id, c.subsidiary_id, c.rm_person_id, c.rm_name,
			c.first_name, c.last_name, c.first_name || ' ' || c.last_name,
			c.company, c.job_title, c.email, c.phone, c.whatsapp, c.linkedin_url, c.address,
			c.contact_type, c.segment, c.stage, c.source, c.source_detail,
			c.estimated_aum, c.annual_income, c.risk_appetite,
			c.investment_goals, c.preferred_products,
			c.onboarding_client_id, c.referred_by_contact_id,
			COALESCE(ref.first_name || ' ' || ref.last_name, '') AS referred_by_name,
			c.background_notes, c.tags, c.priority,
			c.last_interaction_at, c.next_followup_date::text,
			c.is_active, c.created_by_name, c.created_at, c.updated_at,
			COALESCE(ic.cnt, 0), COALESCE(tc.cnt, 0),
			COALESCE(oc.pipeline, 0)::float8
		FROM crm.contact c
		LEFT JOIN crm.contact ref ON ref.id = c.referred_by_contact_id
		LEFT JOIN LATERAL (SELECT COUNT(*)::int AS cnt FROM crm.interaction WHERE contact_id = c.id) ic ON true
		LEFT JOIN LATERAL (SELECT COUNT(*)::int AS cnt FROM crm.task WHERE contact_id = c.id AND status = 'open') tc ON true
		LEFT JOIN LATERAL (SELECT COALESCE(SUM(COALESCE(estimated_value,0)*probability/100),0) AS pipeline FROM crm.opportunity WHERE contact_id=c.id AND stage NOT IN ('closed_won','closed_lost')) oc ON true
		WHERE c.id = $1
	`
	rows, err := s.pool.Query(ctx, q, id)
	if err != nil {
		return Contact{}, err
	}
	defer rows.Close()
	contacts, err := scanContacts(rows)
	if err != nil || len(contacts) == 0 {
		return Contact{}, fmt.Errorf("crm: contact not found")
	}
	return contacts[0], nil
}

func (s *Service) UpdateContactStage(ctx context.Context, id uuid.UUID, stage string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE crm.contact SET stage = $1, updated_at = now() WHERE id = $2
	`, stage, id)
	return err
}

func (s *Service) UpdateContact(ctx context.Context, id uuid.UUID, in CreateContactInput) error {
	if in.InvestmentGoals  == nil { in.InvestmentGoals  = []string{} }
	if in.PreferredProducts == nil { in.PreferredProducts = []string{} }
	if in.Tags == nil { in.Tags = []string{} }
	_, err := s.pool.Exec(ctx, `
		UPDATE crm.contact SET
			rm_person_id = $2, rm_name = $3,
			first_name = $4, last_name = $5, company = $6, job_title = $7,
			email = $8, phone = $9, whatsapp = $10, linkedin_url = $11, address = $12,
			contact_type = $13, segment = $14, stage = $15, source = $16, source_detail = $17,
			estimated_aum = $18, annual_income = $19, risk_appetite = $20,
			investment_goals = $21, preferred_products = $22,
			referred_by_contact_id = $23, background_notes = $24, tags = $25, priority = $26,
			updated_at = now()
		WHERE id = $1
	`, id, in.RMPersonID, in.RMName,
		in.FirstName, in.LastName, in.Company, in.JobTitle,
		in.Email, in.Phone, in.WhatsApp, in.LinkedInURL, in.Address,
		in.ContactType, in.Segment, in.Stage, in.Source, in.SourceDetail,
		in.EstimatedAUM, in.AnnualIncome, in.RiskAppetite,
		in.InvestmentGoals, in.PreferredProducts,
		in.ReferredByContactID, in.BackgroundNotes, in.Tags, in.Priority,
	)
	return err
}

func (s *Service) ConvertToClient(ctx context.Context, contactID, onboardingClientID uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE crm.contact
		SET    stage = 'converted', contact_type = 'client',
		       onboarding_client_id = $2, updated_at = now()
		WHERE  id = $1
	`, contactID, onboardingClientID)
	return err
}

// ── Interactions ──────────────────────────────────────────────────────────────

func (s *Service) LogInteraction(ctx context.Context, in LogInteractionInput, byID uuid.UUID, byName string) (Interaction, error) {
	if in.Type == "" { in.Type = "call" }
	if in.Direction == "" { in.Direction = "outbound" }

	var intDate time.Time
	if in.InteractionDate != "" {
		var err error
		intDate, err = time.Parse("2006-01-02T15:04", in.InteractionDate)
		if err != nil {
			intDate, err = time.Parse("2006-01-02", in.InteractionDate)
			if err != nil {
				intDate = time.Now()
			}
		}
	} else {
		intDate = time.Now()
	}

	var nextActionDate *string
	if in.NextActionDate != "" {
		nextActionDate = &in.NextActionDate
	}

	var id uuid.UUID
	if err := s.pool.QueryRow(ctx, `
		INSERT INTO crm.interaction
		    (contact_id, rm_person_id, rm_name, type, direction,
		     subject, notes, outcome, duration_mins, location,
		     interaction_date, next_action, next_action_date,
		     created_by, created_by_name)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
		RETURNING id
	`, in.ContactID, in.RMPersonID, in.RMName, in.Type, in.Direction,
		in.Subject, in.Notes, in.Outcome, in.DurationMins, in.Location,
		intDate, in.NextAction, nextActionDate, byID, byName,
	).Scan(&id); err != nil {
		return Interaction{}, fmt.Errorf("crm: log interaction: %w", err)
	}

	// Update contact's last_interaction_at and next_followup_date.
	s.pool.Exec(ctx, `
		UPDATE crm.contact
		SET    last_interaction_at = $2,
		       next_followup_date  = COALESCE($3::date, next_followup_date),
		       updated_at          = now()
		WHERE  id = $1
	`, in.ContactID, intDate, nextActionDate)

	return s.getInteraction(ctx, id)
}

func (s *Service) ListInteractions(ctx context.Context, contactID *uuid.UUID, rmPersonID *uuid.UUID, limit int) ([]Interaction, error) {
	if limit <= 0 { limit = 50 }
	const q = `
		SELECT i.id, i.contact_id,
		       COALESCE(c.first_name || ' ' || c.last_name, '') AS contact_name,
		       i.rm_person_id, i.rm_name, i.type, i.direction,
		       i.subject, i.notes, i.outcome, i.duration_mins, i.location,
		       i.interaction_date, i.next_action, i.next_action_date::text,
		       i.created_by_name, i.created_at
		FROM   crm.interaction i
		LEFT   JOIN crm.contact c ON c.id = i.contact_id
		WHERE  ($1::uuid IS NULL OR i.contact_id   = $1)
		  AND  ($2::uuid IS NULL OR i.rm_person_id = $2)
		ORDER  BY i.interaction_date DESC
		LIMIT  $3
	`
	rows, err := s.pool.Query(ctx, q, contactID, rmPersonID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanInteractions(rows)
}

func (s *Service) getInteraction(ctx context.Context, id uuid.UUID) (Interaction, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT i.id, i.contact_id,
		       COALESCE(c.first_name || ' ' || c.last_name, '') AS contact_name,
		       i.rm_person_id, i.rm_name, i.type, i.direction,
		       i.subject, i.notes, i.outcome, i.duration_mins, i.location,
		       i.interaction_date, i.next_action, i.next_action_date::text,
		       i.created_by_name, i.created_at
		FROM   crm.interaction i LEFT JOIN crm.contact c ON c.id = i.contact_id
		WHERE  i.id = $1
	`, id)
	if err != nil {
		return Interaction{}, err
	}
	defer rows.Close()
	items, err := scanInteractions(rows)
	if err != nil || len(items) == 0 {
		return Interaction{}, fmt.Errorf("crm: interaction not found")
	}
	return items[0], nil
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

func (s *Service) CreateTask(ctx context.Context, in CreateTaskInput, byID uuid.UUID, byName string) (Task, error) {
	if in.Title == "" {
		return Task{}, fmt.Errorf("crm: title is required")
	}
	if in.TaskType == "" { in.TaskType = "follow_up" }
	if in.Priority == "" { in.Priority = "medium" }

	var dueDate *string
	if in.DueDate != "" { dueDate = &in.DueDate }

	var id uuid.UUID
	if err := s.pool.QueryRow(ctx, `
		INSERT INTO crm.task
		    (contact_id, assigned_to, assigned_name, title, description,
		     task_type, priority, due_date, created_by, created_by_name)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		RETURNING id
	`, in.ContactID, in.AssignedTo, in.AssignedName, in.Title, in.Description,
		in.TaskType, in.Priority, dueDate, byID, byName,
	).Scan(&id); err != nil {
		return Task{}, fmt.Errorf("crm: create task: %w", err)
	}
	return s.getTask(ctx, id)
}

func (s *Service) ListTasks(ctx context.Context, assignedTo *uuid.UUID, contactID *uuid.UUID, status string) ([]Task, error) {
	const q = `
		SELECT t.id, t.contact_id,
		       COALESCE(c.first_name || ' ' || c.last_name, '') AS contact_name,
		       t.assigned_to, t.assigned_name, t.title, t.description,
		       t.task_type, t.priority, t.status, t.due_date::text,
		       t.completed_at, t.completion_notes,
		       t.created_by_name, t.created_at
		FROM   crm.task t
		LEFT   JOIN crm.contact c ON c.id = t.contact_id
		WHERE  ($1::uuid IS NULL OR t.assigned_to = $1)
		  AND  ($2::uuid IS NULL OR t.contact_id  = $2)
		  AND  ($3::text = ''   OR t.status       = $3)
		ORDER  BY CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
		          t.due_date NULLS LAST, t.created_at DESC
	`
	rows, err := s.pool.Query(ctx, q, assignedTo, contactID, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanTasks(rows)
}

func (s *Service) CompleteTask(ctx context.Context, id uuid.UUID, notes string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE crm.task
		SET    status = 'completed', completed_at = now(),
		       completion_notes = $2, updated_at = now()
		WHERE  id = $1
	`, id, notes)
	return err
}

func (s *Service) UpdateTaskStatus(ctx context.Context, id uuid.UUID, status string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE crm.task SET status = $1, updated_at = now() WHERE id = $2
	`, status, id)
	return err
}

func (s *Service) getTask(ctx context.Context, id uuid.UUID) (Task, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT t.id, t.contact_id,
		       COALESCE(c.first_name || ' ' || c.last_name, '') AS contact_name,
		       t.assigned_to, t.assigned_name, t.title, t.description,
		       t.task_type, t.priority, t.status, t.due_date::text,
		       t.completed_at, t.completion_notes, t.created_by_name, t.created_at
		FROM   crm.task t LEFT JOIN crm.contact c ON c.id = t.contact_id
		WHERE  t.id = $1
	`, id)
	if err != nil {
		return Task{}, err
	}
	defer rows.Close()
	items, err := scanTasks(rows)
	if err != nil || len(items) == 0 {
		return Task{}, fmt.Errorf("crm: task not found")
	}
	return items[0], nil
}

// ── Opportunities ─────────────────────────────────────────────────────────────

func (s *Service) CreateOpportunity(ctx context.Context, in CreateOpportunityInput, byID uuid.UUID, byName string) (Opportunity, error) {
	if in.Title == "" { return Opportunity{}, fmt.Errorf("crm: title is required") }
	if in.Stage == "" { in.Stage = "qualification" }
	if in.Probability == 0 { in.Probability = 25 }

	var expectedClose *string
	if in.ExpectedClose != "" { expectedClose = &in.ExpectedClose }

	var id uuid.UUID
	if err := s.pool.QueryRow(ctx, `
		INSERT INTO crm.opportunity
		    (contact_id, rm_person_id, rm_name, title, product,
		     estimated_value, probability, stage, expected_close, notes,
		     created_by, created_by_name)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		RETURNING id
	`, in.ContactID, in.RMPersonID, in.RMName, in.Title, in.Product,
		in.EstimatedValue, in.Probability, in.Stage, expectedClose, in.Notes,
		byID, byName,
	).Scan(&id); err != nil {
		return Opportunity{}, fmt.Errorf("crm: create opportunity: %w", err)
	}
	return s.getOpportunity(ctx, id)
}

func (s *Service) ListOpportunities(ctx context.Context, contactID *uuid.UUID, rmPersonID *uuid.UUID, stage string) ([]Opportunity, error) {
	const q = `
		SELECT o.id, o.contact_id,
		       COALESCE(c.first_name || ' ' || c.last_name, '') AS contact_name,
		       o.rm_person_id, o.rm_name, o.title, o.product,
		       o.estimated_value, o.probability,
		       (COALESCE(o.estimated_value,0) * o.probability / 100)::float8 AS weighted_value,
		       o.stage, o.expected_close::text, o.actual_close::text,
		       o.notes, o.lost_reason, o.created_by_name, o.created_at, o.updated_at
		FROM   crm.opportunity o
		LEFT   JOIN crm.contact c ON c.id = o.contact_id
		WHERE  ($1::uuid IS NULL OR o.contact_id   = $1)
		  AND  ($2::uuid IS NULL OR o.rm_person_id = $2)
		  AND  ($3::text = ''   OR o.stage         = $3)
		ORDER  BY o.updated_at DESC
	`
	rows, err := s.pool.Query(ctx, q, contactID, rmPersonID, stage)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanOpportunities(rows)
}

func (s *Service) UpdateOpportunityStage(ctx context.Context, id uuid.UUID, stage, lostReason string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE crm.opportunity
		SET    stage = $2, lost_reason = $3,
		       actual_close = CASE WHEN $2 IN ('closed_won','closed_lost') THEN CURRENT_DATE ELSE NULL END,
		       updated_at = now()
		WHERE  id = $1
	`, id, stage, lostReason)
	return err
}

func (s *Service) getOpportunity(ctx context.Context, id uuid.UUID) (Opportunity, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT o.id, o.contact_id,
		       COALESCE(c.first_name || ' ' || c.last_name, '') AS contact_name,
		       o.rm_person_id, o.rm_name, o.title, o.product,
		       o.estimated_value, o.probability,
		       (COALESCE(o.estimated_value,0)*o.probability/100)::float8,
		       o.stage, o.expected_close::text, o.actual_close::text,
		       o.notes, o.lost_reason, o.created_by_name, o.created_at, o.updated_at
		FROM crm.opportunity o LEFT JOIN crm.contact c ON c.id = o.contact_id
		WHERE o.id = $1
	`, id)
	if err != nil {
		return Opportunity{}, err
	}
	defer rows.Close()
	items, err := scanOpportunities(rows)
	if err != nil || len(items) == 0 {
		return Opportunity{}, fmt.Errorf("crm: opportunity not found")
	}
	return items[0], nil
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

func (s *Service) GetDashboardStats(ctx context.Context, rmPersonID *uuid.UUID) (DashboardStats, error) {
	var stats DashboardStats

	s.pool.QueryRow(ctx, `
		SELECT
			COUNT(*)::int,
			COUNT(CASE WHEN created_at >= date_trunc('month', now()) THEN 1 END)::int
		FROM crm.contact
		WHERE is_active = true AND ($1::uuid IS NULL OR rm_person_id = $1)
	`, rmPersonID).Scan(&stats.TotalContacts, &stats.NewThisMonth)

	s.pool.QueryRow(ctx, `
		SELECT
			COALESCE(SUM(COALESCE(estimated_value,0)),0)::float8,
			COALESCE(SUM(COALESCE(estimated_value,0)*probability/100),0)::float8
		FROM crm.opportunity
		WHERE stage NOT IN ('closed_won','closed_lost')
		  AND ($1::uuid IS NULL OR rm_person_id = $1)
	`, rmPersonID).Scan(&stats.PipelineValue, &stats.WeightedPipeline)

	s.pool.QueryRow(ctx, `
		SELECT
			COUNT(CASE WHEN due_date = CURRENT_DATE AND status = 'open' THEN 1 END)::int,
			COUNT(CASE WHEN due_date < CURRENT_DATE AND status = 'open' THEN 1 END)::int
		FROM crm.task
		WHERE $1::uuid IS NULL OR assigned_to = $1
	`, rmPersonID).Scan(&stats.TasksDueToday, &stats.TasksOverdue)

	s.pool.QueryRow(ctx, `
		SELECT COUNT(*)::int FROM crm.interaction
		WHERE interaction_date::date = CURRENT_DATE
		  AND ($1::uuid IS NULL OR rm_person_id = $1)
	`, rmPersonID).Scan(&stats.InteractionsToday)

	// Conversion rate = converted / (converted + lost + dormant + contacted + qualified + proposal + negotiation)
	var converted, total int
	s.pool.QueryRow(ctx, `
		SELECT
			COUNT(CASE WHEN stage = 'converted' THEN 1 END)::int,
			COUNT(*)::int
		FROM crm.contact
		WHERE is_active = true AND stage != 'new'
		  AND ($1::uuid IS NULL OR rm_person_id = $1)
	`, rmPersonID).Scan(&converted, &total)
	if total > 0 {
		stats.ConversionRate = float64(converted) / float64(total) * 100
	}

	// Stage breakdown
	rows, _ := s.pool.Query(ctx, `
		SELECT stage, COUNT(*)::int
		FROM crm.contact
		WHERE is_active = true AND ($1::uuid IS NULL OR rm_person_id = $1)
		GROUP BY stage ORDER BY stage
	`, rmPersonID)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var sc StageCount
			rows.Scan(&sc.Stage, &sc.Count)
			stats.StageBreakdown = append(stats.StageBreakdown, sc)
		}
	}

	// Recent interactions
	stats.RecentInteractions, _ = s.ListInteractions(ctx, nil, rmPersonID, 5)

	// My open tasks
	stats.MyOpenTasks, _ = s.ListTasks(ctx, rmPersonID, nil, "open")
	if len(stats.MyOpenTasks) > 5 {
		stats.MyOpenTasks = stats.MyOpenTasks[:5]
	}

	return stats, nil
}

// ── Scanners ──────────────────────────────────────────────────────────────────

func scanContacts(rows interface{ Next() bool; Scan(...any) error; Err() error }) ([]Contact, error) {
	var out []Contact
	for rows.Next() {
		var c Contact
		var nextFollowup *string
		if err := rows.Scan(
			&c.ID, &c.SubsidiaryID, &c.RMPersonID, &c.RMName,
			&c.FirstName, &c.LastName, &c.FullName,
			&c.Company, &c.JobTitle, &c.Email, &c.Phone, &c.WhatsApp, &c.LinkedInURL, &c.Address,
			&c.ContactType, &c.Segment, &c.Stage, &c.Source, &c.SourceDetail,
			&c.EstimatedAUM, &c.AnnualIncome, &c.RiskAppetite,
			&c.InvestmentGoals, &c.PreferredProducts,
			&c.OnboardingClientID, &c.ReferredByContactID, &c.ReferredByName,
			&c.BackgroundNotes, &c.Tags, &c.Priority,
			&c.LastInteractionAt, &nextFollowup,
			&c.IsActive, &c.CreatedByName, &c.CreatedAt, &c.UpdatedAt,
			&c.InteractionCount, &c.OpenTaskCount, &c.PipelineValue,
		); err != nil {
			return nil, err
		}
		c.NextFollowupDate = nextFollowup
		if c.InvestmentGoals == nil  { c.InvestmentGoals  = []string{} }
		if c.PreferredProducts == nil { c.PreferredProducts = []string{} }
		if c.Tags == nil { c.Tags = []string{} }
		out = append(out, c)
	}
	return out, rows.Err()
}

func scanInteractions(rows interface{ Next() bool; Scan(...any) error; Err() error }) ([]Interaction, error) {
	var out []Interaction
	for rows.Next() {
		var i Interaction
		var nextActionDate *string
		if err := rows.Scan(
			&i.ID, &i.ContactID, &i.ContactName, &i.RMPersonID, &i.RMName,
			&i.Type, &i.Direction, &i.Subject, &i.Notes, &i.Outcome,
			&i.DurationMins, &i.Location, &i.InteractionDate,
			&i.NextAction, &nextActionDate, &i.CreatedByName, &i.CreatedAt,
		); err != nil {
			return nil, err
		}
		i.NextActionDate = nextActionDate
		out = append(out, i)
	}
	return out, rows.Err()
}

func scanTasks(rows interface{ Next() bool; Scan(...any) error; Err() error }) ([]Task, error) {
	var out []Task
	for rows.Next() {
		var t Task
		var dueDate *string
		if err := rows.Scan(
			&t.ID, &t.ContactID, &t.ContactName, &t.AssignedTo, &t.AssignedName,
			&t.Title, &t.Description, &t.TaskType, &t.Priority, &t.Status,
			&dueDate, &t.CompletedAt, &t.CompletionNotes, &t.CreatedByName, &t.CreatedAt,
		); err != nil {
			return nil, err
		}
		t.DueDate = dueDate
		out = append(out, t)
	}
	return out, rows.Err()
}

func scanOpportunities(rows interface{ Next() bool; Scan(...any) error; Err() error }) ([]Opportunity, error) {
	var out []Opportunity
	for rows.Next() {
		var o Opportunity
		if err := rows.Scan(
			&o.ID, &o.ContactID, &o.ContactName, &o.RMPersonID, &o.RMName,
			&o.Title, &o.Product, &o.EstimatedValue, &o.Probability, &o.WeightedValue,
			&o.Stage, &o.ExpectedClose, &o.ActualClose,
			&o.Notes, &o.LostReason, &o.CreatedByName, &o.CreatedAt, &o.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}
