package appraisal

// BSC (Balanced Scorecard) types and service methods.
// These extend the appraisal module with 4-perspective KPI management,
// individual per-employee scorecards, and phase-based cycle control.

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/pagegroup/pageos/internal/notification"
)

// ── Constants ──────────────────────────────────────────────────────────────────

// BSCPerspectives is the fixed order of BSC perspectives.
var BSCPerspectives = []string{
	"Financial",
	"Client / Customer",
	"Internal Business Process",
	"Learning & Growth",
}

// bandThresholds maps a weighted score (1-5 scale) to a performance band.
func Band(score float64) string {
	if score == 0 {
		return ""
	}
	switch {
	case score >= 4.5:
		return "Outstanding"
	case score >= 3.5:
		return "Exceeds Expectations"
	case score >= 2.5:
		return "Meets Expectations"
	case score >= 1.5:
		return "Needs Improvement"
	default:
		return "Unsatisfactory"
	}
}

// ── Types ──────────────────────────────────────────────────────────────────────

// KPI is a Balanced Scorecard objective for a department within a cycle.
type KPI struct {
	ID          uuid.UUID `json:"id"`
	CycleID     uuid.UUID `json:"cycle_id"`
	Department  string    `json:"department"`
	Perspective string    `json:"perspective"`
	Seq         int       `json:"seq"`
	Objective   string    `json:"objective"`
	Measure     string    `json:"measure"`
	Weight      float64   `json:"weight"`
	CreatedBy   uuid.UUID `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
}

// KPIWithTarget wraps KPI with a per-role×grade target string.
type KPIWithTarget struct {
	KPI
	Target string `json:"target"`
}

// IndividualKPI is an employee's customised KPI scorecard set by their manager
// during the target-setting phase.
type IndividualKPI struct {
	ID          uuid.UUID `json:"id"`
	CycleID     uuid.UUID `json:"cycle_id"`
	EmployeeID  uuid.UUID `json:"employee_id"`
	Perspective string    `json:"perspective"`
	Seq         int       `json:"seq"`
	Objective   string    `json:"objective"`
	Measure     string    `json:"measure"`
	Weight      float64   `json:"weight"`
	Target      string    `json:"target"`
	Source      string    `json:"source"` // standard | individual
}

// KPIInput carries the mutable fields for creating a KPI.
type KPIInput struct {
	Perspective string
	Seq         int
	Objective   string
	Measure     string
	Weight      float64
}

// TargetProgress shows whether an employee's individual scorecard has been set.
type TargetProgress struct {
	EmployeeID   uuid.UUID `json:"employee_id"`
	EmployeeName string    `json:"employee_name"`
	Department   string    `json:"department"`
	ManagerName  string    `json:"manager_name"`
	TargetsSet   bool      `json:"targets_set"`
}

// ── KPI management ─────────────────────────────────────────────────────────────

// ListKPIs returns all KPIs for a department in a cycle.
func (s *Service) ListKPIs(ctx context.Context, cycleID uuid.UUID, department string) ([]KPI, error) {
	const q = `
		SELECT id, cycle_id, department, perspective, seq, objective, measure, weight, created_by, created_at
		FROM appraisal.kpi
		WHERE cycle_id = $1 AND department = $2
		ORDER BY perspective, seq
	`
	rows, err := s.pool.Query(ctx, q, cycleID, department)
	if err != nil {
		return nil, fmt.Errorf("appraisal: list kpis: %w", err)
	}
	defer rows.Close()
	var out []KPI
	for rows.Next() {
		var k KPI
		if err := rows.Scan(&k.ID, &k.CycleID, &k.Department, &k.Perspective, &k.Seq, &k.Objective, &k.Measure, &k.Weight, &k.CreatedBy, &k.CreatedAt); err != nil {
			return nil, fmt.Errorf("appraisal: scan kpi: %w", err)
		}
		out = append(out, k)
	}
	return out, rows.Err()
}

// ListDepartments returns distinct departments that have KPIs in a cycle.
func (s *Service) ListKPIDepartments(ctx context.Context, cycleID uuid.UUID) ([]string, error) {
	const q = `SELECT DISTINCT department FROM appraisal.kpi WHERE cycle_id = $1 ORDER BY department`
	rows, err := s.pool.Query(ctx, q, cycleID)
	if err != nil {
		return nil, fmt.Errorf("appraisal: list kpi departments: %w", err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var d string
		if err := rows.Scan(&d); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// SaveKPIs replaces the KPI set for a department in a cycle (transactional).
// Weights must total 100; caller is responsible for validation.
func (s *Service) SaveKPIs(ctx context.Context, cycleID uuid.UUID, department string, items []KPIInput, createdBy uuid.UUID) ([]KPI, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("appraisal: save kpis begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	if _, err := tx.Exec(ctx, `DELETE FROM appraisal.kpi WHERE cycle_id=$1 AND department=$2`, cycleID, department); err != nil {
		return nil, fmt.Errorf("appraisal: delete kpis: %w", err)
	}

	const ins = `
		INSERT INTO appraisal.kpi (cycle_id, department, perspective, seq, objective, measure, weight, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, cycle_id, department, perspective, seq, objective, measure, weight, created_by, created_at
	`
	var out []KPI
	for _, it := range items {
		var k KPI
		err := tx.QueryRow(ctx, ins, cycleID, department, it.Perspective, it.Seq, it.Objective, it.Measure, it.Weight, createdBy).
			Scan(&k.ID, &k.CycleID, &k.Department, &k.Perspective, &k.Seq, &k.Objective, &k.Measure, &k.Weight, &k.CreatedBy, &k.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("appraisal: insert kpi: %w", err)
		}
		out = append(out, k)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("appraisal: save kpis commit: %w", err)
	}
	return out, nil
}

// ── KPI targets ────────────────────────────────────────────────────────────────

// GetKPITargets returns standard targets for a role×grade combination in a dept/cycle.
func (s *Service) GetKPITargets(ctx context.Context, cycleID uuid.UUID, department, role, grade string) (map[string]string, error) {
	const q = `
		SELECT kt.kpi_id::text, kt.target
		FROM appraisal.kpi_target kt
		JOIN appraisal.kpi k ON k.id = kt.kpi_id
		WHERE k.cycle_id = $1 AND k.department = $2 AND kt.role = $3 AND kt.grade = $4
	`
	rows, err := s.pool.Query(ctx, q, cycleID, department, role, grade)
	if err != nil {
		return nil, fmt.Errorf("appraisal: get kpi targets: %w", err)
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var kpiID, target string
		if err := rows.Scan(&kpiID, &target); err != nil {
			return nil, err
		}
		out[kpiID] = target
	}
	return out, rows.Err()
}

// SaveKPITargets upserts targets for a role×grade in a cycle.
func (s *Service) SaveKPITargets(ctx context.Context, cycleID uuid.UUID, department, role, grade string, targets map[string]string) error {
	const q = `
		INSERT INTO appraisal.kpi_target (kpi_id, role, grade, target)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (kpi_id, role, grade) DO UPDATE SET target = EXCLUDED.target
	`
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("appraisal: save kpi targets begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	for kpiIDStr, target := range targets {
		kpiID, err := uuid.Parse(kpiIDStr)
		if err != nil {
			continue
		}
		// Verify the KPI belongs to this cycle+department to prevent cross-dept writes
		var exists bool
		_ = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM appraisal.kpi WHERE id=$1 AND cycle_id=$2 AND department=$3)`, kpiID, cycleID, department).Scan(&exists)
		if !exists {
			continue
		}
		if _, err := tx.Exec(ctx, q, kpiID, role, grade, target); err != nil {
			return fmt.Errorf("appraisal: upsert kpi target: %w", err)
		}
	}

	return tx.Commit(ctx)
}

