import { catalogFingerprint, mapBillingInterval, toMinorUnits } from './stripe-catalog-domain';

type Metadata = Record<string, string>;
type StripeObject = { id: string; metadata?: Metadata };
type StripeCatalogClient = {
  products: { create(input: unknown, options: RequestOptions): Promise<StripeObject>; update(id: string, input: unknown, options: RequestOptions): Promise<StripeObject> };
  prices: { create(input: unknown, options: RequestOptions): Promise<StripeObject>; update(id: string, input: unknown, options: RequestOptions): Promise<StripeObject>; retrieve(id: string): Promise<StripeObject | undefined> };
  coupons: { create(input: unknown, options: RequestOptions): Promise<StripeObject>; update(id: string, input: unknown, options: RequestOptions): Promise<StripeObject>; retrieve(id: string): Promise<StripeObject | undefined> };
  promotionCodes: { create(input: unknown, options: RequestOptions): Promise<StripeObject>; update(id: string, input: unknown, options: RequestOptions): Promise<StripeObject> };
};
type RequestOptions = { idempotencyKey: string };
type Plan = Record<string, any>;
type Coupon = Record<string, any>;
type CatalogStorage = {
  getPlan(id: number): Promise<Plan | undefined>;
  getCouponById(id: number): Promise<Coupon | null | undefined>;
  updatePlan(id: number, update: Record<string, unknown>): Promise<Plan>;
  updateCoupon(id: number, update: Record<string, unknown>): Promise<Coupon>;
};

export type SyncAction =
  | 'create_product' | 'update_product' | 'create_price' | 'archive_price'
  | 'create_coupon' | 'create_promotion_code' | 'archive_promotion_code'
  | 'archive_product' | 'unchanged';
export type SyncResult = { entityType: 'plan' | 'coupon'; entityId: number; dryRun: boolean; actions: SyncAction[]; fingerprint: string };

const SCHEMA_VERSION = '1';

export class StripeCatalogSyncService {
  constructor(private readonly dependencies: {
    storage: CatalogStorage;
    stripe: StripeCatalogClient;
    currency?: string;
    environment?: string;
  }) {}

  async syncPlan(planId: number, options: { dryRun?: boolean } = {}): Promise<SyncResult> {
    const plan = await this.dependencies.storage.getPlan(planId);
    if (!plan) throw new Error(`Plan ${planId} was not found`);
    const fingerprint = catalogFingerprint(planFingerprintInput(plan));
    const priceFingerprint = catalogFingerprint(planPriceFingerprintInput(plan));
    const actions: SyncAction[] = [];
    if (plan.stripeSyncFingerprint === fingerprint) return result('plan', planId, options.dryRun === true, ['unchanged'], fingerprint);

    let productId = plan.stripeProductId as string | undefined;
    let priceId = plan.stripePriceId as string | undefined;
    const metadata = entityMetadata('plan', planId, this.dependencies.environment);
    if (!productId) {
      actions.push('create_product');
      if (!options.dryRun) productId = (await this.dependencies.stripe.products.create(planProductInput(plan, metadata), requestKey('plan', planId, 'create-product', fingerprint))).id;
    } else {
      actions.push('update_product');
      if (!options.dryRun) await this.dependencies.stripe.products.update(productId, planProductInput(plan, metadata), requestKey('plan', planId, 'update-product', fingerprint));
    }

    const currentPrice = priceId ? await this.dependencies.stripe.prices.retrieve(priceId) : undefined;
    const priceChanged = currentPrice?.metadata?.zinto_catalog_price_fingerprint !== priceFingerprint;
    if (!priceId || priceChanged) {
      actions.push('create_price');
      if (priceId) actions.push('archive_price');
      if (!options.dryRun) {
        const nextPriceId = (await this.dependencies.stripe.prices.create(planPriceInput(plan, { ...metadata, zinto_catalog_price_fingerprint: priceFingerprint }, productId!), requestKey('plan', planId, 'create-price', priceFingerprint))).id;
        if (priceId) await this.dependencies.stripe.prices.update(priceId, { active: false }, requestKey('plan', planId, 'archive-price', priceFingerprint));
        priceId = nextPriceId;
      }
    }
    if (!options.dryRun) await this.dependencies.storage.updatePlan(planId, syncedUpdate(fingerprint, { stripeProductId: productId!, stripePriceId: priceId! }));
    return result('plan', planId, options.dryRun === true, actions, fingerprint);
  }

