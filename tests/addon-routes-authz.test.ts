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

// A permissive-by-default fake so the ~9 pre-existing tests below (none of which are about CSRF)
// don't all need updating; the dedicated CSRF tests further down override this per-call.
function fakeRequireCsrf(_req: any, _res: any, next: () => void) {
  return next();
}
function fakeIssueCsrfToken(_req: any) {
  return 'fake-csrf-token';
}

function createFakeService() {
  const purchaseCalls: Array<{ companyId: number; addonKey: string; quantity: number; autoRenew: boolean }> = [];
  const autoRenewCalls: Array<{ companyId: number; addonKey: string; autoRenew: boolean }> = [];
  // Fixture: only company 100 currently has active quota for 'extra_user'.
  const activeQuotaOwners: Record<string, number> = { extra_user: 100 };

  return {
    purchaseCalls,
    autoRenewCalls,
    async createPurchaseCheckoutSession(companyId: number, addonKey: string, quantity: number, autoRenew: boolean) {
      purchaseCalls.push({ companyId, addonKey, quantity, autoRenew });
      return { url: `https://checkout.stripe.test/${companyId}` };
    },
    async setAddonAutoRenew(companyId: number, addonKey: string, autoRenew: boolean) {
      autoRenewCalls.push({ companyId, addonKey, autoRenew });
      return activeQuotaOwners[addonKey] === companyId;
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
  setupAddonRoutes(app as any, {
    ensureAuthenticated: fakeEnsureAuthenticated,
    service,
    requireCsrf: fakeRequireCsrf,
    issueCsrfToken: fakeIssueCsrfToken,
  });

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
  setupAddonRoutes(app as any, {
    ensureAuthenticated: fakeEnsureAuthenticated,
    service,
    requireCsrf: fakeRequireCsrf,
    issueCsrfToken: fakeIssueCsrfToken,
  });

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
  setupAddonRoutes(app as any, {
    ensureAuthenticated: fakeEnsureAuthenticated,
    service,
    requireCsrf: fakeRequireCsrf,
    issueCsrfToken: fakeIssueCsrfToken,
  });

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
  setupAddonRoutes(app as any, {
    ensureAuthenticated: fakeEnsureAuthenticated,
    service,
    requireCsrf: fakeRequireCsrf,
    issueCsrfToken: fakeIssueCsrfToken,
  });

  const res = await invoke(app, 'POST', '/api/addons/purchase', {
    isAuthenticated: () => false,
    body: { addonKey: 'extra_user', quantity: 1 },
  });

  assert.equal(res.statusCode, 401);
  assert.equal(service.purchaseCalls.length, 0);
});

test('POST /api/addons/:addonKey/auto-renew devuelve 404 si la empresa no tiene cupo activo de ese addon', async () => {
  const app = new TestApp();
  const service = createFakeService();
  setupAddonRoutes(app as any, {
    ensureAuthenticated: fakeEnsureAuthenticated,
    service,
    requireCsrf: fakeRequireCsrf,
    issueCsrfToken: fakeIssueCsrfToken,
  });

  // 'extra_user' active quota belongs to company 100 (see createFakeService); company 200 has
  // none, so toggling its auto-renew must 404 rather than silently succeed.
  const res = await invoke(app, 'POST', '/api/addons/:addonKey/auto-renew', {
    ...authenticatedAs(200),
    params: { addonKey: 'extra_user' },
    body: { autoRenew: true },
  });

  assert.equal(res.statusCode, 404);
  assert.deepEqual(service.autoRenewCalls, [{ companyId: 200, addonKey: 'extra_user', autoRenew: true }]);
});

test('POST /api/addons/:addonKey/auto-renew rechaza una addonKey desconocida', async () => {
  const app = new TestApp();
  const service = createFakeService();
  setupAddonRoutes(app as any, {
    ensureAuthenticated: fakeEnsureAuthenticated,
    service,
    requireCsrf: fakeRequireCsrf,
    issueCsrfToken: fakeIssueCsrfToken,
  });

  const res = await invoke(app, 'POST', '/api/addons/:addonKey/auto-renew', {
    ...authenticatedAs(100),
    params: { addonKey: 'not_a_real_addon' },
    body: { autoRenew: true },
  });

  assert.equal(res.statusCode, 400);
  assert.equal(service.autoRenewCalls.length, 0, 'una addonKey inválida nunca debe llegar al servicio');
});

test('POST /api/addons/:addonKey/auto-renew funciona para la empresa con cupo activo', async () => {
  const app = new TestApp();
  const service = createFakeService();
  setupAddonRoutes(app as any, {
    ensureAuthenticated: fakeEnsureAuthenticated,
    service,
    requireCsrf: fakeRequireCsrf,
    issueCsrfToken: fakeIssueCsrfToken,
  });

  const res = await invoke(app, 'POST', '/api/addons/:addonKey/auto-renew', {
    ...authenticatedAs(100),
    params: { addonKey: 'extra_user' },
    body: { autoRenew: true },
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });
});

test('GET /api/addons/status usa el companyId de la sesión', async () => {
  const app = new TestApp();
  const service = createFakeService();
  setupAddonRoutes(app as any, {
    ensureAuthenticated: fakeEnsureAuthenticated,
    service,
    requireCsrf: fakeRequireCsrf,
    issueCsrfToken: fakeIssueCsrfToken,
  });

  const res = await invoke(app, 'GET', '/api/addons/status', authenticatedAs(100));

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    addons: [
      { key: 'extra_user', name: 'Usuario adicional', unitPrice: 12, currency: 'EUR', activeQuantity: 0, nearestExpiresAt: null, autoRenew: false },
    ],
    csrfToken: 'fake-csrf-token',
  });
});

