import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AddonPurchaseError,
  AddonPurchaseService,
  computeQuote,
  createInMemoryAddonStore,
  type AddonRow,
  type CompanyRow,
} from '../server/services/addon-purchase-service';

function fixtures() {
  const extraUser: AddonRow = {
    id: 1,
    key: 'extra_user',
    name: 'Usuario adicional',
    description: null,
    unitPriceEur: '12.00',
    unitPriceUsd: '12.00',
    validityDays: 30,
    isActive: true,
    stripeProductId: 'prod_extra_user',
    stripePriceIdEur: 'price_extra_user_eur',
    stripePriceIdUsd: 'price_extra_user_usd',
    stripeSyncStatus: 'synced',
    stripeSyncError: null,
    stripeSyncedAt: new Date('2026-01-01T00:00:00Z'),
    stripeSyncFingerprint: 'fp-user',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  } as unknown as AddonRow;

  const extraWhatsapp: AddonRow = {
    ...extraUser,
    id: 2,
    key: 'extra_whatsapp_connection',
    name: 'Conexión adicional de WhatsApp',
    unitPriceEur: '15.00',
    unitPriceUsd: '15.00',
    stripePriceIdEur: 'price_extra_wa_eur',
    stripePriceIdUsd: 'price_extra_wa_usd',
  } as unknown as AddonRow;

  const companyEs: CompanyRow = { id: 100, country: 'ES', stripeCustomerId: null } as unknown as CompanyRow;
  const companyUs: CompanyRow = { id: 200, country: 'US', stripeCustomerId: null } as unknown as CompanyRow;

  return { extraUser, extraWhatsapp, companyEs, companyUs };
}

function createFakeStripe() {
  let counter = 0;
  let customerCounter = 0;
  const sessionsCreated: any[] = [];
  const customersCreated: any[] = [];
  let createImpl: ((params: any) => Promise<any>) | null = null;
  let customersCreateImpl: ((params: any) => Promise<any>) | null = null;
  return {
    sessionsCreated,
    customersCreated,
    setCreateImpl(fn: (params: any) => Promise<any>) {
      createImpl = fn;
    },
    setCustomersCreateImpl(fn: (params: any) => Promise<any>) {
      customersCreateImpl = fn;
    },
    checkout: {
      sessions: {
        create: async (params: any) => {
          sessionsCreated.push(params);
          if (createImpl) return createImpl(params);
          counter += 1;
          return { id: `cs_test_${counter}`, url: `https://checkout.stripe.test/${counter}` };
        },
      },
    },
    customers: {
      create: async (params: any) => {
        customersCreated.push(params);
        if (customersCreateImpl) return customersCreateImpl(params);
        customerCounter += 1;
        return { id: `cus_test_${customerCounter}` };
      },
    },
  } as any;
}

test('computeQuote es puro y determinista a partir del catálogo y no de ninguna entrada externa', () => {
  const { extraUser } = fixtures();
  const quoteEur = computeQuote(extraUser, 3, 'EUR');
  assert.deepEqual(quoteEur, { currency: 'EUR', unitAmountMinor: 1200, totalAmountMinor: 3600 });

  const quoteUsd = computeQuote(extraUser, 2, 'USD');
  assert.deepEqual(quoteUsd, { currency: 'USD', unitAmountMinor: 1200, totalAmountMinor: 2400 });

  assert.throws(() => computeQuote(extraUser, 0, 'USD'));
  assert.throws(() => computeQuote(extraUser, -1, 'USD'));
  assert.throws(() => computeQuote(extraUser, 1.5, 'USD'));
});

