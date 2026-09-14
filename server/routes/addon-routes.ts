import { z } from 'zod';
import { logger } from '../utils/logger';
import { ADDON_KEYS, AddonPurchaseError, type AddonPurchaseService } from '../services/addon-purchase-service';

// Duck-typed so tests can register routes on a plain fake app (no Express, no DB) instead of
// booting the real server — mirrors `server/routes/admin/stripe-catalog-routes.ts`.
export interface AddonRouteApp {
  get(path: string, ...handlers: Array<(req: any, res: any, next: () => void) => unknown>): unknown;
  post(path: string, ...handlers: Array<(req: any, res: any, next: () => void) => unknown>): unknown;
}

export interface AddonRoutesDeps {
  ensureAuthenticated: (req: any, res: any, next: () => void) => unknown;
  service: Pick<AddonPurchaseService, 'createPurchaseCheckoutSession' | 'setAddonAutoRenew' | 'getCompanyAddonStatus'>;
}

// `addonKey`/`quantity`/`autoRenew` only — `.strict()` rejects any other field, including a
// client-supplied `companyId`. The company is ALWAYS resolved from the authenticated session
// below, never from the request body.
const purchaseBodySchema = z
  .object({
    addonKey: z.enum(ADDON_KEYS),
    quantity: z.number().int().positive().max(50),
    autoRenew: z.boolean().optional(),
  })
  .strict();

const autoRenewBodySchema = z.object({ autoRenew: z.boolean() }).strict();

function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Invalid request body';
}

export function setupAddonRoutes(app: AddonRouteApp, deps: AddonRoutesDeps): void {
  const { ensureAuthenticated, service } = deps;

  /** POST /api/addons/purchase — always uses the authenticated request's own company id. */
  app.post('/api/addons/purchase', ensureAuthenticated, async (req: any, res: any) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const parsed = purchaseBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: firstIssueMessage(parsed.error) });
      }

      const result = await service.createPurchaseCheckoutSession(
        companyId,
        parsed.data.addonKey,
        parsed.data.quantity,
        parsed.data.autoRenew ?? false
      );
      return res.json(result);
    } catch (error) {
      if (error instanceof AddonPurchaseError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      logger.error('addon-routes', 'Unexpected error creating add-on checkout session', error);
      return res.status(500).json({ error: 'Failed to create checkout session' });
    }
  });

  /** POST /api/addons/:addonKey/auto-renew — scoped to the caller's own company. Applies to
   * every currently-active purchase row for that (company, addon) pair, not one purchase id: the
   * status view the client renders is an aggregate (total active quantity across possibly several
   * purchase batches), and "auto-renew this add-on" is the intent a customer actually has, so
   * there is no purchase id for the client to target in the first place. */
  app.post('/api/addons/:addonKey/auto-renew', ensureAuthenticated, async (req: any, res: any) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const addonKeyResult = z.enum(ADDON_KEYS).safeParse(req.params?.addonKey);
      if (!addonKeyResult.success) {
        return res.status(400).json({ error: 'Unknown add-on' });
      }

      const parsed = autoRenewBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: firstIssueMessage(parsed.error) });
      }

      const updated = await service.setAddonAutoRenew(companyId, addonKeyResult.data, parsed.data.autoRenew);
      if (!updated) {
        return res.status(404).json({ error: 'No active quota for this add-on' });
      }
      return res.json({ success: true });
    } catch (error) {
      logger.error('addon-routes', 'Unexpected error updating add-on auto-renew', error);
      return res.status(500).json({ error: 'Failed to update auto-renew' });
    }
  });

  /** GET /api/addons/status — status for the authenticated company only. */
  app.get('/api/addons/status', ensureAuthenticated, async (req: any, res: any) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const addonsStatus = await service.getCompanyAddonStatus(companyId);
      return res.json({ addons: addonsStatus });
    } catch (error) {
      logger.error('addon-routes', 'Unexpected error fetching add-on status', error);
      return res.status(500).json({ error: 'Failed to fetch add-on status' });
    }
  });
}

/** Production wiring: real session middleware + the real DB/Stripe-backed service singleton.
 * Both are loaded lazily (dynamic `import()`) so this module — and `setupAddonRoutes` above, which
 * is all `tests/addon-routes-authz.test.ts` exercises — never pulls in the real DB connection. */
export async function registerAddonRoutes(app: AddonRouteApp): Promise<void> {
  const [{ ensureAuthenticated }, { addonPurchaseService }] = await Promise.all([
    import('../middleware'),
    import('../services/addon-purchase-store'),
  ]);
  setupAddonRoutes(app, { ensureAuthenticated, service: addonPurchaseService });
}
