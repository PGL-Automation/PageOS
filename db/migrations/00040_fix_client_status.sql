-- +goose Up
-- Fix clients whose onboarding case is 'approved' but whose status was not
-- updated to 'active' due to a silent error in HandleApprovalEvent.
UPDATE onboarding.client c
SET    status     = 'active',
       updated_at = now()
WHERE  c.status != 'active'
  AND  EXISTS (
      SELECT 1 FROM onboarding.onboarding_case oc
      WHERE  oc.client_id = c.id
        AND  oc.state     = 'approved'
  );

-- +goose Down
-- Cannot safely reverse this without knowing the original statuses.
