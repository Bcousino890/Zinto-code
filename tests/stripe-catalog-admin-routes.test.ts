import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { setupStripeCatalogRoutes } from "../server/routes/admin/stripe-catalog-routes";
import { issueSessionCsrfToken, requireSessionCsrf } from "../server/middleware/csrf-protection";

type Handler = (req: any, res: any, next?: () => void) => unknown;

class TestApp {
  readonly routes = new Map<string, Handler[]>();

  get(path: string, ...handlers: Handler[]) { this.routes.set(`GET ${path}`, handlers); }
  post(path: string, ...handlers: Handler[]) { this.routes.set(`POST ${path}`, handlers); }
  put(path: string, ...handlers: Handler[]) { this.routes.set(`PUT ${path}`, handlers); }
  delete(path: string, ...handlers: Handler[]) { this.routes.set(`DELETE ${path}`, handlers); }
}

const storedPlan = { id: 7, name: "Starter", price: "29", stripeSyncStatus: "pending", stripePriceId: null };
const storedCoupon = { id: 8, code: "WELCOME", stripeSyncStatus: "pending", stripeCouponId: null };
const jobs: Array<Record<string, unknown>> = [];
const routeStorage = {
  createPlan: async () => storedPlan,
  updatePlan: async () => storedPlan,
  getPlan: async () => storedPlan,
  deletePlan: async () => true,
  createCoupon: async () => storedCoupon,
  updateCoupon: async () => storedCoupon,
  getCouponById: async () => storedCoupon,
  getCouponByCode: async () => undefined,
  deleteCoupon: async () => true,
  enqueueStripeCatalogSync: async (job: Record<string, unknown>) => { jobs.push(job); return job; },
};

mock.module("../server/storage", { namedExports: { storage: routeStorage } });
mock.module("../server/middleware", {
  namedExports: {
    ensureSuperAdmin(req: any, res: any, next: () => void) {
      if (!req.isAuthenticated?.() || !req.user?.isSuperAdmin) return res.status(403).json({ message: "Super admin access required" });
      return next();
    },
  },
});

const { registerPlanRoutes } = await import("../server/plan-routes");
const { setupCouponRoutes } = await import("../server/routes/admin/coupon-routes");

function response() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

