import type Stripe from 'stripe';
import type { addons, addonPurchases, companies } from '@shared/schema';
import { resolveBillingCurrency, type BillingCurrency } from '@shared/billing-currency';

/**
 * Pure, DB-free add-on billing logic: pricing, the persistence *interface* (not its Drizzle
 * implementation — see `addon-purchase-store.ts`), and the in-memory test fake.
 *
 * Deliberately has ZERO import of `../db` / `../storage` (even transitively) so this file — and
 * everything that only needs types/pure functions/the fake store from it — stays importable in a
 * plain `node:test` run with no database available, exactly like `StripeCatalogSyncService` /
 * `stripe-catalog-sync-job-policy.ts` already do in this codebase. The real Drizzle-backed store
 * and the default Stripe client both live in `addon-purchase-store.ts`, which production code
 * (`addon-routes.ts#registerAddonRoutes`, the renewal job, the webhook handler) loads lazily via
 * dynamic `import()` so tests never pay for it.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AddonRow = typeof addons.$inferSelect;
export type AddonPurchaseRow = typeof addonPurchases.$inferSelect;
export type CompanyRow = typeof companies.$inferSelect;

/** The fixed, known catalog of purchasable add-ons. Any other key is rejected. */
export const ADDON_KEYS = ['extra_user', 'extra_whatsapp_connection'] as const;
export type AddonKey = (typeof ADDON_KEYS)[number];

export class AddonPurchaseError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = 'AddonPurchaseError';
  }
}

/** Thrown by `insertPendingPurchase` when the partial unique index already has a pending row
 * for this (companyId, addonId) pair — i.e. the company double-clicked "buy" or already has an
 * unfinished checkout in flight. */
export class DuplicatePendingPurchaseError extends Error {
  constructor() {
    super('A pending purchase already exists for this company and add-on');
    this.name = 'DuplicatePendingPurchaseError';
  }
}

export interface AddonQuote {
  currency: BillingCurrency;
  unitAmountMinor: number;
  totalAmountMinor: number;
}

export interface NewPendingPurchase {
  companyId: number;
  addonId: number;
  quantity: number;
  currency: BillingCurrency;
  unitAmountMinor: number;
  totalAmountMinor: number;
  autoRenew: boolean;
}

export interface NewRenewalPurchase {
  companyId: number;
  addonId: number;
  quantity: number;
  currency: BillingCurrency;
  unitAmountMinor: number;
  totalAmountMinor: number;
  autoRenew: boolean;
  renewedFromId: number;
  purchasedAt: Date;
  expiresAt: Date;
  stripePaymentIntentId: string;
}

export type ActivateOutcome = 'activated' | 'already-active' | 'not-pending' | 'not-found' | 'duplicate-event';
export type FailOutcome = 'failed' | 'not-pending' | 'not-found' | 'duplicate-event';
export type RevokeOutcome = 'revoked' | 'not-active' | 'not-found' | 'duplicate-event';

export interface ClaimAndActivateParams {
  eventId: string;
  eventType: string;
  companyId: number;
  purchaseId: number;
  purchasedAt: Date;
  expiresAt: Date;
  paymentIntentId?: string | null;
}

export interface ClaimAndFailParams {
  eventId: string;
  eventType: string;
  companyId: number;
  purchaseId: number;
}

export interface ClaimAndRevokeParams {
  eventId: string;
  eventType: string;
  companyId: number;
  purchaseId: number;
  reason: string;
  chargeId?: string | null;
}

/**
 * The persistence surface for add-on billing. Kept as a plain, narrow, named-methods interface
 * (rather than exposing raw Drizzle query builders) so tests can inject a hand-rolled in-memory
 * fake instead of hitting a real Postgres — mirrors the `storage` DI pattern already used by
 * `StripeCatalogSyncService`.
 */
