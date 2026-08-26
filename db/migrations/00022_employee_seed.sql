-- +goose Up
-- Seed all 42 employees from the employee register.
-- Introduces: employment_type on assignment, home_organization on person,
-- SHARED_SERVICE subsidiary, EXECUTIVE_DIRECTOR group position, and all
-- positions needed to cover the real org structure.

-- ── 1. Schema additions ───────────────────────────────────────────────────────
ALTER TABLE organization.assignment
    ADD COLUMN employment_type text NOT NULL DEFAULT 'permanent'
        CHECK (employment_type IN ('permanent','secondee','contract','intern','nysc'));

ALTER TABLE organization.person
    ADD COLUMN home_organization text;

-- ── 2. SHARED_SERVICE subsidiary ─────────────────────────────────────────────
INSERT INTO organization.subsidiary (code, name)
VALUES ('SHARED_SERVICE', 'Page Group Shared Services')
ON CONFLICT (code) DO NOTHING;

-- ── 3. EXECUTIVE_DIRECTOR group-level position (root of the org) ─────────────
INSERT INTO organization.position (subsidiary_id, code, title)
SELECT NULL, 'EXECUTIVE_DIRECTOR', 'Executive Director'
WHERE NOT EXISTS (
    SELECT 1 FROM organization.position WHERE code = 'EXECUTIVE_DIRECTOR' AND subsidiary_id IS NULL
);

-- ── 4. New positions + reporting line corrections ─────────────────────────────
-- +goose StatementBegin
DO $$
DECLARE
    pc_id  uuid;
    pam_id uuid;
    ss_id  uuid;
    ed_id  uuid;
