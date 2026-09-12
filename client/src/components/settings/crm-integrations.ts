export type CrmIntegrationStatus = 'draft' | 'active' | 'inactive' | 'paused';

export interface CrmIntegration {
  id: number;
  name: string;
  provider: string;
  status: CrmIntegrationStatus;
  webhookUrl: string | null;
  scopes: string[];
  createdAt?: string;
  updatedAt?: string;
  lastSyncAt?: string | null;
}

export interface CrmIntegrationFormValues {
  name: string;
  provider: string;
  webhookUrl: string;
  scopes: string[];
}

export interface CreatedCrmIntegration extends CrmIntegration {
  webhookSecret?: string;
}

export type CrmIntegrationAction = 'rotate-secret' | 'delete';

export function buildCrmIntegrationAction(id: number, action: CrmIntegrationAction): { method: 'POST' | 'DELETE'; url: string } {
  const encodedId = encodeURIComponent(String(id));
  return action === 'rotate-secret'
    ? { method: 'POST', url: `/api/settings/crm-integrations/${encodedId}/rotate-secret` }
    : { method: 'DELETE', url: `/api/settings/crm-integrations/${encodedId}` };
}

export function buildCrmIntegrationPayload(values: CrmIntegrationFormValues): CrmIntegrationFormValues {
  return {
    name: values.name.trim(),
    provider: values.provider.trim().toLowerCase(),
    webhookUrl: values.webhookUrl.trim(),
    scopes: [...new Set(values.scopes.filter(Boolean))],
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeStatus(value: unknown): CrmIntegrationStatus {
  return value === 'draft' || value === 'inactive' || value === 'paused' ? value : 'active';
}

export function normalizeCrmIntegrations(payload: unknown): CrmIntegration[] {
  const root = asRecord(payload);
  const records = Array.isArray(payload) ? payload : root.integrations;
  if (!Array.isArray(records)) return [];

  return records.flatMap((value) => {
    const record = asRecord(value);
    const id = Number(record.id ?? record.integration_id);
    if (!Number.isSafeInteger(id) || id <= 0) return [];
    const scopes = record.scopes ?? record.permissions;
    return [{
      id,
      name: asString(record.name, `CRM ${id}`),
      provider: asString(record.provider ?? record.type, 'generic'),
      status: normalizeStatus(record.status),
      webhookUrl: typeof (record.webhookUrl ?? record.webhook_url) === 'string'
        ? asString(record.webhookUrl ?? record.webhook_url)
        : null,
      scopes: Array.isArray(scopes) ? scopes.filter((scope): scope is string => typeof scope === 'string') : [],
      ...(typeof (record.createdAt ?? record.created_at) === 'string' ? { createdAt: asString(record.createdAt ?? record.created_at) } : {}),
      ...(typeof (record.updatedAt ?? record.updated_at) === 'string' ? { updatedAt: asString(record.updatedAt ?? record.updated_at) } : {}),
      ...(typeof (record.lastSyncAt ?? record.last_sync_at) === 'string' ? { lastSyncAt: asString(record.lastSyncAt ?? record.last_sync_at) } : {}),
    }];
  });
}

export function normalizeCreatedCrmIntegration(payload: unknown): CreatedCrmIntegration | null {
  const root = asRecord(payload);
  const candidate = root.integration ?? root.data ?? payload;
  const [integration] = normalizeCrmIntegrations(candidate);
  if (!integration) return null;
  const secret = root.webhookSecret ?? root.webhook_secret ?? asRecord(candidate).webhookSecret ?? asRecord(candidate).webhook_secret;
  return typeof secret === 'string' && secret ? { ...integration, webhookSecret: secret } : integration;
}