export interface AddonPurchaseStore {
  getAddonByKey(key: string): Promise<AddonRow | undefined>;
  getAddonById(id: number): Promise<AddonRow | undefined>;
  listAddons(): Promise<AddonRow[]>;
  getCompanyById(id: number): Promise<CompanyRow | undefined>;
  /** Persists a newly-created Stripe customer id for a company that didn't have one yet. */
  setCompanyStripeCustomerId(companyId: number, stripeCustomerId: string): Promise<void>;

  /** Throws `DuplicatePendingPurchaseError` if a pending row already exists for this pair. */
  insertPendingPurchase(input: NewPendingPurchase): Promise<AddonPurchaseRow>;
  setCheckoutSessionId(purchaseId: number, sessionId: string): Promise<void>;
  /** Best-effort cleanup: pending -> failed. Returns false if the row was no longer pending. */
  markPendingFailed(purchaseId: number): Promise<boolean>;

  /** SUM(quantity) WHERE status='active' AND expires_at > now — the one true "current quota"
   * query. Always computed fresh; never cached. */
  sumActiveQuantity(companyId: number, addonId: number, now: Date): Promise<number>;
  listActivePurchases(companyId: number, addonId: number, now: Date): Promise<AddonPurchaseRow[]>;
  /** Sets auto_renew on every currently-active row for this (companyId, addonId) pair — not a
   * single purchase id. A company can buy the same add-on in several batches over time (e.g. 2
   * extra users on day 1, 3 more on day 15, each with its own 30-day window); "auto-renew this
   * add-on" is a per-company-per-addon intent, not something tied to one purchase id the client
   * would otherwise have no reliable way to obtain from the aggregate status view. Returns
   * whether at least one active row matched (false if the company has no active quota for this
   * addon at all — nothing to toggle). */
  setAutoRenewForAddon(companyId: number, addonId: number, autoRenew: boolean, now: Date): Promise<boolean>;

  getPurchaseById(id: number): Promise<AddonPurchaseRow | undefined>;
  getPurchaseByPaymentIntentId(paymentIntentId: string): Promise<AddonPurchaseRow | undefined>;

  /** Renewal-only insert: a brand-new `active` row chained via `renewedFromId`. Returns
   * 'duplicate' (never throws) if `stripePaymentIntentId` already belongs to another row — i.e.
   * this exact renewal was already recorded (e.g. a `payment_intent.succeeded` webhook racing the
   * synchronous confirm). */
  insertRenewalActivePurchase(input: NewRenewalPurchase): Promise<AddonPurchaseRow | 'duplicate'>;
  /** Active, auto-renewing rows expiring at or before `lookaheadUntil`, excluding ones that
   * already have a renewal chained to them. */
  listDueAutoRenewals(now: Date, lookaheadUntil: Date): Promise<AddonPurchaseRow[]>;

  /** Atomically (a) claims `eventId` in the shared Stripe webhook idempotency ledger and, only if
   * newly claimed, (b) transitions the purchase. Both happen in one DB transaction so a crash
   * between the two can never leave the event "claimed" without the transition having applied. */
  claimAndActivate(params: ClaimAndActivateParams): Promise<ActivateOutcome>;
  claimAndFail(params: ClaimAndFailParams): Promise<FailOutcome>;
  claimAndRevoke(params: ClaimAndRevokeParams): Promise<RevokeOutcome>;
}

// ---------------------------------------------------------------------------
// Pure pricing (never trust a client-supplied amount/currency anywhere in this feature)
// ---------------------------------------------------------------------------

/** Server-only price computation. `addon` must come from the DB catalog; `currency` must come
 * from `resolveBillingCurrency(company.country)`. Never accepts a client-provided amount. */
export function computeQuote(
  addon: Pick<AddonRow, 'unitPriceEur' | 'unitPriceUsd'>,
  quantity: number,
  currency: BillingCurrency
): AddonQuote {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error(`Invalid add-on quantity: ${quantity}`);
  }
  const unitPriceDecimal = currency === 'EUR' ? addon.unitPriceEur : addon.unitPriceUsd;
  const unitAmountMinor = decimalToMinorUnits(unitPriceDecimal);
  return {
    currency,
    unitAmountMinor,
    totalAmountMinor: unitAmountMinor * quantity,
  };
}