BEGIN
    SELECT id INTO pc_id  FROM organization.subsidiary WHERE code = 'PAGE_CAPITAL';
    SELECT id INTO pam_id FROM organization.subsidiary WHERE code = 'PAGE_ASSET_MGMT';
    SELECT id INTO ss_id  FROM organization.subsidiary WHERE code = 'SHARED_SERVICE';
    SELECT id INTO ed_id  FROM organization.position
        WHERE code = 'EXECUTIVE_DIRECTOR' AND subsidiary_id IS NULL;

    -- PCL: add positions not previously in the real org chart
    INSERT INTO organization.position (subsidiary_id, code, title)
    SELECT pc_id, v.code, v.title
    FROM (VALUES
        ('PORTFOLIO_MGMT_ASSISTANT',  'Portfolio Management Assistant'),
        ('TRADING_RESEARCH_TRAINEE',  'Trading Support & Research Trainee')
    ) AS v(code, title)
    WHERE NOT EXISTS (
        SELECT 1 FROM organization.position p WHERE p.subsidiary_id = pc_id AND p.code = v.code
    );

    -- SHARED_SERVICE: full position set
    INSERT INTO organization.position (subsidiary_id, code, title)
    SELECT ss_id, v.code, v.title
    FROM (VALUES
        ('HEAD_OF_OPERATIONS',        'Head of Operations'),
        ('TL_FINANCIAL_REPORTING',    'Team Lead, Financial Reporting'),
        ('FUND_TREASURY_OPERATIONS',  'Fund & Treasury Operations'),
        ('OPERATIONS_EXECUTIVE',      'Operations Executive'),
        ('OPERATIONS_ASSOCIATE',      'Operations Associate'),
        ('HEAD_HR',                   'Head, Human Resources'),
        ('HR_OPS_MANAGER',            'HR Operations Manager'),
        ('HR_ADMIN',                  'HR Admin'),
        ('HEAD_COMPLIANCE_CORPORATE', 'Head, Compliance & Corporate Services'),
        ('IT_SUPPORT',                'IT Support Officer'),
        ('ADMIN_OFFICER',             'Admin Officer'),
        ('ADMIN_LOGISTICS_OFFICER',   'Admin & Logistics Officer'),
        ('INTERNAL_CONTROL_OFFICER',  'Internal Control Officer'),
        ('TREASURY_OPS_FINANCE_MGR',  'Treasury Operations & Finance Manager')
    ) AS v(code, title)
    WHERE NOT EXISTS (
        SELECT 1 FROM organization.position p WHERE p.subsidiary_id = ss_id AND p.code = v.code
    );

    -- ── Reporting lines ──────────────────────────────────────────────────────

    -- MDs and top function heads → EXECUTIVE_DIRECTOR
    UPDATE organization.position SET reports_to_position_id = ed_id
    WHERE (subsidiary_id = pam_id AND code = 'MANAGING_DIRECTOR')
       OR (subsidiary_id = pc_id  AND code = 'HEAD_OF_INVESTMENT');

    -- PCL secondee positions bypass PCL chain and report directly to ED
    UPDATE organization.position SET reports_to_position_id = ed_id
    WHERE subsidiary_id = pc_id AND code IN ('QUANT_MARKET_ANALYST', 'LEAD_SOFTWARE_ENGINEER');

    -- Shared Service: top three function heads → ED
    UPDATE organization.position SET reports_to_position_id = ed_id
    WHERE subsidiary_id = ss_id
      AND code IN ('HEAD_OF_OPERATIONS', 'HEAD_HR', 'HEAD_COMPLIANCE_CORPORATE');

    -- Operations chain
    UPDATE organization.position SET reports_to_position_id = (
        SELECT id FROM organization.position WHERE subsidiary_id = ss_id AND code = 'HEAD_OF_OPERATIONS'
    ) WHERE subsidiary_id = ss_id
      AND code IN (
          'TL_FINANCIAL_REPORTING', 'FUND_TREASURY_OPERATIONS', 'OPERATIONS_EXECUTIVE',
          -- these two functionally report to PAML MD per the employee register;
          -- the position chain defaults here and assignment_manager_override handles the actual override
          'INTERNAL_CONTROL_OFFICER', 'TREASURY_OPS_FINANCE_MGR'
      );

    UPDATE organization.position SET reports_to_position_id = (
        SELECT id FROM organization.position WHERE subsidiary_id = ss_id AND code = 'OPERATIONS_EXECUTIVE'
    ) WHERE subsidiary_id = ss_id AND code = 'OPERATIONS_ASSOCIATE';

    -- HR chain: both HR_OPS_MANAGER and HR_ADMIN report directly to HEAD_HR
    UPDATE organization.position SET reports_to_position_id = (
        SELECT id FROM organization.position WHERE subsidiary_id = ss_id AND code = 'HEAD_HR'
    ) WHERE subsidiary_id = ss_id AND code IN ('HR_OPS_MANAGER', 'HR_ADMIN');

    -- Compliance chain
    UPDATE organization.position SET reports_to_position_id = (
        SELECT id FROM organization.position WHERE subsidiary_id = ss_id AND code = 'HEAD_COMPLIANCE_CORPORATE'
    ) WHERE subsidiary_id = ss_id AND code IN ('IT_SUPPORT', 'ADMIN_OFFICER', 'ADMIN_LOGISTICS_OFFICER');

    -- PCL: Portfolio Management Assistant → Group Head Business Dev (nearest PCL chain parent)
    -- Functional report to John Ezegbugha (PAML) set via assignment_manager_override post-seed
    UPDATE organization.position SET reports_to_position_id = (
        SELECT id FROM organization.position WHERE subsidiary_id = pc_id AND code = 'GROUP_HEAD_BUSINESS_DEV'
    ) WHERE subsidiary_id = pc_id AND code = 'PORTFOLIO_MGMT_ASSISTANT';

    -- PCL: Trading Research Trainee → TL Research & Risk Management
    UPDATE organization.position SET reports_to_position_id = (
        SELECT id FROM organization.position WHERE subsidiary_id = pc_id AND code = 'TL_RESEARCH_RISK_MGMT'
    ) WHERE subsidiary_id = pc_id AND code = 'TRADING_RESEARCH_TRAINEE';

END $$;
-- +goose StatementEnd

