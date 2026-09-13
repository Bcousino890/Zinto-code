-- Persist Stripe catalog mappings on their source records.
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS stripe_product_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_plan_coupon_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_sync_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS stripe_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS stripe_synced_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS stripe_sync_fingerprint TEXT;

ALTER TABLE coupon_codes
  ADD COLUMN IF NOT EXISTS stripe_coupon_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_promotion_code_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_sync_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS stripe_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS stripe_synced_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS stripe_sync_fingerprint TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'plans_stripe_sync_status_check'
      AND conrelid = to_regclass(format('%I.%I', current_schema(), 'plans'))
  ) THEN
    ALTER TABLE plans
      ADD CONSTRAINT plans_stripe_sync_status_check
      CHECK (stripe_sync_status IN ('pending', 'synced', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'coupon_codes_stripe_sync_status_check'
      AND conrelid = to_regclass(format('%I.%I', current_schema(), 'coupon_codes'))
  ) THEN
    ALTER TABLE coupon_codes
      ADD CONSTRAINT coupon_codes_stripe_sync_status_check
      CHECK (stripe_sync_status IN ('pending', 'synced', 'failed'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS stripe_catalog_sync_jobs (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('plan', 'coupon')),
  entity_id INTEGER NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('upsert', 'archive')),
  fingerprint TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMP NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMP,
  locked_by TEXT,
  claim_token TEXT,
  last_error TEXT,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT stripe_catalog_sync_jobs_entity_fingerprint_unique
    UNIQUE (entity_type, entity_id, fingerprint, revision)
);

CREATE INDEX IF NOT EXISTS stripe_catalog_sync_jobs_due_idx
  ON stripe_catalog_sync_jobs(status, next_attempt_at);

CREATE INDEX IF NOT EXISTS stripe_catalog_sync_jobs_entity_idx
  ON stripe_catalog_sync_jobs(entity_type, entity_id, created_at);
