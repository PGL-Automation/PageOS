-- +goose Up
-- Group-level positions and HR department.
-- These are shared infrastructure that spans all subsidiaries.
-- The super-admin user is created at startup by the Go seed function (main.go),
-- not here, because password hashing (argon2id) requires Go code.

-- Group-level HR department (subsidiary_id = NULL means it spans all subsidiaries).
-- We store it under the first subsidiary for the foreign key but treat it logically
-- as group-level; the position table carries the real group flag.
INSERT INTO organization.department (subsidiary_id, code, name)
SELECT id, 'HR', 'Human Resources'
FROM organization.subsidiary
WHERE code = 'PAGE_CAPITAL'
ON CONFLICT DO NOTHING;

-- Group-level positions (subsidiary_id IS NULL = belongs to no single subsidiary).
INSERT INTO organization.position (subsidiary_id, code, title)
VALUES
    (NULL, 'GROUP_ADMIN',    'Group Administrator'),
    (NULL, 'HR_MANAGER',     'HR Manager'),
    (NULL, 'HR_OFFICER',     'HR Officer'),
    (NULL, 'IT_ADMIN',       'IT Administrator'),
    (NULL, 'GROUP_FINANCE',  'Group Finance Officer')
ON CONFLICT DO NOTHING;

-- +goose Down
DELETE FROM organization.position
WHERE code IN ('GROUP_ADMIN','HR_MANAGER','HR_OFFICER','IT_ADMIN','GROUP_FINANCE');
