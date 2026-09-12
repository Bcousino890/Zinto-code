import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import express from 'express';

const { registerCrmIntegrationManagementRoutes } = await import('../../server/routes/crm-integration-management-routes');

function createApp(storage: any, user: any = { id: 7, companyId: 41, role: 'admin', isSuperAdmin: false }, secretOptions: any = {
  createSecret: () => 'zinto_whsec_test-secret',
  encryptSecret: (secret: string) => `encrypted:${secret}`,
}) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.user = user; next(); });
  registerCrmIntegrationManagementRoutes(app, storage, (_req, _res, next) => next(), secretOptions);
  return app;
}

async function withServer(app: express.Express, fn: (baseUrl: string) => Promise<void>) {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  try { await fn(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test('creates an integration and returns its ID plus the webhook secret only once', async () => {
  const created: any[] = [];
  const app = createApp({
    async createCrmIntegration(data: any) {
      created.push(data);
      return { id: 12, ...data, createdAt: new Date('2026-09-12T10:00:00Z'), updatedAt: new Date('2026-09-12T10:00:00Z') };
    },
  });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/settings/crm-integrations`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Mi CRM', provider: 'hubspot', webhookUrl: 'https://example.test/zinto', scopes: ['contacts:read', 'messages:send'] }),
    });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      id: 12, integrationId: 12, name: 'Mi CRM', provider: 'hubspot', status: 'draft',
      webhookUrl: 'https://example.test/zinto', scopes: ['contacts:read', 'messages:send'], conflictRules: {},
      webhookSecret: 'zinto_whsec_test-secret', createdAt: '2026-09-12T10:00:00.000Z', updatedAt: '2026-09-12T10:00:00.000Z',
    });
    assert.equal(created[0].webhookSecretEncrypted, 'encrypted:zinto_whsec_test-secret');
    assert.equal(created[0].companyId, 41);
  });
});

test('lists company integrations without exposing encrypted webhook secrets', async () => {
  const app = createApp({
    async getCrmIntegrationsByCompanyId(companyId: number) {
      assert.equal(companyId, 41);
      return [{ id: 8, companyId, name: 'CRM', provider: 'custom', status: 'active', webhookUrl: 'https://example.test/hook', webhookSecretEncrypted: 'do-not-return', scopes: ['integrations:manage'], conflictRules: { strategy: 'newest' }, createdAt: new Date('2026-09-01T00:00:00Z'), updatedAt: new Date('2026-09-02T00:00:00Z') }];
    },
  });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/settings/crm-integrations`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, [{ id: 8, integrationId: 8, name: 'CRM', provider: 'custom', status: 'active', webhookUrl: 'https://example.test/hook', scopes: ['integrations:manage'], conflictRules: { strategy: 'newest' }, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z' }]);
    assert.equal(JSON.stringify(body).includes('do-not-return'), false);
  });
});

test('updates integration configuration and supports activation/deactivation', async () => {
  const updates: any[] = [];
  const app = createApp({
    async getCrmIntegrationByIdAndCompany(id: number, companyId: number) { return { id, companyId, name: 'CRM', provider: 'custom', status: 'draft', scopes: [], conflictRules: {}, webhookUrl: null, createdAt: new Date(), updatedAt: new Date() }; },
    async updateCrmIntegration(id: number, companyId: number, data: any) { updates.push({ id, companyId, data }); return { id, companyId, name: data.name ?? 'CRM', provider: 'custom', status: data.status ?? 'draft', scopes: data.scopes ?? [], conflictRules: data.conflictRules ?? {}, webhookUrl: data.webhookUrl ?? null, createdAt: new Date('2026-09-01T00:00:00Z'), updatedAt: new Date('2026-09-02T00:00:00Z') }; },
  });
  await withServer(app, async (baseUrl) => {
    const update = await fetch(`${baseUrl}/api/settings/crm-integrations/4`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'CRM nuevo', scopes: ['contacts:write'] }) });
    assert.equal(update.status, 200);
    const activate = await fetch(`${baseUrl}/api/settings/crm-integrations/4/activate`, { method: 'POST' });
    assert.equal(activate.status, 200);
    const deactivate = await fetch(`${baseUrl}/api/settings/crm-integrations/4/deactivate`, { method: 'POST' });
    assert.equal(deactivate.status, 200);
    assert.deepEqual(updates.map((entry) => entry.data), [{ name: 'CRM nuevo', scopes: ['contacts:write'] }, { status: 'active' }, { status: 'inactive' }]);
  });
});

test('rotates a webhook secret and deletes an integration within the authenticated company', async () => {
  const updates: any[] = [];
  const deleted: any[] = [];
  const app = createApp({
    async getCrmIntegrationByIdAndCompany(id: number, companyId: number) {
      return { id, companyId, name: 'CRM', provider: 'custom', status: 'active', scopes: [], conflictRules: {}, webhookUrl: 'https://example.test/hook', webhookSecretEncrypted: 'encrypted:old', createdAt: new Date(), updatedAt: new Date() };
    },
    async updateCrmIntegration(id: number, companyId: number, data: any) {
      updates.push({ id, companyId, data });
      return { id, companyId, name: 'CRM', provider: 'custom', status: 'active', scopes: [], conflictRules: {}, webhookUrl: 'https://example.test/hook', ...data, createdAt: new Date(), updatedAt: new Date() };
    },
    async deleteCrmIntegration(id: number, companyId: number) {
      deleted.push({ id, companyId });
      return true;
    },
  });
  await withServer(app, async (baseUrl) => {
    const rotate = await fetch(`${baseUrl}/api/settings/crm-integrations/9/rotate-secret`, { method: 'POST' });
    assert.equal(rotate.status, 200);
    const rotated = await rotate.json();
    assert.equal(rotated.webhookSecret, 'zinto_whsec_test-secret');
    assert.equal(rotated.webhookSecretEncrypted, undefined);

    const remove = await fetch(`${baseUrl}/api/settings/crm-integrations/9`, { method: 'DELETE' });
    assert.equal(remove.status, 204);
    assert.deepEqual(updates, [{ id: 9, companyId: 41, data: { webhookSecretEncrypted: 'encrypted:zinto_whsec_test-secret' } }]);
    assert.deepEqual(deleted, [{ id: 9, companyId: 41 }]);
  });
});

test('reports missing encryption configuration instead of hiding the webhook secret failure', async () => {
  const app = createApp({
    async getCrmIntegrationByIdAndCompany(id: number, companyId: number) {
      return { id, companyId, name: 'CRM', provider: 'custom', status: 'active', scopes: [], conflictRules: {}, webhookUrl: null, webhookSecretEncrypted: 'encrypted:old', createdAt: new Date(), updatedAt: new Date() };
    },
    async updateCrmIntegration() { throw new Error('ENCRYPTION_KEY is required'); },
  }, undefined, {
    createSecret: () => 'zinto_whsec_test-secret',
    encryptSecret: () => { throw new Error('ENCRYPTION_KEY is required'); },
  });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/settings/crm-integrations/9/rotate-secret`, { method: 'POST' });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'ENCRYPTION_NOT_CONFIGURED', message: 'El servidor no tiene configurada ENCRYPTION_KEY; no se puede generar ni rotar el secreto del webhook.' });
  });
});

test('rejects integration management for non-admin users', async () => {
  const app = createApp({}, { id: 8, companyId: 41, role: 'agent', isSuperAdmin: false });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/settings/crm-integrations`);
    assert.equal(response.status, 403);
  });
});
