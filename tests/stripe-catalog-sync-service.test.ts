import assert from 'node:assert/strict';
import test from 'node:test';

import { StripeCatalogSyncService } from '../server/services/stripe-catalog-sync-service';
import { StripeCatalogConfigurationError, StripeClientProvider, sanitizeStripeCatalogError } from '../server/services/stripe-client-provider';

type Plan = Record<string, any>;
type Coupon = Record<string, any>;

function createFakeStripe() {
  let sequence = 0;
  const next = (prefix: string) => `${prefix}_${++sequence}`;
  const priceById = new Map<string, any>();
  const couponById = new Map<string, any>();
  const productById = new Map<string, any>();
  const promotionCodeById = new Map<string, any>();
  const calls = { retrieve: 0, list: 0 };
  const products = { created: [] as any[], updated: [] as any[] };
  const prices = { created: [] as any[], updated: [] as any[] };
  const coupons = { created: [] as any[], updated: [] as any[] };
  const promotionCodes = { created: [] as any[], updated: [] as any[] };
  return {
    products: {
      created: products.created,
      updated: products.updated,
      create: async (input: any, options: any) => {
        products.created.push({ input, options });
        const id = next('prod');
        productById.set(id, { id, ...input });
        return { id };
      },
      update: async (id: string, input: any, options: any) => {
        products.updated.push({ id, input, options });
        productById.set(id, { ...productById.get(id), ...input });
        return { id };
      },
      list: async (input: any) => paged([...productById.values()], input, calls),
    },
    prices: {
      created: prices.created,
      updated: prices.updated,
      create: async (input: any, options: any) => {
        prices.created.push({ input, options });
        const id = next('price');
        priceById.set(id, { id, ...input });
        return { id };
      },
      update: async (id: string, input: any, options: any) => {
        prices.updated.push({ id, input, options });
        priceById.set(id, { ...priceById.get(id), ...input });
        return { id };
      },
      retrieve: async (id: string) => { calls.retrieve += 1; return priceById.get(id); },
      list: async (input: any) => paged([...priceById.values()], input, calls),
    },
    coupons: {
      created: coupons.created,
      updated: coupons.updated,
      create: async (input: any, options: any) => {
        coupons.created.push({ input, options });
        const id = next('coupon');
        couponById.set(id, { id, ...input });
        return { id };
      },
      update: async (id: string, input: any, options: any) => {
        coupons.updated.push({ id, input, options });
        couponById.set(id, { ...couponById.get(id), ...input });
        return { id };
      },
      retrieve: async (id: string) => { calls.retrieve += 1; return couponById.get(id); },
      list: async (input: any) => paged([...couponById.values()], input, calls),
    },
    promotionCodes: {
      created: promotionCodes.created,
      updated: promotionCodes.updated,
      create: async (input: any, options: any) => {
        promotionCodes.created.push({ input, options });
        const id = next('promo');
        promotionCodeById.set(id, { id, ...input });
        return { id };
      },
      update: async (id: string, input: any, options: any) => {
        promotionCodes.updated.push({ id, input, options });
        promotionCodeById.set(id, { ...promotionCodeById.get(id), ...input });
        return { id };
      },
      list: async (input: any) => paged([...promotionCodeById.values()], input, calls),
    },
    calls,
    seed: {
      product: (value: any) => productById.set(value.id, value),
      price: (value: any) => priceById.set(value.id, value),
      coupon: (value: any) => couponById.set(value.id, value),
      promotionCode: (value: any) => promotionCodeById.set(value.id, value),
    },
  };
}

function paged(values: any[], input: { starting_after?: string; limit?: number }, calls: { list: number }) {
  calls.list += 1;
  const start = input.starting_after ? values.findIndex((value) => value.id === input.starting_after) + 1 : 0;
  const data = values.slice(start, start + (input.limit ?? 100));
  return Promise.resolve({ data, has_more: start + data.length < values.length });
}

