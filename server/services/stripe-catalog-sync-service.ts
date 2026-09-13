import { catalogFingerprint, mapBillingInterval, toMinorUnits } from './stripe-catalog-domain';

type Metadata = Record<string, string>;
type StripeObject = { id: string; active?: boolean; metadata?: Metadata; product?: string; coupon?: string; code?: string };
type RequestOptions = { idempotencyKey: string };
type ListResult = { data: StripeObject[]; has_more: boolean };
type Collection = { create(input: unknown, options: RequestOptions): Promise<StripeObject>; update(id: string, input: unknown, options: RequestOptions): Promise<StripeObject>; list(input: { limit: number; starting_after?: string }): Promise<ListResult> };
type StripeCatalogClient = { products: Collection; prices: Collection & { retrieve(id: string): Promise<StripeObject | undefined> }; coupons: Collection & { retrieve(id: string): Promise<StripeObject | undefined> }; promotionCodes: Collection };
type Plan = Record<string, any>;
type Coupon = Record<string, any>;
type CatalogStorage = { getPlan(id: number): Promise<Plan | undefined>; getCouponById(id: number): Promise<Coupon | null | undefined>; updatePlan(id: number, update: Record<string, unknown>): Promise<Plan>; updateCoupon(id: number, update: Record<string, unknown>): Promise<Coupon> };

export type SyncAction = 'create_product' | 'update_product' | 'create_price' | 'reactivate_price' | 'archive_price' | 'create_coupon' | 'create_promotion_code' | 'archive_promotion_code' | 'create_plan_coupon' | 'archive_plan_coupon' | 'archive_product' | 'unchanged';
export type SyncResult = { entityType: 'plan' | 'coupon'; entityId: number; dryRun: boolean; actions: SyncAction[]; fingerprint: string };
const SCHEMA_VERSION = '1';
const PAGE_LIMIT = 100;
const MAX_PAGES = 100;

export class StripeCatalogSyncService {
  constructor(private readonly dependencies: { storage: CatalogStorage; stripe: StripeCatalogClient; currency?: string; environment?: string; now?: () => Date }) {}

