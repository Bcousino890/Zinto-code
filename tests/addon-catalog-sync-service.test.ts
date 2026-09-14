import assert from 'node:assert/strict';
import test from 'node:test';

import { AddonCatalogSyncService } from '../server/services/addon-catalog-sync-service';

function createFakeStripe() {
  let sequence = 0;
  const next = (prefix: string) => `${prefix}_${++sequence}`;
  const priceById = new Map<string, any>();
  const productById = new Map<string, any>();
  const calls = { retrieve: 0, list: 0 };
  const products = { created: [] as any[], updated: [] as any[] };
  const prices = { created: [] as any[], updated: [] as any[] };
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
      retrieve: async (id: string) => {
        calls.retrieve += 1;
        return priceById.get(id);
      },
      list: async (input: any) => paged([...priceById.values()], input, calls),
    },
    calls,
    seed: {
      product: (value: any) => productById.set(value.id, value),
      price: (value: any) => priceById.set(value.id, value),
    },
  };
}

function paged(values: any[], input: { starting_after?: string; limit?: number }, calls: { list: number }) {
  calls.list += 1;
  const start = input.starting_after ? values.findIndex((value) => value.id === input.starting_after) + 1 : 0;
  const data = values.slice(start, start + (input.limit ?? 100));
  return Promise.resolve({ data, has_more: start + data.length < values.length });
}

function createStorage(addon: Record<string, any>) {
  const addons = new Map([[addon.id, addon]]);
  return {
    getAddonById: async (id: number) => addons.get(id),
    updateAddon: async (id: number, update: Record<string, any>) => {
      const current = addons.get(id);
      if (!current) throw new Error(`Addon ${id} was not found`);
      return Object.assign(current, update);
    },
  };
}

// Mirrors the real seeded rows from migrations/2026-09-14-1789349526641-addon-billing.sql: a fixed
// addon that already carries a real, pre-existing Stripe product id and no prices synced yet.
function fixture() {
  return {
    id: 1,
    key: 'extra_user',
    name: 'Usuario adicional',
    description: 'Usuario adicional para cualquier plan.',
    unitPriceEur: '12.00',
    unitPriceUsd: '12.00',
    validityDays: 30,
    isActive: true,
    stripeProductId: 'prod_TUXz9uFD0h9eQT',
    stripePriceIdEur: null,
    stripePriceIdUsd: null,
    stripeSyncStatus: 'pending',
    stripeSyncError: null,
    stripeSyncedAt: null,
    stripeSyncFingerprint: null,
  };
}

test('crea los dos precios one-time (EUR y USD) cuando el addon no tiene ninguno', async () => {
  const addon = fixture();
  const fakeStripe = createFakeStripe();
  const service = new AddonCatalogSyncService({ storage: createStorage(addon), stripe: fakeStripe });

  const result = await service.syncAddon(addon.id);

  assert.equal(fakeStripe.prices.created.length, 2);
  assert.equal(fakeStripe.prices.created[0].input.currency, 'eur');
  assert.equal(fakeStripe.prices.created[0].input.unit_amount, 1200);
  assert.ok(!('recurring' in fakeStripe.prices.created[0].input), 'the price must be one-time, not recurring');
  assert.equal(fakeStripe.prices.created[1].input.currency, 'usd');
  assert.equal(fakeStripe.prices.created[1].input.unit_amount, 1200);
  assert.ok(!('recurring' in fakeStripe.prices.created[1].input));
  assert.match(fakeStripe.prices.created[0].options.idempotencyKey, /^zinto-addon-catalog:1:create-price-eur:/);
  assert.equal(addon.stripePriceIdEur, 'price_1');
  assert.equal(addon.stripePriceIdUsd, 'price_2');
  assert.equal(addon.stripeSyncStatus, 'synced');
  assert.equal(addon.stripeSyncError, null);
  assert.equal(result.status, 'synced');
  assert.deepEqual([...result.actions].sort(), ['create_price_eur', 'create_price_usd']);
});

test('adopta el producto Stripe ya existente por id, sin crear uno duplicado', async () => {
  const addon = fixture();
  const fakeStripe = createFakeStripe();
  fakeStripe.seed.product({ id: 'prod_unrelated_decoy', metadata: {} });
  const service = new AddonCatalogSyncService({ storage: createStorage(addon), stripe: fakeStripe });

  await service.syncAddon(addon.id);

  assert.equal(fakeStripe.products.created.length, 0);
  assert.equal(fakeStripe.products.updated.length, 0);
  assert.equal(addon.stripeProductId, 'prod_TUXz9uFD0h9eQT');
});