test('createPurchaseCheckoutSession calcula el importe únicamente a partir del catálogo del servidor', async () => {
  const { extraUser, companyEs } = fixtures();
  const store = createInMemoryAddonStore({ addons: [extraUser], companies: [companyEs] });
  const fakeStripe = createFakeStripe();
  const service = new AddonPurchaseService({ store, getStripeClient: async () => fakeStripe });

  const result = await service.createPurchaseCheckoutSession(companyEs.id, 'extra_user', 3, false);

  assert.match(result.url, /^https:\/\/checkout\.stripe\.test\//);
  assert.equal(fakeStripe.sessionsCreated.length, 1);
  const sessionParams = fakeStripe.sessionsCreated[0];
  assert.equal(sessionParams.mode, 'payment');
  assert.deepEqual(sessionParams.line_items, [{ price: 'price_extra_user_eur', quantity: 3 }]);
  assert.equal(sessionParams.metadata.companyId, String(companyEs.id));
  assert.equal(sessionParams.metadata.quantity, '3');
  assert.equal(sessionParams.payment_intent_data.metadata.purchaseId, sessionParams.metadata.purchaseId);

  const [purchase] = [...store.purchases.values()];
  assert.equal(purchase.currency, 'EUR');
  assert.equal(purchase.unitAmountMinor, 1200);
  assert.equal(purchase.totalAmountMinor, 3600);
  assert.equal(purchase.status, 'pending');
  assert.equal(purchase.stripeCheckoutSessionId, 'cs_test_1');
});

test('createPurchaseCheckoutSession crea un Stripe Customer y pide guardar la tarjeta (setup_future_usage) para poder auto-renovar después', async () => {
  const { extraUser, companyEs } = fixtures();
  const store = createInMemoryAddonStore({ addons: [extraUser], companies: [companyEs] });
  const fakeStripe = createFakeStripe();
  const service = new AddonPurchaseService({ store, getStripeClient: async () => fakeStripe });

  await service.createPurchaseCheckoutSession(companyEs.id, 'extra_user', 1, false);

  assert.equal(fakeStripe.customersCreated.length, 1, 'la empresa no tenía stripeCustomerId: debe crearse uno');
  const sessionParams = fakeStripe.sessionsCreated[0];
  assert.equal(sessionParams.customer, 'cus_test_1');
  assert.equal(
    sessionParams.payment_intent_data.setup_future_usage,
    'off_session',
    'sin esto, la renovación automática nunca tendría una tarjeta guardada que cobrar'
  );
  assert.equal(
    store.companies.get(companyEs.id)!.stripeCustomerId,
    'cus_test_1',
    'el customer id creado debe persistirse en la empresa, no perderse tras esta única compra'
  );
});

test('si stripe.customers.create falla, la fila pending se marca failed (no queda huérfana bloqueando futuras compras)', async () => {
  const { extraUser, companyEs } = fixtures();
  const store = createInMemoryAddonStore({ addons: [extraUser], companies: [companyEs] });
  const fakeStripe = createFakeStripe();
  fakeStripe.setCustomersCreateImpl(async () => {
    throw new Error('Stripe is down');
  });
  const service = new AddonPurchaseService({ store, getStripeClient: async () => fakeStripe });

  await assert.rejects(() => service.createPurchaseCheckoutSession(companyEs.id, 'extra_user', 1, false));

  const [purchase] = [...store.purchases.values()];
  assert.equal(
    purchase.status,
    'failed',
    'sin este arreglo la fila se queda pending para siempre y bloquea toda compra futura vía el índice único'
  );
  assert.equal(fakeStripe.sessionsCreated.length, 0, 'nunca debe intentar crear la Checkout Session sin customer');

  // Y ahora sí debe poder comprar de nuevo (la fila failed no cuenta para el índice de "pending único").
  const fakeStripe2 = createFakeStripe();
  const service2 = new AddonPurchaseService({ store, getStripeClient: async () => fakeStripe2 });
  await service2.createPurchaseCheckoutSession(companyEs.id, 'extra_user', 1, false);
  assert.equal(store.purchases.size, 2);
});

test('createPurchaseCheckoutSession reutiliza el stripeCustomerId existente en vez de crear uno nuevo cada vez', async () => {
  const { extraUser, companyEs } = fixtures();
  const existingCompany = { ...companyEs, stripeCustomerId: 'cus_existing' };
  const store = createInMemoryAddonStore({ addons: [extraUser], companies: [existingCompany] });
  const fakeStripe = createFakeStripe();
  const service = new AddonPurchaseService({ store, getStripeClient: async () => fakeStripe });

  await service.createPurchaseCheckoutSession(existingCompany.id, 'extra_user', 1, false);

  assert.equal(fakeStripe.customersCreated.length, 0, 'ya existe un customer: no debe crearse otro');
  assert.equal(fakeStripe.sessionsCreated[0].customer, 'cus_existing');
});

test('createPurchaseCheckoutSession nunca acepta un importe/currency/precio proporcionado por el cliente (no existen esos parámetros)', async () => {
  const { extraUser, companyUs } = fixtures();
  const store = createInMemoryAddonStore({ addons: [extraUser], companies: [companyUs] });
  const fakeStripe = createFakeStripe();
  const service = new AddonPurchaseService({ store, getStripeClient: async () => fakeStripe });

  await service.createPurchaseCheckoutSession(companyUs.id, 'extra_user', 5, false);

  const [purchase] = [...store.purchases.values()];
  // US -> USD, 5 * 12.00 = 60.00 regardless of anything a caller could pass (signature has no
  // amount/currency/price parameter at all).
  assert.equal(purchase.currency, 'USD');
  assert.equal(purchase.totalAmountMinor, 6000);
  assert.equal(fakeStripe.sessionsCreated[0].line_items[0].price, 'price_extra_user_usd');
});

test('una segunda compra pendiente para la misma empresa/addon se rechaza sin crear una segunda fila', async () => {
  const { extraUser, companyEs } = fixtures();
  const store = createInMemoryAddonStore({ addons: [extraUser], companies: [companyEs] });
  const fakeStripe = createFakeStripe();
  const service = new AddonPurchaseService({ store, getStripeClient: async () => fakeStripe });

  await service.createPurchaseCheckoutSession(companyEs.id, 'extra_user', 1, false);
  assert.equal(store.purchases.size, 1);

  await assert.rejects(
    () => service.createPurchaseCheckoutSession(companyEs.id, 'extra_user', 1, false),
    (error: unknown) => {
      assert.ok(error instanceof AddonPurchaseError);
      assert.equal((error as AddonPurchaseError).statusCode, 409);
      return true;
    }
  );

  assert.equal(store.purchases.size, 1, 'no debe haberse creado una segunda fila pending');
  assert.equal(fakeStripe.sessionsCreated.length, 1, 'Stripe no debe haber sido invocado en el segundo intento');
});

test('rechaza la compra si el addon quedó marcado pending tras editar su precio (aunque el price id antiguo siga presente)', async () => {
  const { extraUser, companyEs } = fixtures();
  // Simulates an admin editing the price via PATCH /api/admin/addons/:id: stripePriceIdEur/Usd
  // are still the OLD synced ids (not yet re-synced), but stripeSyncStatus was reset to 'pending'
  // — the purchase must be blocked, not silently charge the stale Stripe price.
  const stalePriceAfterEdit: AddonRow = { ...extraUser, stripeSyncStatus: 'pending' } as unknown as AddonRow;
  const store = createInMemoryAddonStore({ addons: [stalePriceAfterEdit], companies: [companyEs] });
  const fakeStripe = createFakeStripe();
  const service = new AddonPurchaseService({ store, getStripeClient: async () => fakeStripe });

  await assert.rejects(
    () => service.createPurchaseCheckoutSession(companyEs.id, 'extra_user', 1, false),
    (error: unknown) => {
      assert.ok(error instanceof AddonPurchaseError);
      assert.match((error as AddonPurchaseError).message, /not synced with Stripe/);
      return true;
    }
  );

  assert.equal(store.purchases.size, 0, 'no debe crearse ninguna fila mientras el addon no esté sincronizado');
  assert.equal(fakeStripe.sessionsCreated.length, 0, 'nunca debe cobrar el precio antiguo mientras no se resincronice');
});

test('rechaza la compra con un error claro si el addon no tiene precio de Stripe sincronizado para la moneda resuelta', async () => {
  const { extraUser, companyEs } = fixtures();
  const unsynced: AddonRow = { ...extraUser, stripePriceIdEur: null } as unknown as AddonRow;
  const store = createInMemoryAddonStore({ addons: [unsynced], companies: [companyEs] });
  const fakeStripe = createFakeStripe();
  const service = new AddonPurchaseService({ store, getStripeClient: async () => fakeStripe });

  await assert.rejects(
    () => service.createPurchaseCheckoutSession(companyEs.id, 'extra_user', 1, false),
    (error: unknown) => {
      assert.ok(error instanceof AddonPurchaseError);
      assert.match((error as AddonPurchaseError).message, /no synced Stripe price/);
      return true;
    }
  );

  assert.equal(store.purchases.size, 0, 'no debe crearse ninguna fila si el precio no está sincronizado');
  assert.equal(fakeStripe.sessionsCreated.length, 0, 'nunca debe caer a price_data inline ni llamar a Stripe');
});

test('si Stripe falla al crear la sesión, la fila pending se marca failed y libera el hueco para reintentar', async () => {
  const { extraUser, companyEs } = fixtures();
  const store = createInMemoryAddonStore({ addons: [extraUser], companies: [companyEs] });
  const fakeStripe = createFakeStripe();
  fakeStripe.setCreateImpl(async () => {
    throw new Error('stripe unavailable');
  });
  const service = new AddonPurchaseService({ store, getStripeClient: async () => fakeStripe });

  await assert.rejects(() => service.createPurchaseCheckoutSession(companyEs.id, 'extra_user', 1, false), /stripe unavailable/);

  const [purchase] = [...store.purchases.values()];
  assert.equal(purchase.status, 'failed');

  // Retry should now succeed since the failed row no longer blocks the partial unique index.
  fakeStripe.setCreateImpl(async (params: any) => ({ id: 'cs_retry', url: 'https://checkout.stripe.test/retry' }));
  const retryResult = await service.createPurchaseCheckoutSession(companyEs.id, 'extra_user', 1, false);
  assert.equal(retryResult.url, 'https://checkout.stripe.test/retry');
});

test('getActiveQuantity solo suma filas active con expires_at futuro, excluyendo pending/failed/expired/revoked', async () => {
  const { extraUser, companyEs } = fixtures();
  const now = new Date('2026-06-15T00:00:00Z');
  const store = createInMemoryAddonStore({
    addons: [extraUser],
    companies: [companyEs],
    purchases: [
      { id: 1, companyId: companyEs.id, addonId: extraUser.id, quantity: 5, status: 'active', expiresAt: new Date('2026-07-01T00:00:00Z'), currency: 'EUR', unitAmountMinor: 1200, totalAmountMinor: 6000, autoRenew: false, stripeCheckoutSessionId: null, stripePaymentIntentId: null, stripeChargeId: null, renewedFromId: null, purchasedAt: new Date('2026-06-01'), revokedAt: null, revokedReason: null, createdAt: new Date('2026-06-01') } as any,
      { id: 2, companyId: companyEs.id, addonId: extraUser.id, quantity: 100, status: 'pending', expiresAt: null, currency: 'EUR', unitAmountMinor: 1200, totalAmountMinor: 120000, autoRenew: false, stripeCheckoutSessionId: null, stripePaymentIntentId: null, stripeChargeId: null, renewedFromId: null, purchasedAt: null, revokedAt: null, revokedReason: null, createdAt: new Date('2026-06-01') } as any,
      { id: 3, companyId: companyEs.id, addonId: extraUser.id, quantity: 100, status: 'failed', expiresAt: null, currency: 'EUR', unitAmountMinor: 1200, totalAmountMinor: 120000, autoRenew: false, stripeCheckoutSessionId: null, stripePaymentIntentId: null, stripeChargeId: null, renewedFromId: null, purchasedAt: null, revokedAt: null, revokedReason: null, createdAt: new Date('2026-06-01') } as any,
      { id: 4, companyId: companyEs.id, addonId: extraUser.id, quantity: 100, status: 'expired', expiresAt: new Date('2026-01-01'), currency: 'EUR', unitAmountMinor: 1200, totalAmountMinor: 120000, autoRenew: false, stripeCheckoutSessionId: null, stripePaymentIntentId: null, stripeChargeId: null, renewedFromId: null, purchasedAt: new Date('2025-12-01'), revokedAt: null, revokedReason: null, createdAt: new Date('2025-12-01') } as any,
      { id: 5, companyId: companyEs.id, addonId: extraUser.id, quantity: 100, status: 'revoked', expiresAt: new Date('2026-07-01'), currency: 'EUR', unitAmountMinor: 1200, totalAmountMinor: 120000, autoRenew: false, stripeCheckoutSessionId: null, stripePaymentIntentId: null, stripeChargeId: null, renewedFromId: null, purchasedAt: new Date('2026-06-01'), revokedAt: new Date('2026-06-10'), revokedReason: 'refunded', createdAt: new Date('2026-06-01') } as any,
      { id: 6, companyId: companyEs.id, addonId: extraUser.id, quantity: 7, status: 'active', expiresAt: new Date('2026-06-14T00:00:00Z'), currency: 'EUR', unitAmountMinor: 1200, totalAmountMinor: 8400, autoRenew: false, stripeCheckoutSessionId: null, stripePaymentIntentId: null, stripeChargeId: null, renewedFromId: null, purchasedAt: new Date('2026-05-14'), revokedAt: null, revokedReason: null, createdAt: new Date('2026-05-14') } as any,
    ],
  });
  const service = new AddonPurchaseService({ store, now: () => now });

  const active = await service.getActiveQuantity(companyEs.id, extraUser.id);

  // Only row #1 (active, expires in the future) counts. Row #6 is active but already expired
  // relative to `now`, so it must NOT count.
  assert.equal(active, 5);
});

test('getCompanyAddonStatus devuelve la forma exacta esperada por el cliente para cada uno de los 2 addons', async () => {
  const { extraUser, extraWhatsapp, companyEs } = fixtures();
  const now = new Date('2026-06-15T00:00:00Z');
  const store = createInMemoryAddonStore({
    addons: [extraUser, extraWhatsapp],
    companies: [companyEs],
    purchases: [
      { id: 1, companyId: companyEs.id, addonId: extraUser.id, quantity: 2, status: 'active', expiresAt: new Date('2026-07-01T00:00:00Z'), currency: 'EUR', unitAmountMinor: 1200, totalAmountMinor: 2400, autoRenew: false, stripeCheckoutSessionId: null, stripePaymentIntentId: null, stripeChargeId: null, renewedFromId: null, purchasedAt: new Date('2026-06-01'), revokedAt: null, revokedReason: null, createdAt: new Date('2026-06-01') } as any,
      { id: 2, companyId: companyEs.id, addonId: extraUser.id, quantity: 1, status: 'active', expiresAt: new Date('2026-06-20T00:00:00Z'), currency: 'EUR', unitAmountMinor: 1200, totalAmountMinor: 1200, autoRenew: true, stripeCheckoutSessionId: null, stripePaymentIntentId: null, stripeChargeId: null, renewedFromId: null, purchasedAt: new Date('2026-05-20'), revokedAt: null, revokedReason: null, createdAt: new Date('2026-05-20') } as any,
    ],
  });
  const service = new AddonPurchaseService({ store, now: () => now });

  const status = await service.getCompanyAddonStatus(companyEs.id);

  assert.equal(status.length, 2);
  const user = status.find((s) => s.key === 'extra_user')!;
  const wa = status.find((s) => s.key === 'extra_whatsapp_connection')!;

  assert.equal(user.name, 'Usuario adicional');
  assert.equal(user.currency, 'EUR');
  assert.equal(user.unitPrice, 12);
  assert.equal(user.activeQuantity, 3);
  assert.equal(user.nearestExpiresAt?.toISOString(), new Date('2026-06-20T00:00:00Z').toISOString());
  assert.equal(user.autoRenew, true); // row #2 has autoRenew=true

  assert.equal(wa.activeQuantity, 0);
  assert.equal(wa.nearestExpiresAt, null);
  assert.equal(wa.autoRenew, false);
});

test('setAddonAutoRenew está delimitado por companyId y aplica a TODAS las filas activas de ese addon', async () => {
  const { extraUser, companyEs, companyUs } = fixtures();
  const store = createInMemoryAddonStore({
    addons: [extraUser],
    companies: [companyEs, companyUs],
    purchases: [
      // Two independent active batches for companyEs (e.g. bought on different days) — both
      // must flip together, since "auto-renew this add-on" is a per-company-per-addon intent.
      { id: 1, companyId: companyEs.id, addonId: extraUser.id, quantity: 1, status: 'active', expiresAt: new Date('2026-07-01'), currency: 'EUR', unitAmountMinor: 1200, totalAmountMinor: 1200, autoRenew: false, stripeCheckoutSessionId: null, stripePaymentIntentId: null, stripeChargeId: null, renewedFromId: null, purchasedAt: new Date('2026-06-01'), revokedAt: null, revokedReason: null, createdAt: new Date('2026-06-01') } as any,
      { id: 2, companyId: companyEs.id, addonId: extraUser.id, quantity: 2, status: 'active', expiresAt: new Date('2026-07-15'), currency: 'EUR', unitAmountMinor: 1200, totalAmountMinor: 2400, autoRenew: false, stripeCheckoutSessionId: null, stripePaymentIntentId: 'pi_batch2', stripeChargeId: null, renewedFromId: null, purchasedAt: new Date('2026-06-15'), revokedAt: null, revokedReason: null, createdAt: new Date('2026-06-15') } as any,
    ],
  });
  const service = new AddonPurchaseService({ store, now: () => new Date('2026-06-20') });

  const wrongCompany = await service.setAddonAutoRenew(companyUs.id, 'extra_user', true);
  assert.equal(wrongCompany, false, 'una empresa sin cupo activo de este addon no tiene nada que alternar');
  assert.equal(store.purchases.get(1)!.autoRenew, false);
  assert.equal(store.purchases.get(2)!.autoRenew, false);

  const rightCompany = await service.setAddonAutoRenew(companyEs.id, 'extra_user', true);
  assert.equal(rightCompany, true);
  assert.equal(store.purchases.get(1)!.autoRenew, true);
  assert.equal(store.purchases.get(2)!.autoRenew, true);

  const unknownAddon = await service.setAddonAutoRenew(companyEs.id, 'not_a_real_addon', true);
  assert.equal(unknownAddon, false);
});