async function invoke(app: TestApp, method: "GET" | "POST", path: string, request: Record<string, unknown>) {
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

test("protects catalog synchronization routes and performs dry-runs without a Stripe client", async () => {
  const app = new TestApp();
  let clientFactoryCalls = 0;
  const syncCalls: Array<{ entityType: string; entityId: number; dryRun: boolean }> = [];

  setupStripeCatalogRoutes(app as any, {
    ensureSuperAdmin(req, res, next) {
      if (!req.isAuthenticated?.() || !req.user?.isSuperAdmin) {
        res.status(403).json({ message: "Super admin access required" });
        return;
      }
      return next();
    },
    requireCsrf(_req, _res, next) { return next(); },
    storage: {
      getAllPlans: async () => [{ id: 41, stripeSyncStatus: "pending" }],
      getAllCoupons: async () => [{ id: 42, stripeSyncStatus: "failed" }],
    },
    createSyncService() {
      clientFactoryCalls += 1;
      return {
        syncPlan: async (entityId: number, options: { dryRun?: boolean } = {}) => {
          syncCalls.push({ entityType: "plan", entityId, dryRun: options.dryRun === true });
          return { entityType: "plan", entityId, dryRun: options.dryRun === true, actions: ["create_product"], fingerprint: "plan-fingerprint" };
        },
        syncCoupon: async (entityId: number, options: { dryRun?: boolean } = {}) => {
          syncCalls.push({ entityType: "coupon", entityId, dryRun: options.dryRun === true });
          return { entityType: "coupon", entityId, dryRun: options.dryRun === true, actions: ["create_coupon"], fingerprint: "coupon-fingerprint" };
        },
      };
    },
  });

  const anonymous = await invoke(app, "POST", "/api/admin/stripe-catalog/sync", {
    body: { dryRun: true },
    isAuthenticated: () => false,
  });
  assert.equal(anonymous.statusCode, 403);
  assert.equal(clientFactoryCalls, 0);

  const dryRun = await invoke(app, "POST", "/api/admin/stripe-catalog/sync", {
    body: { dryRun: true, stripePriceId: "price_from_body", stripeSyncStatus: "synced" },
    isAuthenticated: () => true,
    user: { isSuperAdmin: true },
  });
  assert.equal(dryRun.statusCode, 200);
  assert.deepEqual(syncCalls, [
    { entityType: "plan", entityId: 41, dryRun: true },
    { entityType: "coupon", entityId: 42, dryRun: true },
  ]);
  assert.equal(clientFactoryCalls, 1);
});

test("queues persisted plan and coupon changes while rejecting client Stripe fields", async () => {
  jobs.length = 0;
  const app = new TestApp();
  registerPlanRoutes(app as any);
  setupCouponRoutes(app as any);

  const admin = { isAuthenticated: () => true, user: { id: 1, isSuperAdmin: true } };
  const plan = await invoke(app, "POST", "/api/admin/plans", {
    ...admin,
    body: {
      name: "Starter", price: "29", maxUsers: 2, maxContacts: 100, maxChannels: 2, maxFlows: 5,
      stripePriceId: "price_from_body", stripeSyncStatus: "synced",
    },
  });
  assert.equal(plan.statusCode, 201);

  const coupon = await invoke(app, "POST", "/api/admin/coupons", {
    ...admin,
    body: {
      code: "WELCOME", name: "Welcome", discountType: "percentage", discountValue: 10,
      startDate: "2026-09-13T00:00:00.000Z", stripeCouponId: "coupon_from_body", stripeSyncStatus: "synced",
    },
  });
  assert.equal(coupon.statusCode, 201);
  assert.deepEqual(jobs.map((job) => ({ entityType: job.entityType, entityId: job.entityId, operation: job.operation })), [
    { entityType: "plan", entityId: 7, operation: "upsert" },
    { entityType: "coupon", entityId: 8, operation: "upsert" },
  ]);
  assert.equal((plan.body as any).stripePriceId, null);
  assert.equal((coupon.body as any).data.stripeCouponId, null);
});

test("aborts plan and coupon deletion when Stripe archival fails", async () => {
  const app = new TestApp();
  registerPlanRoutes(app as any, { archivePlan: async () => { throw new Error("archive failed"); } });
  setupCouponRoutes(app as any, { archiveCoupon: async () => { throw new Error("archive failed"); } });
  const admin = { isAuthenticated: () => true, user: { id: 1, isSuperAdmin: true } };

  const plan = await invoke(app, "DELETE", "/api/admin/plans/:id", { ...admin, params: { id: "7" } });
  const coupon = await invoke(app, "DELETE", "/api/admin/coupons/:id", { ...admin, params: { id: "8" } });
  assert.equal(plan.statusCode, 502);
  assert.equal(coupon.statusCode, 502);
});

test("reports persisted sync state and retries only a validated catalog entity", async () => {
  const app = new TestApp();
  const retries: Array<{ entityType: string; entityId: number }> = [];
  setupStripeCatalogRoutes(app as any, {
    ensureSuperAdmin(_req, _res, next) { return next(); },
    requireCsrf(_req, _res, next) { return next(); },
    storage: {
      getAllPlans: async () => [{ id: 51, stripeSyncStatus: "synced" }, { id: 52, stripeSyncStatus: "failed", stripeSyncError: "safe error" }],
      getAllCoupons: async () => [{ id: 53, stripeSyncStatus: "pending" }],
    },
    createSyncService: () => ({
      syncPlan: async (entityId: number) => {
        retries.push({ entityType: "plan", entityId });
        return { entityType: "plan" as const, entityId, dryRun: false, actions: ["unchanged" as const], fingerprint: "retry" };
      },
      syncCoupon: async (entityId: number) => {
        retries.push({ entityType: "coupon", entityId });
        return { entityType: "coupon" as const, entityId, dryRun: false, actions: ["unchanged" as const], fingerprint: "retry" };
      },
    }),
  });

  const status = await invoke(app, "GET", "/api/admin/stripe-catalog/status", { session: {} });
  assert.equal(status.statusCode, 200);
  assert.match((status.body as any).csrfToken, /^[A-Za-z0-9_-]{40,}$/);
  assert.deepEqual({ ...(status.body as any), csrfToken: undefined }, {
    csrfToken: undefined,
    plans: { pending: 0, synced: 1, failed: 1 },
    coupons: { pending: 1, synced: 0, failed: 0 },
    failed: [{ entityType: "plan", entityId: 52, error: "safe error" }],
  });

  const retry = await invoke(app, "POST", "/api/admin/stripe-catalog/retry/:entityType/:entityId", { params: { entityType: "coupon", entityId: "53" } });
  assert.equal(retry.statusCode, 200);
  assert.deepEqual(retries, [{ entityType: "coupon", entityId: 53 }]);

  const invalid = await invoke(app, "POST", "/api/admin/stripe-catalog/retry/:entityType/:entityId", { params: { entityType: "stripe", entityId: "price_from_body" } });
  assert.equal(invalid.statusCode, 400);
});

test("requires a same-origin session CSRF token before synchronizing or retrying", async () => {
  const app = new TestApp();
  const calls: string[] = [];
  const session: Record<string, unknown> = {};
  const token = issueSessionCsrfToken({ session } as any);
  const headers = (values: Record<string, string | undefined>) => (name: string) => values[name.toLowerCase()];

  setupStripeCatalogRoutes(app as any, {
    ensureSuperAdmin(_req, _res, next) { return next(); },
    requireCsrf: requireSessionCsrf,
    storage: {
      getAllPlans: async () => [{ id: 61 }],
      getAllCoupons: async () => [],
    },
    createSyncService: () => ({
      syncPlan: async (entityId: number) => {
        calls.push(`plan:${entityId}`);
        return { entityType: 'plan' as const, entityId, dryRun: false, actions: ['unchanged' as const], fingerprint: 'csrf' };
      },
      syncCoupon: async (entityId: number) => {
        calls.push(`coupon:${entityId}`);
        return { entityType: 'coupon' as const, entityId, dryRun: false, actions: ['unchanged' as const], fingerprint: 'csrf' };
      },
    }),
  } as any);

  const crossSite = await invoke(app, 'POST', '/api/admin/stripe-catalog/sync', {
    session, protocol: 'https', body: { dryRun: false },
    get: headers({ host: 'admin.zinto.test', origin: 'https://evil.example', 'x-csrf-token': token }),
  });
  assert.equal(crossSite.statusCode, 403);

  const missingToken = await invoke(app, 'POST', '/api/admin/stripe-catalog/retry/:entityType/:entityId', {
    session, protocol: 'https', params: { entityType: 'plan', entityId: '61' },
    get: headers({ host: 'admin.zinto.test', origin: 'https://admin.zinto.test' }),
  });
  assert.equal(missingToken.statusCode, 403);
  assert.deepEqual(calls, []);

  const sameOrigin = { host: 'admin.zinto.test', origin: 'https://admin.zinto.test', 'x-csrf-token': token };
  const sync = await invoke(app, 'POST', '/api/admin/stripe-catalog/sync', {
    session, protocol: 'https', body: { dryRun: false }, get: headers(sameOrigin),
  });
  const retry = await invoke(app, 'POST', '/api/admin/stripe-catalog/retry/:entityType/:entityId', {
    session, protocol: 'https', params: { entityType: 'plan', entityId: '61' }, get: headers(sameOrigin),
  });
  assert.equal(sync.statusCode, 200);
  assert.equal(retry.statusCode, 200);
  assert.deepEqual(calls, ['plan:61', 'plan:61']);
});
