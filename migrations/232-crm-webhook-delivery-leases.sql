-- Make previously queued CRM webhook rows safe for leased, asynchronous delivery.
ALTER TABLE crm_webhook_events
  ADD COLUMN IF NOT EXISTS claimed_by TEXT,
  ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Terminal outcomes have no future retry time, so this column must be nullable.
ALTER TABLE crm_webhook_events
  ALTER COLUMN next_attempt_at DROP NOT NULL;

-- Matches the worker's tenant/integration-scoped claim predicate and due-time ordering.
CREATE INDEX IF NOT EXISTS crm_webhook_events_claim_scope_idx
  ON crm_webhook_events(company_id, integration_id, status, next_attempt_at);
