-- ── Clients ─────────────────────────────────────────────────────────────────

-- name: CreateClient :one
INSERT INTO onboarding.client (subsidiary_id, client_type, display_name, broker_id)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetClient :one
SELECT * FROM onboarding.client WHERE id = $1;

-- name: ListClients :many
SELECT * FROM onboarding.client
WHERE subsidiary_id = $1
ORDER BY display_name;

-- name: UpdateClientStatus :one
UPDATE onboarding.client SET status = $2, updated_at = now()
WHERE id = $1
RETURNING *;

-- ── Cases ────────────────────────────────────────────────────────────────────

-- name: CreateCase :one
INSERT INTO onboarding.onboarding_case
    (client_id, subsidiary_id, client_type, requirement_set_version, initiated_by)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetCase :one
SELECT * FROM onboarding.onboarding_case WHERE id = $1;

-- name: ListCasesByClient :many
SELECT * FROM onboarding.onboarding_case WHERE client_id = $1 ORDER BY created_at DESC;

-- name: ListCasesBySubsidiary :many
SELECT * FROM onboarding.onboarding_case
WHERE subsidiary_id = $1 AND state = $2
ORDER BY created_at DESC;

-- name: ListAllCasesBySubsidiary :many
SELECT * FROM onboarding.onboarding_case
WHERE subsidiary_id = $1
ORDER BY created_at DESC;

-- name: UpdateCaseState :one
UPDATE onboarding.onboarding_case
SET state = $2, updated_at = now()
WHERE id = $1
RETURNING *;

-- name: SubmitCase :one
UPDATE onboarding.onboarding_case
SET state = 'submitted', submitted_at = now(), updated_at = now()
WHERE id = $1 AND state = 'draft'
RETURNING *;

-- name: SetCaseRiskFlag :exec
UPDATE onboarding.onboarding_case
SET risk_flag = $2, risk_notes = $3, updated_at = now()
WHERE id = $1;

-- name: ReturnCase :one
UPDATE onboarding.onboarding_case
SET state = 'draft',
    return_count = return_count + 1,
    return_notes = $2,
    updated_at   = now()
WHERE id = $1
RETURNING *;

-- ── Application data ─────────────────────────────────────────────────────────

-- name: UpsertApplicationData :one
INSERT INTO onboarding.application_data (case_id,
    full_name, gender, mothers_maiden_name, date_of_birth,
    place_of_birth, country_of_origin, place_of_residence, residential_address,
    is_us_person, us_address, phone_numbers, email, tin,
    next_of_kin_name, next_of_kin_email, next_of_kin_phone,
    employer, employer_address, official_email, official_phone,
    is_pep, pep_position, pep_period, social_media,
    source_of_funds, source_of_wealth, investment_purpose,
    investment_amount_kobo, investment_amount_words, tenor, interest_rate_bps,
    bank_name, bank_account_name, bank_account_number, bvn, sort_code,
    declaration_legal_capacity, declaration_info_correct,
    declaration_tnc_accepted, declaration_min_holding)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
        $20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,
        $37,$38,$39,$40,$41)
