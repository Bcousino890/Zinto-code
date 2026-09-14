import assert from 'node:assert/strict';
import test from 'node:test';

import { setupAddonRoutes } from '../server/routes/addon-routes';

type Handler = (req: any, res: any, next?: () => void) => unknown;

class TestApp {
  readonly routes = new Map<string, Handler[]>();
  get(path: string, ...handlers: Handler[]) {
    this.routes.set(`GET ${path}`, handlers);
  }
  post(path: string, ...handlers: Handler[]) {
    this.routes.set(`POST ${path}`, handlers);
  }
}

function response() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
}

async function invoke(app: TestApp, method: 'GET' | 'POST', path: string, request: Record<string, unknown>) {
  const handlers = app.routes.get(`${method} ${path}`);
  assert.ok(handlers, `missing ${method} ${path}`);
  const res = response();
  let index = 0;
  const next = async () => {
    const handler = handlers[index++];
    if (handler) await handler(request, res, next);
  };
  await next();
  return res;
}

function fakeEnsureAuthenticated(req: any, res: any, next: () => void) {
  if (req.isAuthenticated?.()) return next();
  return res.status(401).json({ message: 'Unauthorized' });
}

function createFakeService() {
  const purchaseCalls: Array<{ companyId: number; addonKey: string; quantity: number; autoRenew: boolean }> = [];
  const autoRenewCalls: Array<{ purchaseId: number; companyId: number; autoRenew: boolean }> = [];
  // Fixture: purchase #1 belongs to company 100 only.
  const purchaseOwners: Record<number, number> = { 1: 100 };

  return {
    purchaseCalls,
    autoRenewCalls,
    async createPurchaseCheckoutSession(companyId: number, addonKey: string, quantity: number, autoRenew: boolean) {
      purchaseCalls.push({ companyId, addonKey, quantity, autoRenew });
      return { url: `https://checkout.stripe.test/${companyId}` };
    },
    async setAutoRenew(purchaseId: number, companyId: number, autoRenew: boolean) {
      autoRenewCalls.push({ purchaseId, companyId, autoRenew });
      return purchaseOwners[purchaseId] === companyId;
    },
    async getCompanyAddonStatus(companyId: number) {
      return [
        {
          key: 'extra_user',
          name: 'Usuario adicional',
          unitPrice: 12,
          currency: 'EUR' as const,
          activeQuantity: 0,
          nearestExpiresAt: null,
          autoRenew: false,
        },
      ];
    },
  };
}

function authenticatedAs(companyId: number) {
  return { isAuthenticated: () => true, user: { companyId } };
}

test('POST /api/addons/purchase usa siempre el companyId de la sesión y rechaza un companyId ajeno en el body', async () => {
  const app = new TestApp();
  const service = createFakeService();
  setupAddonRoutes(app as any, { ensureAuthenticated: fakeEnsureAuthenticated, service });

  const malicious = await invoke(app, 'POST', '/api/addons/purchase', {
    ...authenticatedAs(100),
    body: { addonKey: 'extra_user', quantity: 2, companyId: 999 },
  });

  assert.equal(malicious.statusCode, 400, 'un companyId en el body debe rechazarse (schema estricto)');
  assert.equal(service.purchaseCalls.length, 0, 'el servicio nunca debe haberse invocado con datos del body no válidos');

  const clean = await invoke(app, 'POST', '/api/addons/purchase', {
    ...authenticatedAs(100),
    body: { addonKey: 'extra_user', quantity: 2 },
  });

  assert.equal(clean.statusCode, 200);
  assert.equal(service.purchaseCalls.length, 1);
  assert.equal(service.purchaseCalls[0].companyId, 100, 'la compra debe atribuirse a la empresa de la sesión autenticada');
});

test('POST /api/addons/purchase ignora un companyId aunque una empresa DISTINTA intente suplantar la compra', async () => {
  const app = new TestApp();
  const service = createFakeService();
  setupAddonRoutes(app as any, { ensureAuthenticated: fakeEnsureAuthenticated, service });

  // Company 200 is authenticated but tries to smuggle companyId=100 (a different, real company)
  // into the body. The request is rejected outright by the strict schema, so company 100 is
  // never touched by it either way.
  const res = await invoke(app, 'POST', '/api/addons/purchase', {
    ...authenticatedAs(200),
    body: { addonKey: 'extra_user', quantity: 1, companyId: 100 },
  });

  assert.equal(res.statusCode, 400);
  assert.equal(service.purchaseCalls.length, 0);
});

