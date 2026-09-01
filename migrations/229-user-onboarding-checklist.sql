-- Interactive onboarding checklist progress tracking for users.
-- Stores which onboarding steps a user has completed (JSONB map of
-- stepKey -> boolean) plus the timestamp when all steps were finished.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_progress JSONB DEFAULT '{}'::jsonb;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMP;

COMMENT ON COLUMN users.onboarding_progress IS 'Map of onboarding checklist stepKey -> boolean, tracking which setup steps the user has completed';
COMMENT ON COLUMN users.onboarding_completed_at IS 'Timestamp when the user finished every step of the onboarding checklist; NULL while incomplete';

COMMIT;
