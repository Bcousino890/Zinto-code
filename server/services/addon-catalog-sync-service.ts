import { randomUUID } from 'crypto';
import { catalogFingerprint, toMinorUnits } from './stripe-catalog-domain';
import { sanitizeStripeCatalogError } from './stripe-client-provider';

type Metadata = Record<string, string>;
type StripeObject = { id: string; active?: boolean; metadata?: Metadata; product?: string };
type RequestOptions = { idempotencyKey: string };
type ListResult = { data: StripeObject[]; has_more: boolean };
type Collection = {
  create(input: unknown, options: RequestOptions): Promise<StripeObject>;
  update(id: string, input: unknown, options: RequestOptions): Promise<StripeObject>;
  list(input: { limit: number; starting_after?: string }): Promise<ListResult>;
};
type AddonCatalogClient = {
  products: Collection;
  prices: Collection & { retrieve(id: string): Promise<StripeObject | undefined> };
};

type AddonRow = Record<string, any>;
type AddonStorage = {
  getAddonById(id: number): Promise<AddonRow | undefined>;
  updateAddon(id: number, updates: Record<string, unknown>): Promise<AddonRow>;
};

export type SyncAction =
  | 'create_product'
  | 'create_price_eur'
  | 'create_price_usd'
  | 'archive_price'
  | 'unchanged';

export type SyncResult = {
  addonId: number;
  dryRun: boolean;
  actions: SyncAction[];
  fingerprint: string;
  status: 'synced' | 'failed';
  error?: string;
};

const SCHEMA_VERSION = '1';
const PAGE_LIMIT = 100;
const MAX_PAGES = 100;
type AddonCurrency = 'EUR' | 'USD';

/**
 * Keeps the fixed 2-row `addons` catalog (extra_user, extra_whatsapp_connection) in sync with
 * Stripe. Simplified sibling of StripeCatalogSyncService (plans/coupons): no discounts, no
 * billing-interval mapping, and it never creates a Product for these two rows — both already carry
 * a real, pre-existing `stripeProductId` from the seed migration and this service always adopts it.
 * It only ever creates fresh **one-time** (non-recurring) Prices in EUR and USD, and archives
 * (`active:false`) anything else active on the product — including the old recurring/metered prices
 * that were misconfigured by hand in the Stripe dashboard before this service existed.
 */
export class AddonCatalogSyncService {
  constructor(
    private readonly dependencies: {
      storage: AddonStorage;
      stripe: AddonCatalogClient;
      environment?: string;
      now?: () => Date;
    },
  ) {}

  async syncAddon(addonId: number, options: { dryRun?: boolean } = {}): Promise<SyncResult> {
    const addon = await this.dependencies.storage.getAddonById(addonId);
    if (!addon) throw new Error(`Addon ${addonId} was not found`);

    const eurFingerprint = catalogFingerprint(addonPriceFingerprintInput(addon, 'EUR'));
    const usdFingerprint = catalogFingerprint(addonPriceFingerprintInput(addon, 'USD'));
    const fingerprint = catalogFingerprint({
      isActive: addon.isActive !== false,
      eur: eurFingerprint,
      usd: usdFingerprint,
    });
    const dryRun = options.dryRun === true;

    if (addon.stripeSyncFingerprint === fingerprint) {
      return {
        addonId,
        dryRun,
        actions: ['unchanged'],
        fingerprint,
        status: addon.stripeSyncStatus === 'failed' ? 'failed' : 'synced',
      };
    }

    if (dryRun) {
      return { addonId, dryRun: true, actions: plannedAddonActions(addon), fingerprint, status: 'synced' };
    }

    const metadata = entityMetadata(addonId, this.dependencies.environment);
    const actions: SyncAction[] = [];

    try {
      let productId = addon.stripeProductId as string | undefined;
      if (!productId) {
        productId = (await findByMetadata(this.dependencies.stripe.products, 'zinto_addon_id', String(addonId)))?.id;
      }
      if (!productId) {
        actions.push('create_product');
        productId = (
          await this.dependencies.stripe.products.create(
            {
              name: addon.name,
              description: addon.description ?? undefined,
              active: addon.isActive !== false,
              metadata,
            },
            requestKey(addonId, 'create-product', fingerprint),
          )
        ).id;
      }
      if (!productId) throw new Error('Unable to resolve a Stripe product for this addon');

      const priceIdEur = await this.ensureCurrencyPrice(
        addonId, addon, productId, 'EUR', addon.stripePriceIdEur, eurFingerprint, metadata, actions,
      );
      const priceIdUsd = await this.ensureCurrencyPrice(
        addonId, addon, productId, 'USD', addon.stripePriceIdUsd, usdFingerprint, metadata, actions,
      );

      // Explicit cleanup: anything else active on this product (typically the old recurring+metered
      // prices created by hand in the dashboard, sharing one Stripe Meter) is archived, not just the
      // one price this service previously tracked per currency.
      const activePrices = (await findAll(this.dependencies.stripe.prices)).filter(
        (price) => price.product === productId && price.active !== false && price.id !== priceIdEur && price.id !== priceIdUsd,
      );
      if (activePrices.length > 0) {
        // Stripe refuses to archive a price that is still its product's default_price — which the
        // hand-created price being cleaned up here always is, since it was the only price on the
        // product when the product itself was created by hand. Repointing default_price at one of
        // our own tracked prices first is a no-op if it was already pointing there, so it's safe to
        // do unconditionally rather than fetching the product just to check first.
        await this.dependencies.stripe.products.update(
          productId,
          { default_price: priceIdEur ?? priceIdUsd },
          freshRequestKey(),
        );
      }
      for (const price of activePrices) {
        actions.push('archive_price');
        await this.dependencies.stripe.prices.update(price.id, { active: false }, freshRequestKey());
      }

      await this.dependencies.storage.updateAddon(addonId, {
        stripeProductId: productId,
        stripePriceIdEur: priceIdEur,
        stripePriceIdUsd: priceIdUsd,
        stripeSyncStatus: 'synced',
        stripeSyncError: null,
        stripeSyncedAt: this.now,
        stripeSyncFingerprint: fingerprint,
      });

      return { addonId, dryRun: false, actions: actions.length ? actions : ['unchanged'], fingerprint, status: 'synced' };
    } catch (error) {
      const message = sanitizeStripeCatalogError(error);
      await this.dependencies.storage.updateAddon(addonId, {
        stripeSyncStatus: 'failed',
        stripeSyncError: message,
      });
      return { addonId, dryRun: false, actions, fingerprint, status: 'failed', error: message };
    }
  }