// ── Individual scorecard ───────────────────────────────────────────────────────

// HasIndividualScorecard returns true if a custom scorecard exists for the employee.
func (s *Service) HasIndividualScorecard(ctx context.Context, cycleID, employeeID uuid.UUID) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM appraisal.individual_kpi WHERE cycle_id=$1 AND employee_id=$2)`,
		cycleID, employeeID,
	).Scan(&exists)
	return exists, err
}

// GetIndividualScorecard returns the individual KPI scorecard for an employee.
func (s *Service) GetIndividualScorecard(ctx context.Context, cycleID, employeeID uuid.UUID) ([]IndividualKPI, error) {
	const q = `
		SELECT id, cycle_id, employee_id, perspective, seq, objective, measure, weight, target, source
		FROM appraisal.individual_kpi
		WHERE cycle_id=$1 AND employee_id=$2
		ORDER BY perspective, seq
	`
	rows, err := s.pool.Query(ctx, q, cycleID, employeeID)
	if err != nil {
		return nil, fmt.Errorf("appraisal: get individual scorecard: %w", err)
	}
	defer rows.Close()
	var out []IndividualKPI
	for rows.Next() {
		var k IndividualKPI
		if err := rows.Scan(&k.ID, &k.CycleID, &k.EmployeeID, &k.Perspective, &k.Seq, &k.Objective, &k.Measure, &k.Weight, &k.Target, &k.Source); err != nil {
			return nil, fmt.Errorf("appraisal: scan individual kpi: %w", err)
		}
		out = append(out, k)
	}
	return out, rows.Err()
}

// SeedIndividualFromDept copies the department KPIs to an employee's individual scorecard
// (with any standard targets for their role+grade). Idempotent — does nothing if already seeded.
func (s *Service) SeedIndividualFromDept(ctx context.Context, cycleID, employeeID uuid.UUID, department, role, grade string, seededBy uuid.UUID) error {
	exists, err := s.HasIndividualScorecard(ctx, cycleID, employeeID)
	if err != nil || exists {
		return err
	}

	kpis, err := s.ListKPIs(ctx, cycleID, department)
	if err != nil {
		return err
	}
	targets, err := s.GetKPITargets(ctx, cycleID, department, role, grade)
	if err != nil {
		return err
	}

	const ins = `
		INSERT INTO appraisal.individual_kpi (cycle_id, employee_id, perspective, seq, objective, measure, weight, target, source, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'standard', $9)
	`
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("appraisal: seed individual scorecard begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	for _, k := range kpis {
		target := targets[k.ID.String()]
		if _, err := tx.Exec(ctx, ins, cycleID, employeeID, k.Perspective, k.Seq, k.Objective, k.Measure, k.Weight, target, seededBy); err != nil {
			return fmt.Errorf("appraisal: seed individual kpi row: %w", err)
		}
	}
	return tx.Commit(ctx)
}

// SaveIndividualScorecard replaces an employee's individual scorecard (manager action).
func (s *Service) SaveIndividualScorecard(ctx context.Context, cycleID, employeeID, savedBy uuid.UUID, items []IndividualKPI) error {
	// Validate weights total 100
	var total float64
	for _, k := range items {
		total += k.Weight
	}
	if math.Round(total) != 100 {
		return fmt.Errorf("KPI weights must total 100%% (currently %.1f%%)", total)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("appraisal: save individual scorecard begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	if _, err := tx.Exec(ctx, `DELETE FROM appraisal.individual_kpi WHERE cycle_id=$1 AND employee_id=$2`, cycleID, employeeID); err != nil {
		return fmt.Errorf("appraisal: delete individual scorecard: %w", err)
	}
	const ins = `
		INSERT INTO appraisal.individual_kpi (cycle_id, employee_id, perspective, seq, objective, measure, weight, target, source, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`
	for i, k := range items {
		source := k.Source
		if source == "" {
			source = "standard"
		}
		if _, err := tx.Exec(ctx, ins, cycleID, employeeID, k.Perspective, i, k.Objective, k.Measure, k.Weight, k.Target, source, savedBy); err != nil {
			return fmt.Errorf("appraisal: insert individual kpi: %w", err)
		}
	}
	return tx.Commit(ctx)
}

// HEAD_POSITION_CODES are role codes considered department heads for KPI purposes.
var HEAD_POSITION_CODES = []string{
	"GROUP_HEAD_WEALTH_MGMT", "HEAD_OF_INVESTMENT", "HEAD_INVESTMENT_MGMT",
	"HEAD_OF_OPERATIONS", "TREASURY_OPS_FINANCE_MGR", "TL_FINANCIAL_REPORTING",
	"HEAD_CORPORATE_COMPLIANCE", "HEAD_RISK_TRADE_MGMT",
	"HEAD_HUMAN_CAPITAL", "HR_MANAGER", "HR_OPS_MANAGER",
}

// IsDeptHead returns true if the user holds any department-head position.
func (s *Service) IsDeptHead(ctx context.Context, userID uuid.UUID) bool {
	const q = `
		SELECT EXISTS(
			SELECT 1 FROM organization.assignment a
			JOIN organization.position p ON p.id = a.position_id
			WHERE a.person_id = (SELECT id FROM organization.person WHERE user_id=$1 LIMIT 1)
			  AND a.effective_to IS NULL
			  AND p.code = ANY($2::text[])
		)
	`
	var ok bool
	_ = s.pool.QueryRow(ctx, q, userID, HEAD_POSITION_CODES).Scan(&ok)
	return ok
}

// NotifyDeptHeadsOnCycleOpen sends an in-app notification to all department heads
// in the subsidiary when a cycle is opened, asking them to configure KPIs.
func (s *Service) NotifyDeptHeadsOnCycleOpen(ctx context.Context, cycleID uuid.UUID) {
	var cycleName, subID string
	_ = s.pool.QueryRow(ctx, `SELECT title, COALESCE(subsidiary_id::text,'') FROM appraisal.cycle WHERE id=$1`, cycleID).Scan(&cycleName, &subID)

	// Fetch all dept head user IDs in the subsidiary
	const q = `
		SELECT DISTINCT u.id
		FROM identity.users u
		JOIN organization.person per ON per.user_id = u.id
		JOIN organization.assignment a ON a.person_id = per.id AND a.effective_to IS NULL
		JOIN organization.position pos ON pos.id = a.position_id
		WHERE pos.code = ANY($1::text[])
		  AND ($2 = '' OR a.subsidiary_id::text = $2)
		  AND u.status = 'active'
	`
	rows, err := s.pool.Query(ctx, q, HEAD_POSITION_CODES, subID)
	if err != nil {
		return
	}
	defer rows.Close()

	cycleIDCopy := cycleID
	for rows.Next() {
		var userID uuid.UUID
		if err := rows.Scan(&userID); err != nil {
			continue
		}
		_ = notification.SendToUserByID(ctx, s.pool, userID, notification.InApp{
			Type:       "appraisal_cycle_opened",
			Title:      "Appraisal cycle opened — configure your team's KPIs",
			Body:       fmt.Sprintf("The \"%s\" appraisal cycle is now open. Please set KPIs and targets for your direct reports before the appraisal phase begins.", cycleName),
			Link:       fmt.Sprintf("/appraisal/%s/kpis", cycleID),
			Priority:   "high",
			EntityType: "appraisal_cycle",
			EntityID:   &cycleIDCopy,
		})
	}
}

// NotifyEmployeesOnAppraisalPhase sends an in-app notification to all employees
// with submissions in the cycle when HR switches it to the "appraisal" phase.
func (s *Service) NotifyEmployeesOnAppraisalPhase(ctx context.Context, cycleID uuid.UUID) {
	var cycleName string
	_ = s.pool.QueryRow(ctx, `SELECT title FROM appraisal.cycle WHERE id=$1`, cycleID).Scan(&cycleName)

	const q = `
		SELECT DISTINCT appraisee_id FROM appraisal.submission
		WHERE cycle_id = $1 AND status NOT IN ('finalized','completed')
	`
	rows, err := s.pool.Query(ctx, q, cycleID)
	if err != nil {
		return
	}
	defer rows.Close()

	cycleIDCopy := cycleID
	for rows.Next() {
		var userID uuid.UUID
		if err := rows.Scan(&userID); err != nil {
			continue
		}
		_ = notification.SendToUserByID(ctx, s.pool, userID, notification.InApp{
			Type:       "appraisal_now_open",
			Title:      "Your appraisal is now open",
			Body:       fmt.Sprintf("The \"%s\" appraisal cycle is now in the assessment phase. Log in to complete your self-assessment.", cycleName),
			Link:       fmt.Sprintf("/appraisal/%s", cycleID),
			Priority:   "high",
			EntityType: "appraisal_cycle",
			EntityID:   &cycleIDCopy,
		})
	}
}

// SetTargetStatus updates the target_status field on a submission.
func (s *Service) SetTargetStatus(ctx context.Context, cycleID, employeeID uuid.UUID, status string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE appraisal.submission SET target_status=$1, updated_at=now() WHERE cycle_id=$2 AND appraisee_id=$3`,
		status, cycleID, employeeID,
	)
	return err
}

