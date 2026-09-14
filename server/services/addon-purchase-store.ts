import Stripe from 'stripe';
import { and, eq, gt, lte, inArray } from 'drizzle-orm';
import { db } from '../db';
import { storage } from '../storage';
import { addons, addonPurchases, companies, stripeWebhookEvents } from '@shared/schema';
import { StripeClientProvider } from './stripe-client-provider';
import {
  AddonPurchaseService,
  DuplicatePendingPurchaseError,
  type AddonPurchaseStore,
} from './addon-purchase-service';

/**
 * Production wiring: the real Drizzle-backed `AddonPurchaseStore` and the real Stripe client.
 * Deliberately kept OUT of `addon-purchase-service.ts` (which must stay import-safe with no
 * database available, for tests) — this file is loaded lazily via dynamic `import()` from
 * `addon-routes.ts`, `addon-billing-webhooks.ts`, and `addon-renewal-service.ts` so a plain
 * `node:test` run of those modules never pays for (or crashes on) a real DB connection.
 */

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | DbTx;

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505';
}

async function claimWebhookEvent(
  executor: Executor,
  eventId: string,
  eventType: string,
  companyId: number | null
): Promise<boolean> {
  const [ledger] = await executor
    .insert(stripeWebhookEvents)
    .values({ eventId, eventType, companyId: companyId ?? undefined })
    .onConflictDoNothing({ target: stripeWebhookEvents.eventId })
    .returning();
  return !!ledger;
}