test('POST /api/addons/purchase valida quantity (entero positivo, máximo 50) y addonKey (uno de los 2 conocidos)', async () => {
  const app = new TestApp();
  const service = createFakeService();
  setupAddonRoutes(app as any, { ensureAuthenticated: fakeEnsureAuthenticated, service });

  const tooMany = await invoke(app, 'POST', '/api/addons/purchase', { ...authenticatedAs(100), body: { addonKey: 'extra_user', quantity: 51 } });
  assert.equal(tooMany.statusCode, 400);

  const negative = await invoke(app, 'POST', '/api/addons/purchase', { ...authenticatedAs(100), body: { addonKey: 'extra_user', quantity: -1 } });
  assert.equal(negative.statusCode, 400);

  const unknownKey = await invoke(app, 'POST', '/api/addons/purchase', { ...authenticatedAs(100), body: { addonKey: 'unlimited_everything', quantity: 1 } });
  assert.equal(unknownKey.statusCode, 400);

  assert.equal(service.purchaseCalls.length, 0);
});

test('POST /api/addons/purchase requiere autenticación', async () => {
  const app = new TestApp();
  const service = createFakeService();
  setupAddonRoutes(app as any, { ensureAuthenticated: fakeEnsureAuthenticated, service });

  const res = await invoke(app, 'POST', '/api/addons/purchase', {
    isAuthenticated: () => false,
    body: { addonKey: 'extra_user', quantity: 1 },
  });

  assert.equal(res.statusCode, 401);
  assert.equal(service.purchaseCalls.length, 0);
});

test('POST /api/addons/:purchaseId/auto-renew devuelve 404 si la compra pertenece a otra empresa', async () => {
  const app = new TestApp();
  const service = createFakeService();
  setupAddonRoutes(app as any, { ensureAuthenticated: fakeEnsureAuthenticated, service });

  // Purchase #1 belongs to company 100 (see createFakeService); company 200 tries to toggle it
  // by guessing the id.
  const res = await invoke(app, 'POST', '/api/addons/:purchaseId/auto-renew', {
    ...authenticatedAs(200),
    params: { purchaseId: '1' },
    body: { autoRenew: true },
  });

  assert.equal(res.statusCode, 404);
  assert.deepEqual(service.autoRenewCalls, [{ purchaseId: 1, companyId: 200, autoRenew: true }]);
});

test('POST /api/addons/:purchaseId/auto-renew funciona para el dueño legítimo de la compra', async () => {
  const app = new TestApp();
  const service = createFakeService();
  setupAddonRoutes(app as any, { ensureAuthenticated: fakeEnsureAuthenticated, service });

  const res = await invoke(app, 'POST', '/api/addons/:purchaseId/auto-renew', {
    ...authenticatedAs(100),
    params: { purchaseId: '1' },
    body: { autoRenew: true },
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });
});

test('GET /api/addons/status usa el companyId de la sesión', async () => {
  const app = new TestApp();
  const service = createFakeService();
  setupAddonRoutes(app as any, { ensureAuthenticated: fakeEnsureAuthenticated, service });

  const res = await invoke(app, 'GET', '/api/addons/status', authenticatedAs(100));

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    addons: [
      { key: 'extra_user', name: 'Usuario adicional', unitPrice: 12, currency: 'EUR', activeQuantity: 0, nearestExpiresAt: null, autoRenew: false },
    ],
  });
});

test('GET /api/addons/status requiere autenticación', async () => {
  const app = new TestApp();
  const service = createFakeService();
  setupAddonRoutes(app as any, { ensureAuthenticated: fakeEnsureAuthenticated, service });

  const res = await invoke(app, 'GET', '/api/addons/status', { isAuthenticated: () => false });
  assert.equal(res.statusCode, 401);
});