// NotifyManagerOnTargetRejection notifies the manager when an employee rejects their targets.
func (s *Service) NotifyManagerOnTargetRejection(ctx context.Context, cycleID, employeeID uuid.UUID, reason string) {
	var empName, cycleName, managerID string
	_ = s.pool.QueryRow(ctx,
		`SELECT COALESCE(u.display_name, u.email), c.title, COALESCE(s.manager_id::text,'')
		 FROM appraisal.submission s
		 JOIN identity.users u ON u.id = s.appraisee_id
		 JOIN appraisal.cycle c ON c.id = s.cycle_id
		 WHERE s.cycle_id=$1 AND s.appraisee_id=$2`,
		cycleID, employeeID,
	).Scan(&empName, &cycleName, &managerID)

	if managerID == "" {
		return
	}
	mgrID, err := uuid.Parse(managerID)
	if err != nil {
		return
	}

	body := fmt.Sprintf("%s has rejected their KPI targets for the \"%s\" cycle.", empName, cycleName)
	if reason != "" {
		body += " Reason: " + reason
	}
	body += " Please review and update the targets."

	cycleIDCopy := cycleID
	_ = notification.SendToUserByID(ctx, s.pool, mgrID, notification.InApp{
		Type:       "appraisal_targets_rejected",
		Title:      "Employee rejected their targets — revision required",
		Body:       body,
		Link:       fmt.Sprintf("/appraisal/%s/targets/%s", cycleID, employeeID),
		Priority:   "high",
		EntityType: "appraisal_cycle",
		EntityID:   &cycleIDCopy,
	})
}

