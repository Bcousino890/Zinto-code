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
        return { id: next('prod') };
      },
      update: async (id: string, input: any, options: any) => {
        products.updated.push({ id, input, options });
        return { id };
      },
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
        return { id };
      },
      retrieve: async (id: string) => priceById.get(id),
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
        return { id };
      },
      retrieve: async (id: string) => couponById.get(id),
    },
    promotionCodes: {
      created: promotionCodes.created,
      updated: promotionCodes.updated,
      create: async (input: any, options: any) => {
        promotionCodes.created.push({ input, options });
        return { id: next('promo') };
      },
      update: async (id: string, input: any, options: any) => {
        promotionCodes.updated.push({ id, input, options });
        return { id };
      },
    },
  };
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
