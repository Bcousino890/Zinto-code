import assert from 'node:assert/strict';
import test from 'node:test';

import { handleAddonWebhookEvent } from '../server/services/addon-billing-webhooks';
import { createInMemoryAddonStore, type AddonRow } from '../server/services/addon-purchase-service';

function baseAddon(): AddonRow {
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
  } as unknown as AddonRow;
}

function pendingPurchase(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    companyId: 100,
    addonId: 1,
    quantity: 2,
    currency: 'EUR',
    unitAmountMinor: 1200,
    totalAmountMinor: 2400,
    status: 'pending',
    stripeCheckoutSessionId: 'cs_1',
    stripePaymentIntentId: null,
    stripeChargeId: null,
    autoRenew: false,
    renewedFromId: null,
    purchasedAt: null,
    expiresAt: null,
    revokedAt: null,
    revokedReason: null,
    createdAt: new Date('2026-06-01'),
    ...overrides,
  } as any;
}

function activePurchase(overrides: Record<string, unknown> = {}) {
  return {
    ...pendingPurchase(),
    status: 'active',
    stripePaymentIntentId: 'pi_1',
    purchasedAt: new Date('2026-06-01'),
    expiresAt: new Date('2026-07-01'),
    ...overrides,
  } as any;
}

function checkoutSessionCompletedEvent(id: string, purchaseId: number, paymentIntentId = 'pi_1') {
  return {
    id,
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_1', payment_intent: paymentIntentId, metadata: { purchaseId: String(purchaseId) } } },
  } as any;
}

function checkoutSessionExpiredEvent(id: string, purchaseId: number) {
  return {
    id,
    type: 'checkout.session.expired',
    data: { object: { id: 'cs_1', metadata: { purchaseId: String(purchaseId) } } },
  } as any;
}

function paymentIntentFailedEvent(id: string, opts: { purchaseId?: number; paymentIntentId: string }) {
  return {
    id,
    type: 'payment_intent.payment_failed',
    data: {
      object: {
        id: opts.paymentIntentId,
        metadata: opts.purchaseId != null ? { purchaseId: String(opts.purchaseId) } : {},
      },
    },
  } as any;
}

function chargeRefundedEvent(id: string, paymentIntentId: string, chargeId = 'ch_1') {
  return {
    id,
    type: 'charge.refunded',
    data: { object: { id: chargeId, payment_intent: paymentIntentId } },
  } as any;
}

function chargeDisputeCreatedEvent(id: string, paymentIntentId: string, chargeId = 'ch_1') {
  return {
    id,
    type: 'charge.dispute.created',
    data: { object: { id: `dp_1`, charge: chargeId, payment_intent: paymentIntentId } },
  } as any;
}

const fixedNow = new Date('2026-06-15T12:00:00Z');

// -----------------------------------------------------------------------
// checkout.session.completed -> the ONLY path that grants quota
// -----------------------------------------------------------------------

