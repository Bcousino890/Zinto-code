import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCrmIntegrationAction, buildCrmIntegrationPayload, normalizeCreatedCrmIntegration, normalizeCrmIntegrations } from './crm-integrations';

test('builds safe action requests for revealing/rotating secrets and deleting an integration', () => {
  assert.deepEqual(buildCrmIntegrationAction('7f8c2a91-4e1b-4c70-bc3d-91a8e4f0d612', 'reveal-secret'), {
    method: 'POST',
    url: '/api/settings/crm-integrations/7f8c2a91-4e1b-4c70-bc3d-91a8e4f0d612/reveal-secret',
  });
  assert.deepEqual(buildCrmIntegrationAction('7f8c2a91-4e1b-4c70-bc3d-91a8e4f0d612', 'rotate-secret'), {
    method: 'POST',
    url: '/api/settings/crm-integrations/7f8c2a91-4e1b-4c70-bc3d-91a8e4f0d612/rotate-secret',
  });
  assert.deepEqual(buildCrmIntegrationAction('7f8c2a91-4e1b-4c70-bc3d-91a8e4f0d612', 'delete'), {
    method: 'DELETE',
    url: '/api/settings/crm-integrations/7f8c2a91-4e1b-4c70-bc3d-91a8e4f0d612',
  });
});

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

test('preserves opaque UUID integration IDs for external clients', () => {
  assert.equal(normalizeCrmIntegrations([{ id: '7f8c2a91-4e1b-4c70-bc3d-91a8e4f0d612', name: 'CRM', provider: 'generic', status: 'active', scopes: [] }])[0]?.id, '7f8c2a91-4e1b-4c70-bc3d-91a8e4f0d612');
});

test('normalizes a single mutation response and preserves its webhook secret', () => {
  const result = normalizeCreatedCrmIntegration({
    id: '7f8c2a91-4e1b-4c70-bc3d-91a8e4f0d612', name: 'CRM', provider: 'generic', status: 'active', scopes: [],
    webhookSecret: 'zinto_whsec_example',
  });
  assert.equal(result?.id, '7f8c2a91-4e1b-4c70-bc3d-91a8e4f0d612');
  assert.equal(result?.webhookSecret, 'zinto_whsec_example');
});