  async syncPlan(planId: number, options: { dryRun?: boolean } = {}): Promise<SyncResult> {
    const plan = await this.dependencies.storage.getPlan(planId);
    if (!plan) throw new Error(`Plan ${planId} was not found`);
    const now = this.now;
    const discountIsAvailable = planDiscountIsActive(plan, now);
    const fingerprint = catalogFingerprint(planFingerprintInput(plan, this.currency, discountIsAvailable));
    const priceFingerprint = catalogFingerprint(planPriceFingerprintInput(plan, this.currency));
    const discountFingerprint = discountIsAvailable ? catalogFingerprint(planDiscountFingerprintInput(plan, this.currency)) : undefined;
    const dryRun = options.dryRun === true;
    if (plan.stripeSyncFingerprint === fingerprint) return result('plan', planId, dryRun, ['unchanged'], fingerprint);
    if (dryRun) return result('plan', planId, true, plannedPlanActions(plan, discountFingerprint), fingerprint);

    const metadata = entityMetadata('plan', planId, this.dependencies.environment);
    let productId = plan.stripeProductId as string | undefined;
    let priceId = plan.stripePriceId as string | undefined;
    const actions: SyncAction[] = [];
    if (!productId) productId = (await findByMetadata(this.dependencies.stripe.products, 'zinto_plan_id', String(planId)))?.id;
    if (productId && !priceId) priceId = (await findAll(this.dependencies.stripe.prices)).find((price) => price.product === productId && price.metadata?.zinto_catalog_price_fingerprint === priceFingerprint)?.id;

    if (!plan.isActive) {
      if (priceId) { actions.push('archive_price'); await this.dependencies.stripe.prices.update(priceId, { active: false }, requestKey('plan', planId, 'archive-price', fingerprint)); }
      if (productId) { actions.push('archive_product'); await this.dependencies.stripe.products.update(productId, { active: false }, requestKey('plan', planId, 'archive-product', fingerprint)); }
      if (plan.stripePlanCouponId) actions.push('archive_plan_coupon');
      await this.dependencies.storage.updatePlan(planId, syncedUpdate(fingerprint, { stripeProductId: productId ?? null, stripePriceId: priceId ?? null, stripePlanCouponId: null }));
      return result('plan', planId, false, actions.length ? actions : ['unchanged'], fingerprint);
    }

    if (!productId) { actions.push('create_product'); productId = (await this.dependencies.stripe.products.create(planProductInput(plan, metadata), requestKey('plan', planId, 'create-product', fingerprint))).id; }
    else { actions.push('update_product'); await this.dependencies.stripe.products.update(productId, planProductInput(plan, metadata), requestKey('plan', planId, 'update-product', fingerprint)); }
    const currentPrice = priceId ? await this.dependencies.stripe.prices.retrieve(priceId) : undefined;
    if (!priceId || currentPrice?.metadata?.zinto_catalog_price_fingerprint !== priceFingerprint) {
      actions.push('create_price');
      const nextPriceId = (await this.dependencies.stripe.prices.create(planPriceInput(plan, this.currency, { ...metadata, zinto_catalog_price_fingerprint: priceFingerprint }, productId), requestKey('plan', planId, 'create-price', priceFingerprint))).id;
      if (priceId) { actions.push('archive_price'); await this.dependencies.stripe.prices.update(priceId, { active: false }, requestKey('plan', planId, 'archive-price', priceFingerprint)); }
      priceId = nextPriceId;
    } else if (currentPrice.active === false) {
      actions.push('reactivate_price');
      await this.dependencies.stripe.prices.update(priceId, { active: true }, requestKey('plan', planId, 'reactivate-price', priceFingerprint));
    }

    let planCouponId = plan.stripePlanCouponId as string | undefined;
    if (discountFingerprint) {
      let current = planCouponId ? await this.dependencies.stripe.coupons.retrieve(planCouponId) : undefined;
      if (!planCouponId) planCouponId = (await findByMetadata(this.dependencies.stripe.coupons, 'zinto_plan_id', String(planId), 'zinto_catalog_plan_discount_fingerprint', discountFingerprint))?.id;
      if (planCouponId && !current) current = await this.dependencies.stripe.coupons.retrieve(planCouponId);
      if (!planCouponId || current?.metadata?.zinto_catalog_plan_discount_fingerprint !== discountFingerprint) {
        actions.push('create_plan_coupon');
        if (planCouponId) { actions.push('archive_plan_coupon'); await archivePlanCoupon(this.dependencies.stripe.coupons, planCouponId, current?.metadata, requestKey('plan', planId, 'archive-plan-coupon', fingerprint)); }
        planCouponId = (await this.dependencies.stripe.coupons.create(planDiscountInput(plan, this.currency, { ...metadata, zinto_catalog_plan_discount_fingerprint: discountFingerprint }), requestKey('plan', planId, 'create-plan-coupon', discountFingerprint))).id;
      }
    } else if (planCouponId) { actions.push('archive_plan_coupon'); await archivePlanCoupon(this.dependencies.stripe.coupons, planCouponId, undefined, requestKey('plan', planId, 'archive-plan-coupon', fingerprint)); planCouponId = undefined; }
    await this.dependencies.storage.updatePlan(planId, syncedUpdate(fingerprint, { stripeProductId: productId, stripePriceId: priceId!, stripePlanCouponId: planCouponId ?? null }));
    return result('plan', planId, false, actions, fingerprint);
  }

