// Package payroll handles monthly payroll runs, Nigerian PAYE computation,
// pension contributions, and auto-posting of the payroll GL journal.
package payroll

import (
	"context"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/pagegroup/pageos/internal/finance"
)

type Service struct {
	pool       *pgxpool.Pool
	financeSvc *finance.Service
}

func NewService(pool *pgxpool.Pool, financeSvc *finance.Service) *Service {
	return &Service{pool: pool, financeSvc: financeSvc}
}

// ── Domain types ──────────────────────────────────────────────────────────────

type Run struct {
	ID                   uuid.UUID  `json:"id"`
	SubsidiaryID         *uuid.UUID `json:"subsidiary_id,omitempty"`
	SubsidiaryName       string     `json:"subsidiary_name"`
	PeriodYear           int        `json:"period_year"`
	PeriodMonth          int        `json:"period_month"`
	PeriodName           string     `json:"period_name"`
	Status               string     `json:"status"`
	EmployeeCount        int        `json:"employee_count"`
	TotalGross           float64    `json:"total_gross"`
	TotalPAYE            float64    `json:"total_paye"`
	TotalEmpPension      float64    `json:"total_emp_pension"`
	TotalEmployerPension float64    `json:"total_employer_pension"`
	TotalNet             float64    `json:"total_net"`
	CreatedBy            uuid.UUID  `json:"created_by"`
	CreatedByName        string     `json:"created_by_name"`
	ApprovedBy           *uuid.UUID `json:"approved_by,omitempty"`
	ApprovedAt           *time.Time `json:"approved_at,omitempty"`
	JournalID            *uuid.UUID `json:"journal_id,omitempty"`
	CreatedAt            time.Time  `json:"created_at"`
}

type Payslip struct {
	ID                  uuid.UUID `json:"id"`
	RunID               uuid.UUID `json:"run_id"`
	PersonID            uuid.UUID `json:"person_id"`
	EmployeeName        string    `json:"employee_name"`
	EmployeeEmail       string    `json:"employee_email"`
	PositionTitle       string    `json:"position_title"`
	GradeCode           string    `json:"grade_code"`
	GradeName           string    `json:"grade_name"`
	GrossSalary         float64   `json:"gross_salary"`
	BasicSalary         float64   `json:"basic_salary"`
	HousingAllowance    float64   `json:"housing_allowance"`
	TransportAllowance  float64   `json:"transport_allowance"`
	CRA                 float64   `json:"cra"`
	TaxableIncome       float64   `json:"taxable_income"`
	PAYETax             float64   `json:"paye_tax"`
	PensionableEarnings float64   `json:"pensionable_earnings"`
	EmpPension          float64   `json:"emp_pension"`
	EmployerPension     float64   `json:"employer_pension"`
	NetPay              float64   `json:"net_pay"`
	HasSalary           bool      `json:"has_salary"`
}

type RunWithPayslips struct {
	Run
	Payslips []Payslip `json:"payslips"`
}

// ── Nigerian PAYE Computation ─────────────────────────────────────────────────

// computeAnnualPAYE returns the annual PAYE and the taxable income used.
// Uses Nigerian FIRS 2024 rates and CRA formula.
func computeAnnualPAYE(annualGross, annualEmpPension float64) (taxableIncome, cra, annualPAYE float64) {
	// Consolidated Relief Allowance: 20% of gross + max(₦200k, 1% of gross)
	cra = 0.20*annualGross + math.Max(200000, 0.01*annualGross)
	taxableIncome = math.Max(0, annualGross-cra-annualEmpPension)

	type bracket struct{ limit, rate float64 }
	brackets := []bracket{
		{300_000, 0.07},
		{300_000, 0.11},
		{500_000, 0.15},
		{500_000, 0.19},
		{1_600_000, 0.21},
		{math.MaxFloat64, 0.24},
	}
	remaining := taxableIncome
	for _, b := range brackets {
		if remaining <= 0 {
			break
		}
		inBracket := math.Min(remaining, b.limit)
		annualPAYE += inBracket * b.rate
		remaining -= inBracket
	}
	// Minimum tax: 1% of gross
	if annualPAYE < 0.01*annualGross {
		annualPAYE = 0.01 * annualGross
	}
	return
}

func round2(v float64) float64 { return math.Round(v*100) / 100 }