-- ── 5. Person records ─────────────────────────────────────────────────────────
-- Guarded by email to be idempotent.
INSERT INTO organization.person (first_name, last_name, email, home_organization)
SELECT v.fn, v.ln, v.email, v.home_org
FROM (VALUES
    -- PCL
    ('Abideen',          'Mikail',          'Abideen.Mikail@pagecapitalng.com',          'F&G Partners'),
    ('Caleb',            'Ojima',            'ojima.anyagba@pagecapitalng.com',            NULL),
    ('Chinonso',         'Okoroafor',        'Chinonso.Okoroafor@pagecapitalng.com',       'F&G Partners'),
    ('Chinonyerem',      'Amanze',           'chinonyerem.amanze@pagecapitalng.com',       NULL),
    ('Edwin',            'Ojideagu',         'edwin.ojideagu@pagecapitalng.com',           NULL),
    ('Gabriel',          'Odediran',         'Gabriel.Odediran@pageiml.com',               NULL),
    ('Joseph',           'Ehikioya',         'joseph.ehikioya@pagecapitalng.com',          NULL),
    ('Ndifreke',         'Obot',             'ndifreke.obot@pageaml.com',                  NULL),
    ('Oladotun',         'Murele',           'oladotun.murele@pagecapitalng.com',          NULL),
    ('Olatunji',         'Olabodunde',       'oolabodunde@pagecapitalng.com',              NULL),
    ('Otito',            'Esedebe',          'otito.esedebe@pagecapitalng.com',            NULL),
    ('Rachael',          'Oyedele',          'Rachael.Oyedele@pagecapitalng.com',          NULL),
    ('Sarah',            'Egbele',           'Sarah.Egbele@pagecapitalng.com',             NULL),
    ('Victor',           'Akomolafe',        'victor.akomolafe@pagecapitalng.com',         NULL),
    ('Oluwatimilehin',   'Oloketuyi',        'Timi.Oloketuyi@pagecapitalng.com',           NULL),
    -- PAML
    ('Adenike',          'Odesanya',         'adenike.odesanya@pageaml.com',               NULL),
    ('Ahmed',            'Umaru',            'ahmed.umaru@pageaml.com',                    NULL),
    ('Chiamaka',         'Mbachu',           'Chiamaka.Mbachu@pageaml.com',                NULL),
    ('Ebelechukwu',      'Odukwe',           'ebele.odukwe@pageaml.com',                   NULL),
    ('Gabriel',          'Adepoju',          'gabriel.adepoju@pageaml.com',                NULL),
    ('Ifeoluwa',         'Adesina',          'Ifeoluwa.adesina@pageaml.com',               NULL),
    ('John',             'Ezegbugha',        'john.ezegbugha@pageaml.com',                 NULL),
    ('Kehinde',          'Ojetola',          'kehinde.ojetola@pagecapitalng.com',          NULL),
    ('Nneka',            'Sunmonu',          'nneka.sunmonu@pageaml.com',                  NULL),
    ('Segun',            'Agunbiade',        'segun.agunbiade@pageaml.com',                NULL),
    ('Temitope',         'Abimbola-Adio',    'temitope.adio@pageaml.com',                  NULL),
    ('Toyin',            'Akinde',           'toyin.akinde@pageaml.com',                   NULL),
    ('Gbenga',           'Olubayode',        'Gbenga.Olubayode@pageaml.com',               NULL),
    -- SHARED SERVICE
    ('Amos',             'Olanrewaju',       'amos.olanrewaju@pageaml.com',                NULL),
    ('Damilola',         'Osifala',          'damilola.osifala@pageaml.com',               NULL),
    ('Adewale',          'Bamiro',           'Adewale.Bamiro@pagecapitalng.com',           'F&G Partners'),
    ('Olorunjeda',       'Adegbulugbe',      'olorunjeda.adegbulugbe@pagecapitalng.com',   NULL),
    ('Chiamaka',         'Dike',             'chiamaka.dike@pageaml.com',                  NULL),
    ('Halima',           'Yakubu',           'Halima.Yakubu@pageaml.com',                  NULL),
    ('Franca',           'Imene',            'Franca.Imene@pageaml.com',                   NULL),
    ('John',             'Offuna',           'john.offuna@pagecapitalng.com',              NULL),
    ('Obasi',            'Egwu',             'obasi.egwu@pageaml.com',                     NULL),
    ('Olawunmi',         'Oladigbo',         'olawunmi.oladigbo@pageaml.com',              NULL),
    ('Oluwakemi',        'Agboola',          'oluwakemi.agboola@pageaml.com',              NULL),
    ('Udochukwu',        'Okigbo',           'udochukwu.okigbo@pageaml.com',               NULL),
    ('Samuel',           'Fabunmi',          'Samuel.Fabunmi@pageaml.com',                 NULL)
) AS v(fn, ln, email, home_org)
WHERE NOT EXISTS (
    SELECT 1 FROM organization.person p WHERE p.email = v.email
);

