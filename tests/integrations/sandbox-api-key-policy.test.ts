import assert from 'node:assert/strict';
import test from 'node:test';

import { validateSandboxApiKeyConfiguration } from '../../server/services/sandbox-api-key-policy';

test('accepts sandbox credentials with a localhost webhook', () => {
  assert.deepEqual(
    validateSandboxApiKeyConfiguration({
      environment: 'sandbox',
      webhookUrl: 'http://localhost:3000/hooks/crm',
    }),
    {
      environment: 'sandbox',
      webhookUrl: 'http://localhost:3000/hooks/crm',
    },
  );
});

test('accepts sandbox credentials with a test-domain webhook', () => {
  assert.deepEqual(
    validateSandboxApiKeyConfiguration({
      environment: 'sandbox',
      webhookUrl: 'https://crm.test/hooks/zinto',
    }),
    {
      environment: 'sandbox',
      webhookUrl: 'https://crm.test/hooks/zinto',
    },
  );
});

test('rejects a sandbox webhook that targets a production-like host', () => {
  assert.throws(
    () => validateSandboxApiKeyConfiguration({
      environment: 'sandbox',
      webhookUrl: 'https://crm.example.com/hooks/zinto',
    }),
    /Sandbox webhook URL must target localhost or a .test or .example domain/,
  );
});

test('accepts production credentials with an HTTPS non-localhost webhook', () => {
  assert.deepEqual(
    validateSandboxApiKeyConfiguration({
      environment: 'production',
      webhookUrl: 'https://crm.example.com/hooks/zinto',
    }),
    {
      environment: 'production',
      webhookUrl: 'https://crm.example.com/hooks/zinto',
    },
  );
});

test('rejects a production webhook that is not HTTPS', () => {
  assert.throws(
    () => validateSandboxApiKeyConfiguration({
      environment: 'production',
      webhookUrl: 'http://crm.example.com/hooks/zinto',
    }),
    /Production webhook URL must use HTTPS/,
  );
});

test('rejects a production webhook that targets localhost', () => {
  assert.throws(
    () => validateSandboxApiKeyConfiguration({
      environment: 'production',
      webhookUrl: 'https://localhost/hooks/zinto',
    }),
    /Production webhook URL must not target localhost/,
  );
});

test('rejects a production webhook that targets a loopback address', () => {
  assert.throws(
    () => validateSandboxApiKeyConfiguration({
      environment: 'production',
      webhookUrl: 'https://127.0.0.1/hooks/zinto',
    }),
    /Production webhook URL must not target localhost/,
  );
});

test('rejects an unsupported API-key environment', () => {
  assert.throws(
    () => validateSandboxApiKeyConfiguration({
      environment: 'staging',
      webhookUrl: 'https://crm.test/hooks/zinto',
    }),
    /environment must be either sandbox or production/,
  );
});
