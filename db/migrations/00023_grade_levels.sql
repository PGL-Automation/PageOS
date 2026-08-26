-- +goose Up
-- Grade level reference table + assignment extensions.
-- Adds grade_level_code and pending_grade_review to organization.assignment,
-- then back-fills all 42 seeded employees.

-- ── 1. Reference table ────────────────────────────────────────────────────────
CREATE TABLE organization.grade_level (
    code               text        PRIMARY KEY,
    display_name       text        NOT NULL,
    competency_level   text        NOT NULL DEFAULT '',
    annual_gross_ngn   numeric(14,2),
    annual_net_ngn     numeric(14,2),
    monthly_gross_ngn  numeric(14,2),
    monthly_net_ngn    numeric(14,2),
    is_contractor      boolean     NOT NULL DEFAULT false,
    created_at         timestamptz NOT NULL DEFAULT now()
);

INSERT INTO organization.grade_level
    (code, display_name, competency_level,
     annual_gross_ngn, annual_net_ngn, monthly_gross_ngn, monthly_net_ngn, is_contractor)
VALUES
    ('GRADUATE_TRAINEE',      'Graduate Trainee',           'Foundation',                            NULL,          NULL,          NULL,         NULL,         false),
    ('ANALYST',               'Analyst',                    'Developing Professional',               3545743.26,    3110026.45,    295478.61,    259168.87,    false),
    ('ASSOCIATE',             'Associate',                  'Proficient',                            4433870.46,    3816520.40,    369489.21,    318043.37,    false),
    ('EXECUTIVE_ASSOCIATE',   'Executive Associate',        'Junior-Level Professional',             7352394.12,    6131213.19,    612699.51,    510934.43,    false),
    ('SENIOR_EXEC_ASSOCIATE', 'Senior Executive Associate', 'Professional',                          8380359.04,    6946496.28,    698363.25,    578874.69,    false),
    ('ASSISTANT_MANAGER',     'Assistant Manager',          'Advanced Professional',                14128719.27,   11470584.85,   1177393.27,   955882.07,    false),
    ('DEPUTY_MANAGER',        'Deputy Manager',             'Specialist; First-line Management',    15036894.19,   12164510.41,   1253074.52,   1013709.20,   false),
    ('MANAGER',               'Manager',                   'Senior Specialist; Middle Management',  19267522.31,   15397082.58,   1605626.86,   1283090.22,   false),
    ('SENIOR_MANAGER',        'Senior Manager',             'Expert; Leadership',                   24627643.62,   19492686.96,   2052303.64,   1624390.58,   false),
    ('AVP',                   'Assistant Vice President',   'Principal Expert; Business Leadership', 32274583.13,  25221302.14,   2689548.59,   2101775.18,   false),
    ('VP',                    'Vice President',             'Enterprise Executive',                 39936341.93,   30927351.03,   3328028.49,   2577279.25,   false),
    ('SVP',                   'Senior Vice President',      'Strategic Executive',                  NULL,          NULL,          NULL,         NULL,         false),
    ('INTERN',                'Intern',                     'Basic',                                NULL,          NULL,          NULL,         NULL,         false),
    ('NYSC',                  'Youth Corps Member',         'Basic',                                NULL,          NULL,          NULL,         NULL,         false),
    ('FG_CONSULTANT',         'F&G Consultant',             'Consultant',                           NULL,          NULL,          NULL,         NULL,         true),
    ('FG_EXEC_CONSULTANT',    'F&G Executive Consultant',   'Executive Consultant',                 NULL,          NULL,          NULL,         NULL,         true),
    ('SENIOR_EXEC_CONSULTANT','Senior Executive Consultant','Executive Consultant',                 NULL,          NULL,          NULL,         NULL,         true);

-- ── 2. Extend assignment ──────────────────────────────────────────────────────
ALTER TABLE organization.assignment
    ADD COLUMN grade_level_code     text    REFERENCES organization.grade_level(code),
    ADD COLUMN pending_grade_review boolean NOT NULL DEFAULT false;

-- ── 3. Back-fill grades for the 42 seeded employees ──────────────────────────
-- pending_grade_review = true flags the 4 employees whose grade is transitional.
-- +goose StatementBegin
UPDATE organization.assignment a
SET    grade_level_code     = v.grade,
       pending_grade_review = v.pending