-- ── 6. Assignment records ─────────────────────────────────────────────────────
-- +goose StatementBegin
DO $$
DECLARE
    pc_id  uuid;
    pam_id uuid;
    ss_id  uuid;

    -- persons
    p_abideen uuid; p_caleb uuid; p_chinonso uuid; p_chinonyerem uuid;
    p_edwin uuid; p_gabriel_o uuid; p_joseph uuid; p_ndifreke uuid;
    p_oladotun uuid; p_olatunji uuid; p_otito uuid; p_rachael uuid;
    p_sarah uuid; p_victor uuid; p_timi uuid;
    p_adenike uuid; p_ahmed uuid; p_chiamaka_m uuid; p_ebele uuid;
    p_gabriel_a uuid; p_ifeoluwa uuid; p_john_e uuid; p_kehinde uuid;
    p_nneka uuid; p_segun uuid; p_temitope uuid; p_toyin uuid; p_gbenga uuid;
    p_amos uuid; p_damilola uuid; p_adewale uuid; p_olorunjeda uuid;
    p_chiamaka_d uuid; p_halima uuid; p_franca uuid; p_john_o uuid;
    p_obasi uuid; p_olawunmi uuid; p_oluwakemi uuid; p_udochukwu uuid;
    p_samuel uuid;

    -- PCL positions
    pos_quant             uuid; pos_trading_analyst  uuid; pos_lead_sw          uuid;
    pos_grp_biz_dev       uuid; pos_head_risk        uuid; pos_head_invest      uuid;
    pos_invest_trainee    uuid; pos_trading_trainee  uuid; pos_wealth_pc        uuid;
    pos_tl_research       uuid; pos_head_invest_mgmt uuid; pos_portfolio_asst_pc uuid;

    -- PAML positions
    pos_grp_wealth_pam uuid; pos_wealth_pam   uuid; pos_portfolio_mgr uuid;
    pos_equity         uuid; pos_ops_assoc_pam uuid; pos_data_intern   uuid;
    pos_fin_ops_assoc  uuid; pos_md_pam        uuid;

    -- Shared Service positions
    pos_ss_head_ops  uuid; pos_ss_tl_fin    uuid; pos_ss_fund_treas uuid;
    pos_ss_ops_exec  uuid; pos_ss_ops_assoc uuid; pos_ss_head_hr    uuid;
    pos_ss_hr_ops    uuid; pos_ss_hr_admin  uuid; pos_ss_head_comp  uuid;
    pos_ss_it        uuid; pos_ss_admin     uuid; pos_ss_admin_log  uuid;
    pos_ss_int_ctrl  uuid; pos_ss_treas_fin uuid;
