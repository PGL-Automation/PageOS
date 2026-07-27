-- +goose Up
-- Ensure Page Capital Ltd subsidiary and its three approval-chain positions
-- exist. Works on both fresh databases and ones with existing smoke-test data.

-- +goose StatementBegin
DO $$
DECLARE
    sub_id uuid;
BEGIN
    -- Find existing subsidiary or create it
    SELECT id INTO sub_id FROM organization.subsidiary WHERE code = 'PAGE_CAPITAL';
    IF sub_id IS NULL THEN
        INSERT INTO organization.subsidiary (code, name)
        VALUES ('PAGE_CAPITAL', 'Page Capital Ltd')
        RETURNING id INTO sub_id;
    END IF;

    -- Add any missing positions
    IF NOT EXISTS (SELECT 1 FROM organization.position WHERE subsidiary_id = sub_id AND code = 'WEALTH_MANAGER') THEN
        INSERT INTO organization.position (subsidiary_id, code, title)
        VALUES (sub_id, 'WEALTH_MANAGER', 'Wealth Manager');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM organization.position WHERE subsidiary_id = sub_id AND code = 'MANAGING_DIRECTOR') THEN
        INSERT INTO organization.position (subsidiary_id, code, title)
        VALUES (sub_id, 'MANAGING_DIRECTOR', 'Managing Director');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM organization.position WHERE subsidiary_id = sub_id AND code = 'COMPLIANCE_MANAGER') THEN
        INSERT INTO organization.position (subsidiary_id, code, title)
        VALUES (sub_id, 'COMPLIANCE_MANAGER', 'Compliance Manager');
    END IF;
END $$;
-- +goose StatementEnd

-- +goose Down
-- Intentionally left blank: seed data is not destructively removed on rollback.
SELECT 1;
