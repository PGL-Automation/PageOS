-- +goose Up
-- Seed 2026 leave balances for all policies for every employee with an active assignment.
-- +goose StatementBegin
INSERT INTO hr.leave_balance (person_id, policy_id, year, days_granted)
SELECT p.id, pol.id, 2026, pol.days_per_year
FROM   organization.person p
CROSS  JOIN hr.leave_policy pol
WHERE  pol.is_active = true
  AND  EXISTS (
    SELECT 1 FROM organization.assignment a
    WHERE  a.person_id    = p.id
      AND  a.effective_to IS NULL
  )
ON CONFLICT (person_id, policy_id, year) DO NOTHING;
-- +goose StatementEnd

-- +goose Down
