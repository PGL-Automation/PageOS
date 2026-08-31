-- +goose Up
-- Restrict Study Leave and Leave of Absence to the appropriate grade bands.
--
-- Grade bands (from company job-title register):
--   Junior   : INTERN, NYSC, GRADUATE_TRAINEE, ANALYST, ASSOCIATE,
--               EXECUTIVE_ASSOCIATE, SENIOR_EXEC_ASSOCIATE,
--               FG_CONSULTANT, FG_EXEC_CONSULTANT, SENIOR_EXEC_CONSULTANT
--   Mid      : ASSISTANT_MANAGER, DEPUTY_MANAGER, MANAGER, SENIOR_MANAGER
--   Senior   : AVP, VP, SVP
--
-- Study Leave (Short) — available from mid-level upward (ASSISTANT_MANAGER+)
UPDATE hr.leave_policy
SET    applicable_grades = ARRAY[
    'ASSISTANT_MANAGER','DEPUTY_MANAGER',
    'MANAGER','SENIOR_MANAGER',
    'AVP','VP','SVP'
]
WHERE  code = 'STUDY_L1';

-- Study Leave (Long) — available from MANAGER upward only
UPDATE hr.leave_policy
SET    applicable_grades = ARRAY[
    'MANAGER','SENIOR_MANAGER',
    'AVP','VP','SVP'
]
WHERE  code = 'STUDY_L2';

-- Leave of Absence — senior management only (AVP and above)
UPDATE hr.leave_policy
SET    applicable_grades = ARRAY['AVP','VP','SVP']
WHERE  code = 'LEAVE_ABSENCE';

-- +goose Down
-- Restore all three policies to universal visibility (original state)
UPDATE hr.leave_policy
SET    applicable_grades = NULL
WHERE  code IN ('STUDY_L1','STUDY_L2','LEAVE_ABSENCE');
