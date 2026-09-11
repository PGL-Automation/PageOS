-- +goose Up
-- Auto-inherit department family when creating a new position
CREATE OR REPLACE FUNCTION organization.inherit_position_family()
RETURNS TRIGGER AS $$
BEGIN
  -- Only set family from department if the caller left it as 'default'
  IF NEW.family = 'default' AND NEW.department_id IS NOT NULL THEN
    SELECT family INTO NEW.family
    FROM organization.department
    WHERE id = NEW.department_id;
    IF NEW.family IS NULL THEN NEW.family := 'default'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inherit_position_family ON organization.position;
CREATE TRIGGER trg_inherit_position_family
  BEFORE INSERT ON organization.position
  FOR EACH ROW EXECUTE FUNCTION organization.inherit_position_family();

-- +goose Down
DROP TRIGGER IF EXISTS trg_inherit_position_family ON organization.position;
DROP FUNCTION IF EXISTS organization.inherit_position_family();