function createStorage(plan: Plan, coupon: Coupon) {
  const plans = new Map([[plan.id, plan]]);
  const coupons = new Map([[coupon.id, coupon]]);
  return {
    getPlan: async (id: number) => plans.get(id),
    getCouponById: async (id: number) => coupons.get(id),
    updatePlan: async (id: number, update: Plan) => {
      return Object.assign(plans.get(id)!, update);
    },
    updateCoupon: async (id: number, update: Coupon) => {
      return Object.assign(coupons.get(id)!, update);
    },
  };
}

function fixtures() {
  return {
    plan: {
      id: 7, name: 'Pro', description: 'For growing teams', price: '29.25',
      billingInterval: 'monthly', customDurationDays: null, isActive: true,
      discountType: 'none', discountValue: '0', originalPrice: null,
    },
    coupon: {
      id: 8, code: 'WELCOME20', name: 'Welcome', description: 'Welcome offer',
      discountType: 'percentage', discountValue: '20', usageLimit: 25,
      startDate: new Date('2026-01-01T00:00:00.000Z'), endDate: null, isActive: true,
    },
  };
}

test('sincroniza un plan una vez y reutiliza sus objetos en reejecuciones', async () => {
  const { plan, coupon } = fixtures();
  const fakeStripe = createFakeStripe();
  const storage = createStorage(plan, coupon);
  const service = new StripeCatalogSyncService({ storage, stripe: fakeStripe, currency: 'EUR' });

  await service.syncPlan(plan.id);
  await service.syncPlan(plan.id);

  assert.equal(fakeStripe.products.created.length, 1);
  assert.equal(fakeStripe.prices.created.length, 1);
  assert.equal(plan.stripeProductId, 'prod_1');
  assert.equal(plan.stripePriceId, 'price_2');
  assert.equal(plan.stripeSyncStatus, 'synced');
  assert.match(fakeStripe.products.created[0].options.idempotencyKey, /^zinto-catalog:/);
  assert.equal(fakeStripe.products.created[0].input.metadata.zinto_plan_id, '7');
});

test('reemplaza y archiva el precio de un plan cuando cambia su importe', async () => {
  const { plan, coupon } = fixtures();
  const fakeStripe = createFakeStripe();
  const storage = createStorage(plan, coupon);
  const service = new StripeCatalogSyncService({ storage, stripe: fakeStripe, currency: 'EUR' });
  await service.syncPlan(plan.id);
  plan.price = '39.25';

  await service.syncPlan(plan.id);

  assert.equal(fakeStripe.prices.created.length, 2);
  assert.equal(fakeStripe.prices.updated[0].id, 'price_2');
  assert.deepEqual(fakeStripe.prices.updated[0].input, { active: false });
  assert.equal(plan.stripePriceId, 'price_3');
});

test('actualiza texto de plan sin crear un precio nuevo', async () => {
  const { plan, coupon } = fixtures();
  const fakeStripe = createFakeStripe();
  const storage = createStorage(plan, coupon);
  const service = new StripeCatalogSyncService({ storage, stripe: fakeStripe, currency: 'EUR' });
  await service.syncPlan(plan.id);
  plan.description = 'Updated copy';

  await service.syncPlan(plan.id);

  assert.equal(fakeStripe.prices.created.length, 1);
  assert.equal(fakeStripe.products.updated.length, 1);
  assert.equal(fakeStripe.products.updated[0].input.description, 'Updated copy');
});

