import assert from 'node:assert/strict';
import test from 'node:test';

import { runDueRenewals } from '../server/services/addon-renewal-service';
import { createInMemoryAddonStore, type AddonRow, type CompanyRow } from '../server/services/addon-purchase-service';

function baseAddon(overrides: Record<string, unknown> = {}): AddonRow {
  return {
    id: 1,
    key: 'extra_user',
    name: 'Usuario adicional',
    description: null,
    unitPriceEur: '12.00',
    unitPriceUsd: '12.00',
    validityDays: 30,
    isActive: true,
    stripeProductId: 'prod_1',
    stripePriceIdEur: 'price_eur_1',
    stripePriceIdUsd: 'price_usd_1',
    stripeSyncStatus: 'synced',
    stripeSyncError: null,
    stripeSyncedAt: new Date('2026-01-01'),
    stripeSyncFingerprint: 'fp',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as unknown as AddonRow;
}

function company(overrides: Record<string, unknown> = {}): CompanyRow {
  return { id: 100, country: 'ES', stripeCustomerId: 'cus_1', ...overrides } as unknown as CompanyRow;
}

function dueActivePurchase(now: Date, overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    companyId: 100,
    addonId: 1,
    quantity: 3,
    currency: 'EUR',
    unitAmountMinor: 1200,
    totalAmountMinor: 3600,
    status: 'active',
    stripeCheckoutSessionId: 'cs_old',
    stripePaymentIntentId: 'pi_old',
    stripeChargeId: null,
    autoRenew: true,
    renewedFromId: null,
    purchasedAt: new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000),
    expiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1000), // due in 2h, inside the 6h lookahead
    revokedAt: null,
    revokedReason: null,
    createdAt: new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000),
    ...overrides,
  } as any;
}

function createFakeStripe(opts: {
  customer?: any;
  createPaymentIntent?: (params: any) => Promise<any>;
} = {}) {
  let retrieveCalls = 0;
  let createCalls = 0;
  return {
    get retrieveCalls() {
      return retrieveCalls;
    },
    get createCalls() {
      return createCalls;
    },
    customers: {
      retrieve: async (id: string) => {
        retrieveCalls += 1;
        return opts.customer ?? { id, deleted: false, invoice_settings: { default_payment_method: 'pm_1' } };
      },
    },
    paymentIntents: {
      create: async (params: any) => {
        createCalls += 1;
        if (opts.createPaymentIntent) return opts.createPaymentIntent(params);
        return { id: 'pi_new', status: 'succeeded', ...params };
      },
    },
  } as any;
}

const now = new Date('2026-06-15T10:00:00Z');

test('una renovación exitosa crea exactamente una nueva fila active encadenada por renewedFromId', async () => {
  const addon = baseAddon();
  const comp = company();
  const original = dueActivePurchase(now);
  const store = createInMemoryAddonStore({ addons: [addon], companies: [comp], purchases: [original] });
  const fakeStripe = createFakeStripe();

  const summary = await runDueRenewals(now, { store, getStripeClient: async () => fakeStripe });

  assert.deepEqual(summary, { processed: 1, renewed: 1, skipped: 0, failed: 0 });
  assert.equal(store.purchases.size, 2);

  const newRow = [...store.purchases.values()].find((p) => p.id !== original.id)!;
  assert.equal(newRow.status, 'active');
  assert.equal(newRow.renewedFromId, original.id);
  assert.equal(newRow.companyId, 100);
  assert.equal(newRow.addonId, 1);
  assert.equal(newRow.quantity, 3);
  assert.equal(newRow.currency, 'EUR');
  assert.equal(newRow.unitAmountMinor, 1200);
  assert.equal(newRow.totalAmountMinor, 3600);
  assert.equal(newRow.stripePaymentIntentId, 'pi_new');
  assert.equal(newRow.purchasedAt.toISOString(), now.toISOString());
  assert.equal(newRow.expiresAt.toISOString(), new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString());

  // Original row is left exactly as it was (no expiry extension applied to it).
  const originalAfter = store.purchases.get(original.id)!;
  assert.equal(originalAfter.expiresAt!.toISOString(), original.expiresAt.toISOString());
  assert.equal(originalAfter.status, 'active');
});

test('una renovación rechazada (tarjeta declinada) no crea fila nueva ni extiende expiresAt', async () => {
  const addon = baseAddon();
  const comp = company();
  const original = dueActivePurchase(now);
  const store = createInMemoryAddonStore({ addons: [addon], companies: [comp], purchases: [original] });
  const fakeStripe = createFakeStripe({
    createPaymentIntent: async () => {
      throw Object.assign(new Error('Your card was declined'), { type: 'StripeCardError', code: 'card_declined' });
    },
  });

  const summary = await runDueRenewals(now, { store, getStripeClient: async () => fakeStripe });

  assert.deepEqual(summary, { processed: 1, renewed: 0, skipped: 0, failed: 1 });
  assert.equal(store.purchases.size, 1, 'no debe crearse ninguna fila nueva');
  const untouched = store.purchases.get(original.id)!;
  assert.equal(untouched.expiresAt!.toISOString(), original.expiresAt.toISOString(), 'expiresAt no debe extenderse');
  assert.equal(untouched.status, 'active', 'la fila original no cambia de estado; el cupo simplemente caduca en su expiresAt original');
});