  /** Convenience wrapper mirroring StripeCatalogSyncService.reconcileAvailability. */
  async reconcileAvailability(addonId: number): Promise<SyncResult> {
    return this.syncAddon(addonId);
  }

  private async ensureCurrencyPrice(
    addonId: number,
    addon: AddonRow,
    productId: string,
    currency: AddonCurrency,
    currentPriceId: string | undefined,
    priceFingerprint: string,
    metadata: Metadata,
    actions: SyncAction[],
  ): Promise<string> {
    const currentPrice = currentPriceId ? await this.dependencies.stripe.prices.retrieve(currentPriceId) : undefined;
    if (
      currentPriceId &&
      currentPrice?.active !== false &&
      currentPrice?.metadata?.zinto_catalog_price_fingerprint === priceFingerprint
    ) {
      return currentPriceId;
    }

    actions.push(currency === 'EUR' ? 'create_price_eur' : 'create_price_usd');
    const created = await this.dependencies.stripe.prices.create(
      addonPriceInput(addon, currency, { ...metadata, zinto_catalog_price_fingerprint: priceFingerprint }, productId),
      requestKey(addonId, `create-price-${currency.toLowerCase()}`, priceFingerprint),
    );

    if (currentPriceId) {
      actions.push('archive_price');
      await this.dependencies.stripe.prices.update(currentPriceId, { active: false }, freshRequestKey());
    }

    return created.id;
  }

  private get now() {
    return this.dependencies.now?.() ?? new Date();
  }
}

function unitPriceFor(addon: AddonRow, currency: AddonCurrency): string | number {
  return currency === 'EUR' ? addon.unitPriceEur : addon.unitPriceUsd;
}

function addonPriceFingerprintInput(addon: AddonRow, currency: AddonCurrency) {
  return {
    currency: currency.toLowerCase(),
    unitAmount: toMinorUnits(unitPriceFor(addon, currency), currency),
    type: 'one_time',
  };
}

// Stripe one-time Price payload: deliberately has no `recurring` field at all — that absence is what
// makes it one-time rather than a subscription/metered price.
function addonPriceInput(addon: AddonRow, currency: AddonCurrency, metadata: Metadata, product: string) {
  return {
    currency: currency.toLowerCase(),
    unit_amount: toMinorUnits(unitPriceFor(addon, currency), currency),
    active: true,
    metadata,
    product,
  };
}

function plannedAddonActions(addon: AddonRow): SyncAction[] {
  const actions: SyncAction[] = [];
  if (!addon.stripeProductId) actions.push('create_product');
  actions.push('create_price_eur', 'create_price_usd');
  if (addon.stripeProductId) actions.push('archive_price');
  return actions;
}

function entityMetadata(addonId: number, environment?: string): Metadata {
  return {
    zinto_addon_id: String(addonId),
    zinto_environment: environment ?? process.env.NODE_ENV ?? 'development',
    zinto_schema_version: SCHEMA_VERSION,
  };
}

function requestKey(addonId: number, operation: string, fingerprint: string): RequestOptions {
  return { idempotencyKey: `zinto-addon-catalog:${addonId}:${operation}:${fingerprint}` };
}

// For calls that only ever move a Stripe object toward a target state (archive a price, repoint
// a product's default price) — unlike creating a Product/Price, replaying one of these has no
// duplication risk, so there's nothing for a stable idempotency key to protect against. Worse,
// a stable key here actively breaks retries: after a failed sync attempt is fixed and re-run,
// Stripe would replay the FIRST attempt's cached response (including a cached failure) instead
// of re-evaluating against the now-different state, which is exactly what happened while fixing
// this file — a stale cached "can't archive the default price" kept coming back even after the
// default had genuinely been repointed moments earlier in the same retry.
function freshRequestKey(): RequestOptions {
  return { idempotencyKey: randomUUID() };
}

async function findByMetadata(collection: Pick<Collection, 'list'>, key: string, value: string) {
  return (await findAll(collection)).find((entry) => entry.metadata?.[key] === value);
}

async function findAll(collection: Pick<Collection, 'list'>): Promise<StripeObject[]> {
  const output: StripeObject[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await collection.list({ limit: PAGE_LIMIT, ...(cursor ? { starting_after: cursor } : {}) });
    output.push(...response.data);
    if (!response.has_more) return output;
    const next = response.data.at(-1)?.id;
    if (!next || next === cursor) throw new Error('Stripe catalog pagination did not advance');
    cursor = next;
  }
  throw new Error('Stripe catalog pagination limit exceeded');
}
