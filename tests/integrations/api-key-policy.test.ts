import assert from 'node:assert/strict';
import test from 'node:test';

import { validateApiKeyConfigurationUpdate } from '../../server/services/integration-api-key-policy';

test('accepts a bounded credential configuration with documented scopes', () => {
  assert.deepEqual(
    validateApiKeyConfigurationUpdate({
      permissions: ['contacts:read', 'messages:send'],
      rateLimitPerMinute: 120,
      allowedIps: ['203.0.113.12'],
      webhookUrl: 'https://crm.example/webhooks/zinto',
    }),
    {
      permissions: ['contacts:read', 'messages:send'],
      rateLimitPerMinute: 120,
      allowedIps: ['203.0.113.12'],
      webhookUrl: 'https://crm.example/webhooks/zinto',
    },
  );
});

test('rejects an unknown scope before the API key is updated', () => {
  assert.throws(
    () => validateApiKeyConfigurationUpdate({ permissions: ['contacts:destroy'] }),
    /Unknown integration scope: contacts:destroy/,
  );
});

test('rejects a webhook URL that could send customer data over HTTP', () => {
  assert.throws(
    () => validateApiKeyConfigurationUpdate({ webhookUrl: 'http://crm.example/webhooks/zinto' }),
    /Webhook URL must use HTTPS/,
  );
});

test('rejects zero or negative rate limits', () => {
  assert.throws(
    () => validateApiKeyConfigurationUpdate({ rateLimitPerMinute: 0 }),
    /rateLimitPerMinute must be a positive integer/,
  );
});
