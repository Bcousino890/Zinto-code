import * as cron from 'node-cron';
import type Stripe from 'stripe';
import { resolveBillingCurrency } from '@shared/billing-currency';
import { logger } from '../utils/logger';
import { addDays, computeQuote, type AddonPurchaseStore, type AddonPurchaseRow } from './addon-purchase-service';

/** How far ahead of expiry a row becomes eligible for auto-renewal. */
const DEFAULT_LOOKAHEAD_MS = 6 * 60 * 60 * 1000; // 6 hours
/** How often the cron job runs. */
const DEFAULT_CRON_EXPRESSION = '0 * * * *'; // hourly

export interface RenewalRunSummary {
  processed: number;
  renewed: number;
  skipped: number;
  failed: number;
}

export interface RunDueRenewalsDeps {
  store?: AddonPurchaseStore;
  getStripeClient?: () => Promise<Stripe>;
  lookaheadMs?: number;
}

/** Lazily loaded so a plain `node:test` run of this module (which always injects its own fake
 * `store`/`getStripeClient`) never pulls in the real DB connection — see
 * `addon-purchase-store.ts`'s header comment. */
async function getDefaultStripeClient(): Promise<Stripe> {
  const { getDefaultStripeClient: getClient } = await import('./addon-purchase-store');
  return getClient();
}

function resolveDefaultPaymentMethod(customer: Stripe.Customer | Stripe.DeletedCustomer): string | undefined {
  if ((customer as Stripe.DeletedCustomer).deleted) return undefined;
  const full = customer as Stripe.Customer;
  const method = full.invoice_settings?.default_payment_method;
  if (!method) return undefined;
  return typeof method === 'string' ? method : method.id;
}

/**
 * Auto-renewal job. Reuses the exact same saved-payment-method mechanism as
 * `subscription-manager.ts#enableAutomaticRenewal` (a Stripe customer with
 * `invoice_settings.default_payment_method`) — it never stores or asks for a card itself.
 *
 * Integrity guarantees:
 *  - Re-prices from the LIVE `addons` catalog and the company's CURRENT currency on every run;
 *    never reuses a stored/previous amount.
 *  - A company with no Stripe customer or no saved default payment method is skipped (logged),
 *    never crashes the batch.
 *  - On a synchronous decline/error from Stripe, NO new row is created and the existing row's
 *    `expiresAt` is left untouched — the quota simply lapses at its original expiry if every
 *    retry (this function re-runs hourly until the row falls out of the lookahead window or
 *    expires) fails.
 *  - On success, exactly one new `active` row is inserted, chained via `renewedFromId`, with the
 *    new Stripe PaymentIntent id. That id is UNIQUE at the DB level, so if this function is ever
 *    invoked twice for the same due row (e.g. overlapping cron runs) — or a
 *    `payment_intent.succeeded` webhook for the same intent tries to do the same thing — the
 *    second insert attempt fails cleanly instead of duplicating quota.
 */
export async function runDueRenewals(now: Date = new Date(), deps: RunDueRenewalsDeps = {}): Promise<RenewalRunSummary> {
  const store = deps.store ?? (await import('./addon-purchase-store')).createDrizzleAddonPurchaseStore();
  const getStripeClient = deps.getStripeClient ?? getDefaultStripeClient;
  const lookaheadUntil = new Date(now.getTime() + (deps.lookaheadMs ?? DEFAULT_LOOKAHEAD_MS));

  const due = await store.listDueAutoRenewals(now, lookaheadUntil);
  const summary: RenewalRunSummary = { processed: 0, renewed: 0, skipped: 0, failed: 0 };

  for (const purchase of due) {
    summary.processed += 1;
    try {
      const outcome = await renewOne(purchase, { store, getStripeClient, now });
      summary[outcome] += 1;
    } catch (error) {
      // Never let one bad row abort the whole batch.
      logger.error('addon-renewal-service', `Unexpected error renewing purchase ${purchase.id}`, error);
      summary.failed += 1;
    }
  }

  logger.info(
    'addon-renewal-service',
    `Renewal run complete: processed=${summary.processed} renewed=${summary.renewed} skipped=${summary.skipped} failed=${summary.failed}`
  );
  return summary;
}

