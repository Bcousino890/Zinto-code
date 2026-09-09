import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApiKeyCreationPayload } from './api-key-creation-form';

test('builds a sandbox API key payload with its webhook URL', () => {
  assert.deepEqual(
    buildApiKeyCreationPayload({
      name: '  Local CRM sync  ',
      environment: 'sandbox',
      webhookUrl: '  http://localhost:3000/webhooks/crm  ',
    }),
    {
      name: 'Local CRM sync',
      environment: 'sandbox',
      webhookUrl: 'http://localhost:3000/webhooks/crm',
    },
  );
});

test('builds a production API key payload with its webhook URL', () => {
  assert.deepEqual(
    buildApiKeyCreationPayload({
      name: 'CRM production',
      environment: 'production',
      webhookUrl: 'https://crm.example.com/webhooks/zinto',
    }),
    {
      name: 'CRM production',
      environment: 'production',
      webhookUrl: 'https://crm.example.com/webhooks/zinto',
    },
  );
});