test('GET /api/addons/status requiere autenticación', async () => {
  const app = new TestApp();
  const service = createFakeService();
  setupAddonRoutes(app as any, {
    ensureAuthenticated: fakeEnsureAuthenticated,
    service,
    requireCsrf: fakeRequireCsrf,
    issueCsrfToken: fakeIssueCsrfToken,
  });

  const res = await invoke(app, 'GET', '/api/addons/status', { isAuthenticated: () => false });
  assert.equal(res.statusCode, 401);
});

test('GET /api/addons/status devuelve un csrfToken para usarlo en las rutas que sí cambian estado', async () => {
  const app = new TestApp();
  const service = createFakeService();
  setupAddonRoutes(app as any, {
    ensureAuthenticated: fakeEnsureAuthenticated,
    service,
    requireCsrf: fakeRequireCsrf,
    issueCsrfToken: fakeIssueCsrfToken,
  });

  const res = await invoke(app, 'GET', '/api/addons/status', authenticatedAs(100));
  assert.equal((res.body as any).csrfToken, 'fake-csrf-token');
});

// -----------------------------------------------------------------------
// CSRF: POST /api/addons/purchase and POST /api/addons/:addonKey/auto-renew move real money /
// enroll a company in recurring off-session charges, so — unlike most read-only company routes —
// they must be behind the same session CSRF check the admin add-on catalog routes already use.
// -----------------------------------------------------------------------

test('POST /api/addons/purchase se bloquea si falla la comprobación CSRF (nunca llega al servicio)', async () => {
  const app = new TestApp();
  const service = createFakeService();
  const requireCsrf = (_req: any, res: any) => res.status(403).json({ message: 'CSRF validation failed' });
  setupAddonRoutes(app as any, { ensureAuthenticated: fakeEnsureAuthenticated, service, requireCsrf, issueCsrfToken: fakeIssueCsrfToken });

  const res = await invoke(app, 'POST', '/api/addons/purchase', {
    ...authenticatedAs(100),
    body: { addonKey: 'extra_user', quantity: 1 },
  });

  assert.equal(res.statusCode, 403);
  assert.equal(service.purchaseCalls.length, 0, 'un fallo de CSRF nunca debe crear una compra');
});

test('POST /api/addons/:addonKey/auto-renew se bloquea si falla la comprobación CSRF', async () => {
  const app = new TestApp();
  const service = createFakeService();
  const requireCsrf = (_req: any, res: any) => res.status(403).json({ message: 'CSRF validation failed' });
  setupAddonRoutes(app as any, { ensureAuthenticated: fakeEnsureAuthenticated, service, requireCsrf, issueCsrfToken: fakeIssueCsrfToken });

  const res = await invoke(app, 'POST', '/api/addons/:addonKey/auto-renew', {
    ...authenticatedAs(100),
    params: { addonKey: 'extra_user' },
    body: { autoRenew: true },
  });

  assert.equal(res.statusCode, 403);
  assert.equal(service.autoRenewCalls.length, 0, 'un fallo de CSRF nunca debe cambiar auto-renew');
});