  async syncCoupon(couponId: number, options: { dryRun?: boolean } = {}): Promise<SyncResult> {
    const coupon = await this.dependencies.storage.getCouponById(couponId);
    if (!coupon) throw new Error(`Coupon ${couponId} was not found`);
    const fingerprint = catalogFingerprint(couponFingerprintInput(coupon));
    const discountFingerprint = catalogFingerprint(couponDiscountFingerprintInput(coupon, this.currency));
    const actions: SyncAction[] = [];
    if (coupon.stripeSyncFingerprint === fingerprint) return result('coupon', couponId, options.dryRun === true, ['unchanged'], fingerprint);

    let stripeCouponId = coupon.stripeCouponId as string | undefined;
    let promotionCodeId = coupon.stripePromotionCodeId as string | undefined;
    const metadata = entityMetadata('coupon', couponId, this.dependencies.environment);
    const currentCoupon = stripeCouponId ? await this.dependencies.stripe.coupons.retrieve(stripeCouponId) : undefined;
    const discountChanged = currentCoupon?.metadata?.zinto_catalog_discount_fingerprint !== discountFingerprint;
    if (!stripeCouponId || discountChanged) {
      actions.push('create_coupon', 'create_promotion_code');
      if (promotionCodeId) actions.push('archive_promotion_code');
      if (!options.dryRun) {
        const nextCouponId = (await this.dependencies.stripe.coupons.create(couponDiscountInput(coupon, { ...metadata, zinto_catalog_discount_fingerprint: discountFingerprint }, this.currency), requestKey('coupon', couponId, 'create-coupon', discountFingerprint))).id;
        const nextPromotionCodeId = (await this.dependencies.stripe.promotionCodes.create({ coupon: nextCouponId, code: coupon.code, active: coupon.isActive !== false, metadata }, requestKey('coupon', couponId, 'create-promotion-code', fingerprint))).id;
        if (promotionCodeId) await this.dependencies.stripe.promotionCodes.update(promotionCodeId, { active: false }, requestKey('coupon', couponId, 'archive-promotion-code', fingerprint));
        stripeCouponId = nextCouponId;
        promotionCodeId = nextPromotionCodeId;
      }
    }
    if (!options.dryRun) await this.dependencies.storage.updateCoupon(couponId, syncedUpdate(fingerprint, { stripeCouponId: stripeCouponId!, stripePromotionCodeId: promotionCodeId! }));
    return result('coupon', couponId, options.dryRun === true, actions.length ? actions : ['unchanged'], fingerprint);
  }

  async archivePlan(planId: number): Promise<SyncResult> {
    const plan = await this.dependencies.storage.getPlan(planId);
    if (!plan) throw new Error(`Plan ${planId} was not found`);
    const fingerprint = catalogFingerprint({ archive: true, id: planId, fingerprint: plan.stripeSyncFingerprint ?? null });
    const actions: SyncAction[] = [];
    if (plan.stripePriceId) { actions.push('archive_price'); await this.dependencies.stripe.prices.update(plan.stripePriceId, { active: false }, requestKey('plan', planId, 'archive-price', fingerprint)); }
    if (plan.stripeProductId) { actions.push('archive_product'); await this.dependencies.stripe.products.update(plan.stripeProductId, { active: false }, requestKey('plan', planId, 'archive-product', fingerprint)); }
    await this.dependencies.storage.updatePlan(planId, { stripeSyncStatus: 'synced', stripeSyncError: null, stripeSyncedAt: new Date() });
    return result('plan', planId, false, actions.length ? actions : ['unchanged'], fingerprint);
  }