test('reemplaza cupón y código promocional cuando cambia un descuento inmutable', async () => {
  const { plan, coupon } = fixtures();
  const fakeStripe = createFakeStripe();
  const storage = createStorage(plan, coupon);
  const service = new StripeCatalogSyncService({ storage, stripe: fakeStripe, currency: 'EUR' });
  await service.syncCoupon(coupon.id);
  coupon.discountValue = '30';

  await service.syncCoupon(coupon.id);

  assert.equal(fakeStripe.coupons.created.length, 2);
  assert.equal(fakeStripe.promotionCodes.created.length, 2);
  assert.equal(fakeStripe.promotionCodes.updated[0].id, 'promo_2');
  assert.equal(fakeStripe.promotionCodes.updated[0].input.active, false);
  assert.equal(coupon.stripeCouponId, 'coupon_3');
  assert.equal(coupon.stripePromotionCodeId, 'promo_4');
  assert.equal(fakeStripe.coupons.created[0].input.metadata.zinto_coupon_id, '8');
});

test('simula sin escribir en Stripe ni persistir correspondencias', async () => {
  const { plan, coupon } = fixtures();
  const fakeStripe = createFakeStripe();
  const storage = createStorage(plan, coupon);
  const service = new StripeCatalogSyncService({ storage, stripe: fakeStripe, currency: 'EUR' });

  const result = await service.syncPlan(plan.id, { dryRun: true });

  assert.equal(result.dryRun, true);
  assert.deepEqual(result.actions, ['create_product', 'create_price']);
  assert.equal(fakeStripe.products.created.length, 0);
  assert.equal(fakeStripe.prices.created.length, 0);
  assert.equal(plan.stripeProductId, undefined);
});

test('archiva objetos Stripe de planes y cupones sin borrarlos', async () => {
  const { plan, coupon } = fixtures();
  const fakeStripe = createFakeStripe();
  const storage = createStorage(plan, coupon);
  const service = new StripeCatalogSyncService({ storage, stripe: fakeStripe, currency: 'EUR' });
  await service.syncPlan(plan.id);
  await service.syncCoupon(coupon.id);

  await service.archivePlan(plan.id);
  await service.archiveCoupon(coupon.id);

  assert.equal(fakeStripe.products.updated.at(-1).input.active, false);
  assert.equal(fakeStripe.prices.updated.at(-1).input.active, false);
  assert.equal(fakeStripe.promotionCodes.updated.at(-1).input.active, false);
});

test('el proveedor rechaza configuración Stripe incompleta sin exponer secretos', async () => {
  const provider = new StripeClientProvider(
    { getAppSetting: async () => ({ value: { enabled: true, secretKey: '' } }) } as any,
    () => { throw new Error('provider should not construct a client'); },
  );

  await assert.rejects(provider.getClient(), StripeCatalogConfigurationError);
  assert.equal(sanitizeStripeCatalogError(new Error('Stripe rejected sk_test_example_catalog_key')), 'Stripe rejected [redacted]');
});

test('sincroniza, reemplaza y retira el cupón propio activo del plan según sus fechas', async () => {
  const { plan, coupon } = fixtures();
  Object.assign(plan, { originalPrice: '40.00', discountType: 'percentage', discountValue: '25', discountStartDate: new Date('2026-01-01'), discountEndDate: new Date('2026-12-31') });
  const fakeStripe = createFakeStripe();
  const service = new StripeCatalogSyncService({ storage: createStorage(plan, coupon), stripe: fakeStripe, currency: 'EUR', now: () => new Date('2026-09-13') });

  await service.syncPlan(plan.id);
  const firstCouponId = plan.stripePlanCouponId;
  plan.discountValue = '30';
  await service.syncPlan(plan.id);
  plan.discountEndDate = new Date('2026-09-01');
  await service.syncPlan(plan.id);

  assert.equal(fakeStripe.coupons.created.length, 2);
  assert.notEqual(plan.stripePlanCouponId, firstCouponId);
  assert.equal(plan.stripePlanCouponId, null);
  assert.equal(fakeStripe.coupons.updated.at(-1).input.metadata.zinto_catalog_archived, 'true');
  assert.equal(fakeStripe.coupons.created[0].input.metadata.zinto_plan_id, '7');
});

