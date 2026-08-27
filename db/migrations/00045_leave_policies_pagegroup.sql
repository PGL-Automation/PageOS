-- +goose Up
-- Replace generic leave policies with Page Group's actual structure.

-- ── 1. Extend hr.leave_policy ─────────────────────────────────────────────────
ALTER TABLE hr.leave_policy
    ADD COLUMN IF NOT EXISTS is_unpaid              boolean  NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS minimum_tenure_months  int      NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS applicable_grades      text[]   -- NULL = all grades
;

-- ── 2. Deactivate legacy policies that are being replaced ─────────────────────
UPDATE hr.leave_policy
SET    is_active = false
WHERE  code IN ('ANNUAL','STUDY','COMPASSIONATE');

-- Remove incorrect 2026 balance rows that were seeded for the generic ANNUAL
-- policy so we can re-seed correctly below.
DELETE FROM hr.leave_balance
WHERE  policy_id = (SELECT id FROM hr.leave_policy WHERE code = 'ANNUAL')
  AND  year = 2026;

-- ── 3. Insert correct Page Group leave policies ───────────────────────────────
INSERT INTO hr.leave_policy
    (code, name, days_per_year, requires_approval, is_active,
     is_unpaid, minimum_tenure_months, applicable_grades)
VALUES
    -- Grade-tiered annual leave ------------------------------------------------
    ('ANNUAL_L1', 'Annual Leave (Entry–Mid)',
        22,  true, true, false, 0,
        ARRAY['GRADUATE_TRAINEE','ANALYST','ASSOCIATE',
              'EXECUTIVE_ASSOCIATE','SENIOR_EXEC_ASSOCIATE',
              'INTERN','NYSC',
              'FG_CONSULTANT','FG_EXEC_CONSULTANT','SENIOR_EXEC_CONSULTANT']),

    ('ANNUAL_L2', 'Annual Leave (Mid-Level)',
        25,  true, true, false, 0,
        ARRAY['ASSISTANT_MANAGER','DEPUTY_MANAGER']),

    ('ANNUAL_L3', 'Annual Leave (Senior)',
        27,  true, true, false, 0,
        ARRAY['MANAGER','SENIOR_MANAGER']),

    ('ANNUAL_L4', 'Annual Leave (Management)',
        30,  true, true, false, 0,
        ARRAY['AVP','VP']),

    ('ANNUAL_L5', 'Annual Leave (MD / Executive)',
        35,  true, true, false, 0,
        ARRAY['SVP']),

    -- Universal leave policies (all grades) ------------------------------------
    ('SICK',        'Sick Leave',             12,  true,  true, false,  0, NULL),
    ('MATERNITY',   'Maternity Leave',        90,  true,  true, false,  0, NULL),
    ('PATERNITY',   'Paternity Leave',         5,  true,  true, false,  0, NULL),
    ('BEREAVEMENT', 'Bereavement Leave',      10,  true,  true, false,  0, NULL),
    ('MARRIAGE',    'Marriage Leave',          5,  true,  true, false,  0, NULL),

    -- Unpaid extended leave (requires minimum 18 months tenure) ---------------
    ('STUDY_L1',    'Study Leave – Short (Unpaid)',  520, true, true, true, 18, NULL),
    ('STUDY_L2',    'Study Leave – Long (Unpaid)',  1040, true, true, true, 18, NULL),
    ('LEAVE_ABSENCE','Leave of Absence (Unpaid)',    260, true, true, true, 18, NULL)

ON CONFLICT (code) DO UPDATE
    SET name                   = EXCLUDED.name,
        days_per_year          = EXCLUDED.days_per_year,
        is_active              = EXCLUDED.is_active,
        is_unpaid              = EXCLUDED.is_unpaid,
        minimum_tenure_months  = EXCLUDED.minimum_tenure_months,
        applicable_grades      = EXCLUDED.applicable_grades;

-- ── 4. Seed 2026 annual leave balances by grade level ────────────────────────
-- Each active employee receives the annual leave tier that matches their grade.
-- +goose StatementBegin
INSERT INTO hr.leave_balance (person_id, policy_id, year, days_granted)
SELECT DISTINCT ON (p.id)
       p.id,
       pol.id,
       2026,
       pol.days_per_year
FROM   organization.person p
JOIN   organization.assignment a   ON a.person_id    = p.id
                                   AND a.effective_to IS NULL
JOIN   hr.leave_policy pol         ON a.grade_level_code = ANY(pol.applicable_grades)
                                   AND pol.code LIKE 'ANNUAL_%'
                                   AND pol.is_active = true
ON CONFLICT (person_id, policy_id, year) DO NOTHING;
-- +goose StatementEnd

-- ── 5. Seed 2026 balances for universal policies (all active employees) ───────
-- +goose StatementBegin
INSERT INTO hr.leave_balance (person_id, policy_id, year, days_granted)
SELECT p.id, pol.id, 2026, pol.days_per_year
FROM   organization.person p
CROSS  JOIN hr.leave_policy pol
WHERE  pol.applicable_grades IS NULL
  AND  pol.is_active = true
  AND  pol.code NOT IN ('STUDY_L1','STUDY_L2','LEAVE_ABSENCE')   -- unpaid: on-request only
  AND  EXISTS (
           SELECT 1 FROM organization.assignment a
           WHERE  a.person_id    = p.id
             AND  a.effective_to IS NULL
       )
ON CONFLICT (person_id, policy_id, year) DO NOTHING;
-- +goose StatementEnd

-- +goose Down
DELETE FROM hr.leave_balance
WHERE policy_id IN (
    SELECT id FROM hr.leave_policy
    WHERE code IN (
        'ANNUAL_L1','ANNUAL_L2','ANNUAL_L3','ANNUAL_L4','ANNUAL_L5',
        'BEREAVEMENT','MARRIAGE','STUDY_L1','STUDY_L2','LEAVE_ABSENCE'
    )
);
DELETE FROM hr.leave_policy
WHERE code IN (
    'ANNUAL_L1','ANNUAL_L2','ANNUAL_L3','ANNUAL_L4','ANNUAL_L5',
    'BEREAVEMENT','MARRIAGE','STUDY_L1','STUDY_L2','LEAVE_ABSENCE'
);
UPDATE hr.leave_policy SET is_active = true WHERE code IN ('ANNUAL','STUDY','COMPASSIONATE');
ALTER TABLE hr.leave_policy
    DROP COLUMN IF EXISTS is_unpaid,
    DROP COLUMN IF EXISTS minimum_tenure_months,
    DROP COLUMN IF EXISTS applicable_grades;
