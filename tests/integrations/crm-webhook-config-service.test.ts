import assert from 'node:assert/strict';
import test from 'node:test';

import { createWebhookConfigService } from '../../server/services/crm-webhook-config-service';

function fakeDeps(overrides: Partial<{ webhookUrl: string | null; webhookSecretEncrypted: string | null }> = {}) {
  const record = { webhookUrl: null, webhookSecretEncrypted: null, ...overrides };
  const updates: unknown[] = [];
  return {
    record,
    updates,
    deps: {
      getCrmIntegrationByIdAndCompany: async (id: number, companyId: number) => {
        if (companyId !== 12) return undefined;
        return { ...record };
      },
      updateCrmIntegration: async (id: number, companyId: number, data: any) => {
        updates.push({ id, companyId, data });
        Object.assign(record, data);
        return { ...record };
      },
      encryptSecret: (secret: string) => `encrypted(${secret})`,
    },
  };
}

test('get() returns the webhook URL and whether a secret is configured, without ever exposing the secret itself', async () => {
  const { deps } = fakeDeps({ webhookUrl: 'https://1.1.1.1/webhooks/zinto', webhookSecretEncrypted: 'encrypted(zinto_whsec_abc)' });
  const service = createWebhookConfigService(deps);

  const result = await service.get(12, 3);

  assert.deepEqual(result, { status: 200, body: { url: 'https://1.1.1.1/webhooks/zinto', secretConfigured: true } });
});

test('get() returns 404 when the integration does not belong to the company (or does not exist)', async () => {
  const { deps } = fakeDeps();
  const service = createWebhookConfigService(deps);

  const result = await service.get(999, 3);

  assert.equal(result.status, 404);
});

test('update() rejects an invalid webhookUrl without ever calling updateCrmIntegration', async () => {
  const { deps, updates } = fakeDeps();
  const service = createWebhookConfigService(deps);

  const result = await service.update(12, 3, { url: 'http://internal.local/webhook' });

  assert.equal(result.status, 400);
  assert.equal(updates.length, 0);
});

test('update() sets the URL and generates a first secret, returning it exactly once', async () => {
  const { deps, updates } = fakeDeps();
  const service = createWebhookConfigService(deps);

  const result = await service.update(12, 3, { url: 'https://1.1.1.1/webhooks/zinto' });

  assert.equal(result.status, 200);
  assert.equal(result.body.url, 'https://1.1.1.1/webhooks/zinto');
  assert.equal(result.body.secretConfigured, true);
  assert.ok(typeof result.body.secret === 'string' && (result.body.secret as string).startsWith('zinto_whsec_'));
  assert.equal(updates.length, 1);
  assert.equal((updates[0] as any).data.webhookSecretEncrypted, `encrypted(${result.body.secret})`);
});

test('update() does not generate a new secret just for setting a URL when one is already configured', async () => {
  const { deps } = fakeDeps({ webhookSecretEncrypted: 'encrypted(zinto_whsec_existing)' });
  const service = createWebhookConfigService(deps);

  const result = await service.update(12, 3, { url: 'https://1.1.1.1/webhooks/zinto' });

  assert.equal(result.status, 200);
  assert.ok(!('secret' in result.body), 'must not return a fresh secret when one already existed and rotation was not requested');
});

test('update() rotates the secret on request, returning the new one exactly once', async () => {
  const { deps } = fakeDeps({ webhookUrl: 'https://1.1.1.1/webhooks/zinto', webhookSecretEncrypted: 'encrypted(zinto_whsec_old)' });
  const service = createWebhookConfigService(deps);

  const result = await service.update(12, 3, { rotateSecret: true });

  assert.equal(result.status, 200);
  assert.ok(typeof result.body.secret === 'string' && result.body.secret !== 'zinto_whsec_old');
});

test('update() clears the webhook URL when passed null, without touching the existing secret', async () => {
  const { deps, record } = fakeDeps({ webhookUrl: 'https://1.1.1.1/webhooks/zinto', webhookSecretEncrypted: 'encrypted(zinto_whsec_existing)' });
  const service = createWebhookConfigService(deps);

  const result = await service.update(12, 3, { url: null });

  assert.equal(result.status, 200);
  assert.equal(result.body.url, null);
  assert.ok(!('secret' in result.body));
  assert.equal(record.webhookSecretEncrypted, 'encrypted(zinto_whsec_existing)');
});

test('update() returns 404 for an integration that does not belong to the company', async () => {
  const { deps } = fakeDeps();
  const service = createWebhookConfigService(deps);

  const result = await service.update(999, 3, { url: 'https://1.1.1.1/webhooks/zinto' });

  assert.equal(result.status, 404);
});

test('update() with no fields at all is a no-op that still reports the current state', async () => {
  const { deps } = fakeDeps({ webhookUrl: 'https://1.1.1.1/webhooks/zinto', webhookSecretEncrypted: 'encrypted(zinto_whsec_existing)' });
  const service = createWebhookConfigService(deps);

  const result = await service.update(12, 3, {});

  assert.deepEqual(result, { status: 200, body: { url: 'https://1.1.1.1/webhooks/zinto', secretConfigured: true } });
});