  async archiveCoupon(couponId: number): Promise<SyncResult> {
    const coupon = await this.dependencies.storage.getCouponById(couponId);
    if (!coupon) throw new Error(`Coupon ${couponId} was not found`);
    const fingerprint = catalogFingerprint({ archive: true, id: couponId, fingerprint: coupon.stripeSyncFingerprint ?? null });
    const actions: SyncAction[] = [];
    if (coupon.stripePromotionCodeId) { actions.push('archive_promotion_code'); await this.dependencies.stripe.promotionCodes.update(coupon.stripePromotionCodeId, { active: false }, requestKey('coupon', couponId, 'archive-promotion-code', fingerprint)); }
    await this.dependencies.storage.updateCoupon(couponId, { stripeSyncStatus: 'synced', stripeSyncError: null, stripeSyncedAt: new Date() });
    return result('coupon', couponId, false, actions.length ? actions : ['unchanged'], fingerprint);
  }

  private get currency() { return (this.dependencies.currency ?? 'EUR').toUpperCase(); }
}

function planFingerprintInput(plan: Plan) { return { name: plan.name, description: plan.description ?? null, isActive: plan.isActive !== false, price: planPriceFingerprintInput(plan) }; }
function planPriceFingerprintInput(plan: Plan) { return { currency: 'eur', unitAmount: toMinorUnits(plan.originalPrice ?? plan.price, 'EUR'), recurring: mapBillingInterval(plan.billingInterval ?? 'monthly', plan.customDurationDays) }; }
function planPriceInput(plan: Plan, metadata?: Metadata, product?: string) {
  const recurring = mapBillingInterval(plan.billingInterval ?? 'monthly', plan.customDurationDays);
  const input: Record<string, unknown> = { currency: 'eur', unit_amount: toMinorUnits(plan.originalPrice ?? plan.price, 'EUR'), active: plan.isActive !== false, metadata };
  if (product) input.product = product;
  if (recurring) input.recurring = recurring;
  return input;
}
function planProductInput(plan: Plan, metadata: Metadata) { return { name: plan.name, description: plan.description ?? undefined, active: plan.isActive !== false, metadata }; }
function couponFingerprintInput(coupon: Coupon) { return { code: coupon.code, name: coupon.name, description: coupon.description ?? null, isActive: coupon.isActive !== false, discount: couponDiscountFingerprintInput(coupon, 'EUR') }; }
function couponDiscountFingerprintInput(coupon: Coupon, currency: string) { return coupon.discountType === 'percentage' ? { percentOff: Number(coupon.discountValue), maxRedemptions: coupon.usageLimit ?? null, redeemBy: coupon.endDate ? Math.floor(new Date(coupon.endDate).getTime() / 1000) : null } : { amountOff: toMinorUnits(coupon.discountValue, currency), currency: currency.toLowerCase(), maxRedemptions: coupon.usageLimit ?? null, redeemBy: coupon.endDate ? Math.floor(new Date(coupon.endDate).getTime() / 1000) : null }; }
function couponDiscountInput(coupon: Coupon, metadata?: Metadata, currency = 'EUR') {
  const input: Record<string, unknown> = { name: coupon.name, metadata };
  if (coupon.discountType === 'percentage') input.percent_off = Number(coupon.discountValue);
  else { input.amount_off = toMinorUnits(coupon.discountValue, currency); input.currency = currency.toLowerCase(); }
  if (coupon.usageLimit != null) input.max_redemptions = coupon.usageLimit;
  if (coupon.endDate) input.redeem_by = Math.floor(new Date(coupon.endDate).getTime() / 1000);
  return input;
}
function entityMetadata(type: 'plan' | 'coupon', id: number, environment?: string): Metadata { return { [`zinto_${type}_id`]: String(id), zinto_environment: environment ?? process.env.NODE_ENV ?? 'development', zinto_schema_version: SCHEMA_VERSION }; }
function requestKey(type: 'plan' | 'coupon', id: number, operation: string, fingerprint: string): RequestOptions { return { idempotencyKey: `zinto-catalog:${type}:${id}:${operation}:${fingerprint}` }; }
function syncedUpdate(fingerprint: string, ids: Record<string, string>) { return { ...ids, stripeSyncStatus: 'synced', stripeSyncError: null, stripeSyncedAt: new Date(), stripeSyncFingerprint: fingerprint }; }
function result(entityType: 'plan' | 'coupon', entityId: number, dryRun: boolean, actions: SyncAction[], fingerprint: string): SyncResult { return { entityType, entityId, dryRun, actions, fingerprint }; }