test('crea un Product nuevo solo cuando el addon no tiene stripeProductId (caso defensivo)', async () => {
  const addon = { ...fixture(), stripeProductId: null };
  const fakeStripe = createFakeStripe();
  const service = new AddonCatalogSyncService({ storage: createStorage(addon), stripe: fakeStripe });

  const result = await service.syncAddon(addon.id);

  assert.equal(fakeStripe.products.created.length, 1);
  assert.equal(fakeStripe.products.created[0].input.metadata.zinto_addon_id, '1');
  assert.equal(addon.stripeProductId, 'prod_1');
  assert.ok(result.actions.includes('create_product'));
});

test('archiva un precio activo preexistente que no coincide (limpieza del metered antiguo compartido)', async () => {
  const addon = fixture();
  const fakeStripe = createFakeStripe();
  fakeStripe.seed.price({
    id: 'price_old_metered',
    product: addon.stripeProductId,
    active: true,
    recurring: { interval: 'month', meter: 'mtr_61TgwlacCesOzJ6R1416yRauBhYCtMyW' },
    metadata: {},
  });
  const service = new AddonCatalogSyncService({ storage: createStorage(addon), stripe: fakeStripe });

  await service.syncAddon(addon.id);

  const archived = fakeStripe.prices.updated.find((entry: any) => entry.id === 'price_old_metered');
  assert.ok(archived, 'the stale metered price should have been archived');
  assert.equal(archived.input.active, false);
  assert.notEqual(addon.stripePriceIdEur, 'price_old_metered');
  assert.notEqual(addon.stripePriceIdUsd, 'price_old_metered');
});

test('no hace nada (unchanged) en una segunda sincronización sin cambios', async () => {
  const addon = fixture();
  const fakeStripe = createFakeStripe();
  const service = new AddonCatalogSyncService({ storage: createStorage(addon), stripe: fakeStripe });
  await service.syncAddon(addon.id);
  const priceCreatesAfterFirstSync = fakeStripe.prices.created.length;
  const listCallsAfterFirstSync = fakeStripe.calls.list;

  const result = await service.syncAddon(addon.id);

  assert.deepEqual(result.actions, ['unchanged']);
  assert.equal(result.status, 'synced');
  assert.equal(fakeStripe.prices.created.length, priceCreatesAfterFirstSync);
  assert.equal(fakeStripe.calls.list, listCallsAfterFirstSync);
  assert.equal(fakeStripe.calls.retrieve, 0);
});

test('dryRun:true no realiza ninguna llamada al cliente Stripe simulado', async () => {
  const addon = fixture();
  const fakeStripe = createFakeStripe();
  const service = new AddonCatalogSyncService({ storage: createStorage(addon), stripe: fakeStripe });

  const result = await service.syncAddon(addon.id, { dryRun: true });

  assert.equal(result.dryRun, true);
  assert.deepEqual(result.actions, ['create_price_eur', 'create_price_usd', 'archive_price']);
  assert.equal(fakeStripe.products.created.length, 0);
  assert.equal(fakeStripe.products.updated.length, 0);
  assert.equal(fakeStripe.prices.created.length, 0);
  assert.equal(fakeStripe.prices.updated.length, 0);
  assert.equal(fakeStripe.calls.list, 0);
  assert.equal(fakeStripe.calls.retrieve, 0);
  assert.equal(addon.stripeSyncStatus, 'pending');
});

test('marca stripeSyncStatus failed con el mensaje saneado, sin lanzar la excepción, cuando Stripe falla', async () => {
  const addon = fixture();
  const fakeStripe = createFakeStripe();
  fakeStripe.prices.create = async () => {
    throw new Error('Stripe rejected sk_live_example_catalog_secret_key');
  };
  const service = new AddonCatalogSyncService({ storage: createStorage(addon), stripe: fakeStripe });

  const result = await service.syncAddon(addon.id);

  assert.equal(result.status, 'failed');
  assert.equal(addon.stripeSyncStatus, 'failed');
  assert.ok(addon.stripeSyncError);
  assert.ok(!String(addon.stripeSyncError).includes('sk_live_example_catalog_secret_key'), 'the secret key must be redacted');
  assert.equal(addon.stripeSyncFingerprint, null);
});

test('reconcileAvailability delega en syncAddon', async () => {
  const addon = fixture();
  const fakeStripe = createFakeStripe();
  const service = new AddonCatalogSyncService({ storage: createStorage(addon), stripe: fakeStripe });

  const result = await service.reconcileAvailability(addon.id);

  assert.equal(result.status, 'synced');
  assert.equal(fakeStripe.prices.created.length, 2);
});
