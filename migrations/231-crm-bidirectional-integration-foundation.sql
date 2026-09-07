CREATE TABLE IF NOT EXISTS crm_integrations (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'custom',
  status TEXT NOT NULL DEFAULT 'draft',
  webhook_url TEXT,
  webhook_secret_encrypted TEXT,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  conflict_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS crm_integrations_company_status_idx ON crm_integrations(company_id, status);

CREATE TABLE IF NOT EXISTS crm_external_mappings (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  integration_id INTEGER NOT NULL REFERENCES crm_integrations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  zinto_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_external_mappings_external_unique UNIQUE(company_id, integration_id, entity_type, external_id),
  CONSTRAINT crm_external_mappings_zinto_unique UNIQUE(company_id, integration_id, entity_type, zinto_id)
);

CREATE TABLE IF NOT EXISTS crm_idempotency_keys (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  integration_id INTEGER REFERENCES crm_integrations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER,
  response_body JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  CONSTRAINT crm_idempotency_keys_unique UNIQUE(company_id, key)
);

CREATE TABLE IF NOT EXISTS crm_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  integration_id INTEGER NOT NULL REFERENCES crm_integrations(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  origin TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS crm_webhook_events_pending_idx ON crm_webhook_events(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS crm_webhook_events_company_created_idx ON crm_webhook_events(company_id, created_at);

CREATE TABLE IF NOT EXISTS crm_sync_conflicts (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  integration_id INTEGER NOT NULL REFERENCES crm_integrations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  zinto_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  fields JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  resolution JSONB,
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
