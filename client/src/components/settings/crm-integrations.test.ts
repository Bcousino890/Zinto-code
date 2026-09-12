import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCrmIntegrationPayload, normalizeCrmIntegrations } from './crm-integrations';

test('builds a trimmed CRM integration payload with explicit provider and scopes', () => {
  assert.deepEqual(buildCrmIntegrationPayload({
    name: '  Mi CRM  ',
    provider: '  generic  ',
    webhookUrl: ' https://example.com/hooks/zinto ',
    scopes: ['contacts:read', 'messages:write'],
  }), {
    name: 'Mi CRM',
    provider: 'generic',
    webhookUrl: 'https://example.com/hooks/zinto',
    scopes: ['contacts:read', 'messages:write'],
  });
});

test('normalizes API integration records and supports snake_case responses', () => {
  assert.deepEqual(normalizeCrmIntegrations({ integrations: [{
    id: '7',
    name: 'CRM',
    provider: 'hubspot',
    status: 'inactive',
    webhook_url: 'https://example.com/hook',
    scopes: ['contacts:read'],
    created_at: '2026-09-12T00:00:00.000Z',
  }] }), [{
    id: 7,
    name: 'CRM',
    provider: 'hubspot',
    status: 'inactive',
    webhookUrl: 'https://example.com/hook',
    scopes: ['contacts:read'],
    createdAt: '2026-09-12T00:00:00.000Z',
  }]);
});