// NotifyTargetsSet sends an in-app notification to the employee when their
// line manager saves their individual KPI scorecard.
func (s *Service) NotifyTargetsSet(ctx context.Context, cycleID, employeeID, managerID uuid.UUID) {
	var cycleName, managerName string
	_ = s.pool.QueryRow(ctx, `SELECT title FROM appraisal.cycle WHERE id=$1`, cycleID).Scan(&cycleName)
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(display_name, email) FROM identity.users WHERE id=$1`, managerID).Scan(&managerName)

	body := fmt.Sprintf(
		"%s has set your performance KPIs and targets for the \"%s\" appraisal cycle. Log in to review your scorecard before the appraisal opens.",
		managerName, cycleName,
	)
	if managerName == "" {
		body = fmt.Sprintf(
			"Your performance KPIs and targets have been set for the \"%s\" appraisal cycle. Log in to review your scorecard.",
			cycleName,
		)
	}

	cycleIDCopy := cycleID
	_ = notification.SendToUserByID(ctx, s.pool, employeeID, notification.InApp{
		Type:       "appraisal_targets_set",
		Title:      "Your performance targets have been set",
		Body:       body,
		Link:       fmt.Sprintf("/appraisal/%s", cycleID),
		Priority:   "medium",
		EntityType: "appraisal_cycle",
		EntityID:   &cycleIDCopy,
	})
}

// ── Phase management ───────────────────────────────────────────────────────────

// SetCyclePhase switches a cycle between 'target' and 'appraisal' phases.
func (s *Service) SetCyclePhase(ctx context.Context, cycleID uuid.UUID, phase string) error {
	if phase != "target" && phase != "appraisal" {
		return fmt.Errorf("invalid phase %q: must be 'target' or 'appraisal'", phase)
	}
	_, err := s.pool.Exec(ctx, `UPDATE appraisal.cycle SET phase=$1, updated_at=now() WHERE id=$2`, phase, cycleID)
	if err != nil {
		return fmt.Errorf("appraisal: set phase: %w", err)
	}
	return nil
}

// GetCyclePhase returns the current phase of a cycle.
func (s *Service) GetCyclePhase(ctx context.Context, cycleID uuid.UUID) (string, error) {
	var phase string
	err := s.pool.QueryRow(ctx, `SELECT COALESCE(phase, 'appraisal') FROM appraisal.cycle WHERE id=$1`, cycleID).Scan(&phase)
	return phase, err
}

// TargetsProgress returns how many employees in a cycle have had their individual
// scorecard set by their manager.
func (s *Service) TargetsProgress(ctx context.Context, cycleID uuid.UUID) ([]TargetProgress, error) {
	const q = `
		SELECT
			s.appraisee_id,
			COALESCE(u.display_name, u.email) AS employee_name,
			s.department,
			COALESCE(mu.display_name, mu.email, '') AS manager_name,
			EXISTS(
				SELECT 1 FROM appraisal.individual_kpi ik
				WHERE ik.cycle_id = s.cycle_id AND ik.employee_id = s.appraisee_id
			) AS targets_set
		FROM appraisal.submission s
		JOIN identity.users u  ON u.id = s.appraisee_id
		LEFT JOIN identity.users mu ON mu.id = s.manager_id
		WHERE s.cycle_id = $1
		ORDER BY s.department, employee_name
	`
	rows, err := s.pool.Query(ctx, q, cycleID)
	if err != nil {
		return nil, fmt.Errorf("appraisal: targets progress: %w", err)
	}
	defer rows.Close()
	var out []TargetProgress
	for rows.Next() {
		var p TargetProgress
		if err := rows.Scan(&p.EmployeeID, &p.EmployeeName, &p.Department, &p.ManagerName, &p.TargetsSet); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ── BSC scoring helpers ────────────────────────────────────────────────────────

// ComputeKPIScore calculates the weighted average score from a ratings map
// (kpi_id → rating 1-5) and KPI list.
func ComputeKPIScore(kpis []IndividualKPI, ratings map[string]float64) float64 {
	var score, totalWeight float64
	for _, k := range kpis {
		if r, ok := ratings[k.ID.String()]; ok && r > 0 {
			score += (k.Weight / 100.0) * r
			totalWeight += k.Weight
		}
	}
	if totalWeight == 0 {
		return 0
	}
	return math.Round(score*100) / 100
}

// AllKPIsRated returns true if every KPI has a non-zero rating.
func AllKPIsRated(kpis []IndividualKPI, ratings map[string]float64) bool {
	if len(kpis) == 0 {
		return false
	}
	for _, k := range kpis {
		r, ok := ratings[k.ID.String()]
		if !ok || r < 1 || r > 5 {
			return false
		}
	}
	return true
}

// ── Extended submission types ──────────────────────────────────────────────────

// BSCSubmission is an enriched submission with BSC fields.
type BSCSubmission struct {
	Submission
	Department      string                 `json:"department"`
	Grade           string                 `json:"grade"`
	Level           int                    `json:"level"`
	ManagerID       *uuid.UUID             `json:"manager_id,omitempty"`
	ManagerName     string                 `json:"manager_name,omitempty"`
	EmployeeComments string               `json:"employee_comments"`
	ManagerComments string                `json:"manager_comments"`
	DevelopmentPlan string                `json:"development_plan"`
	HCComments      string                `json:"hc_comments"`
	Band            string                `json:"band"`
	SelfJSON        map[string]float64    `json:"self_json"`
	AgreedJSON      map[string]float64    `json:"agreed_json"`
	HCSubmittedAt   *time.Time            `json:"hc_submitted_at,omitempty"`
	FinalizedAt     *time.Time            `json:"finalized_at,omitempty"`
	TargetStatus    string                `json:"target_status"` // not_set | set | accepted | rejected
	Scorecard       []IndividualKPI       `json:"scorecard,omitempty"`
	Stage           int                   `json:"stage"`
}

// GetBSCSubmission fetches a BSC-enriched submission by ID.
func (s *Service) GetBSCSubmission(ctx context.Context, submissionID uuid.UUID) (BSCSubmission, error) {
	const q = `
		SELECT
			s.id, s.cycle_id, s.appraisee_id,
			COALESCE(u.display_name, u.email) AS appraisee_name,
			u.email AS appraisee_email,
			s.reviewer_id, s.status,
			s.self_score, s.manager_score,
			s.self_submitted_at, s.manager_submitted_at, s.updated_at,
			COALESCE(s.department, ''),
			COALESCE(s.grade, ''),
			COALESCE(s.level, 1),
			s.manager_id,
			COALESCE(mu.display_name, mu.email, '') AS manager_name,
			COALESCE(s.employee_comments, ''),
			COALESCE(s.manager_comments, ''),
			COALESCE(s.development_plan, ''),
			COALESCE(s.hc_comments, ''),
			COALESCE(s.band, ''),
			COALESCE(s.self_json, '{}')::text,
			COALESCE(s.agreed_json, '{}')::text,
			s.hc_submitted_at, s.finalized_at,
			COALESCE(s.target_status, 'not_set')
		FROM appraisal.submission s
		JOIN identity.users u ON u.id = s.appraisee_id
		LEFT JOIN identity.users mu ON mu.id = s.manager_id
		WHERE s.id = $1
	`
	var bs BSCSubmission
	var selfJSONStr, agreedJSONStr string
	var reviewerID *uuid.UUID
	err := s.pool.QueryRow(ctx, q, submissionID).Scan(
		&bs.ID, &bs.CycleID, &bs.AppraiseeID,
		&bs.AppraiseeName, &bs.AppraiseeEmail,
		&reviewerID, &bs.Status,
		&bs.SelfScore, &bs.ManagerScore,
		&bs.SelfSubmittedAt, &bs.ManagerSubmittedAt, &bs.UpdatedAt,
		&bs.Department, &bs.Grade, &bs.Level, &bs.ManagerID, &bs.ManagerName,
		&bs.EmployeeComments, &bs.ManagerComments, &bs.DevelopmentPlan, &bs.HCComments,
		&bs.Band, &selfJSONStr, &agreedJSONStr,
		&bs.HCSubmittedAt, &bs.FinalizedAt, &bs.TargetStatus,
	)
	if err != nil {
		return BSCSubmission{}, fmt.Errorf("appraisal: get bsc submission: %w", err)
	}
	bs.ReviewerID = reviewerID
	_ = json.Unmarshal([]byte(selfJSONStr), &bs.SelfJSON)
	_ = json.Unmarshal([]byte(agreedJSONStr), &bs.AgreedJSON)

	// Attach scorecard
	bs.Scorecard, _ = s.GetIndividualScorecard(ctx, bs.CycleID, bs.AppraiseeID)

	// Compute stage
	bs.Stage = stageOf(bs.Status)
	return bs, nil
}

func stageOf(status string) int {
	switch status {
	case "pending", "self_draft":
		return 0
	case "self_submitted", "manager_scoring":
		return 1
	case "submitted_to_hc":
		return 2
	case "finalized", "completed":
		return 3
	}
	return 0
}

// ListBSCSubmissions returns enriched submissions for a cycle (HC view).
func (s *Service) ListBSCSubmissions(ctx context.Context, cycleID uuid.UUID) ([]BSCSubmission, error) {
	const q = `
		SELECT
			s.id, s.cycle_id, s.appraisee_id,
			COALESCE(u.display_name, u.email) AS appraisee_name,
			u.email AS appraisee_email,
			s.reviewer_id, s.status,
			s.self_score, s.manager_score,
			s.self_submitted_at, s.manager_submitted_at, s.updated_at,
			COALESCE(s.department, ''),
			COALESCE(s.grade, ''),
			COALESCE(s.level, 1),
			s.manager_id,
			COALESCE(mu.display_name, mu.email, '') AS manager_name,
			COALESCE(s.band, '')
		FROM appraisal.submission s
		JOIN identity.users u ON u.id = s.appraisee_id
		LEFT JOIN identity.users mu ON mu.id = s.manager_id
		WHERE s.cycle_id = $1
		ORDER BY s.department, appraisee_name
	`
	rows, err := s.pool.Query(ctx, q, cycleID)
	if err != nil {
		return nil, fmt.Errorf("appraisal: list bsc submissions: %w", err)
	}
	defer rows.Close()
	var out []BSCSubmission
	for rows.Next() {
		var bs BSCSubmission
		var reviewerID *uuid.UUID
		if err := rows.Scan(
			&bs.ID, &bs.CycleID, &bs.AppraiseeID,
			&bs.AppraiseeName, &bs.AppraiseeEmail,
			&reviewerID, &bs.Status,
			&bs.SelfScore, &bs.ManagerScore,
			&bs.SelfSubmittedAt, &bs.ManagerSubmittedAt, &bs.UpdatedAt,
			&bs.Department, &bs.Grade, &bs.Level, &bs.ManagerID, &bs.ManagerName,
			&bs.Band,
		); err != nil {
			return nil, fmt.Errorf("appraisal: scan bsc submission: %w", err)
		}
		bs.ReviewerID = reviewerID
		bs.Stage = stageOf(bs.Status)
		out = append(out, bs)
	}
	return out, rows.Err()
}

// ── BSC workflow actions ───────────────────────────────────────────────────────

// BSCAction represents an action taken on a BSC submission.
type BSCAction struct {
	Action           string
	SelfJSON         map[string]float64
	AgreedJSON       map[string]float64
	EmployeeComments string
	ManagerComments  string
	DevelopmentPlan  string
	HCComments       string
}

// ApplyBSCAction applies a workflow action to a BSC submission and returns the updated record.
// It enforces the state machine and validates ratings before committing.
func (s *Service) ApplyBSCAction(ctx context.Context, submissionID, actorID uuid.UUID, isHR bool, action BSCAction) (BSCSubmission, error) {
	current, err := s.GetBSCSubmission(ctx, submissionID)
	if err != nil {
		return BSCSubmission{}, err
	}

	status := current.Status
	isSelf    := actorID == current.AppraiseeID
	isManager := current.ManagerID != nil && actorID == *current.ManagerID

	deny := func(reason string) error { return fmt.Errorf("not permitted: %s", reason) }

	selfStage    := status == "pending" || status == "self_draft"
	managerStage := status == "self_submitted" || status == "manager_scoring"
	hcStage      := status == "submitted_to_hc"

	var newSelf, newAgreed map[string]float64
	newSelf    = current.SelfJSON
	newAgreed  = current.AgreedJSON
	empC  := current.EmployeeComments
	mgrC  := current.ManagerComments
	devP  := current.DevelopmentPlan
	hcC   := current.HCComments
	var hcSubAt, finalAt *time.Time
	now := time.Now()

	switch action.Action {
	case "save-self":
		if !(isSelf && selfStage) {
			return BSCSubmission{}, deny("only the appraisee can save during self-assessment")
		}
		newSelf = validateRatings(action.SelfJSON)
		if action.EmployeeComments != "" { empC = action.EmployeeComments }
		if action.DevelopmentPlan != "" { devP = action.DevelopmentPlan }
		if len(newSelf) > 0 { status = "self_draft" }

	case "submit-self":
		if !(isSelf && selfStage) {
			return BSCSubmission{}, deny("only the appraisee can submit self-assessment")
		}
		newSelf = validateRatings(action.SelfJSON)
		if action.EmployeeComments != "" { empC = action.EmployeeComments }
		if action.DevelopmentPlan != "" { devP = action.DevelopmentPlan }
		if !allRated(current.Scorecard, newSelf) {
			return BSCSubmission{}, fmt.Errorf("rate every KPI before submitting")
		}
		status = "self_submitted"

	case "save-manager":
		if !(isManager && managerStage) && !isHR {
			return BSCSubmission{}, deny("only the line manager can save agreed scores")
		}
		newAgreed = validateRatings(action.AgreedJSON)
		if action.ManagerComments != "" { mgrC = action.ManagerComments }
		if action.DevelopmentPlan != "" { devP = action.DevelopmentPlan }
		if len(newAgreed) > 0 { status = "manager_scoring" }

	case "submit-manager":
		if !(isManager && managerStage) && !isHR {
			return BSCSubmission{}, deny("only the line manager can submit to HC")
		}
		newAgreed = validateRatings(action.AgreedJSON)
		if action.ManagerComments != "" { mgrC = action.ManagerComments }
		if action.DevelopmentPlan != "" { devP = action.DevelopmentPlan }
		if !allRated(current.Scorecard, newAgreed) {
			return BSCSubmission{}, fmt.Errorf("set agreed rating for every KPI before submitting to HC")
		}
		status = "submitted_to_hc"
		hcSubAt = &now

	case "return-to-employee":
		if !(isManager && managerStage) && !isHR {
			return BSCSubmission{}, deny("only the line manager can return to employee")
		}
		status = "self_draft"

	case "finalize":
		if !(isHR && hcStage) {
			return BSCSubmission{}, deny("only HC can finalise")
		}
		if action.HCComments != "" { hcC = action.HCComments }
		status = "finalized"
		finalAt = &now

	case "return-to-manager":
		if !(isHR && hcStage) {
			return BSCSubmission{}, deny("only HC can return to manager")
		}
		status = "manager_scoring"

	default:
		return BSCSubmission{}, fmt.Errorf("unknown action %q", action.Action)
	}

	// Compute scores and band
	selfScore := ComputeKPIScore(current.Scorecard, newSelf)
	agreedScore := ComputeKPIScore(current.Scorecard, newAgreed)
	activeBand := Band(agreedScore)
	if activeBand == "" {
		activeBand = Band(selfScore)
	}

	selfJSONB, _ := json.Marshal(newSelf)
	agreedJSONB, _ := json.Marshal(newAgreed)

	const upd = `
		UPDATE appraisal.submission SET
			status=$1, self_json=$2::jsonb, agreed_json=$3::jsonb,
			employee_comments=$4, manager_comments=$5, development_plan=$6, hc_comments=$7,
			band=$8, self_score=$9, manager_score=$10,
			hc_submitted_at=COALESCE($11, hc_submitted_at),
			finalized_at=COALESCE($12, finalized_at),
			updated_at=now()
		WHERE id=$13
	`
	var selfScorePtr, agreedScorePtr *float64
	if selfScore > 0 { selfScorePtr = &selfScore }
	if agreedScore > 0 { agreedScorePtr = &agreedScore }

	if _, err := s.pool.Exec(ctx, upd,
		status, string(selfJSONB), string(agreedJSONB),
		empC, mgrC, devP, hcC,
		activeBand, selfScorePtr, agreedScorePtr,
		hcSubAt, finalAt,
		submissionID,
	); err != nil {
		return BSCSubmission{}, fmt.Errorf("appraisal: apply bsc action: %w", err)
	}

	return s.GetBSCSubmission(ctx, submissionID)
}

func validateRatings(m map[string]float64) map[string]float64 {
	if m == nil {
		return map[string]float64{}
	}
	out := make(map[string]float64, len(m))
	for k, v := range m {
		if v >= 1 && v <= 5 {
			out[k] = v
		}
	}
	return out
}

func allRated(scorecard []IndividualKPI, ratings map[string]float64) bool {
	if len(scorecard) == 0 {
		return false
	}
	for _, k := range scorecard {
		r, ok := ratings[k.ID.String()]
		if !ok || r < 1 || r > 5 {
			return false
		}
	}
	return true
}

// ── Auto-generate submissions ──────────────────────────────────────────────────

// GenerateBSCSubmissions creates submissions for all active employees in the org
// who have a manager, populating department/grade/level/manager_id.
func (s *Service) GenerateBSCSubmissions(ctx context.Context, cycleID uuid.UUID) (created, existing int, err error) {
	const fetchEmps = `
		SELECT
			u.id AS user_id,
			COALESCE(p.grade_level_code, '') AS grade,
			COALESCE(pos.code, '') AS role_code,
			COALESCE(pos.title, '') AS dept,
			COALESCE(mu.id, '00000000-0000-0000-0000-000000000000'::uuid) AS manager_user_id
		FROM identity.users u
		JOIN organization.person per ON per.user_id = u.id
		JOIN organization.assignment a ON a.person_id = per.id AND a.effective_to IS NULL
		JOIN organization.position pos ON pos.id = a.position_id
		LEFT JOIN organization.grade_level gl ON gl.code = a.grade_level_code
		LEFT JOIN organization.assignment ma ON ma.person_id = (
			SELECT p2.id FROM organization.person p2
			JOIN organization.assignment a2 ON a2.person_id = p2.id
			WHERE a2.position_id = pos.reports_to_position_id AND a2.effective_to IS NULL
			LIMIT 1
		) AND ma.effective_to IS NULL
		LEFT JOIN identity.users mu ON mu.id = (
			SELECT p3.user_id FROM organization.person p3
			WHERE p3.id = ma.person_id LIMIT 1
		)
		WHERE u.status = 'active'
		  AND a.effective_to IS NULL
	`
	rows, err := s.pool.Query(ctx, fetchEmps)
	if err != nil {
		return 0, 0, fmt.Errorf("appraisal: fetch employees for generation: %w", err)
	}
	defer rows.Close()

	type empRow struct {
		UserID       uuid.UUID
		Grade        string
		RoleCode     string
		Dept         string
		ManagerUserID uuid.UUID
	}
	var emps []empRow
	for rows.Next() {
		var e empRow
		if err := rows.Scan(&e.UserID, &e.Grade, &e.RoleCode, &e.Dept, &e.ManagerUserID); err != nil {
			continue
		}
		emps = append(emps, e)
	}
	rows.Close()

	const ins = `
		INSERT INTO appraisal.submission
			(cycle_id, appraisee_id, department, grade, level, manager_id, status, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, 'pending', now())
		ON CONFLICT (cycle_id, appraisee_id) DO NOTHING
	`
	nilUUID := uuid.MustParse("00000000-0000-0000-0000-000000000000")
	for _, e := range emps {
		var mgrPtr *uuid.UUID
		if e.ManagerUserID != nilUUID {
			id := e.ManagerUserID
			mgrPtr = &id
		}
		tag, qErr := s.pool.Exec(ctx, ins, cycleID, e.UserID, e.Dept, e.Grade, 1, mgrPtr)
		if qErr != nil {
			continue
		}
		if tag.RowsAffected() > 0 {
			created++
		} else {
			existing++
		}
	}
	return created, existing, nil
}

// ── CSV export ─────────────────────────────────────────────────────────────────

// ExportCSVRows returns rows suitable for a CSV export of a cycle's appraisals.
func (s *Service) ExportCSVRows(ctx context.Context, cycleID uuid.UUID) ([][]string, error) {
	subs, err := s.ListBSCSubmissions(ctx, cycleID)
	if err != nil {
		return nil, err
	}

	header := []string{"Employee", "Email", "Department", "Grade", "Level", "Line Manager", "Status", "Self Score", "Agreed Score", "Band", "Percent"}
	out := [][]string{header}

	levelLabel := func(l int) string {
		switch l {
		case 3:
			return "Head / Executive"
		case 2:
			return "Manager"
		default:
			return "Individual Contributor"
		}
	}

	for _, sub := range subs {
		selfS := ""
		if sub.SelfScore != nil {
			selfS = fmt.Sprintf("%.2f", *sub.SelfScore)
		}
		agreedS := ""
		pct := ""
		if sub.ManagerScore != nil {
			agreedS = fmt.Sprintf("%.2f", *sub.ManagerScore)
			pct = fmt.Sprintf("%.0f%%", (*sub.ManagerScore/5.0)*100)
		} else if sub.SelfScore != nil {
			pct = fmt.Sprintf("%.0f%%", (*sub.SelfScore/5.0)*100)
		}

		out = append(out, []string{
			sub.AppraiseeName, sub.AppraiseeEmail, sub.Department,
			sub.Grade, levelLabel(sub.Level), sub.ManagerName,
			sub.Status, selfS, agreedS, sub.Band, pct,
		})
	}
	return out, nil
}