function decimalToMinorUnits(decimalAmount: string | number): number {
  // numeric(10,2) columns come back from Drizzle/pg as strings to avoid float rounding surprises.
  const value = typeof decimalAmount === 'string' ? Number.parseFloat(decimalAmount) : decimalAmount;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid add-on price value: ${String(decimalAmount)}`);
  }
  return Math.round(value * 100);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// In-memory fake store (tests only — no mocking library, mirrors the
// `createStorage()` helper style used by tests/stripe-catalog-sync-service.test.ts)
// ---------------------------------------------------------------------------

export interface InMemoryAddonStoreSeed {
  addons?: AddonRow[];
  companies?: CompanyRow[];
  purchases?: AddonPurchaseRow[];
}

export function createInMemoryAddonStore(seed: InMemoryAddonStoreSeed = {}): AddonPurchaseStore & {
  purchases: Map<number, AddonPurchaseRow>;
  companies: Map<number, CompanyRow>;
  claimedEvents: Set<string>;
} {
  const addonsById = new Map<number, AddonRow>((seed.addons ?? []).map((a) => [a.id, a]));
  const companiesById = new Map<number, CompanyRow>((seed.companies ?? []).map((c) => [c.id, c]));
  const purchases = new Map<number, AddonPurchaseRow>((seed.purchases ?? []).map((p) => [p.id, p]));
  const claimedEvents = new Set<string>();
  let nextId = Math.max(0, ...[...purchases.keys()]) + 1;

  const clone = <T>(value: T): T => (value ? ({ ...(value as any) } as T) : value);

  const hasPendingFor = (companyId: number, addonId: number) =>
    [...purchases.values()].some((p) => p.companyId === companyId && p.addonId === addonId && p.status === 'pending');

  const hasPaymentIntent = (paymentIntentId: string | null | undefined) =>
    !!paymentIntentId && [...purchases.values()].some((p) => p.stripePaymentIntentId === paymentIntentId);

  return {
    purchases,
    companies: companiesById,
    claimedEvents,

    async getAddonByKey(key) {
      return clone([...addonsById.values()].find((a) => a.key === key));
    },
    async getAddonById(id) {
      return clone(addonsById.get(id));
    },
    async listAddons() {
      return [...addonsById.values()].map(clone);
    },
    async getCompanyById(id) {
      return clone(companiesById.get(id));
    },
    async setCompanyStripeCustomerId(companyId, stripeCustomerId) {
      const company = companiesById.get(companyId);
      if (company) company.stripeCustomerId = stripeCustomerId;
    },

    async insertPendingPurchase(input) {
      if (hasPendingFor(input.companyId, input.addonId)) {
        throw new DuplicatePendingPurchaseError();
      }
      const row: AddonPurchaseRow = {
        id: nextId++,
        companyId: input.companyId,
        addonId: input.addonId,
        quantity: input.quantity,
        currency: input.currency,
        unitAmountMinor: input.unitAmountMinor,
        totalAmountMinor: input.totalAmountMinor,
        status: 'pending',
        stripeCheckoutSessionId: null,
        stripePaymentIntentId: null,
        stripeChargeId: null,
        autoRenew: input.autoRenew,
        renewedFromId: null,
        purchasedAt: null,
        expiresAt: null,
        revokedAt: null,
        revokedReason: null,
        createdAt: new Date(),
      } as AddonPurchaseRow;
      purchases.set(row.id, row);
      return clone(row);
    },

    async setCheckoutSessionId(purchaseId, sessionId) {
      const row = purchases.get(purchaseId);
      if (row) row.stripeCheckoutSessionId = sessionId;
    },

    async markPendingFailed(purchaseId) {
      const row = purchases.get(purchaseId);
      if (!row || row.status !== 'pending') return false;
      row.status = 'failed';
      return true;
    },

    async sumActiveQuantity(companyId, addonId, now) {
      return [...purchases.values()]
        .filter(
          (p) =>
            p.companyId === companyId &&
            p.addonId === addonId &&
            p.status === 'active' &&
            p.expiresAt != null &&
            p.expiresAt.getTime() > now.getTime()
        )
        .reduce((sum, p) => sum + p.quantity, 0);
    },

    async listActivePurchases(companyId, addonId, now) {
      return [...purchases.values()]
        .filter(
          (p) =>
            p.companyId === companyId &&
            p.addonId === addonId &&
            p.status === 'active' &&
            p.expiresAt != null &&
            p.expiresAt.getTime() > now.getTime()
        )
        .map(clone);
    },

    async setAutoRenewForAddon(companyId, addonId, autoRenew, now) {
      const matches = [...purchases.values()].filter(
        (p) =>
          p.companyId === companyId &&
          p.addonId === addonId &&
          p.status === 'active' &&
          p.expiresAt != null &&
          p.expiresAt.getTime() > now.getTime()
      );
      for (const row of matches) row.autoRenew = autoRenew;
      return matches.length > 0;
    },

    async getPurchaseById(id) {
      return clone(purchases.get(id));
    },

    async getPurchaseByPaymentIntentId(paymentIntentId) {
      return clone([...purchases.values()].find((p) => p.stripePaymentIntentId === paymentIntentId));
    },

    async insertRenewalActivePurchase(input) {
      if (hasPaymentIntent(input.stripePaymentIntentId)) {
        return 'duplicate';
      }
      const row: AddonPurchaseRow = {
        id: nextId++,
        companyId: input.companyId,
        addonId: input.addonId,
        quantity: input.quantity,
        currency: input.currency,
        unitAmountMinor: input.unitAmountMinor,
        totalAmountMinor: input.totalAmountMinor,
        status: 'active',
        stripeCheckoutSessionId: null,
        stripePaymentIntentId: input.stripePaymentIntentId,
        stripeChargeId: null,
        autoRenew: input.autoRenew,
        renewedFromId: input.renewedFromId,
        purchasedAt: input.purchasedAt,
        expiresAt: input.expiresAt,
        revokedAt: null,
        revokedReason: null,
        createdAt: new Date(),
      } as AddonPurchaseRow;
      purchases.set(row.id, row);
      return clone(row);
    },

    async listDueAutoRenewals(now, lookaheadUntil) {
      const renewedFromIds = new Set(
        [...purchases.values()].map((p) => p.renewedFromId).filter((id): id is number => id != null)
      );
      return [...purchases.values()]
        .filter(
          (p) =>
            p.status === 'active' &&
            p.autoRenew === true &&
            p.expiresAt != null &&
            p.expiresAt.getTime() <= lookaheadUntil.getTime() &&
            !renewedFromIds.has(p.id)
        )
        .map(clone);
    },

    async claimAndActivate(params) {
      if (claimedEvents.has(params.eventId)) return 'duplicate-event';
      claimedEvents.add(params.eventId);

      const row = purchases.get(params.purchaseId);
      if (!row) return 'not-found';
      if (row.status === 'active') return 'already-active';
      if (row.status !== 'pending') return 'not-pending';

      row.status = 'active';
      row.purchasedAt = params.purchasedAt;
      row.expiresAt = params.expiresAt;
      if (params.paymentIntentId) row.stripePaymentIntentId = params.paymentIntentId;
      return 'activated';
    },

    async claimAndFail(params) {
      if (claimedEvents.has(params.eventId)) return 'duplicate-event';
      claimedEvents.add(params.eventId);

      const row = purchases.get(params.purchaseId);
      if (!row) return 'not-found';
      if (row.status !== 'pending') return 'not-pending';

      row.status = 'failed';
      return 'failed';
    },

    async claimAndRevoke(params) {
      if (claimedEvents.has(params.eventId)) return 'duplicate-event';
      claimedEvents.add(params.eventId);

      const row = purchases.get(params.purchaseId);
      if (!row) return 'not-found';
      if (row.status !== 'active') return 'not-active';

      row.status = 'revoked';
      row.revokedAt = new Date();
      row.revokedReason = params.reason;
      if (params.chargeId) row.stripeChargeId = params.chargeId;
      return 'revoked';
    },
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface AddonStatusEntry {
  key: string;
  name: string;
  unitPrice: number;
  currency: BillingCurrency;
  activeQuantity: number;
  nearestExpiresAt: Date | null;
  autoRenew: boolean;
}

export interface AddonPurchaseServiceDeps {
  store: AddonPurchaseStore;
  getStripeClient: () => Promise<Stripe>;
  now?: () => Date;
}

export class AddonPurchaseService {
  private readonly store: AddonPurchaseStore;
  private readonly getStripeClient: () => Promise<Stripe>;
  private readonly now: () => Date;

  constructor(deps: AddonPurchaseServiceDeps) {
    this.store = deps.store;
    this.getStripeClient = deps.getStripeClient;
    this.now = deps.now ?? (() => new Date());
  }

  async createPurchaseCheckoutSession(
    companyId: number,
    addonKey: string,
    quantity: number,
    autoRenew: boolean
  ): Promise<{ url: string }> {
    const company = await this.store.getCompanyById(companyId);
    if (!company) {
      throw new AddonPurchaseError('Company not found', 404);
    }

    const addon = await this.store.getAddonByKey(addonKey);
    if (!addon || !addon.isActive) {
      throw new AddonPurchaseError('Add-on not available', 404);
    }

    // An admin price edit resets this to 'pending' (see addon-catalog-routes.ts's PATCH handler)
    // until an explicit re-sync recomputes the Stripe price for the new amount. Refusing to
    // charge here is what actually closes that gap — without it, the price shown/quoted to the
    // customer (read fresh from this row) and the amount Stripe charges (the OLD, still-'synced'
    // -looking price id) could silently diverge the moment a price is edited but not yet synced.
    if (addon.stripeSyncStatus !== 'synced') {
      throw new AddonPurchaseError(
        `Add-on '${addon.key}' is not synced with Stripe (status: ${addon.stripeSyncStatus}); run the catalog sync first`,
        422
      );
    }

    const currency = resolveBillingCurrency(company.country);
    const stripePriceId = currency === 'EUR' ? addon.stripePriceIdEur : addon.stripePriceIdUsd;
    if (!stripePriceId) {
      // Real error condition per spec: never fall back to inline price_data.
      throw new AddonPurchaseError(
        `Add-on '${addon.key}' has no synced Stripe price for ${currency}; run the catalog sync first`,
        422
      );
    }

    const quote = computeQuote(addon, quantity, currency);

    let purchase: AddonPurchaseRow;
    try {
      purchase = await this.store.insertPendingPurchase({
        companyId,
        addonId: addon.id,
        quantity,
        currency: quote.currency,
        unitAmountMinor: quote.unitAmountMinor,
        totalAmountMinor: quote.totalAmountMinor,
        autoRenew,
      });
    } catch (error) {
      if (error instanceof DuplicatePendingPurchaseError) {
        throw new AddonPurchaseError('Ya tienes una compra en curso para este complemento', 409);
      }
      throw error;
    }

    const stripe = await this.getStripeClient();

    // A one-time Checkout Session normally has no lasting relationship with a Stripe Customer,
    // which would leave auto-renewal (this purchase's own, or toggled on later for the same
    // company+addon) with no saved card to ever charge off-session — there is no separate
    // card-collection UI anywhere in this app to fall back on. Attaching a Customer plus
    // `setup_future_usage: 'off_session'` below saves the card used here for that purpose,
    // on every purchase, regardless of whether auto-renew is requested at purchase time.
    let stripeCustomerId = company.stripeCustomerId ?? undefined;
    if (!stripeCustomerId) {
      try {
        const customer = await stripe.customers.create({
          email: company.companyEmail || undefined,
          name: company.name || undefined,
          metadata: { companyId: String(companyId) },
        });
        stripeCustomerId = customer.id;
        await this.store.setCompanyStripeCustomerId(companyId, stripeCustomerId);
      } catch (error) {
        // Same cleanup as the sibling checkout.sessions.create failure below: without this, a
        // customers.create failure (network blip, Stripe outage) leaves the just-inserted
        // `pending` row permanently orphaned — no Checkout Session is ever created, so no
        // checkout.session.expired webhook will ever arrive to fail it — and the partial unique
        // index then blocks every future purchase attempt for this company+addon with a 409.
        await this.store.markPendingFailed(purchase.id).catch(() => undefined);
        throw error;
      }
    }

    const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
    const metadata = {
      purchaseId: String(purchase.id),
      companyId: String(companyId),
      addonId: String(addon.id),
      quantity: String(quantity),
    };

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer: stripeCustomerId,
        line_items: [{ price: stripePriceId, quantity }],
        allow_promotion_codes: true,
        success_url: `${baseUrl}/payment/success?type=addon&purchaseId=${purchase.id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/payment/cancelled?type=addon&purchaseId=${purchase.id}`,
        metadata,
        // Copied onto the auto-created PaymentIntent too, so payment_intent.* webhooks (e.g. a
        // declined retry inside the same Checkout Session) can also be linked back to this row.
        // `setup_future_usage` is what actually saves the payment method to the customer above.
        payment_intent_data: { metadata, setup_future_usage: 'off_session' },
      });
    } catch (error) {
      // Never leave an unrecoverable `pending` row behind (it would permanently block this
      // company/add-on pair thanks to the one-pending-per-company-addon unique index).
      await this.store.markPendingFailed(purchase.id).catch(() => undefined);
      throw error;
    }

    if (!session.url) {
      await this.store.markPendingFailed(purchase.id).catch(() => undefined);
      throw new AddonPurchaseError('Stripe did not return a checkout URL', 502);
    }

    await this.store.setCheckoutSessionId(purchase.id, session.id);

    return { url: session.url };
  }

  /** SUM(quantity) WHERE status='active' AND expires_at > now — computed fresh every call. */
  async getActiveQuantity(companyId: number, addonId: number): Promise<number> {
    return this.store.sumActiveQuantity(companyId, addonId, this.now());
  }

  async getCompanyAddonStatus(companyId: number): Promise<AddonStatusEntry[]> {
    const company = await this.store.getCompanyById(companyId);
    const currency = resolveBillingCurrency(company?.country);
    const now = this.now();
    const addonRows = await this.store.listAddons();

    const entries: AddonStatusEntry[] = [];
    for (const addon of addonRows) {
      const activeRows = await this.store.listActivePurchases(companyId, addon.id, now);
      const activeQuantity = activeRows.reduce((sum, row) => sum + row.quantity, 0);
      const nearestExpiresAt = activeRows.reduce<Date | null>((min, row) => {
        if (!row.expiresAt) return min;
        if (!min || row.expiresAt.getTime() < min.getTime()) return row.expiresAt;
        return min;
      }, null);
      const autoRenew = activeRows.some((row) => row.autoRenew);
      const unitPriceDecimal = currency === 'EUR' ? addon.unitPriceEur : addon.unitPriceUsd;

      entries.push({
        key: addon.key,
        name: addon.name,
        unitPrice: Number.parseFloat(String(unitPriceDecimal)),
        currency,
        activeQuantity,
        nearestExpiresAt,
        autoRenew,
      });
    }
    return entries;
  }

  /** Scoped to `companyId` + `addonKey` (never a raw purchase id from the client) — applies to
   * every currently-active purchase row for that pair. Returns false if the addon key is unknown
   * or the company has no active quota for it right now. */
  async setAddonAutoRenew(companyId: number, addonKey: string, autoRenew: boolean): Promise<boolean> {
    const addon = await this.store.getAddonByKey(addonKey);
    if (!addon) return false;
    return this.store.setAutoRenewForAddon(companyId, addon.id, autoRenew, this.now());
  }
}