test('desactivar un plan retira simultáneamente su producto y precio', async () => {
  const { plan, coupon } = fixtures();
  const fakeStripe = createFakeStripe();
  const service = new StripeCatalogSyncService({ storage: createStorage(plan, coupon), stripe: fakeStripe });
  await service.syncPlan(plan.id);
  plan.isActive = false;

  await service.syncPlan(plan.id);

  assert.equal(fakeStripe.products.updated.at(-1).input.active, false);
  assert.equal(fakeStripe.prices.updated.at(-1).input.active, false);
});

test('reactivar un plan reactiva su precio Stripe archivado cuando conserva la misma configuración', async () => {
  const { plan, coupon } = fixtures();
  const fakeStripe = createFakeStripe();
  const service = new StripeCatalogSyncService({ storage: createStorage(plan, coupon), stripe: fakeStripe });
  await service.syncPlan(plan.id);
  plan.isActive = false;
  await service.syncPlan(plan.id);
  plan.isActive = true;

  await service.syncPlan(plan.id);

  assert.equal(fakeStripe.prices.created.length, 1);
  assert.equal(fakeStripe.prices.updated.at(-1).id, 'price_2');
  assert.deepEqual(fakeStripe.prices.updated.at(-1).input, { active: true });
});

test('mantiene códigos promocionales no canjeables antes del inicio y tras desactivar el cupón', async () => {
  const { plan, coupon } = fixtures();
  coupon.startDate = new Date('2026-10-01T00:00:00.000Z');
  const fakeStripe = createFakeStripe();
  const service = new StripeCatalogSyncService({ storage: createStorage(plan, coupon), stripe: fakeStripe, now: () => new Date('2026-09-13') });
  await service.syncCoupon(coupon.id);
  coupon.startDate = new Date('2026-01-01T00:00:00.000Z');
  await service.syncCoupon(coupon.id);
  coupon.isActive = false;
  await service.syncCoupon(coupon.id);

  assert.equal(fakeStripe.promotionCodes.created[0].input.active, false);
  assert.equal(fakeStripe.promotionCodes.updated.at(-1).input.active, false);
});

test('reconcilia ventanas temporales sin editar el cupón mediante la entrada de reconciliación', async () => {
  const { plan, coupon } = fixtures();
  coupon.startDate = new Date('2026-10-01T00:00:00.000Z');
  let currentTime = new Date('2026-09-13T00:00:00.000Z');
  const fakeStripe = createFakeStripe();
  const service = new StripeCatalogSyncService({ storage: createStorage(plan, coupon), stripe: fakeStripe, now: () => currentTime });
  await service.syncCoupon(coupon.id);
  currentTime = new Date('2026-10-01T00:00:00.000Z');

  await service.reconcileAvailability('coupon', coupon.id);

  assert.equal(fakeStripe.promotionCodes.updated.at(-1).id, 'promo_2');
  assert.equal(fakeStripe.promotionCodes.updated.at(-1).input.active, true);
});

test('reconcilia ventanas temporales sin editar el descuento del plan', async () => {
  const { plan, coupon } = fixtures();
  Object.assign(plan, {
    originalPrice: '40.00', discountType: 'percentage', discountValue: '25',
    discountDuration: 'first_month', discountStartDate: new Date('2026-10-01T00:00:00.000Z'),
  });
  let currentTime = new Date('2026-09-13T00:00:00.000Z');
  const fakeStripe = createFakeStripe();
  const service = new StripeCatalogSyncService({ storage: createStorage(plan, coupon), stripe: fakeStripe, now: () => currentTime });
  await service.syncPlan(plan.id);
  currentTime = new Date('2026-10-01T00:00:00.000Z');

  await service.reconcileAvailability('plan', plan.id);

  assert.equal(fakeStripe.coupons.created.length, 1);
  assert.equal(plan.stripePlanCouponId, 'coupon_3');
});