// computePayslip calculates all components for a single employee.
func computePayslip(monthlyGross float64) (basic, housing, transport, pensionable, empPension, employerPension, cra, taxableAnnual, monthlyPAYE, netPay float64) {
	basic     = round2(monthlyGross * 0.70)
	housing   = round2(monthlyGross * 0.15)
	transport = round2(monthlyGross * 0.15)
	pensionable = basic + housing + transport // = monthlyGross

	empPension      = round2(pensionable * 0.08)
	employerPension = round2(pensionable * 0.10)

	annualGross     := monthlyGross * 12
	annualEmpPension := empPension * 12
	taxableAnnual, cra, annualPAYE := computeAnnualPAYE(annualGross, annualEmpPension)
	// cra is annual; store monthly equivalent
	cra = round2(cra / 12)
	taxableAnnual = round2(taxableAnnual / 12) // monthly taxable for display
	monthlyPAYE = round2(annualPAYE / 12)

	netPay = round2(monthlyGross - empPension - monthlyPAYE)
	return
}

// ── Initiate Run ──────────────────────────────────────────────────────────────

func (s *Service) InitiateRun(ctx context.Context, subsidiaryID *uuid.UUID, year, month int, createdByID uuid.UUID, createdByName string) (Run, error) {
	monthNames := [...]string{"", "January", "February", "March", "April", "May", "June",
		"July", "August", "September", "October", "November", "December"}
	if month < 1 || month > 12 {
		return Run{}, fmt.Errorf("payroll: invalid month %d", month)
	}
	periodName := fmt.Sprintf("%s %d", monthNames[month], year)

	// Fetch active employees for the subsidiary (or all if nil).
	const employeeQ = `
		SELECT DISTINCT ON (p.id)
		       p.id, p.first_name || ' ' || p.last_name AS name, p.email,
		       pos.title, a.grade_level_code,
		       gl.display_name AS grade_name,
		       COALESCE(gl.monthly_gross_ngn, 0)::float8 AS monthly_gross,
		       gl.monthly_gross_ngn IS NOT NULL AS has_salary
		FROM   organization.person     p
		JOIN   organization.assignment a   ON a.person_id      = p.id
		                                  AND a.is_primary      = true
		                                  AND a.effective_from <= CURRENT_DATE
		                                  AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
		                                  AND a.employment_type NOT IN ('intern','nysc')
		LEFT   JOIN organization.position  pos ON pos.id   = a.position_id
		LEFT   JOIN organization.grade_level gl ON gl.code = a.grade_level_code
		WHERE  ($1::uuid IS NULL OR a.subsidiary_id = $1)
		ORDER  BY p.id, a.effective_from DESC
	`
	rows, err := s.pool.Query(ctx, employeeQ, subsidiaryID)
	if err != nil {
		return Run{}, fmt.Errorf("payroll: query employees: %w", err)
	}

	type empRow struct {
		personID    uuid.UUID
		name        string
		email       string
		posTitle    string
		gradeCode   string
		gradeName   string
		monthlyGross float64
		hasSalary   bool
	}
	var employees []empRow
	for rows.Next() {
		var e empRow
		if err := rows.Scan(&e.personID, &e.name, &e.email, &e.posTitle,
			&e.gradeCode, &e.gradeName, &e.monthlyGross, &e.hasSalary); err != nil {
			rows.Close()
			return Run{}, err
		}
		employees = append(employees, e)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return Run{}, err
	}

	if len(employees) == 0 {
		return Run{}, fmt.Errorf("payroll: no eligible employees found for this subsidiary")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Run{}, err
	}
	defer tx.Rollback(ctx)

	// Create run.
	var runID uuid.UUID
	if err := tx.QueryRow(ctx, `
		INSERT INTO payroll.run
		    (subsidiary_id, period_year, period_month, period_name,
		     created_by, created_by_name, employee_count)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		RETURNING id
	`, subsidiaryID, year, month, periodName, createdByID, createdByName, len(employees),
	).Scan(&runID); err != nil {
		return Run{}, fmt.Errorf("payroll: create run: %w", err)
	}

	var totGross, totPAYE, totEmpPension, totEmployerPension, totNet float64

	for _, e := range employees {
		basic, housing, transport, pensionable, empPension, employerPension, cra, taxable, paye, net :=
			computePayslip(e.monthlyGross)

		if _, err := tx.Exec(ctx, `
			INSERT INTO payroll.payslip
			    (run_id, person_id, employee_name, employee_email,
			     position_title, grade_code, grade_name,
			     gross_salary, basic_salary, housing_allowance, transport_allowance,
			     cra, taxable_income, paye_tax,
			     pensionable_earnings, emp_pension, employer_pension,
			     net_pay, has_salary)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
		`, runID, e.personID, e.name, e.email,
			e.posTitle, e.gradeCode, e.gradeName,
			e.monthlyGross, basic, housing, transport,
			cra, taxable, paye,
			pensionable, empPension, employerPension,
			net, e.hasSalary,
		); err != nil {
			return Run{}, fmt.Errorf("payroll: insert payslip for %s: %w", e.name, err)
		}

		totGross += e.monthlyGross
		totPAYE += paye
		totEmpPension += empPension
		totEmployerPension += employerPension
		totNet += net
	}

	// Update run totals.
	if _, err := tx.Exec(ctx, `
		UPDATE payroll.run
		SET    total_gross            = $1,
		       total_paye             = $2,
		       total_emp_pension      = $3,
		       total_employer_pension = $4,
		       total_net              = $5
		WHERE  id = $6
	`, round2(totGross), round2(totPAYE), round2(totEmpPension),
		round2(totEmployerPension), round2(totNet), runID); err != nil {
		return Run{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return Run{}, err
	}
	return s.singleRun(ctx, runID)
}

// ── Approve (posts GL journal) ────────────────────────────────────────────────

func (s *Service) ApproveRun(ctx context.Context, runID, approverID uuid.UUID, approverName string) (Run, error) {
	run, err := s.singleRun(ctx, runID)
	if err != nil {
		return Run{}, err
	}
	if run.Status != "draft" {
		return Run{}, fmt.Errorf("payroll: run is already %s", run.Status)
	}

	payrollDate := fmt.Sprintf("%d-%02d-%02d", run.PeriodYear, run.PeriodMonth,
		daysInMonth(run.PeriodYear, run.PeriodMonth))

	// Build GL journal.
	jlines := []finance.JournalLineInput{
		// Dr Staff Salaries (gross payroll)
		{AccountCode: "5001", AccountName: "Staff Salaries and Wages",
			Narration: "Gross payroll – " + run.PeriodName, Debit: run.TotalGross},
		// Dr Employer Pension
		{AccountCode: "5003", AccountName: "Employer Pension Contribution",
			Narration: "Employer pension – " + run.PeriodName, Debit: run.TotalEmployerPension},
		// Cr Salaries Payable (net pay)
		{AccountCode: "2140", AccountName: "Salaries and Wages Payable",
			Narration: "Net salaries payable – " + run.PeriodName, Credit: run.TotalNet},
		// Cr PAYE Payable
		{AccountCode: "2120", AccountName: "PAYE Tax Payable",
			Narration: "PAYE – " + run.PeriodName, Credit: run.TotalPAYE},
		// Cr Pension Payable (employee + employer combined)
		{AccountCode: "2130", AccountName: "Pension Contributions Payable",
			Narration: "Pension (employee 8% + employer 10%) – " + run.PeriodName,
			Credit: run.TotalEmpPension + run.TotalEmployerPension},
	}

	journal, err := s.financeSvc.CreateJournal(ctx, approverID, approverName, finance.CreateJournalInput{
		SubsidiaryID: run.SubsidiaryID,
		Date:         payrollDate,
		Type:         "Payroll",
		Description:  "Payroll – " + run.PeriodName,
		Lines:        jlines,
	})
	if err != nil {
		return Run{}, fmt.Errorf("payroll: create journal: %w", err)
	}
	if err := s.financeSvc.PostJournal(ctx, journal.ID, approverID); err != nil {
		return Run{}, fmt.Errorf("payroll: post journal: %w", err)
	}

	if _, err := s.pool.Exec(ctx, `
		UPDATE payroll.run
		SET    status      = 'approved',
		       approved_by = $1,
		       approved_at = now(),
		       journal_id  = $2
		WHERE  id = $3
	`, approverID, journal.ID, runID); err != nil {
		return Run{}, err
	}
	return s.singleRun(ctx, runID)
}

// ── List / Get ────────────────────────────────────────────────────────────────

func (s *Service) ListRuns(ctx context.Context, subsidiaryID *uuid.UUID) ([]Run, error) {
	const q = `
		SELECT r.id, r.subsidiary_id, COALESCE(sub.name,'') AS subsidiary_name,
		       r.period_year, r.period_month, r.period_name, r.status,
		       r.employee_count,
		       r.total_gross::float8, r.total_paye::float8,
		       r.total_emp_pension::float8, r.total_employer_pension::float8,
		       r.total_net::float8,
		       r.created_by, r.created_by_name, r.approved_by, r.approved_at,
		       r.journal_id, r.created_at
		FROM   payroll.run r
		LEFT   JOIN organization.subsidiary sub ON sub.id = r.subsidiary_id
		WHERE  ($1::uuid IS NULL OR r.subsidiary_id = $1)
		ORDER  BY r.period_year DESC, r.period_month DESC, r.created_at DESC
	`
	rows, err := s.pool.Query(ctx, q, subsidiaryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanRuns(rows)
}

func (s *Service) GetRunWithPayslips(ctx context.Context, runID uuid.UUID) (RunWithPayslips, error) {
	run, err := s.singleRun(ctx, runID)
	if err != nil {
		return RunWithPayslips{}, err
	}
	payslips, err := s.listPayslips(ctx, runID)
	if err != nil {
		return RunWithPayslips{}, err
	}
	return RunWithPayslips{Run: run, Payslips: payslips}, nil
}

func (s *Service) listPayslips(ctx context.Context, runID uuid.UUID) ([]Payslip, error) {
	const q = `
		SELECT id, run_id, person_id, employee_name, employee_email,
		       position_title, grade_code, grade_name,
		       gross_salary::float8, basic_salary::float8,
		       housing_allowance::float8, transport_allowance::float8,
		       cra::float8, taxable_income::float8, paye_tax::float8,
		       pensionable_earnings::float8, emp_pension::float8, employer_pension::float8,
		       net_pay::float8, has_salary
		FROM   payroll.payslip
		WHERE  run_id = $1
		ORDER  BY employee_name
	`
	rows, err := s.pool.Query(ctx, q, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Payslip
	for rows.Next() {
		var p Payslip
		if err := rows.Scan(
			&p.ID, &p.RunID, &p.PersonID, &p.EmployeeName, &p.EmployeeEmail,
			&p.PositionTitle, &p.GradeCode, &p.GradeName,
			&p.GrossSalary, &p.BasicSalary, &p.HousingAllowance, &p.TransportAllowance,
			&p.CRA, &p.TaxableIncome, &p.PAYETax,
			&p.PensionableEarnings, &p.EmpPension, &p.EmployerPension,
			&p.NetPay, &p.HasSalary,
		); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ── Schedule helpers (for CSV downloads) ─────────────────────────────────────

// PAYEScheduleRow is a single row in the PAYE remittance schedule.
type PAYEScheduleRow struct {
	SN            int     `json:"sn"`
	EmployeeName  string  `json:"employee_name"`
	GrossIncome   float64 `json:"gross_income"`
	CRA           float64 `json:"cra"`
	TaxableIncome float64 `json:"taxable_income"`
	PAYETax       float64 `json:"paye_tax"`
}

type PensionScheduleRow struct {
	SN                int     `json:"sn"`
	EmployeeName      string  `json:"employee_name"`
	Pensionable       float64 `json:"pensionable_earnings"`
	EmployeeContrib   float64 `json:"employee_contribution"`
	EmployerContrib   float64 `json:"employer_contribution"`
	TotalContribution float64 `json:"total_contribution"`
}

func (s *Service) GetPAYESchedule(ctx context.Context, runID uuid.UUID) ([]PAYEScheduleRow, error) {
	payslips, err := s.listPayslips(ctx, runID)
	if err != nil {
		return nil, err
	}
	out := make([]PAYEScheduleRow, 0, len(payslips))
	for i, p := range payslips {
		if p.PAYETax > 0 {
			out = append(out, PAYEScheduleRow{
				SN: i + 1, EmployeeName: p.EmployeeName,
				GrossIncome: p.GrossSalary, CRA: p.CRA,
				TaxableIncome: p.TaxableIncome, PAYETax: p.PAYETax,
			})
		}
	}
	return out, nil
}

func (s *Service) GetPensionSchedule(ctx context.Context, runID uuid.UUID) ([]PensionScheduleRow, error) {
	payslips, err := s.listPayslips(ctx, runID)
	if err != nil {
		return nil, err
	}
	out := make([]PensionScheduleRow, 0, len(payslips))
	for i, p := range payslips {
		if p.EmpPension > 0 || p.EmployerPension > 0 {
			out = append(out, PensionScheduleRow{
				SN: i + 1, EmployeeName: p.EmployeeName,
				Pensionable:     p.PensionableEarnings,
				EmployeeContrib: p.EmpPension, EmployerContrib: p.EmployerPension,
				TotalContribution: p.EmpPension + p.EmployerPension,
			})
		}
	}
	return out, nil
}

// PAYEScheduleCSV returns a formatted CSV string.
func PAYEScheduleCSV(rows []PAYEScheduleRow, periodName, subsidiaryName string) string {
	var sb strings.Builder
	sb.WriteString("PAYE Remittance Schedule\n")
	sb.WriteString("Period: " + periodName + "\n")
	sb.WriteString("Entity: " + subsidiaryName + "\n\n")
	sb.WriteString("S/N,Employee Name,Monthly Gross (₦),CRA (Monthly),Taxable Income (Monthly),PAYE (Monthly)\n")
	var totalGross, totalCRA, totalTaxable, totalPAYE float64
	for _, r := range rows {
		sb.WriteString(fmt.Sprintf("%d,%s,%.2f,%.2f,%.2f,%.2f\n",
			r.SN, r.EmployeeName, r.GrossIncome, r.CRA, r.TaxableIncome, r.PAYETax))
		totalGross += r.GrossIncome
		totalCRA += r.CRA
		totalTaxable += r.TaxableIncome
		totalPAYE += r.PAYETax
	}
	sb.WriteString(fmt.Sprintf("TOTAL,,%s,%s,%s,%s\n",
		fmtNum(totalGross), fmtNum(totalCRA), fmtNum(totalTaxable), fmtNum(totalPAYE)))
	return sb.String()
}

// PensionScheduleCSV returns a formatted CSV string.
func PensionScheduleCSV(rows []PensionScheduleRow, periodName, subsidiaryName string) string {
	var sb strings.Builder
	sb.WriteString("Pension Remittance Schedule (PenCom)\n")
	sb.WriteString("Period: " + periodName + "\n")
	sb.WriteString("Entity: " + subsidiaryName + "\n\n")
	sb.WriteString("S/N,Employee Name,Pensionable Earnings (₦),Employee (8%) (₦),Employer (10%) (₦),Total (₦)\n")
	var totPens, totEmp, totEmpl, totTotal float64
	for _, r := range rows {
		sb.WriteString(fmt.Sprintf("%d,%s,%.2f,%.2f,%.2f,%.2f\n",
			r.SN, r.EmployeeName, r.Pensionable, r.EmployeeContrib, r.EmployerContrib, r.TotalContribution))
		totPens += r.Pensionable
		totEmp += r.EmployeeContrib
		totEmpl += r.EmployerContrib
		totTotal += r.TotalContribution
	}
	sb.WriteString(fmt.Sprintf("TOTAL,,%s,%s,%s,%s\n",
		fmtNum(totPens), fmtNum(totEmp), fmtNum(totEmpl), fmtNum(totTotal)))
	return sb.String()
}

func fmtNum(n float64) string { return fmt.Sprintf("%.2f", n) }

// ── Remittance tracking ───────────────────────────────────────────────────────

type Remittance struct {
	ID          uuid.UUID  `json:"id"`
	RunID       uuid.UUID  `json:"run_id"`
	Type        string     `json:"type"` // "paye" | "pension"
	Amount      float64    `json:"amount"`
	PaymentDate string     `json:"payment_date"`
	Reference   string     `json:"reference"`
	Notes       string     `json:"notes"`
	RecordedBy  uuid.UUID  `json:"recorded_by"`
	JournalID   *uuid.UUID `json:"journal_id,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

// RunRemittanceSummary is one payroll run enriched with its remittance totals.
type RunRemittanceSummary struct {
	Run
	PAYEPaid      float64       `json:"paye_paid"`
	PAYEOutstanding float64     `json:"paye_outstanding"`
	PensionDue    float64       `json:"pension_due"` // emp + employer
	PensionPaid   float64       `json:"pension_paid"`
	PensionOutstanding float64  `json:"pension_outstanding"`
	Remittances   []Remittance  `json:"remittances"`
}

type RecordRemittanceInput struct {
	RunID       uuid.UUID `json:"run_id"`
	Type        string    `json:"type"` // "paye" | "pension"
	Amount      float64   `json:"amount"`
	PaymentDate string    `json:"payment_date"`
	Reference   string    `json:"reference"`
	Notes       string    `json:"notes"`
	BankCode    string    `json:"bank_account_code"` // GL code for bank account
}

// RecordRemittance saves a statutory payment and posts the corresponding GL journal.
// PAYE:    Dr 2120 (PAYE Tax Payable)            / Cr bank
// Pension: Dr 2130 (Pension Contributions Payable) / Cr bank
func (s *Service) RecordRemittance(ctx context.Context, in RecordRemittanceInput, byID uuid.UUID, byName string) (Remittance, error) {
	if in.Type != "paye" && in.Type != "pension" {
		return Remittance{}, fmt.Errorf("payroll: type must be 'paye' or 'pension'")
	}
	if in.Amount <= 0 {
		return Remittance{}, fmt.Errorf("payroll: amount must be positive")
	}
	if in.BankCode == "" {
		in.BankCode = "1110"
	}

	run, err := s.singleRun(ctx, in.RunID)
	if err != nil {
		return Remittance{}, fmt.Errorf("payroll: run not found: %w", err)
	}

	// Determine the liability account being cleared
	var liabCode, liabName, remitDesc string
	switch in.Type {
	case "paye":
		liabCode, liabName = "2120", "PAYE Tax Payable"
		remitDesc = fmt.Sprintf("PAYE remittance to FIRS — %s", run.PeriodName)
	case "pension":
		liabCode, liabName = "2130", "Pension Contributions Payable"
		remitDesc = fmt.Sprintf("Pension remittance to PFA — %s", run.PeriodName)
	}

	// Get bank account name
	bankName := "Cash at Bank"
	_ = s.pool.QueryRow(ctx, `SELECT name FROM finance.account WHERE code = $1`, in.BankCode).Scan(&bankName)

	// Post the GL journal
	journal, err := s.financeSvc.CreateJournal(ctx, byID, byName, finance.CreateJournalInput{
		SubsidiaryID: run.SubsidiaryID,
		Date:         in.PaymentDate,
		Type:         "PAYE / Tax Remittance",
		Description:  remitDesc,
		Lines: []finance.JournalLineInput{
			{AccountCode: liabCode, AccountName: liabName,
				Narration: remitDesc, Debit: in.Amount},
			{AccountCode: in.BankCode, AccountName: bankName,
				Narration: remitDesc, Credit: in.Amount},
		},
	})
	if err != nil {
		return Remittance{}, fmt.Errorf("payroll: create remittance journal: %w", err)
	}
	if err := s.financeSvc.PostJournal(ctx, journal.ID, byID); err != nil {
		return Remittance{}, fmt.Errorf("payroll: post remittance journal: %w", err)
	}

	// Persist the remittance record
	var rem Remittance
	if err := s.pool.QueryRow(ctx, `
		INSERT INTO payroll.remittance
		    (run_id, type, amount, payment_date, reference, notes, recorded_by, journal_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		RETURNING id, run_id, type, amount::float8, payment_date::text,
		          reference, notes, recorded_by, journal_id, created_at
	`, in.RunID, in.Type, in.Amount, in.PaymentDate, in.Reference, in.Notes, byID, journal.ID,
	).Scan(&rem.ID, &rem.RunID, &rem.Type, &rem.Amount, &rem.PaymentDate,
		&rem.Reference, &rem.Notes, &rem.RecordedBy, &rem.JournalID, &rem.CreatedAt); err != nil {
		return Remittance{}, fmt.Errorf("payroll: insert remittance: %w", err)
	}
	return rem, nil
}

// ListRemittanceDashboard returns all approved/paid runs for a subsidiary (or all),
// enriched with how much PAYE and pension has been remitted so far.
func (s *Service) ListRemittanceDashboard(ctx context.Context, subsidiaryID *uuid.UUID) ([]RunRemittanceSummary, error) {
	runs, err := s.ListRuns(ctx, subsidiaryID)
	if err != nil {
		return nil, err
	}

	var out []RunRemittanceSummary
	for _, run := range runs {
		// Only approved/paid runs have statutory obligations
		if run.Status == "draft" {
			continue
		}

		// Sum remittances for this run
		var payePaid, pensionPaid float64
		rows, err := s.pool.Query(ctx, `
			SELECT type, SUM(amount)::float8
			FROM   payroll.remittance
			WHERE  run_id = $1
			GROUP  BY type
		`, run.ID)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var t string
			var amt float64
			if err := rows.Scan(&t, &amt); err != nil {
				rows.Close()
				return nil, err
			}
			switch t {
			case "paye":
				payePaid = amt
			case "pension":
				pensionPaid = amt
			}
		}
		rows.Close()

		// Fetch remittance records for detail panel
		remRows, err := s.pool.Query(ctx, `
			SELECT id, run_id, type, amount::float8, payment_date::text,
			       reference, notes, recorded_by, journal_id, created_at
			FROM   payroll.remittance
			WHERE  run_id = $1
			ORDER  BY payment_date, type
		`, run.ID)
		if err != nil {
			return nil, err
		}
		var rems []Remittance
		for remRows.Next() {
			var r Remittance
			if err := remRows.Scan(&r.ID, &r.RunID, &r.Type, &r.Amount, &r.PaymentDate,
				&r.Reference, &r.Notes, &r.RecordedBy, &r.JournalID, &r.CreatedAt); err != nil {
				remRows.Close()
				return nil, err
			}
			rems = append(rems, r)
		}
		remRows.Close()

		pensionDue := math.Round((run.TotalEmpPension+run.TotalEmployerPension)*100) / 100
		out = append(out, RunRemittanceSummary{
			Run:                run,
			PAYEPaid:           math.Round(payePaid*100) / 100,
			PAYEOutstanding:    math.Round((run.TotalPAYE-payePaid)*100) / 100,
			PensionDue:         pensionDue,
			PensionPaid:        math.Round(pensionPaid*100) / 100,
			PensionOutstanding: math.Round((pensionDue-pensionPaid)*100) / 100,
			Remittances:        rems,
		})
	}
	return out, nil
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func (s *Service) singleRun(ctx context.Context, id uuid.UUID) (Run, error) {
	const q = `
		SELECT r.id, r.subsidiary_id, COALESCE(sub.name,'') AS subsidiary_name,
		       r.period_year, r.period_month, r.period_name, r.status,
		       r.employee_count,
		       r.total_gross::float8, r.total_paye::float8,
		       r.total_emp_pension::float8, r.total_employer_pension::float8,
		       r.total_net::float8,
		       r.created_by, r.created_by_name, r.approved_by, r.approved_at,
		       r.journal_id, r.created_at
		FROM   payroll.run r
		LEFT   JOIN organization.subsidiary sub ON sub.id = r.subsidiary_id
		WHERE  r.id = $1
	`
	var r Run
	if err := s.pool.QueryRow(ctx, q, id).Scan(
		&r.ID, &r.SubsidiaryID, &r.SubsidiaryName,
		&r.PeriodYear, &r.PeriodMonth, &r.PeriodName, &r.Status,
		&r.EmployeeCount, &r.TotalGross, &r.TotalPAYE,
		&r.TotalEmpPension, &r.TotalEmployerPension, &r.TotalNet,
		&r.CreatedBy, &r.CreatedByName, &r.ApprovedBy, &r.ApprovedAt,
		&r.JournalID, &r.CreatedAt,
	); err != nil {
		return Run{}, fmt.Errorf("payroll: run not found: %w", err)
	}
	return r, nil
}

func scanRuns(rows pgx.Rows) ([]Run, error) {
	var out []Run
	for rows.Next() {
		var r Run
		if err := rows.Scan(
			&r.ID, &r.SubsidiaryID, &r.SubsidiaryName,
			&r.PeriodYear, &r.PeriodMonth, &r.PeriodName, &r.Status,
			&r.EmployeeCount, &r.TotalGross, &r.TotalPAYE,
			&r.TotalEmpPension, &r.TotalEmployerPension, &r.TotalNet,
			&r.CreatedBy, &r.CreatedByName, &r.ApprovedBy, &r.ApprovedAt,
			&r.JournalID, &r.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func daysInMonth(year, month int) int {
	return time.Date(year, time.Month(month+1), 0, 0, 0, 0, 0, time.UTC).Day()
}