BEGIN
    SELECT id INTO pc_id  FROM organization.subsidiary WHERE code = 'PAGE_CAPITAL';
    SELECT id INTO pam_id FROM organization.subsidiary WHERE code = 'PAGE_ASSET_MGMT';
    SELECT id INTO ss_id  FROM organization.subsidiary WHERE code = 'SHARED_SERVICE';

    -- Load persons by email
    SELECT id INTO p_abideen       FROM organization.person WHERE email = 'Abideen.Mikail@pagecapitalng.com';
    SELECT id INTO p_caleb         FROM organization.person WHERE email = 'ojima.anyagba@pagecapitalng.com';
    SELECT id INTO p_chinonso      FROM organization.person WHERE email = 'Chinonso.Okoroafor@pagecapitalng.com';
    SELECT id INTO p_chinonyerem   FROM organization.person WHERE email = 'chinonyerem.amanze@pagecapitalng.com';
    SELECT id INTO p_edwin         FROM organization.person WHERE email = 'edwin.ojideagu@pagecapitalng.com';
    SELECT id INTO p_gabriel_o     FROM organization.person WHERE email = 'Gabriel.Odediran@pageiml.com';
    SELECT id INTO p_joseph        FROM organization.person WHERE email = 'joseph.ehikioya@pagecapitalng.com';
    SELECT id INTO p_ndifreke      FROM organization.person WHERE email = 'ndifreke.obot@pageaml.com';
    SELECT id INTO p_oladotun      FROM organization.person WHERE email = 'oladotun.murele@pagecapitalng.com';
    SELECT id INTO p_olatunji      FROM organization.person WHERE email = 'oolabodunde@pagecapitalng.com';
    SELECT id INTO p_otito         FROM organization.person WHERE email = 'otito.esedebe@pagecapitalng.com';
    SELECT id INTO p_rachael       FROM organization.person WHERE email = 'Rachael.Oyedele@pagecapitalng.com';
    SELECT id INTO p_sarah         FROM organization.person WHERE email = 'Sarah.Egbele@pagecapitalng.com';
    SELECT id INTO p_victor        FROM organization.person WHERE email = 'victor.akomolafe@pagecapitalng.com';
    SELECT id INTO p_timi          FROM organization.person WHERE email = 'Timi.Oloketuyi@pagecapitalng.com';
    SELECT id INTO p_adenike       FROM organization.person WHERE email = 'adenike.odesanya@pageaml.com';
    SELECT id INTO p_ahmed         FROM organization.person WHERE email = 'ahmed.umaru@pageaml.com';
    SELECT id INTO p_chiamaka_m    FROM organization.person WHERE email = 'Chiamaka.Mbachu@pageaml.com';
    SELECT id INTO p_ebele         FROM organization.person WHERE email = 'ebele.odukwe@pageaml.com';
    SELECT id INTO p_gabriel_a     FROM organization.person WHERE email = 'gabriel.adepoju@pageaml.com';
    SELECT id INTO p_ifeoluwa      FROM organization.person WHERE email = 'Ifeoluwa.adesina@pageaml.com';
    SELECT id INTO p_john_e        FROM organization.person WHERE email = 'john.ezegbugha@pageaml.com';
    SELECT id INTO p_kehinde       FROM organization.person WHERE email = 'kehinde.ojetola@pagecapitalng.com';
    SELECT id INTO p_nneka         FROM organization.person WHERE email = 'nneka.sunmonu@pageaml.com';
    SELECT id INTO p_segun         FROM organization.person WHERE email = 'segun.agunbiade@pageaml.com';
    SELECT id INTO p_temitope      FROM organization.person WHERE email = 'temitope.adio@pageaml.com';
    SELECT id INTO p_toyin         FROM organization.person WHERE email = 'toyin.akinde@pageaml.com';
    SELECT id INTO p_gbenga        FROM organization.person WHERE email = 'Gbenga.Olubayode@pageaml.com';
    SELECT id INTO p_amos          FROM organization.person WHERE email = 'amos.olanrewaju@pageaml.com';
    SELECT id INTO p_damilola      FROM organization.person WHERE email = 'damilola.osifala@pageaml.com';
    SELECT id INTO p_adewale       FROM organization.person WHERE email = 'Adewale.Bamiro@pagecapitalng.com';
    SELECT id INTO p_olorunjeda    FROM organization.person WHERE email = 'olorunjeda.adegbulugbe@pagecapitalng.com';
    SELECT id INTO p_chiamaka_d    FROM organization.person WHERE email = 'chiamaka.dike@pageaml.com';
    SELECT id INTO p_halima        FROM organization.person WHERE email = 'Halima.Yakubu@pageaml.com';
    SELECT id INTO p_franca        FROM organization.person WHERE email = 'Franca.Imene@pageaml.com';
    SELECT id INTO p_john_o        FROM organization.person WHERE email = 'john.offuna@pagecapitalng.com';
    SELECT id INTO p_obasi         FROM organization.person WHERE email = 'obasi.egwu@pageaml.com';
    SELECT id INTO p_olawunmi      FROM organization.person WHERE email = 'olawunmi.oladigbo@pageaml.com';
    SELECT id INTO p_oluwakemi     FROM organization.person WHERE email = 'oluwakemi.agboola@pageaml.com';
    SELECT id INTO p_udochukwu     FROM organization.person WHERE email = 'udochukwu.okigbo@pageaml.com';
    SELECT id INTO p_samuel        FROM organization.person WHERE email = 'Samuel.Fabunmi@pageaml.com';

    -- Load PCL positions
    SELECT id INTO pos_quant             FROM organization.position WHERE subsidiary_id = pc_id AND code = 'QUANT_MARKET_ANALYST';
    SELECT id INTO pos_trading_analyst   FROM organization.position WHERE subsidiary_id = pc_id AND code = 'TRADING_RESEARCH_ANALYST';
    SELECT id INTO pos_lead_sw           FROM organization.position WHERE subsidiary_id = pc_id AND code = 'LEAD_SOFTWARE_ENGINEER';
    SELECT id INTO pos_grp_biz_dev       FROM organization.position WHERE subsidiary_id = pc_id AND code = 'GROUP_HEAD_BUSINESS_DEV';
    SELECT id INTO pos_head_risk         FROM organization.position WHERE subsidiary_id = pc_id AND code = 'HEAD_RISK_TRADE_MGMT';
    SELECT id INTO pos_head_invest       FROM organization.position WHERE subsidiary_id = pc_id AND code = 'HEAD_OF_INVESTMENT';
    SELECT id INTO pos_invest_trainee    FROM organization.position WHERE subsidiary_id = pc_id AND code = 'INVESTMENT_RESEARCH_TRAINEE';
    SELECT id INTO pos_trading_trainee   FROM organization.position WHERE subsidiary_id = pc_id AND code = 'TRADING_RESEARCH_TRAINEE';
    SELECT id INTO pos_wealth_pc         FROM organization.position WHERE subsidiary_id = pc_id AND code = 'WEALTH_MANAGER';
    SELECT id INTO pos_tl_research       FROM organization.position WHERE subsidiary_id = pc_id AND code = 'TL_RESEARCH_RISK_MGMT';
    SELECT id INTO pos_head_invest_mgmt  FROM organization.position WHERE subsidiary_id = pc_id AND code = 'HEAD_INVESTMENT_MGMT';
    SELECT id INTO pos_portfolio_asst_pc FROM organization.position WHERE subsidiary_id = pc_id AND code = 'PORTFOLIO_MGMT_ASSISTANT';

    -- Load PAML positions
    SELECT id INTO pos_grp_wealth_pam FROM organization.position WHERE subsidiary_id = pam_id AND code = 'GROUP_HEAD_WEALTH_MGMT';
    SELECT id INTO pos_wealth_pam     FROM organization.position WHERE subsidiary_id = pam_id AND code = 'WEALTH_MANAGER';
    SELECT id INTO pos_portfolio_mgr  FROM organization.position WHERE subsidiary_id = pam_id AND code = 'PORTFOLIO_MANAGER';
    SELECT id INTO pos_equity         FROM organization.position WHERE subsidiary_id = pam_id AND code = 'EQUITY_TRADER';
    SELECT id INTO pos_ops_assoc_pam  FROM organization.position WHERE subsidiary_id = pam_id AND code = 'OPERATIONS_ASSOCIATE';
    SELECT id INTO pos_data_intern    FROM organization.position WHERE subsidiary_id = pam_id AND code = 'DATA_ANALYST_INTERN';
    SELECT id INTO pos_fin_ops_assoc  FROM organization.position WHERE subsidiary_id = pam_id AND code = 'FINANCE_OPS_ASSOCIATE';
    SELECT id INTO pos_md_pam         FROM organization.position WHERE subsidiary_id = pam_id AND code = 'MANAGING_DIRECTOR';

    -- Load Shared Service positions
    SELECT id INTO pos_ss_head_ops  FROM organization.position WHERE subsidiary_id = ss_id AND code = 'HEAD_OF_OPERATIONS';
    SELECT id INTO pos_ss_tl_fin    FROM organization.position WHERE subsidiary_id = ss_id AND code = 'TL_FINANCIAL_REPORTING';
    SELECT id INTO pos_ss_fund_treas FROM organization.position WHERE subsidiary_id = ss_id AND code = 'FUND_TREASURY_OPERATIONS';
    SELECT id INTO pos_ss_ops_exec  FROM organization.position WHERE subsidiary_id = ss_id AND code = 'OPERATIONS_EXECUTIVE';
    SELECT id INTO pos_ss_ops_assoc FROM organization.position WHERE subsidiary_id = ss_id AND code = 'OPERATIONS_ASSOCIATE';
    SELECT id INTO pos_ss_head_hr   FROM organization.position WHERE subsidiary_id = ss_id AND code = 'HEAD_HR';
    SELECT id INTO pos_ss_hr_ops    FROM organization.position WHERE subsidiary_id = ss_id AND code = 'HR_OPS_MANAGER';
    SELECT id INTO pos_ss_hr_admin  FROM organization.position WHERE subsidiary_id = ss_id AND code = 'HR_ADMIN';
    SELECT id INTO pos_ss_head_comp FROM organization.position WHERE subsidiary_id = ss_id AND code = 'HEAD_COMPLIANCE_CORPORATE';
    SELECT id INTO pos_ss_it        FROM organization.position WHERE subsidiary_id = ss_id AND code = 'IT_SUPPORT';
    SELECT id INTO pos_ss_admin     FROM organization.position WHERE subsidiary_id = ss_id AND code = 'ADMIN_OFFICER';
    SELECT id INTO pos_ss_admin_log FROM organization.position WHERE subsidiary_id = ss_id AND code = 'ADMIN_LOGISTICS_OFFICER';
    SELECT id INTO pos_ss_int_ctrl  FROM organization.position WHERE subsidiary_id = ss_id AND code = 'INTERNAL_CONTROL_OFFICER';
    SELECT id INTO pos_ss_treas_fin FROM organization.position WHERE subsidiary_id = ss_id AND code = 'TREASURY_OPS_FINANCE_MGR';

    -- Insert assignments, skipping any person already assigned to that subsidiary
    INSERT INTO organization.assignment
        (person_id, position_id, subsidiary_id, effective_from, is_primary, employment_type)
    SELECT a.person_id, a.pos_id, a.sub_id, '2026-08-22', true, a.etype
    FROM (VALUES
        -- ── Page Capital ──────────────────────────────────────────────────────
        (p_abideen,       pos_quant,            pc_id,  'secondee'),
        (p_caleb,         pos_trading_analyst,  pc_id,  'permanent'),
        (p_chinonso,      pos_lead_sw,          pc_id,  'secondee'),
        (p_chinonyerem,   pos_grp_biz_dev,      pc_id,  'permanent'),
        (p_edwin,         pos_head_risk,        pc_id,  'permanent'),
        (p_gabriel_o,     pos_head_invest,      pc_id,  'permanent'),
        (p_joseph,        pos_trading_trainee,  pc_id,  'permanent'),
        (p_ndifreke,      pos_wealth_pc,        pc_id,  'permanent'),
        (p_oladotun,      pos_tl_research,      pc_id,  'permanent'),
        (p_olatunji,      pos_head_invest_mgmt, pc_id,  'permanent'),
        (p_otito,         pos_tl_research,      pc_id,  'permanent'),
        (p_rachael,       pos_wealth_pc,        pc_id,  'permanent'),
        (p_sarah,         pos_wealth_pc,        pc_id,  'permanent'),
        (p_victor,        pos_invest_trainee,   pc_id,  'permanent'),
        (p_timi,          pos_portfolio_asst_pc, pc_id, 'permanent'),
        -- ── Page Asset Management ─────────────────────────────────────────────
        (p_adenike,       pos_grp_wealth_pam,   pam_id, 'permanent'),
        (p_ahmed,         pos_wealth_pam,        pam_id, 'permanent'),
        (p_chiamaka_m,    pos_wealth_pam,        pam_id, 'permanent'),
        (p_ebele,         pos_wealth_pam,        pam_id, 'permanent'),
        (p_gabriel_a,     pos_ops_assoc_pam,     pam_id, 'permanent'),
        (p_ifeoluwa,      pos_data_intern,       pam_id, 'intern'),
        (p_john_e,        pos_portfolio_mgr,     pam_id, 'permanent'),
        (p_kehinde,       pos_fin_ops_assoc,     pam_id, 'permanent'),
        (p_nneka,         pos_wealth_pam,        pam_id, 'permanent'),
        (p_segun,         pos_wealth_pam,        pam_id, 'permanent'),
        (p_temitope,      pos_wealth_pam,        pam_id, 'permanent'),
        (p_toyin,         pos_md_pam,            pam_id, 'permanent'),
        (p_gbenga,        pos_equity,            pam_id, 'permanent'),
        -- ── Shared Service ────────────────────────────────────────────────────
        (p_amos,          pos_ss_head_ops,       ss_id,  'permanent'),
        (p_damilola,      pos_ss_tl_fin,         ss_id,  'permanent'),
        (p_adewale,       pos_ss_head_hr,        ss_id,  'secondee'),
        (p_olorunjeda,    pos_ss_hr_ops,         ss_id,  'permanent'),
        (p_chiamaka_d,    pos_ss_hr_admin,       ss_id,  'permanent'),
        (p_halima,        pos_ss_it,             ss_id,  'permanent'),
        (p_franca,        pos_ss_admin,          ss_id,  'permanent'),
        (p_john_o,        pos_ss_admin_log,      ss_id,  'permanent'),
        (p_obasi,         pos_ss_fund_treas,     ss_id,  'permanent'),
        (p_olawunmi,      pos_ss_int_ctrl,       ss_id,  'permanent'),
        (p_oluwakemi,     pos_ss_ops_exec,       ss_id,  'permanent'),
        (p_udochukwu,     pos_ss_head_comp,      ss_id,  'permanent'),
        (p_samuel,        pos_ss_treas_fin,      ss_id,  'permanent')
    ) AS a(person_id, pos_id, sub_id, etype)
    WHERE NOT EXISTS (
        SELECT 1 FROM organization.assignment x
        WHERE x.person_id = a.person_id
          AND x.subsidiary_id = a.sub_id
          AND x.effective_to IS NULL
    );