  async syncCoupon(couponId: number, options: { dryRun?: boolean } = {}): Promise<SyncResult> {
    const coupon = await this.dependencies.storage.getCouponById(couponId);
    if (!coupon) throw new Error(`Coupon ${couponId} was not found`);
    const now = this.now;
    const active = couponIsRedeemable(coupon, now);
    const fingerprint = catalogFingerprint(couponFingerprintInput(coupon, this.currency, active));
    const discountFingerprint = catalogFingerprint(couponDiscountFingerprintInput(coupon, this.currency));
    const dryRun = options.dryRun === true;
    if (coupon.stripeSyncFingerprint === fingerprint) return result('coupon', couponId, dryRun, ['unchanged'], fingerprint);
    if (dryRun) return result('coupon', couponId, true, coupon.stripeCouponId ? ['unchanged'] : ['create_coupon', 'create_promotion_code'], fingerprint);

    const metadata = entityMetadata('coupon', couponId, this.dependencies.environment);
    let stripeCouponId = coupon.stripeCouponId as string | undefined;
    let promotionCodeId = coupon.stripePromotionCodeId as string | undefined;
    const actions: SyncAction[] = [];
    if (!stripeCouponId) stripeCouponId = (await findByMetadata(this.dependencies.stripe.coupons, 'zinto_coupon_id', String(couponId), 'zinto_catalog_discount_fingerprint', discountFingerprint))?.id;
    const currentCoupon = stripeCouponId ? await this.dependencies.stripe.coupons.retrieve(stripeCouponId) : undefined;
    if (!stripeCouponId || currentCoupon?.metadata?.zinto_catalog_discount_fingerprint !== discountFingerprint) {
      actions.push('create_coupon');
      stripeCouponId = (await this.dependencies.stripe.coupons.create(couponDiscountInput(coupon, { ...metadata, zinto_catalog_discount_fingerprint: discountFingerprint }, this.currency), requestKey('coupon', couponId, 'create-coupon', discountFingerprint))).id;
      promotionCodeId = undefined;
    }
    const promotion = promotionCodeId ? (await findAll(this.dependencies.stripe.promotionCodes)).find((entry) => entry.id === promotionCodeId) : await findByMetadata(this.dependencies.stripe.promotionCodes, 'zinto_coupon_id', String(couponId));
    if (!promotion || promotion.coupon !== stripeCouponId || promotion.code !== coupon.code) {
      actions.push('create_promotion_code');
      if (promotion) { actions.push('archive_promotion_code'); await this.dependencies.stripe.promotionCodes.update(promotion.id, { active: false }, requestKey('coupon', couponId, 'archive-promotion-code', fingerprint)); }
      promotionCodeId = (await this.dependencies.stripe.promotionCodes.create({ coupon: stripeCouponId, code: coupon.code, active, metadata: { ...metadata, zinto_catalog_promotion_fingerprint: promotionFingerprint(coupon, this.now) } }, requestKey('coupon', couponId, 'create-promotion-code', fingerprint))).id;
    } else {
      actions.push('archive_promotion_code');
      await this.dependencies.stripe.promotionCodes.update(promotion.id, { active }, requestKey('coupon', couponId, 'set-promotion-code-active', fingerprint));
      promotionCodeId = promotion.id;
    }
    await this.dependencies.storage.updateCoupon(couponId, syncedUpdate(fingerprint, { stripeCouponId, stripePromotionCodeId: promotionCodeId! }));
    return result('coupon', couponId, false, actions, fingerprint);
  }

  async reconcileAvailability(entityType: 'plan' | 'coupon', entityId: number): Promise<SyncResult> {
    return entityType === 'plan' ? this.syncPlan(entityId) : this.syncCoupon(entityId);
  }

  async archivePlan(planId: number): Promise<SyncResult> { return this.archive('plan', planId); }
  async archiveCoupon(couponId: number): Promise<SyncResult> { return this.archive('coupon', couponId); }
  private async archive(type: 'plan' | 'coupon', id: number): Promise<SyncResult> {
    const entity = type === 'plan' ? await this.dependencies.storage.getPlan(id) : await this.dependencies.storage.getCouponById(id);
    if (!entity) throw new Error(`${type === 'plan' ? 'Plan' : 'Coupon'} ${id} was not found`);
    const fingerprint = catalogFingerprint({ archive: true, id, fingerprint: entity.stripeSyncFingerprint ?? null });
    const actions: SyncAction[] = [];
    if (type === 'plan') {
      if (entity.stripePriceId) { actions.push('archive_price'); await this.dependencies.stripe.prices.update(entity.stripePriceId, { active: false }, requestKey(type, id, 'archive-price', fingerprint)); }
      if (entity.stripeProductId) { actions.push('archive_product'); await this.dependencies.stripe.products.update(entity.stripeProductId, { active: false }, requestKey(type, id, 'archive-product', fingerprint)); }
      await this.dependencies.storage.updatePlan(id, { stripeSyncStatus: 'synced', stripeSyncError: null, stripeSyncedAt: new Date(), stripePlanCouponId: null });
    } else {
      if (entity.stripePromotionCodeId) { actions.push('archive_promotion_code'); await this.dependencies.stripe.promotionCodes.update(entity.stripePromotionCodeId, { active: false }, requestKey(type, id, 'archive-promotion-code', fingerprint)); }
      await this.dependencies.storage.updateCoupon(id, { stripeSyncStatus: 'synced', stripeSyncError: null, stripeSyncedAt: new Date() });
    }
    return result(type, id, false, actions.length ? actions : ['unchanged'], fingerprint);
  }
  private get currency() { return (this.dependencies.currency ?? 'EUR').trim().toUpperCase(); }
  private get now() { return this.dependencies.now?.() ?? new Date(); }
}