test('una fila sin método de pago guardado se omite (log) en vez de romper el lote', async () => {
  const addon = baseAddon();
  const comp = company();
  const original = dueActivePurchase(now);
  const store = createInMemoryAddonStore({ addons: [addon], companies: [comp], purchases: [original] });
  const fakeStripe = createFakeStripe({ customer: { id: 'cus_1', deleted: false, invoice_settings: {} } });

  const summary = await runDueRenewals(now, { store, getStripeClient: async () => fakeStripe });

  assert.deepEqual(summary, { processed: 1, renewed: 0, skipped: 1, failed: 0 });
  assert.equal(store.purchases.size, 1);
  assert.equal(fakeStripe.createCalls, 0, 'nunca debe intentarse un cargo sin método de pago guardado');
});

test('una empresa sin stripeCustomerId se omite sin ni siquiera consultar Stripe', async () => {
  const addon = baseAddon();
  const comp = company({ stripeCustomerId: null });
  const original = dueActivePurchase(now);
  const store = createInMemoryAddonStore({ addons: [addon], companies: [comp], purchases: [original] });
  const fakeStripe = createFakeStripe();

  const summary = await runDueRenewals(now, { store, getStripeClient: async () => fakeStripe });

  assert.deepEqual(summary, { processed: 1, renewed: 0, skipped: 1, failed: 0 });
  assert.equal(fakeStripe.retrieveCalls, 0);
  assert.equal(fakeStripe.createCalls, 0);
});

test('un lote con una fila mala no se aborta: el resto de renovaciones se procesan igual', async () => {
  const addon = baseAddon();
  const compGood = company({ id: 100, stripeCustomerId: 'cus_1' });
  const compBad = company({ id: 101, stripeCustomerId: null });
  const rowBad = dueActivePurchase(now, { id: 1, companyId: 101 });
  const rowGood = dueActivePurchase(now, { id: 2, companyId: 100, stripePaymentIntentId: 'pi_old_2' });
  const store = createInMemoryAddonStore({ addons: [addon], companies: [compGood, compBad], purchases: [rowBad, rowGood] });
  const fakeStripe = createFakeStripe();

  const summary = await runDueRenewals(now, { store, getStripeClient: async () => fakeStripe });

  assert.equal(summary.processed, 2);
  assert.equal(summary.skipped, 1);
  assert.equal(summary.renewed, 1);
  assert.equal(store.purchases.size, 3); // rowBad + rowGood + the one new renewal row
});

test('la renovación siempre recalcula el precio del catálogo vigente, nunca reutiliza el importe guardado en la fila antigua', async () => {
  // The stored row has a stale (lower) amount; the live catalog price has since gone up. The
  // renewal MUST charge/record the current catalog price, not the old row's amount.
  const addon = baseAddon({ unitPriceEur: '18.00' });
  const comp = company();
  const original = dueActivePurchase(now, { unitAmountMinor: 1200, totalAmountMinor: 3600 }); // stale: quantity 3 * old 12.00
  const store = createInMemoryAddonStore({ addons: [addon], companies: [comp], purchases: [original] });
  const fakeStripe = createFakeStripe();

  await runDueRenewals(now, { store, getStripeClient: async () => fakeStripe });

  const newRow = [...store.purchases.values()].find((p) => p.id !== original.id)!;
  assert.equal(newRow.unitAmountMinor, 1800); // 18.00 EUR, not the stale 12.00
  assert.equal(newRow.totalAmountMinor, 5400); // 3 * 1800
});

test('si el PaymentIntent de renovación coincide con uno ya registrado (carrera con el webhook), no se duplica el cupo', async () => {
  const addon = baseAddon();
  const comp = company();
  const original = dueActivePurchase(now, { id: 1 });
  // Simulates a row that a `payment_intent.succeeded` webhook (or a previous run) already
  // inserted for the SAME Stripe payment intent id our fake will return.
  const alreadyRecorded = {
    ...dueActivePurchase(now, { id: 2 }),
    status: 'active',
    renewedFromId: 1,
    stripePaymentIntentId: 'pi_race',
  };
  const store = createInMemoryAddonStore({ addons: [addon], companies: [comp], purchases: [original, alreadyRecorded] });
  const fakeStripe = createFakeStripe({ createPaymentIntent: async () => ({ id: 'pi_race', status: 'succeeded' }) });

  const summary = await runDueRenewals(now, { store, getStripeClient: async () => fakeStripe });

  assert.equal(summary.renewed, 0);
  assert.equal(summary.skipped, 1);
  assert.equal(store.purchases.size, 2, 'no debe haberse insertado una tercera fila duplicada');
});

test('un addon desactivado en el catálogo se omite en vez de cobrar por él', async () => {
  const addon = baseAddon({ isActive: false });
  const comp = company();
  const original = dueActivePurchase(now);
  const store = createInMemoryAddonStore({ addons: [addon], companies: [comp], purchases: [original] });
  const fakeStripe = createFakeStripe();

  const summary = await runDueRenewals(now, { store, getStripeClient: async () => fakeStripe });

  assert.equal(summary.skipped, 1);
  assert.equal(fakeStripe.createCalls, 0);
});