test('mapea duraciones de descuento de plan a semántica Stripe y rechaza valores desconocidos', async () => {
  const { plan, coupon } = fixtures();
  Object.assign(plan, { originalPrice: '40.00', discountType: 'percentage', discountValue: '25', discountDuration: 'first_month' });
  const fakeStripe = createFakeStripe();
  const service = new StripeCatalogSyncService({ storage: createStorage(plan, coupon), stripe: fakeStripe });
  await service.syncPlan(plan.id);
  plan.discountDuration = 'first_year';
  await service.syncPlan(plan.id);
  plan.discountDuration = 'unknown';

  await assert.rejects(service.syncPlan(plan.id), /Unsupported plan discount duration/);

  assert.equal(fakeStripe.coupons.created[0].input.duration, 'once');
  assert.equal(fakeStripe.coupons.created[1].input.duration, 'repeating');
  assert.equal(fakeStripe.coupons.created[1].input.duration_in_months, 12);
});

test('reconcilia producto, precio, cupón y código existentes por metadata a través de páginas', async () => {
  const { plan, coupon } = fixtures();
  const fakeStripe = createFakeStripe();
  for (let index = 0; index < 101; index += 1) fakeStripe.seed.product({ id: `other_${index}`, metadata: {} });
  const service = new StripeCatalogSyncService({ storage: createStorage(plan, coupon), stripe: fakeStripe });
  await service.syncPlan(plan.id);
  await service.syncCoupon(coupon.id);
  const expectedPlanIds = { product: plan.stripeProductId, price: plan.stripePriceId };
  const expectedCouponIds = { coupon: coupon.stripeCouponId, promotionCode: coupon.stripePromotionCodeId };
  Object.assign(plan, { stripeProductId: undefined, stripePriceId: undefined, stripeSyncFingerprint: undefined });
  Object.assign(coupon, { stripeCouponId: undefined, stripePromotionCodeId: undefined, stripeSyncFingerprint: undefined });

  await service.syncPlan(plan.id);
  await service.syncCoupon(coupon.id);

  assert.equal(plan.stripeProductId, expectedPlanIds.product);
  assert.equal(plan.stripePriceId, expectedPlanIds.price);
  assert.equal(coupon.stripeCouponId, expectedCouponIds.coupon);
  assert.equal(coupon.stripePromotionCodeId, expectedCouponIds.promotionCode);
  assert.ok(fakeStripe.calls.list >= 2);
  assert.equal(fakeStripe.products.created.length, 1);
});

test('crea precios con la moneda normalizada configurada y unidades sin decimales', async () => {
  const { plan, coupon } = fixtures();
  plan.price = '2925';
  const fakeStripe = createFakeStripe();
  const service = new StripeCatalogSyncService({ storage: createStorage(plan, coupon), stripe: fakeStripe, currency: 'jpy' });

  await service.syncPlan(plan.id);

  assert.equal(fakeStripe.prices.created[0].input.currency, 'jpy');
  assert.equal(fakeStripe.prices.created[0].input.unit_amount, 2925);
});

test('dry-run con mappings existentes no toca ningún método remoto', async () => {
  const { plan, coupon } = fixtures();
  Object.assign(plan, { stripeProductId: 'prod_existing', stripePriceId: 'price_existing' });
  Object.assign(coupon, { stripeCouponId: 'coupon_existing', stripePromotionCodeId: 'promo_existing' });
  const fakeStripe = createFakeStripe();
  const service = new StripeCatalogSyncService({ storage: createStorage(plan, coupon), stripe: fakeStripe });

  await service.syncPlan(plan.id, { dryRun: true });
  await service.syncCoupon(coupon.id, { dryRun: true });

  assert.equal(fakeStripe.calls.retrieve, 0);
  assert.equal(fakeStripe.calls.list, 0);
  assert.equal(fakeStripe.products.updated.length + fakeStripe.prices.updated.length + fakeStripe.coupons.updated.length + fakeStripe.promotionCodes.updated.length, 0);
});