function planFingerprintInput(plan: Plan, currency: string, discountIsAvailable: boolean) { return { name: plan.name, description: plan.description ?? null, isActive: plan.isActive !== false, price: planPriceFingerprintInput(plan, currency), discount: planDiscountFingerprintInput(plan, currency), discountIsAvailable }; }
function planPriceFingerprintInput(plan: Plan, currency: string) { return { currency: currency.toLowerCase(), unitAmount: toMinorUnits(plan.originalPrice ?? plan.price, currency), recurring: mapBillingInterval(plan.billingInterval ?? 'monthly', plan.customDurationDays) }; }
function planPriceInput(plan: Plan, currency: string, metadata: Metadata, product: string) { const input: Record<string, unknown> = { currency: currency.toLowerCase(), unit_amount: toMinorUnits(plan.originalPrice ?? plan.price, currency), active: true, metadata, product }; const recurring = mapBillingInterval(plan.billingInterval ?? 'monthly', plan.customDurationDays); if (recurring) input.recurring = recurring; return input; }
function planProductInput(plan: Plan, metadata: Metadata) { return { name: plan.name, description: plan.description ?? undefined, active: plan.isActive !== false, metadata }; }
function planDiscountFingerprintInput(plan: Plan, currency: string) { return { type: plan.discountType ?? 'none', value: plan.discountValue ?? null, duration: plan.discountDuration ?? null, start: timestamp(plan.discountStartDate), end: timestamp(plan.discountEndDate), currency: currency.toLowerCase() }; }
function planDiscountIsActive(plan: Plan, now: Date) { return plan.isActive !== false && plan.discountType && plan.discountType !== 'none' && plan.discountValue != null && inWindow(plan.discountStartDate, plan.discountEndDate, now); }
function planDiscountInput(plan: Plan, currency: string, metadata: Metadata) { const input: Record<string, unknown> = { name: `${plan.name} plan discount`, metadata, ...stripeCouponDuration(plan.discountDuration) }; if (plan.discountType === 'percentage') input.percent_off = Number(plan.discountValue); else { input.amount_off = toMinorUnits(plan.discountValue, currency); input.currency = currency.toLowerCase(); } if (plan.discountEndDate) input.redeem_by = Math.floor(new Date(plan.discountEndDate).getTime() / 1000); return input; }
function stripeCouponDuration(value: unknown): Record<string, unknown> { switch (value ?? 'permanent') { case 'permanent': return { duration: 'forever' }; case 'first_month': return { duration: 'once' }; case 'first_year': return { duration: 'repeating', duration_in_months: 12 }; case 'limited_time': return { duration: 'forever' }; default: throw new Error(`Unsupported plan discount duration: ${String(value)}`); } }
function couponFingerprintInput(coupon: Coupon, currency: string, active: boolean) { return { code: coupon.code, name: coupon.name, description: coupon.description ?? null, active: coupon.isActive !== false, redeemableNow: active, start: timestamp(coupon.startDate), end: timestamp(coupon.endDate), discount: couponDiscountFingerprintInput(coupon, currency) }; }
function couponDiscountFingerprintInput(coupon: Coupon, currency: string) { return coupon.discountType === 'percentage' ? { percentOff: Number(coupon.discountValue), maxRedemptions: coupon.usageLimit ?? null, redeemBy: timestamp(coupon.endDate) } : { amountOff: toMinorUnits(coupon.discountValue, currency), currency: currency.toLowerCase(), maxRedemptions: coupon.usageLimit ?? null, redeemBy: timestamp(coupon.endDate) }; }
function couponDiscountInput(coupon: Coupon, metadata: Metadata, currency: string) { const input: Record<string, unknown> = { name: coupon.name, metadata }; if (coupon.discountType === 'percentage') input.percent_off = Number(coupon.discountValue); else { input.amount_off = toMinorUnits(coupon.discountValue, currency); input.currency = currency.toLowerCase(); } if (coupon.usageLimit != null) input.max_redemptions = coupon.usageLimit; if (coupon.endDate) input.redeem_by = Math.floor(new Date(coupon.endDate).getTime() / 1000); return input; }
function couponIsRedeemable(coupon: Coupon, now: Date) { return coupon.isActive !== false && inWindow(coupon.startDate, coupon.endDate, now); }
function promotionFingerprint(coupon: Coupon, now: Date) { return catalogFingerprint({ code: coupon.code, active: couponIsRedeemable(coupon, now), start: timestamp(coupon.startDate), end: timestamp(coupon.endDate) }); }
function inWindow(start: unknown, end: unknown, now: Date) { const time = now.getTime(); const startTime = start == null ? undefined : new Date(start as any).getTime(); const endTime = end == null ? undefined : new Date(end as any).getTime(); return (startTime == null || time >= startTime) && (endTime == null || time <= endTime); }
function timestamp(value: unknown) { return value == null ? null : new Date(value as any).toISOString(); }
function entityMetadata(type: 'plan' | 'coupon', id: number, environment?: string): Metadata { return { [`zinto_${type}_id`]: String(id), zinto_environment: environment ?? process.env.NODE_ENV ?? 'development', zinto_schema_version: SCHEMA_VERSION }; }
function requestKey(type: 'plan' | 'coupon', id: number, operation: string, fingerprint: string): RequestOptions { return { idempotencyKey: `zinto-catalog:${type}:${id}:${operation}:${fingerprint}` }; }
function syncedUpdate(fingerprint: string, ids: Record<string, unknown>) { return { ...ids, stripeSyncStatus: 'synced', stripeSyncError: null, stripeSyncedAt: new Date(), stripeSyncFingerprint: fingerprint }; }
function result(entityType: 'plan' | 'coupon', entityId: number, dryRun: boolean, actions: SyncAction[], fingerprint: string): SyncResult { return { entityType, entityId, dryRun, actions, fingerprint }; }
function plannedPlanActions(plan: Plan, discountFingerprint?: string): SyncAction[] { if (!plan.isActive) { const actions: SyncAction[] = []; if (plan.stripePriceId) actions.push('archive_price'); if (plan.stripeProductId) actions.push('archive_product'); return actions.length ? actions : ['unchanged']; } const actions: SyncAction[] = [plan.stripeProductId ? 'update_product' : 'create_product']; if (!plan.stripePriceId) actions.push('create_price'); if (discountFingerprint && !plan.stripePlanCouponId) actions.push('create_plan_coupon'); return actions; }
async function archivePlanCoupon(collection: Pick<Collection, 'update'>, id: string, metadata: Metadata | undefined, options: RequestOptions) { await collection.update(id, { metadata: { ...metadata, zinto_catalog_archived: 'true' } }, options); }
async function findByMetadata(collection: Pick<Collection, 'list'>, key: string, value: string, secondKey?: string, secondValue?: string) { return (await findAll(collection)).find((entry) => entry.metadata?.[key] === value && (!secondKey || entry.metadata?.[secondKey] === secondValue)); }
async function findAll(collection: Pick<Collection, 'list'>): Promise<StripeObject[]> { const output: StripeObject[] = []; let cursor: string | undefined; for (let page = 0; page < MAX_PAGES; page += 1) { const response = await collection.list({ limit: PAGE_LIMIT, ...(cursor ? { starting_after: cursor } : {}) }); output.push(...response.data); if (!response.has_more) return output; const next = response.data.at(-1)?.id; if (!next || next === cursor) throw new Error('Stripe catalog pagination did not advance'); cursor = next; } throw new Error('Stripe catalog pagination limit exceeded'); }