async function renewOne(
  purchase: AddonPurchaseRow,
  ctx: { store: AddonPurchaseStore; getStripeClient: () => Promise<Stripe>; now: Date }
): Promise<'renewed' | 'skipped' | 'failed'> {
  const { store, getStripeClient, now } = ctx;

  const company = await store.getCompanyById(purchase.companyId);
  if (!company?.stripeCustomerId) {
    logger.info('addon-renewal-service', `Skipping renewal of purchase ${purchase.id}: company ${purchase.companyId} has no Stripe customer`);
    return 'skipped';
  }

  const addon = await store.getAddonById(purchase.addonId);
  if (!addon || !addon.isActive) {
    logger.info('addon-renewal-service', `Skipping renewal of purchase ${purchase.id}: add-on ${purchase.addonId} is missing or inactive`);
    return 'skipped';
  }

  const stripe = await getStripeClient();
  const customer = await stripe.customers.retrieve(company.stripeCustomerId);
  const defaultPaymentMethod = resolveDefaultPaymentMethod(customer);
  if (!defaultPaymentMethod) {
    logger.info('addon-renewal-service', `Skipping renewal of purchase ${purchase.id}: company ${purchase.companyId} has no saved default payment method`);
    return 'skipped';
  }

  const currency = resolveBillingCurrency(company.country);
  const quote = computeQuote(addon, purchase.quantity, currency);

  let paymentIntent: Stripe.PaymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.create({
      amount: quote.totalAmountMinor,
      currency: currency.toLowerCase(),
      customer: company.stripeCustomerId,
      payment_method: defaultPaymentMethod,
      off_session: true,
      confirm: true,
      metadata: {
        renewalFromPurchaseId: String(purchase.id),
        companyId: String(purchase.companyId),
        addonId: String(purchase.addonId),
      },
    });
  } catch (error) {
    // card_declined, authentication_required, etc. — no row created, no expiry extension.
    logger.warn('addon-renewal-service', `Renewal charge failed for purchase ${purchase.id}`, error);
    return 'failed';
  }

  if (paymentIntent.status !== 'succeeded') {
    logger.warn(
      'addon-renewal-service',
      `Renewal PaymentIntent ${paymentIntent.id} for purchase ${purchase.id} did not succeed synchronously (status=${paymentIntent.status})`
    );
    return 'failed';
  }

  const purchasedAt = now;
  const expiresAt = addDays(purchasedAt, addon.validityDays);

  const inserted = await store.insertRenewalActivePurchase({
    companyId: purchase.companyId,
    addonId: purchase.addonId,
    quantity: purchase.quantity,
    currency,
    unitAmountMinor: quote.unitAmountMinor,
    totalAmountMinor: quote.totalAmountMinor,
    autoRenew: true,
    renewedFromId: purchase.id,
    purchasedAt,
    expiresAt,
    stripePaymentIntentId: paymentIntent.id,
  });

  if (inserted === 'duplicate') {
    logger.info('addon-renewal-service', `Renewal for purchase ${purchase.id} already recorded (payment intent ${paymentIntent.id}); skipping duplicate insert`);
    return 'skipped';
  }

  logger.info('addon-renewal-service', `Renewed purchase ${purchase.id} -> new purchase ${inserted.id} (payment intent ${paymentIntent.id})`);
  return 'renewed';
}

// ---------------------------------------------------------------------------
// Periodic-job wiring (node-cron — the same mechanism `subscription-scheduler.ts`,
// `conference-cleanup-scheduler.ts`, `backup-scheduler.ts` etc. already use in this codebase).
// ---------------------------------------------------------------------------

let scheduledTask: cron.ScheduledTask | null = null;

export function startAddonRenewalScheduler(cronExpression: string = DEFAULT_CRON_EXPRESSION): void {
  if (scheduledTask) {
    logger.info('addon-renewal-service', 'Renewal scheduler already running');
    return;
  }
  if (!cron.validate(cronExpression)) {
    throw new Error(`Invalid cron expression: ${cronExpression}`);
  }

  scheduledTask = cron.schedule(cronExpression, () => {
    runDueRenewals().catch((error) => {
      logger.error('addon-renewal-service', 'Error running scheduled add-on renewals', error);
    });
  });
  scheduledTask.start();
  logger.info('addon-renewal-service', `Add-on renewal scheduler started (${cronExpression})`);
}

export function stopAddonRenewalScheduler(): void {
  if (!scheduledTask) return;
  scheduledTask.stop();
  scheduledTask = null;
  logger.info('addon-renewal-service', 'Add-on renewal scheduler stopped');
}
