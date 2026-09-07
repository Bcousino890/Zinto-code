import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertIntegrationScopes,
  buildWebhookSignaturePayload,
  INTEGRATION_SCOPES,
  signWebhookPayload,
} from '../../shared/integrations/contracts';

test('rejects an unknown API v2 permission before it can be saved', () => {
  assert.throws(
    () => assertIntegrationScopes(['contacts:read', 'contacts:destroy']),
    /Unknown integration scope: contacts:destroy/
  );
});

test('accepts the documented API v2 permission set', () => {
  assert.deepEqual(
    assertIntegrationScopes(['contacts:read', 'messages:send']),
    ['contacts:read', 'messages:send']
  );
  assert.ok(INTEGRATION_SCOPES.includes('webhooks:manage'));
});

test('signs the timestamp and raw body without JSON reserialization', () => {
  assert.equal(
    buildWebhookSignaturePayload('1725677273', '{"id":"evt_123"}'),
    '1725677273.{"id":"evt_123"}'
  );
});

test('creates a versioned HMAC signature that a CRM can verify', () => {
  assert.equal(
    signWebhookPayload('integration-secret', '1725677273', '{"id":"evt_123"}'),
    'v1=7e767a4bb362f7cb49ee0b18b410cce49980de368568adf3974ec98a1ec2f03c'
  );
});