END $$;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DO $$
DECLARE
    ss_id uuid;
BEGIN
    SELECT id INTO ss_id FROM organization.subsidiary WHERE code = 'SHARED_SERVICE';

    -- Remove assignments for all seeded persons
    DELETE FROM organization.assignment
    WHERE person_id IN (
        SELECT id FROM organization.person WHERE email IN (
            'Abideen.Mikail@pagecapitalng.com','ojima.anyagba@pagecapitalng.com',
            'Chinonso.Okoroafor@pagecapitalng.com','chinonyerem.amanze@pagecapitalng.com',
            'edwin.ojideagu@pagecapitalng.com','Gabriel.Odediran@pageiml.com',
            'joseph.ehikioya@pagecapitalng.com','ndifreke.obot@pageaml.com',
            'oladotun.murele@pagecapitalng.com','oolabodunde@pagecapitalng.com',
            'otito.esedebe@pagecapitalng.com','Rachael.Oyedele@pagecapitalng.com',
            'Sarah.Egbele@pagecapitalng.com','victor.akomolafe@pagecapitalng.com',
            'Timi.Oloketuyi@pagecapitalng.com','adenike.odesanya@pageaml.com',
            'ahmed.umaru@pageaml.com','Chiamaka.Mbachu@pageaml.com',
            'ebele.odukwe@pageaml.com','gabriel.adepoju@pageaml.com',
            'Ifeoluwa.adesina@pageaml.com','john.ezegbugha@pageaml.com',
            'kehinde.ojetola@pagecapitalng.com','nneka.sunmonu@pageaml.com',
            'segun.agunbiade@pageaml.com','temitope.adio@pageaml.com',
            'toyin.akinde@pageaml.com','Gbenga.Olubayode@pageaml.com',
            'amos.olanrewaju@pageaml.com','damilola.osifala@pageaml.com',
            'Adewale.Bamiro@pagecapitalng.com','olorunjeda.adegbulugbe@pagecapitalng.com',
            'chiamaka.dike@pageaml.com','Halima.Yakubu@pageaml.com',
            'Franca.Imene@pageaml.com','john.offuna@pagecapitalng.com',
            'obasi.egwu@pageaml.com','olawunmi.oladigbo@pageaml.com',
            'oluwakemi.agboola@pageaml.com','udochukwu.okigbo@pageaml.com',
            'Samuel.Fabunmi@pageaml.com'
        )
    );

    -- Remove positions under SHARED_SERVICE (foreign key safe after assignment removal)
    DELETE FROM organization.position WHERE subsidiary_id = ss_id;

    -- Remove SHARED_SERVICE subsidiary
    DELETE FROM organization.subsidiary WHERE code = 'SHARED_SERVICE';

    -- Remove EXECUTIVE_DIRECTOR group position
    DELETE FROM organization.position WHERE code = 'EXECUTIVE_DIRECTOR' AND subsidiary_id IS NULL;

    -- Remove seeded persons
    DELETE FROM organization.person WHERE email IN (
        'Abideen.Mikail@pagecapitalng.com','ojima.anyagba@pagecapitalng.com',
        'Chinonso.Okoroafor@pagecapitalng.com','chinonyerem.amanze@pagecapitalng.com',
        'edwin.ojideagu@pagecapitalng.com','Gabriel.Odediran@pageiml.com',
        'joseph.ehikioya@pagecapitalng.com','ndifreke.obot@pageaml.com',
        'oladotun.murele@pagecapitalng.com','oolabodunde@pagecapitalng.com',
        'otito.esedebe@pagecapitalng.com','Rachael.Oyedele@pagecapitalng.com',
        'Sarah.Egbele@pagecapitalng.com','victor.akomolafe@pagecapitalng.com',
        'Timi.Oloketuyi@pagecapitalng.com','adenike.odesanya@pageaml.com',
        'ahmed.umaru@pageaml.com','Chiamaka.Mbachu@pageaml.com',
        'ebele.odukwe@pageaml.com','gabriel.adepoju@pageaml.com',
        'Ifeoluwa.adesina@pageaml.com','john.ezegbugha@pageaml.com',
        'kehinde.ojetola@pagecapitalng.com','nneka.sunmonu@pageaml.com',
        'segun.agunbiade@pageaml.com','temitope.adio@pageaml.com',
        'toyin.akinde@pageaml.com','Gbenga.Olubayode@pageaml.com',
        'amos.olanrewaju@pageaml.com','damilola.osifala@pageaml.com',
        'Adewale.Bamiro@pagecapitalng.com','olorunjeda.adegbulugbe@pagecapitalng.com',
        'chiamaka.dike@pageaml.com','Halima.Yakubu@pageaml.com',
        'Franca.Imene@pageaml.com','john.offuna@pagecapitalng.com',
        'obasi.egwu@pageaml.com','olawunmi.oladigbo@pageaml.com',
        'oluwakemi.agboola@pageaml.com','udochukwu.okigbo@pageaml.com',
        'Samuel.Fabunmi@pageaml.com'
    );

END $$;
-- +goose StatementEnd

-- Remove added PCL positions
DELETE FROM organization.position
WHERE subsidiary_id = (SELECT id FROM organization.subsidiary WHERE code = 'PAGE_CAPITAL')
  AND code IN ('PORTFOLIO_MGMT_ASSISTANT', 'TRADING_RESEARCH_TRAINEE');

-- Drop added columns
ALTER TABLE organization.assignment DROP COLUMN IF EXISTS employment_type;
ALTER TABLE organization.person     DROP COLUMN IF EXISTS home_organization;