FROM (VALUES
    -- PCL
    ('Abideen.Mikail@pagecapitalng.com',        'FG_CONSULTANT',          false),
    ('ojima.anyagba@pagecapitalng.com',          'SENIOR_EXEC_ASSOCIATE',  false),
    ('Chinonso.Okoroafor@pagecapitalng.com',     'FG_EXEC_CONSULTANT',     false),
    ('chinonyerem.amanze@pagecapitalng.com',     'VP',                     false),
    ('edwin.ojideagu@pagecapitalng.com',         'AVP',                    false),
    ('Gabriel.Odediran@pageiml.com',             'SVP',                    false),
    ('joseph.ehikioya@pagecapitalng.com',        'ANALYST',                true),
    ('ndifreke.obot@pageaml.com',                'DEPUTY_MANAGER',         false),
    ('oladotun.murele@pagecapitalng.com',        'AVP',                    false),
    ('oolabodunde@pagecapitalng.com',            'AVP',                    false),
    ('otito.esedebe@pagecapitalng.com',          'AVP',                    true),
    ('Rachael.Oyedele@pagecapitalng.com',        'DEPUTY_MANAGER',         false),
    ('Sarah.Egbele@pagecapitalng.com',           'DEPUTY_MANAGER',         false),
    ('victor.akomolafe@pagecapitalng.com',       'ASSOCIATE',              true),
    ('Timi.Oloketuyi@pagecapitalng.com',         'SENIOR_EXEC_ASSOCIATE',  false),
    -- PAML
    ('adenike.odesanya@pageaml.com',             'AVP',                    true),
    ('ahmed.umaru@pageaml.com',                  'SENIOR_MANAGER',         false),
    ('Chiamaka.Mbachu@pageaml.com',              'ASSISTANT_MANAGER',      false),
    ('ebele.odukwe@pageaml.com',                 'SENIOR_MANAGER',         false),
    ('gabriel.adepoju@pageaml.com',              'ASSOCIATE',              false),
    ('Ifeoluwa.adesina@pageaml.com',             'INTERN',                 false),
    ('john.ezegbugha@pageaml.com',               'DEPUTY_MANAGER',         false),
    ('kehinde.ojetola@pagecapitalng.com',        'EXECUTIVE_ASSOCIATE',    false),
    ('nneka.sunmonu@pageaml.com',                'MANAGER',                false),
    ('segun.agunbiade@pageaml.com',              'ASSISTANT_MANAGER',      false),
    ('temitope.adio@pageaml.com',                'DEPUTY_MANAGER',         false),
    ('toyin.akinde@pageaml.com',                 'SVP',                    false),
    ('Gbenga.Olubayode@pageaml.com',             'DEPUTY_MANAGER',         false),
    -- Shared Service
    ('amos.olanrewaju@pageaml.com',              'AVP',                    false),
    ('damilola.osifala@pageaml.com',             'MANAGER',                false),
    ('Adewale.Bamiro@pagecapitalng.com',         'SENIOR_EXEC_CONSULTANT', false),
    ('olorunjeda.adegbulugbe@pagecapitalng.com', 'DEPUTY_MANAGER',         false),
    ('chiamaka.dike@pageaml.com',                'ANALYST',                false),
    ('Halima.Yakubu@pageaml.com',                'EXECUTIVE_ASSOCIATE',    false),
    ('Franca.Imene@pageaml.com',                 'ANALYST',                false),
    ('john.offuna@pagecapitalng.com',            'ASSOCIATE',              false),
    ('obasi.egwu@pageaml.com',                   'ASSISTANT_MANAGER',      false),
    ('olawunmi.oladigbo@pageaml.com',            'DEPUTY_MANAGER',         false),
    ('oluwakemi.agboola@pageaml.com',            'EXECUTIVE_ASSOCIATE',    false),
    ('udochukwu.okigbo@pageaml.com',             'DEPUTY_MANAGER',         false),
    ('Samuel.Fabunmi@pageaml.com',               'DEPUTY_MANAGER',         false)
) AS v(email, grade, pending)
JOIN organization.person p ON p.email = v.email
WHERE a.person_id    = p.id
  AND a.effective_to IS NULL;
-- +goose StatementEnd

-- +goose Down
ALTER TABLE organization.assignment DROP COLUMN IF EXISTS pending_grade_review;
ALTER TABLE organization.assignment DROP COLUMN IF EXISTS grade_level_code;
DROP TABLE IF EXISTS organization.grade_level;