ON CONFLICT (case_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    gender = EXCLUDED.gender,
    mothers_maiden_name = EXCLUDED.mothers_maiden_name,
    date_of_birth = EXCLUDED.date_of_birth,
    place_of_birth = EXCLUDED.place_of_birth,
    country_of_origin = EXCLUDED.country_of_origin,
    place_of_residence = EXCLUDED.place_of_residence,
    residential_address = EXCLUDED.residential_address,
    is_us_person = EXCLUDED.is_us_person,
    us_address = EXCLUDED.us_address,
    phone_numbers = EXCLUDED.phone_numbers,
    email = EXCLUDED.email,
    tin = EXCLUDED.tin,
    next_of_kin_name = EXCLUDED.next_of_kin_name,
    next_of_kin_email = EXCLUDED.next_of_kin_email,
    next_of_kin_phone = EXCLUDED.next_of_kin_phone,
    employer = EXCLUDED.employer,
    employer_address = EXCLUDED.employer_address,
    official_email = EXCLUDED.official_email,
    official_phone = EXCLUDED.official_phone,
    is_pep = EXCLUDED.is_pep,
    pep_position = EXCLUDED.pep_position,
    pep_period = EXCLUDED.pep_period,
    social_media = EXCLUDED.social_media,
    source_of_funds = EXCLUDED.source_of_funds,
    source_of_wealth = EXCLUDED.source_of_wealth,
    investment_purpose = EXCLUDED.investment_purpose,
    investment_amount_kobo = EXCLUDED.investment_amount_kobo,
    investment_amount_words = EXCLUDED.investment_amount_words,
    tenor = EXCLUDED.tenor,
    interest_rate_bps = EXCLUDED.interest_rate_bps,
    bank_name = EXCLUDED.bank_name,
    bank_account_name = EXCLUDED.bank_account_name,
    bank_account_number = EXCLUDED.bank_account_number,
    bvn = EXCLUDED.bvn,
    sort_code = EXCLUDED.sort_code,
    declaration_legal_capacity = EXCLUDED.declaration_legal_capacity,
    declaration_info_correct = EXCLUDED.declaration_info_correct,
    declaration_tnc_accepted = EXCLUDED.declaration_tnc_accepted,
    declaration_min_holding = EXCLUDED.declaration_min_holding,
    updated_at = now()
RETURNING *;

-- name: GetApplicationData :one
SELECT * FROM onboarding.application_data WHERE case_id = $1;

-- ── Requirement instances ─────────────────────────────────────────────────────

-- name: UpsertRequirementInstance :one
INSERT INTO onboarding.requirement_instance
    (case_id, requirement_key, label, category, obligation, status)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (case_id, requirement_key) DO UPDATE SET
    label       = EXCLUDED.label,
    obligation  = EXCLUDED.obligation,
    status      = EXCLUDED.status
RETURNING *;

-- name: SatisfyRequirementWithDocument :one
UPDATE onboarding.requirement_instance
SET status = 'satisfied', document_id = $3, satisfied_at = now()
WHERE case_id = $1 AND requirement_key = $2
RETURNING *;

-- name: ListRequirementInstances :many
SELECT * FROM onboarding.requirement_instance WHERE case_id = $1 ORDER BY created_at;

-- ── RM–Client ─────────────────────────────────────────────────────────────────

-- name: CreateRMClientLink :one
INSERT INTO onboarding.rm_client (client_id, rm_person_id, subsidiary_id, assigned_by)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: EndRMClientLink :exec
UPDATE onboarding.rm_client
SET ended_at = now()
WHERE client_id = $1 AND ended_at IS NULL;

-- name: GetActiveRMForClient :one
SELECT * FROM onboarding.rm_client
WHERE client_id = $1 AND ended_at IS NULL;

-- name: ListActiveClientsByRM :many
SELECT c.* FROM onboarding.client c
JOIN onboarding.rm_client r ON r.client_id = c.id
WHERE r.rm_person_id = $1 AND r.ended_at IS NULL
ORDER BY c.display_name;

-- ── Compliance ────────────────────────────────────────────────────────────────

-- name: UpsertComplianceCheck :one
INSERT INTO onboarding.compliance_check
    (case_id, check_type, outcome, notes, source, performed_by)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (case_id, check_type) DO UPDATE SET
    outcome = EXCLUDED.outcome,
    notes = EXCLUDED.notes,
    source = EXCLUDED.source,
    performed_by = EXCLUDED.performed_by,
    performed_at = now()
RETURNING *;

-- name: ListComplianceChecksByCase :many
SELECT * FROM onboarding.compliance_check
WHERE case_id = $1 ORDER BY performed_at;

-- name: GetClientEmailByCase :one
SELECT c.display_name, a.email
FROM onboarding.onboarding_case oc
JOIN onboarding.client c ON c.id = oc.client_id
JOIN onboarding.application_data a ON a.case_id = oc.id
WHERE oc.id = $1;

