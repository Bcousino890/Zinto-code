import type { Express, NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { issueSessionCsrfToken, requireSessionCsrf } from '../../middleware/csrf-protection';
import type { IStorage } from '../../storage';
import type { AddonCatalogSyncService, SyncResult } from '../../services/addon-catalog-sync-service';

type AddonStorage = Pick<IStorage, 'getAllAddons' | 'getAddonById' | 'updateAddon'>;
type SyncService = Pick<AddonCatalogSyncService, 'syncAddon'>;

type RouteDependencies = {
  ensureSuperAdmin: (req: Request, res: Response, next: NextFunction) => unknown;
  requireCsrf: (req: Request, res: Response, next: NextFunction) => unknown;
  storage: AddonStorage;
  createSyncService: (options?: { dryRun?: boolean }) => Promise<SyncService> | SyncService;
};

function hasAtMostTwoDecimals(value: number): boolean {
  return Number.isFinite(value) && Math.round(value * 100) / 100 === value;
}

const priceSchema = z
  .number()
  .positive()
  .refine(hasAtMostTwoDecimals, { message: 'Must be a positive number with at most 2 decimal places' });

const updateAddonSchema = z
  .object({
    unitPriceEur: priceSchema.optional(),
    unitPriceUsd: priceSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const idParamsSchema = z.object({ id: z.coerce.number().int().positive() });
const syncQuerySchema = z.object({ dryRun: z.enum(['true', 'false']).optional() });

const noRemoteStripeClient = new Proxy(
  {},
  {
    get() {
      throw new Error('Stripe is unavailable during an addon catalog dry-run');
    },
  },
);

export async function createAddonCatalogSyncService(options: { dryRun?: boolean } = {}): Promise<AddonCatalogSyncService> {
  const [{ storage }, { AddonCatalogSyncService }, { StripeClientProvider }] = await Promise.all([
    import('../../storage'),
    import('../../services/addon-catalog-sync-service'),
    import('../../services/stripe-client-provider'),
  ]);
  const stripe = options.dryRun ? noRemoteStripeClient : await new StripeClientProvider(storage).getClient();
  return new AddonCatalogSyncService({ storage, stripe: stripe as any });
}

const defaultDependencies: RouteDependencies = {
  async ensureSuperAdmin(req, res, next) {
    const { ensureSuperAdmin } = await import('../../middleware');
    return ensureSuperAdmin(req, res, next);
  },
  requireCsrf: requireSessionCsrf,
  storage: new Proxy(
    {},
    {
      get(_target, property) {
        return async (...args: unknown[]) => {
          const { storage } = await import('../../storage');
          return (storage as any)[property](...args);
        };
      },
    },
  ) as AddonStorage,
  createSyncService: createAddonCatalogSyncService,
};

async function errorMessage(error: unknown): Promise<string> {
  const { sanitizeStripeCatalogError } = await import('../../services/stripe-client-provider');
  return sanitizeStripeCatalogError(error);
}

export function setupAddonCatalogRoutes(app: Express, dependencies: Partial<RouteDependencies> = {}) {
  const routes = { ...defaultDependencies, ...dependencies };

  app.get('/api/admin/addons', routes.ensureSuperAdmin, async (req, res) => {
    try {
      const list = await routes.storage.getAllAddons();
      res.json({ csrfToken: issueSessionCsrfToken(req), addons: list });
    } catch (error) {
      res.status(500).json({ message: await errorMessage(error) });
    }
  });

  app.patch('/api/admin/addons/:id', routes.ensureSuperAdmin, routes.requireCsrf, async (req, res) => {
    const paramsParsed = idParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return res.status(400).json({ message: 'Invalid addon id' });

    const bodyParsed = updateAddonSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      return res.status(400).json({ message: bodyParsed.error.issues[0]?.message ?? 'Invalid request body' });
    }

    try {
      const existing = await routes.storage.getAddonById(paramsParsed.data.id);
      if (!existing) return res.status(404).json({ message: 'Addon not found' });

      const updates: Record<string, unknown> = {};
      if (bodyParsed.data.unitPriceEur !== undefined) updates.unitPriceEur = bodyParsed.data.unitPriceEur.toFixed(2);
      if (bodyParsed.data.unitPriceUsd !== undefined) updates.unitPriceUsd = bodyParsed.data.unitPriceUsd.toFixed(2);
      if (bodyParsed.data.isActive !== undefined) updates.isActive = bodyParsed.data.isActive;

      // A price edit invalidates whatever Stripe sync already ran — until an explicit re-sync
      // recomputes stripePriceIdEur/Usd for the NEW amount, createPurchaseCheckoutSession refuses
      // to charge (see its `stripeSyncStatus !== 'synced'` check). Without this, the DB price
      // shown to a customer and the amount actually charged via the still-'synced'-looking old
      // Stripe price would silently diverge the moment an admin edits a price and forgets to sync.
      const priceActuallyChanged =
        (updates.unitPriceEur !== undefined && updates.unitPriceEur !== existing.unitPriceEur) ||
        (updates.unitPriceUsd !== undefined && updates.unitPriceUsd !== existing.unitPriceUsd);
      if (priceActuallyChanged) updates.stripeSyncStatus = 'pending';

      const updated = await routes.storage.updateAddon(paramsParsed.data.id, updates);
      res.json({ addon: updated });
    } catch (error) {
      res.status(500).json({ message: await errorMessage(error) });
    }
  });

  app.post('/api/admin/addons/:id/sync', routes.ensureSuperAdmin, routes.requireCsrf, async (req, res) => {
    const paramsParsed = idParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return res.status(400).json({ message: 'Invalid addon id' });

    const queryParsed = syncQuerySchema.safeParse(req.query);
    if (!queryParsed.success) return res.status(400).json({ message: 'dryRun must be true or false' });
    const dryRun = queryParsed.data.dryRun === 'true';

    try {
      const existing = await routes.storage.getAddonById(paramsParsed.data.id);
      if (!existing) return res.status(404).json({ message: 'Addon not found' });

      const service = await routes.createSyncService({ dryRun });
      const result: SyncResult = await service.syncAddon(paramsParsed.data.id, { dryRun });
      res.json({ result });
    } catch (error) {
      res.status(502).json({ message: await errorMessage(error) });
    }
  });
}