test('checkout.session.completed activa una compra pending, fija purchasedAt/expiresAt', async () => {
  const addon = baseAddon();
  const store = createInMemoryAddonStore({ addons: [addon], purchases: [pendingPurchase()] });

  const result = await handleAddonWebhookEvent(checkoutSessionCompletedEvent('evt_1', 1), { store, now: () => fixedNow });

  assert.deepEqual(result, { handled: true, event: 'checkout.session.completed', purchaseId: 1, outcome: 'activated' });
  const row = store.purchases.get(1)!;
  assert.equal(row.status, 'active');
  assert.equal(row.purchasedAt!.toISOString(), fixedNow.toISOString());
  assert.equal(row.expiresAt!.toISOString(), new Date(fixedNow.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString());
  assert.equal(row.stripePaymentIntentId, 'pi_1');
});

test('checkout.session.completed es un no-op si la fila ya está active (replay idempotente)', async () => {
  const addon = baseAddon();
  const originalExpiry = new Date('2026-07-01T00:00:00Z');
  const store = createInMemoryAddonStore({ addons: [addon], purchases: [activePurchase({ expiresAt: originalExpiry })] });

  // A different event id, but the row is already active: must not reset purchasedAt/expiresAt.
  const result = await handleAddonWebhookEvent(checkoutSessionCompletedEvent('evt_other', 1), { store, now: () => fixedNow });

  assert.equal(result.handled, true);
  assert.equal((result as any).outcome, 'already-active');
  assert.equal(store.purchases.get(1)!.expiresAt!.toISOString(), originalExpiry.toISOString());
});

test('checkout.session.completed: el mismo event.id repetido es un no-op estricto (no reactiva ni duplica)', async () => {
  const addon = baseAddon();
  const store = createInMemoryAddonStore({ addons: [addon], purchases: [pendingPurchase()] });

  const first = await handleAddonWebhookEvent(checkoutSessionCompletedEvent('evt_dup', 1), { store, now: () => fixedNow });
  assert.equal((first as any).outcome, 'activated');

  const second = await handleAddonWebhookEvent(checkoutSessionCompletedEvent('evt_dup', 1), { store, now: () => new Date('2099-01-01') });
  assert.equal((second as any).outcome, 'duplicate-event');
  // Must not have been re-activated with the second call's `now`.
  assert.equal(store.purchases.get(1)!.purchasedAt!.toISOString(), fixedNow.toISOString());
});

// -----------------------------------------------------------------------
// checkout.session.expired -> pending -> failed, never touches active
// -----------------------------------------------------------------------

test('checkout.session.expired marca failed una compra pending y nunca otorga cupo', async () => {
  const addon = baseAddon();
  const store = createInMemoryAddonStore({ addons: [addon], purchases: [pendingPurchase()] });

  const result = await handleAddonWebhookEvent(checkoutSessionExpiredEvent('evt_2', 1), { store, now: () => fixedNow });

  assert.equal((result as any).outcome, 'failed');
  assert.equal(store.purchases.get(1)!.status, 'failed');
});

test('checkout.session.expired nunca toca una fila que ya está active (entrega fuera de orden)', async () => {
  const addon = baseAddon();
  const store = createInMemoryAddonStore({ addons: [addon], purchases: [activePurchase()] });

  const result = await handleAddonWebhookEvent(checkoutSessionExpiredEvent('evt_3', 1), { store, now: () => fixedNow });

  assert.equal((result as any).outcome, 'not-pending');
  assert.equal(store.purchases.get(1)!.status, 'active');
});

test('checkout.session.expired: mismo event.id repetido es no-op estricto', async () => {
  const addon = baseAddon();
  const store = createInMemoryAddonStore({ addons: [addon], purchases: [pendingPurchase()] });

  await handleAddonWebhookEvent(checkoutSessionExpiredEvent('evt_dup_2', 1), { store, now: () => fixedNow });
  const second = await handleAddonWebhookEvent(checkoutSessionExpiredEvent('evt_dup_2', 1), { store, now: () => fixedNow });

  assert.equal((second as any).outcome, 'duplicate-event');
  assert.equal(store.purchases.get(1)!.status, 'failed');
});

// -----------------------------------------------------------------------
// payment_intent.payment_failed -> pending -> failed (via metadata or PI lookup)
// -----------------------------------------------------------------------

test('payment_intent.payment_failed marca failed la compra vinculada por metadata', async () => {
  const addon = baseAddon();
  const store = createInMemoryAddonStore({ addons: [addon], purchases: [pendingPurchase()] });

  const result = await handleAddonWebhookEvent(paymentIntentFailedEvent('evt_4', { purchaseId: 1, paymentIntentId: 'pi_x' }), {
    store,
    now: () => fixedNow,
  });

  assert.equal((result as any).outcome, 'failed');
  assert.equal(store.purchases.get(1)!.status, 'failed');
});

test('payment_intent.payment_failed encuentra la compra por stripePaymentIntentId cuando no hay metadata', async () => {
  const addon = baseAddon();
  const store = createInMemoryAddonStore({
    addons: [addon],
    purchases: [pendingPurchase({ stripePaymentIntentId: 'pi_linked' })],
  });

  const result = await handleAddonWebhookEvent(paymentIntentFailedEvent('evt_5', { paymentIntentId: 'pi_linked' }), {
    store,
    now: () => fixedNow,
  });

  assert.equal((result as any).outcome, 'failed');
  assert.equal(store.purchases.get(1)!.status, 'failed');
});

test('payment_intent.payment_failed sin metadata ni PI vinculado no es tratado como evento de add-ons', async () => {
  const addon = baseAddon();
  const store = createInMemoryAddonStore({ addons: [addon], purchases: [pendingPurchase()] });

  const result = await handleAddonWebhookEvent(paymentIntentFailedEvent('evt_6', { paymentIntentId: 'pi_unrelated' }), {
    store,
    now: () => fixedNow,
  });

  assert.equal(result.handled, false);
  assert.equal(store.purchases.get(1)!.status, 'pending');
});

test('payment_intent.payment_failed: mismo event.id repetido es no-op estricto', async () => {
  const addon = baseAddon();
  const store = createInMemoryAddonStore({ addons: [addon], purchases: [pendingPurchase()] });

  await handleAddonWebhookEvent(paymentIntentFailedEvent('evt_dup_3', { purchaseId: 1, paymentIntentId: 'pi_x' }), { store, now: () => fixedNow });
  const second = await handleAddonWebhookEvent(paymentIntentFailedEvent('evt_dup_3', { purchaseId: 1, paymentIntentId: 'pi_x' }), {
    store,
    now: () => fixedNow,
  });

  assert.equal((second as any).outcome, 'duplicate-event');
});

// -----------------------------------------------------------------------
// charge.refunded -> active -> revoked('refunded'), excluded from quota immediately
// -----------------------------------------------------------------------

test('charge.refunded revoca de inmediato una compra active y dispara la exclusión inmediata del cupo', async () => {
  const addon = baseAddon();
  const store = createInMemoryAddonStore({ addons: [addon], purchases: [activePurchase({ stripePaymentIntentId: 'pi_refund' })] });

  const result = await handleAddonWebhookEvent(chargeRefundedEvent('evt_7', 'pi_refund'), { store, now: () => fixedNow });

  assert.equal((result as any).outcome, 'revoked');
  const row = store.purchases.get(1)!;
  assert.equal(row.status, 'revoked');
  assert.equal(row.revokedReason, 'refunded');
  assert.ok(row.revokedAt);
  assert.equal(row.stripeChargeId, 'ch_1');

  const activeQuantity = await store.sumActiveQuantity(row.companyId, row.addonId, fixedNow);
  assert.equal(activeQuantity, 0, 'una fila revoked no debe contar nunca en el cupo vigente');
});

test('charge.refunded sobre una compra que no está active no hace nada (not-active)', async () => {
  const addon = baseAddon();
  const store = createInMemoryAddonStore({ addons: [addon], purchases: [pendingPurchase({ stripePaymentIntentId: 'pi_refund_2' })] });

  const result = await handleAddonWebhookEvent(chargeRefundedEvent('evt_8', 'pi_refund_2'), { store, now: () => fixedNow });

  assert.equal((result as any).outcome, 'not-active');
  assert.equal(store.purchases.get(1)!.status, 'pending');
});

test('charge.refunded sin coincidencia de payment_intent no se trata como evento de add-ons', async () => {
  const addon = baseAddon();
  const store = createInMemoryAddonStore({ addons: [addon], purchases: [activePurchase({ stripePaymentIntentId: 'pi_other' })] });

  const result = await handleAddonWebhookEvent(chargeRefundedEvent('evt_9', 'pi_unmatched'), { store, now: () => fixedNow });

  assert.equal(result.handled, false);
  assert.equal(store.purchases.get(1)!.status, 'active');
});

test('charge.refunded: mismo event.id repetido es no-op estricto (no revoca dos veces)', async () => {
  const addon = baseAddon();
  const store = createInMemoryAddonStore({ addons: [addon], purchases: [activePurchase({ stripePaymentIntentId: 'pi_refund_3' })] });

  const first = await handleAddonWebhookEvent(chargeRefundedEvent('evt_dup_4', 'pi_refund_3'), { store, now: () => fixedNow });
  assert.equal((first as any).outcome, 'revoked');
  const revokedAtFirst = store.purchases.get(1)!.revokedAt;

  const second = await handleAddonWebhookEvent(chargeRefundedEvent('evt_dup_4', 'pi_refund_3'), { store, now: () => new Date('2099-01-01') });
  assert.equal((second as any).outcome, 'duplicate-event');
  assert.equal(store.purchases.get(1)!.revokedAt!.getTime(), revokedAtFirst!.getTime(), 'revokedAt no debe cambiar en el replay');
});

// -----------------------------------------------------------------------
// charge.dispute.created -> active -> revoked('disputed'), immediate (no esperar resolución)
// -----------------------------------------------------------------------

test('charge.dispute.created revoca de inmediato una compra active sin esperar el resultado de la disputa', async () => {
  const addon = baseAddon();
  const store = createInMemoryAddonStore({ addons: [addon], purchases: [activePurchase({ stripePaymentIntentId: 'pi_dispute' })] });

  const result = await handleAddonWebhookEvent(chargeDisputeCreatedEvent('evt_10', 'pi_dispute', 'ch_dispute'), {
    store,
    now: () => fixedNow,
  });

  assert.equal((result as any).outcome, 'revoked');
  const row = store.purchases.get(1)!;
  assert.equal(row.status, 'revoked');
  assert.equal(row.revokedReason, 'disputed');
  assert.equal(row.stripeChargeId, 'ch_dispute');
});

test('charge.dispute.created: mismo event.id repetido es no-op estricto (no revoca dos veces)', async () => {
  const addon = baseAddon();
  const store = createInMemoryAddonStore({ addons: [addon], purchases: [activePurchase({ stripePaymentIntentId: 'pi_dispute_2' })] });

  await handleAddonWebhookEvent(chargeDisputeCreatedEvent('evt_dup_5', 'pi_dispute_2'), { store, now: () => fixedNow });
  const second = await handleAddonWebhookEvent(chargeDisputeCreatedEvent('evt_dup_5', 'pi_dispute_2'), { store, now: () => fixedNow });

  assert.equal((second as any).outcome, 'duplicate-event');
});

test('charge.dispute.created sobre una compra ya revoked no hace nada (not-active)', async () => {
  const addon = baseAddon();
  const store = createInMemoryAddonStore({
    addons: [addon],
    purchases: [activePurchase({ stripePaymentIntentId: 'pi_dispute_3', status: 'revoked', revokedReason: 'refunded', revokedAt: new Date('2026-06-10') })],
  });

  const result = await handleAddonWebhookEvent(chargeDisputeCreatedEvent('evt_11', 'pi_dispute_3'), { store, now: () => fixedNow });

  assert.equal((result as any).outcome, 'not-active');
  assert.equal(store.purchases.get(1)!.revokedReason, 'refunded', 'no debe sobrescribir el motivo de revocación original');
});
