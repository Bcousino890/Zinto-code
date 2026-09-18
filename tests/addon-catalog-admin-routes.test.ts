import assert from 'node:assert/strict';
import test from 'node:test';

import { setupAddonCatalogRoutes } from '../server/routes/admin/addon-catalog-routes';

type Handler = (req: any, res: any, next?: () => void) => unknown;

class TestApp {
  readonly routes = new Map<string, Handler[]>();
  get(path: string, ...handlers: Handler[]) {
    this.routes.set(`GET ${path}`, handlers);
  }
  patch(path: string, ...handlers: Handler[]) {
    this.routes.set(`PATCH ${path}`, handlers);
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

async function invoke(app: TestApp, method: 'GET' | 'PATCH' | 'POST', path: string, request: Record<string, unknown>) {
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

function baseAddon(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    key: 'extra_user',
    name: 'Usuario adicional',
    unitPriceEur: '12.00',
    unitPriceUsd: '12.00',
    isActive: true,
    stripeProductId: 'prod_1',
    stripePriceIdEur: 'price_eur_old',
    stripePriceIdUsd: 'price_usd_old',
    stripeSyncStatus: 'synced',
    ...overrides,
  };
}

function fakeStorage(addon: ReturnType<typeof baseAddon>) {
  const updateCalls: Array<{ id: number; updates: Record<string, unknown> }> = [];
  let current = { ...addon };
  return {
    updateCalls,
    async getAllAddons() {
      return [current];
    },
    async getAddonById(id: number) {
      return id === current.id ? current : undefined;
    },
    async updateAddon(id: number, updates: Record<string, unknown>) {
      updateCalls.push({ id, updates });
      current = { ...current, ...updates };
      return current;
    },
  };
}

function passthroughMiddleware(_req: any, _res: any, next: () => void) {
  return next();
}

test('PATCH /api/admin/addons/:id resetea stripeSyncStatus a pending cuando el precio realmente cambia', async () => {
  const app = new TestApp();
  const storage = fakeStorage(baseAddon());
  setupAddonCatalogRoutes(app as any, {
    ensureSuperAdmin: passthroughMiddleware,
    requireCsrf: passthroughMiddleware,
    storage: storage as any,
  });

  const res = await invoke(app, 'PATCH', '/api/admin/addons/:id', {
    params: { id: '1' },
    body: { unitPriceEur: 13 },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(storage.updateCalls.length, 1);
  assert.equal(storage.updateCalls[0].updates.stripeSyncStatus, 'pending');
  assert.equal(
    storage.updateCalls[0].updates.unitPriceEur,
    '13.00',
    'el nuevo precio SÍ debe guardarse — solo el estado de sync se invalida'
  );
});

test('PATCH /api/admin/addons/:id NO toca stripeSyncStatus si el precio enviado es igual al actual', async () => {
  const app = new TestApp();
  const storage = fakeStorage(baseAddon({ unitPriceEur: '12.00' }));
  setupAddonCatalogRoutes(app as any, {
    ensureSuperAdmin: passthroughMiddleware,
    requireCsrf: passthroughMiddleware,
    storage: storage as any,
  });

  await invoke(app, 'PATCH', '/api/admin/addons/:id', {
    params: { id: '1' },
    body: { unitPriceEur: 12 },
  });

  assert.equal(
    storage.updateCalls[0].updates.stripeSyncStatus,
    undefined,
    'reenviar el mismo precio no debe invalidar un addon ya sincronizado'
  );
});

test('PATCH /api/admin/addons/:id NO toca stripeSyncStatus cuando solo cambia isActive (sin tocar el precio)', async () => {
  const app = new TestApp();
  const storage = fakeStorage(baseAddon());
  setupAddonCatalogRoutes(app as any, {
    ensureSuperAdmin: passthroughMiddleware,
    requireCsrf: passthroughMiddleware,
    storage: storage as any,
  });

  await invoke(app, 'PATCH', '/api/admin/addons/:id', {
    params: { id: '1' },
    body: { isActive: false },
  });

  assert.equal(storage.updateCalls[0].updates.stripeSyncStatus, undefined);
  assert.equal(storage.updateCalls[0].updates.isActive, false);
});