export function createDrizzleAddonPurchaseStore(): AddonPurchaseStore {
  return {
    async getAddonByKey(key) {
      const [row] = await db.select().from(addons).where(eq(addons.key, key)).limit(1);
      return row;
    },

    async getAddonById(id) {
      const [row] = await db.select().from(addons).where(eq(addons.id, id)).limit(1);
      return row;
    },

    async listAddons() {
      return db.select().from(addons);
    },

    async getCompanyById(id) {
      const [row] = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
      return row;
    },

    async setCompanyStripeCustomerId(companyId, stripeCustomerId) {
      await storage.updateCompany(companyId, { stripeCustomerId });
    },

    async insertPendingPurchase(input) {
      try {
        const [row] = await db
          .insert(addonPurchases)
          .values({
            companyId: input.companyId,
            addonId: input.addonId,
            quantity: input.quantity,
            currency: input.currency,
            unitAmountMinor: input.unitAmountMinor,
            totalAmountMinor: input.totalAmountMinor,
            autoRenew: input.autoRenew,
            status: 'pending',
          })
          .returning();
        return row;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new DuplicatePendingPurchaseError();
        }
        throw error;
      }
    },

    async setCheckoutSessionId(purchaseId, sessionId) {
      await db
        .update(addonPurchases)
        .set({ stripeCheckoutSessionId: sessionId })
        .where(eq(addonPurchases.id, purchaseId));
    },

    async markPendingFailed(purchaseId) {
      const [row] = await db
        .update(addonPurchases)
        .set({ status: 'failed' })
        .where(and(eq(addonPurchases.id, purchaseId), eq(addonPurchases.status, 'pending')))
        .returning();
      return !!row;
    },

    async sumActiveQuantity(companyId, addonId, now) {
      const rows = await db
        .select({ quantity: addonPurchases.quantity })
        .from(addonPurchases)
        .where(
          and(
            eq(addonPurchases.companyId, companyId),
            eq(addonPurchases.addonId, addonId),
            eq(addonPurchases.status, 'active'),
            gt(addonPurchases.expiresAt, now)
          )
        );
      return rows.reduce((sum, row) => sum + row.quantity, 0);
    },

    async listActivePurchases(companyId, addonId, now) {
      return db
        .select()
        .from(addonPurchases)
        .where(
          and(
            eq(addonPurchases.companyId, companyId),
            eq(addonPurchases.addonId, addonId),
            eq(addonPurchases.status, 'active'),
            gt(addonPurchases.expiresAt, now)
          )
        );
    },

    async setAutoRenewForAddon(companyId, addonId, autoRenew, now) {
      const rows = await db
        .update(addonPurchases)
        .set({ autoRenew })
        .where(
          and(
            eq(addonPurchases.companyId, companyId),
            eq(addonPurchases.addonId, addonId),
            eq(addonPurchases.status, 'active'),
            gt(addonPurchases.expiresAt, now)
          )
        )
        .returning({ id: addonPurchases.id });
      return rows.length > 0;
    },

    async getPurchaseById(id) {
      const [row] = await db.select().from(addonPurchases).where(eq(addonPurchases.id, id)).limit(1);
      return row;
    },

    async getPurchaseByPaymentIntentId(paymentIntentId) {
      const [row] = await db
        .select()
        .from(addonPurchases)
        .where(eq(addonPurchases.stripePaymentIntentId, paymentIntentId))
        .limit(1);
      return row;
    },

    async insertRenewalActivePurchase(input) {
      try {
        const [row] = await db
          .insert(addonPurchases)
          .values({
            companyId: input.companyId,
            addonId: input.addonId,
            quantity: input.quantity,
            currency: input.currency,
            unitAmountMinor: input.unitAmountMinor,
            totalAmountMinor: input.totalAmountMinor,
            status: 'active',
            autoRenew: input.autoRenew,
            renewedFromId: input.renewedFromId,
            purchasedAt: input.purchasedAt,
            expiresAt: input.expiresAt,
            stripePaymentIntentId: input.stripePaymentIntentId,
          })
          .returning();
        return row;
      } catch (error) {
        if (isUniqueViolation(error)) {
          return 'duplicate';
        }
        throw error;
      }
    },

    async listDueAutoRenewals(now, lookaheadUntil) {
      const candidates = await db
        .select()
        .from(addonPurchases)
        .where(
          and(
            eq(addonPurchases.status, 'active'),
            eq(addonPurchases.autoRenew, true),
            lte(addonPurchases.expiresAt, lookaheadUntil)
          )
        );
      if (candidates.length === 0) {
        return [];
      }
      const ids = candidates.map((row) => row.id);
      const alreadyRenewed = await db
        .select({ renewedFromId: addonPurchases.renewedFromId })
        .from(addonPurchases)
        .where(inArray(addonPurchases.renewedFromId, ids));
      const renewedIds = new Set(alreadyRenewed.map((row) => row.renewedFromId).filter((id): id is number => id != null));
      return candidates.filter((row) => !renewedIds.has(row.id));
    },

    async claimAndActivate(params) {
      return db.transaction(async (tx) => {
        const claimed = await claimWebhookEvent(tx, params.eventId, params.eventType, params.companyId);
        if (!claimed) {
          return 'duplicate-event';
        }

        const [updated] = await tx
          .update(addonPurchases)
          .set({
            status: 'active',
            purchasedAt: params.purchasedAt,
            expiresAt: params.expiresAt,
            ...(params.paymentIntentId ? { stripePaymentIntentId: params.paymentIntentId } : {}),
          })
          .where(and(eq(addonPurchases.id, params.purchaseId), eq(addonPurchases.status, 'pending')))
          .returning();

        if (updated) {
          return 'activated';
        }

        const [existing] = await tx.select().from(addonPurchases).where(eq(addonPurchases.id, params.purchaseId)).limit(1);
        if (!existing) {
          return 'not-found';
        }
        return existing.status === 'active' ? 'already-active' : 'not-pending';
      });
    },

    async claimAndFail(params) {
      return db.transaction(async (tx) => {
        const claimed = await claimWebhookEvent(tx, params.eventId, params.eventType, params.companyId);
        if (!claimed) {
          return 'duplicate-event';
        }

        const [updated] = await tx
          .update(addonPurchases)
          .set({ status: 'failed' })
          .where(and(eq(addonPurchases.id, params.purchaseId), eq(addonPurchases.status, 'pending')))
          .returning();

        if (updated) {
          return 'failed';
        }

        const [existing] = await tx.select().from(addonPurchases).where(eq(addonPurchases.id, params.purchaseId)).limit(1);
        return existing ? 'not-pending' : 'not-found';
      });
    },

    async claimAndRevoke(params) {
      return db.transaction(async (tx) => {
        const claimed = await claimWebhookEvent(tx, params.eventId, params.eventType, params.companyId);
        if (!claimed) {
          return 'duplicate-event';
        }

        const [updated] = await tx
          .update(addonPurchases)
          .set({
            status: 'revoked',
            revokedAt: new Date(),
            revokedReason: params.reason,
            ...(params.chargeId ? { stripeChargeId: params.chargeId } : {}),
          })
          .where(and(eq(addonPurchases.id, params.purchaseId), eq(addonPurchases.status, 'active')))
          .returning();

        if (updated) {
          return 'revoked';
        }

        const [existing] = await tx.select().from(addonPurchases).where(eq(addonPurchases.id, params.purchaseId)).limit(1);
        return existing ? 'not-active' : 'not-found';
      });
    },
  };
}

const defaultStripeClientProvider = new StripeClientProvider(storage);

export async function getDefaultStripeClient(): Promise<Stripe> {
  return defaultStripeClientProvider.getClient();
}

export const addonPurchaseService = new AddonPurchaseService({
  store: createDrizzleAddonPurchaseStore(),
  getStripeClient: getDefaultStripeClient,
});
