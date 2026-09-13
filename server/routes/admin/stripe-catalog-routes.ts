import type { Express, NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { issueSessionCsrfToken, requireSessionCsrf } from '../../middleware/csrf-protection';
import type { IStorage } from '../../storage';
import type { StripeCatalogSyncService, SyncResult } from '../../services/stripe-catalog-sync-service';

type CatalogEntityType = 'plan' | 'coupon';
type CatalogEntity = { id: number; stripeSyncStatus?: 'pending' | 'synced' | 'failed' | string; stripeSyncError?: string | null };
type SyncService = Pick<StripeCatalogSyncService, 'syncPlan' | 'syncCoupon'>;
type CatalogStorage = Pick<IStorage, 'getAllPlans' | 'getAllCoupons' | 'getAppSetting'>;

type RouteDependencies = {
  ensureSuperAdmin: (req: Request, res: Response, next: NextFunction) => unknown;
  requireCsrf: (req: Request, res: Response, next: NextFunction) => unknown;
  storage: CatalogStorage;
  createSyncService: (options?: { dryRun?: boolean }) => Promise<SyncService> | SyncService;
};

const syncRequestSchema = z.object({ dryRun: z.boolean() });
const retryParamsSchema = z.object({ entityType: z.enum(['plan', 'coupon']), entityId: z.coerce.number().int().positive() });

const noRemoteStripeClient = new Proxy({}, {
  get() {
    throw new Error('Stripe is unavailable during a catalog dry-run');
  },
});

export async function createStripeCatalogSyncService(options: { dryRun?: boolean } = {}): Promise<StripeCatalogSyncService> {
  const [{ storage }, { StripeCatalogSyncService }, { StripeClientProvider }] = await Promise.all([
    import('../../storage'),
    import('../../services/stripe-catalog-sync-service'),
    import('../../services/stripe-client-provider'),
  ]);
  const stripe = options.dryRun ? noRemoteStripeClient : await new StripeClientProvider(storage).getClient();
  return new StripeCatalogSyncService({ storage, stripe: stripe as any });
}

const defaultDependencies: RouteDependencies = {
  async ensureSuperAdmin(req, res, next) {
    const { ensureSuperAdmin } = await import('../../middleware');
    return ensureSuperAdmin(req, res, next);
  },
  requireCsrf: requireSessionCsrf,
  storage: new Proxy({}, {
    get(_target, property) {
      return async (...args: unknown[]) => {
        const { storage } = await import('../../storage');
        return (storage as any)[property](...args);
      };
    },
  }) as CatalogStorage,
  createSyncService: createStripeCatalogSyncService,
};

async function errorMessage(error: unknown): Promise<string> {
  const { sanitizeStripeCatalogError } = await import('../../services/stripe-client-provider');
  return sanitizeStripeCatalogError(error);
}

function statusFor(items: CatalogEntity[]) {
  return items.reduce<Record<'pending' | 'synced' | 'failed', number>>((counts, item) => {
    const status = item.stripeSyncStatus;
    if (status === 'synced' || status === 'failed') counts[status] += 1;
    else counts.pending += 1;
    return counts;
  }, { pending: 0, synced: 0, failed: 0 });
}

async function synchronize(service: SyncService, entityType: CatalogEntityType, entityId: number, dryRun: boolean): Promise<SyncResult> {
  return entityType === 'plan'
    ? service.syncPlan(entityId, { dryRun })
    : service.syncCoupon(entityId, { dryRun });
}

export function setupStripeCatalogRoutes(app: Express, dependencies: Partial<RouteDependencies> = {}) {
  const routes = { ...defaultDependencies, ...dependencies };

  app.post('/api/admin/stripe-catalog/sync', routes.ensureSuperAdmin, routes.requireCsrf, async (req, res) => {
    const parsed = syncRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'dryRun must be a boolean' });

    try {
      const [plans, coupons] = await Promise.all([routes.storage.getAllPlans(), routes.storage.getAllCoupons()]);
      const service = await routes.createSyncService({ dryRun: parsed.data.dryRun });
      const results = await Promise.all([
        ...plans.map((plan) => synchronize(service, 'plan', plan.id, parsed.data.dryRun)),
        ...coupons.map((coupon) => synchronize(service, 'coupon', coupon.id, parsed.data.dryRun)),
      ]);
      res.json({ dryRun: parsed.data.dryRun, results });
    } catch (error) {
      res.status(502).json({ message: await errorMessage(error) });
    }
  });

  app.get('/api/admin/stripe-catalog/status', routes.ensureSuperAdmin, async (_req, res) => {
    try {
      const [plans, coupons] = await Promise.all([routes.storage.getAllPlans(), routes.storage.getAllCoupons()]);
      res.json({
        csrfToken: issueSessionCsrfToken(_req),
        plans: statusFor(plans),
        coupons: statusFor(coupons),
        failed: [
          ...plans.filter((plan) => plan.stripeSyncStatus === 'failed').map((plan) => ({ entityType: 'plan', entityId: plan.id, error: plan.stripeSyncError ?? null })),
          ...coupons.filter((coupon) => coupon.stripeSyncStatus === 'failed').map((coupon) => ({ entityType: 'coupon', entityId: coupon.id, error: coupon.stripeSyncError ?? null })),
        ],
      });
    } catch (error) {
      res.status(500).json({ message: await errorMessage(error) });
    }
  });

  app.post('/api/admin/stripe-catalog/retry/:entityType/:entityId', routes.ensureSuperAdmin, routes.requireCsrf, async (req, res) => {
    const parsed = retryParamsSchema.safeParse(req.params);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid catalog entity' });

    try {
      const service = await routes.createSyncService();
      const result = await synchronize(service, parsed.data.entityType, parsed.data.entityId, false);
      res.json({ result });
    } catch (error) {
      res.status(502).json({ message: await errorMessage(error) });
    }
  });
}
