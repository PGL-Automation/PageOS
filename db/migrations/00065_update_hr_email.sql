-- +goose Up
-- Update the seeded HR Manager account from the old PageGroup email to the AML email.
-- Safe to run multiple times (no-op if the old email no longer exists).
UPDATE identity.users
SET    email = 'hr@pageaml.com'
WHERE  lower(email) = 'hr@pagegroup.ng';

-- Also update the linked organization.person record so email is consistent.
UPDATE organization.person
SET    email = 'hr@pageaml.com'
WHERE  lower(email) = 'hr@pagegroup.ng';

-- +goose Down
UPDATE identity.users  SET email = 'hr@pagegroup.ng' WHERE lower(email) = 'hr@pageaml.com';
UPDATE organization.person SET email = 'hr@pagegroup.ng' WHERE lower(email) = 'hr@pageaml.com';
