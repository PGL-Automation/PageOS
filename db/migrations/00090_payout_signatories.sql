-- +goose Up
-- Create the bank signatory and CEO positions needed by the payout approval
-- routing engine.  Bank signatories are created per subsidiary (each
-- subsidiary has its own bank mandate).  CEO is group-level (subsidiary_id NULL).

-- ── Bank signatory positions ──────────────────────────────────────────────────
-- BANK_SIGNATORY_1 and BANK_SIGNATORY_2 represent the two signatories on each
-- subsidiary's bank mandate.  People are assigned to these positions by Nonso
-- after the board resolution and specimen signatures are received.

INSERT INTO organization.position (subsidiary_id, code, title, family)
SELECT s.id, 'BANK_SIGNATORY_1', 'Bank Signatory 1', 'finance'
FROM   organization.subsidiary s
ON CONFLICT DO NOTHING;

INSERT INTO organization.position (subsidiary_id, code, title, family)
SELECT s.id, 'BANK_SIGNATORY_2', 'Bank Signatory 2', 'finance'
FROM   organization.subsidiary s
ON CONFLICT DO NOTHING;

-- ── CEO position (group-level, for expenses > ₦1 m) ──────────────────────────
INSERT INTO organization.position (subsidiary_id, code, title, family)
VALUES (NULL, 'CEO', 'Chief Executive Officer', 'md')
ON CONFLICT DO NOTHING;

-- +goose Down
DELETE FROM organization.position WHERE code IN ('BANK_SIGNATORY_1','BANK_SIGNATORY_2','CEO');
