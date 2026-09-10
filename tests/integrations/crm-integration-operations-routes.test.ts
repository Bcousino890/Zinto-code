import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import express from 'express';

const { registerCrmIntegrationOperationsRoutes } = await import('../../server/routes/crm-integration-operations-routes');

test('returns only the authenticated company integration operations and omits webhook payloads', async () => {
  const calls: number[] = [];
  const app = express();
  app.use((req: any, _res, next) => { req.user = { companyId: 41 }; next(); });
  registerCrmIntegrationOperationsRoutes(app, {
    async getCrmIntegrationOperations(companyId) {
      calls.push(companyId);
      return [{
        id: 9, name: 'CRM', status: 'active', scopes: ['contacts:read'],
        pendingEvents: [{ id: 'evt-1', type: 'contact.updated', status: 'pending', attemptCount: 1, createdAt: new Date('2026-09-10T08:00:00Z'), lastError: null, payload: { secret: true } }],
        failedEvents: [], conflicts: [],
      }];
    },
  }, (_req, _res, next) => next());
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/settings/crm-integration-operations`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [{
      id: 9, name: 'CRM', status: 'active', scopes: ['contacts:read'],
      pendingEvents: [{ id: 'evt-1', type: 'contact.updated', status: 'pending', attemptCount: 1, createdAt: '2026-09-10T08:00:00.000Z', lastError: null }],
      failedEvents: [], conflicts: [],
    }]);
    assert.deepEqual(calls, [41]);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});
