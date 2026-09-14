import type Stripe from 'stripe';
import { logger } from '../utils/logger';
import { addDays, type AddonPurchaseStore } from './addon-purchase-service';

/**
 * Add-on billing integrity: every transition below reuses the SAME `stripeWebhookEvents` ledger
 * (via `AddonPurchaseStore#claimAndActivate/claimAndFail/claimAndRevoke`) that
 * `subscription-webhooks.ts` uses for plan billing — one row per Stripe event id, inserted with
 * `onConflictDoNothing`, in the same DB transaction as the state transition it guards. A replayed
 * event id is therefore always a strict no-op, and a crash between "claimed" and "applied" can
 * never happen because both happen in one transaction.
 *
 * | Stripe event                                          | Effect                                  |
 * |--------------------------------------------------------|------------------------------------------|
 * | checkout.session.completed (metadata.purchaseId)        | pending -> active (ONLY path that grants) |
 * | checkout.session.expired (metadata.purchaseId)          | pending -> failed, only if still pending  |
 * | payment_intent.payment_failed (metadata or PI lookup)   | pending -> failed                         |
 * | charge.refunded (active purchase)                       | active -> revoked ('refunded')            |
 * | charge.dispute.created (active purchase)                 | active -> revoked ('disputed')            |
 * | any of the above replayed (same event.id)                | strict no-op                              |
 *
 * This module is called from the existing, already signature-verified webhook entry point in
 * `server/routes/payment-callbacks.ts` — it does not open a new route or a second verification
 * path.
 */

export type AddonWebhookOutcome =
  | { handled: false }
  | { handled: true; event: string; purchaseId: number; outcome: string };

export interface HandleAddonWebhookDeps {
  store?: AddonPurchaseStore;
  now?: () => Date;
}

function parsePurchaseId(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const id = Number.parseInt(value, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function idOf(value: string | { id: string } | null | undefined): string | undefined {
  if (!value) return undefined;
  return typeof value === 'string' ? value : value.id;
}

/**
 * Inspects a Stripe event and, if it's one this feature owns (recognized by
 * `metadata.purchaseId` being present, or — for charge events — by the underlying payment intent
 * matching a purchase we recorded), applies the corresponding transition. Returns
 * `{handled:false}` for any event this feature doesn't own so the caller can keep its existing
 * handling untouched.
 */
export async function handleAddonWebhookEvent(
  event: Stripe.Event,
  deps: HandleAddonWebhookDeps = {}
): Promise<AddonWebhookOutcome> {
  // Lazily loaded so a plain `node:test` run of this module (which always injects its own fake
  // `store`) never pulls in the real DB connection — see addon-purchase-store.ts's header comment.
  const store = deps.store ?? (await import('./addon-purchase-store')).createDrizzleAddonPurchaseStore();
  const now = deps.now ?? (() => new Date());

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const purchaseId = parsePurchaseId(session.metadata?.purchaseId);
      if (purchaseId == null) return { handled: false };

      const purchase = await store.getPurchaseById(purchaseId);
      if (!purchase) {
        logger.error('addon-billing-webhooks', `checkout.session.completed: purchase ${purchaseId} not found`);
        return { handled: true, event: event.type, purchaseId, outcome: 'not-found' };
      }
      const addon = await store.getAddonById(purchase.addonId);
      if (!addon) {
        logger.error('addon-billing-webhooks', `checkout.session.completed: addon ${purchase.addonId} missing for purchase ${purchaseId}`);
        return { handled: true, event: event.type, purchaseId, outcome: 'addon-not-found' };
      }

      const purchasedAt = now();
      const expiresAt = addDays(purchasedAt, addon.validityDays);
      const paymentIntentId = idOf(session.payment_intent as any);

      const outcome = await store.claimAndActivate({
        eventId: event.id,
        eventType: event.type,
        companyId: purchase.companyId,
        purchaseId,
        purchasedAt,
        expiresAt,
        paymentIntentId,
      });
      logger.info('addon-billing-webhooks', `checkout.session.completed -> ${outcome} (purchase ${purchaseId})`);
      return { handled: true, event: event.type, purchaseId, outcome };
    }

    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session;
      const purchaseId = parsePurchaseId(session.metadata?.purchaseId);
      if (purchaseId == null) return { handled: false };

      const purchase = await store.getPurchaseById(purchaseId);
      if (!purchase) {
        return { handled: true, event: event.type, purchaseId, outcome: 'not-found' };
      }

      const outcome = await store.claimAndFail({
        eventId: event.id,
        eventType: event.type,
        companyId: purchase.companyId,
        purchaseId,
      });
      logger.info('addon-billing-webhooks', `checkout.session.expired -> ${outcome} (purchase ${purchaseId})`);
      return { handled: true, event: event.type, purchaseId, outcome };
    }

    case 'payment_intent.payment_failed': {
      const intent = event.data.object as Stripe.PaymentIntent;
      let purchaseId = parsePurchaseId(intent.metadata?.purchaseId);
      let purchase = purchaseId != null ? await store.getPurchaseById(purchaseId) : undefined;

      if (!purchase) {
        purchase = await store.getPurchaseByPaymentIntentId(intent.id);
        purchaseId = purchase?.id ?? null;
      }
      if (!purchase || purchaseId == null) return { handled: false };

      const outcome = await store.claimAndFail({
        eventId: event.id,
        eventType: event.type,
        companyId: purchase.companyId,
        purchaseId,
      });
      logger.info('addon-billing-webhooks', `payment_intent.payment_failed -> ${outcome} (purchase ${purchaseId})`);
      return { handled: true, event: event.type, purchaseId, outcome };
    }

    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId = idOf(charge.payment_intent as any);
      const purchase = paymentIntentId ? await store.getPurchaseByPaymentIntentId(paymentIntentId) : undefined;
      if (!purchase) return { handled: false };

      const outcome = await store.claimAndRevoke({
        eventId: event.id,
        eventType: event.type,
        companyId: purchase.companyId,
        purchaseId: purchase.id,
        reason: 'refunded',
        chargeId: charge.id,
      });
      logger.info('addon-billing-webhooks', `charge.refunded -> ${outcome} (purchase ${purchase.id})`);
      return { handled: true, event: event.type, purchaseId: purchase.id, outcome };
    }

    case 'charge.dispute.created': {
      const dispute = event.data.object as Stripe.Dispute;
      const paymentIntentId = idOf(dispute.payment_intent as any);
      const purchase = paymentIntentId ? await store.getPurchaseByPaymentIntentId(paymentIntentId) : undefined;
      if (!purchase) return { handled: false };

      const chargeId = idOf(dispute.charge as any);
      const outcome = await store.claimAndRevoke({
        eventId: event.id,
        eventType: event.type,
        companyId: purchase.companyId,
        purchaseId: purchase.id,
        reason: 'disputed',
        chargeId,
      });
      logger.info('addon-billing-webhooks', `charge.dispute.created -> ${outcome} (purchase ${purchase.id})`);
      return { handled: true, event: event.type, purchaseId: purchase.id, outcome };
    }

    default:
      return { handled: false };
  }
}
