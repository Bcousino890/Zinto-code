import assert from 'node:assert/strict';
import test from 'node:test';

import { crmWebhookEvents } from '../../shared/schema';
import {
  assertDurableWebhookEvent,
  type DurableWebhookEventStore,
  type DurableWebhookDeliveryUpdate,
} from '../../server/services/durable-webhook-event-store';

test('webhook events persist the claim lease and delivery outcome fields', () => {
  assert.equal(crmWebhookEvents.claimedBy.name, 'claimed_by');
  assert.equal(crmWebhookEvents.claimExpiresAt.name, 'claim_expires_at');
  assert.equal(crmWebhookEvents.deliveredAt.name, 'delivered_at');
  assert.equal(crmWebhookEvents.lastError.name, 'last_error');
  assert.equal(crmWebhookEvents.nextAttemptAt.notNull, false);
});

test('does not allow processing as a delivery outcome', async () => {
  process.env.NODE_ENV = 'development';
  process.env.DATABASE_URL = 'postgresql://localhost:5432/webhook_storage_test';
  const { DatabaseStorage } = await import('../../server/storage');
  const storage = Object.create(DatabaseStorage.prototype) as Pick<DatabaseStorage, 'updateDelivery'>;

  await assert.rejects(
    storage.updateDelivery({
      companyId: 41,
      integrationId: 9,
      eventId: '82789ebb-9317-454c-9002-7f8acdc70d1a',
      claimToken: 'lease_1',
      status: 'processing',
    }),
    /processing is not a delivery outcome/,
  );
});

test('does not allow an outcome without the opaque claim token', async () => {
  process.env.NODE_ENV = 'development';
  process.env.DATABASE_URL = 'postgresql://localhost:5432/webhook_storage_test';
  const { DatabaseStorage } = await import('../../server/storage');
  const storage = Object.create(DatabaseStorage.prototype) as Pick<DatabaseStorage, 'updateDelivery'>;

  await assert.rejects(
    storage.updateDelivery({
      companyId: 41,
      integrationId: 9,
      eventId: '82789ebb-9317-454c-9002-7f8acdc70d1a',
      status: 'delivered',
    } as DurableWebhookDeliveryUpdate),
    /claimToken is required/,
  );
});

const validEvent = {
  companyId: 41,
  integrationId: 9,
  eventId: 'evt_9c66',
  eventType: 'contact.updated',
  origin: 'zinto' as const,
  payload: { contactId: 'crm_contact_1' },
};

test('accepts a complete tenant-scoped durable webhook event', () => {
  assert.doesNotThrow(() => assertDurableWebhookEvent(validEvent));
});

test('rejects durable webhook events with missing or invalid required fields', () => {
  for (const event of [
    { ...validEvent, companyId: undefined },
    { ...validEvent, companyId: 0 },
    { ...validEvent, integrationId: undefined },
    { ...validEvent, integrationId: -1 },
    { ...validEvent, eventId: '  ' },
    { ...validEvent, eventType: '' },
    { ...validEvent, payload: undefined },
    { ...validEvent, payload: null },
    { ...validEvent, payload: [] },
  ]) {
    assert.throws(() => assertDurableWebhookEvent(event), /companyId|integrationId|eventId|eventType|payload/);
  }
});

test('storage callers use tenant-scoped claimPending and updateDelivery operations', async () => {
  const calls: Array<{ operation: string; input: unknown }> = [];
  const store: DurableWebhookEventStore = {
    async claimPending(input) {
      calls.push({ operation: 'claimPending', input });
      return undefined;
    },
    async updateDelivery(input) {
      calls.push({ operation: 'updateDelivery', input });
      return false;
    },
  };
  const scope = {
    companyId: validEvent.companyId,
    integrationId: validEvent.integrationId,
  };
  const update: DurableWebhookDeliveryUpdate = {
    ...scope,
    eventId: validEvent.eventId,
    claimToken: 'lease_1',
    status: 'delivered',
    deliveredAt: new Date('2026-09-08T09:00:00.000Z'),
  };

  await store.claimPending({ ...scope, claimToken: 'lease_1', limit: 10 });
  await store.updateDelivery(update);

  assert.deepEqual(calls, [
    { operation: 'claimPending', input: { ...scope, claimToken: 'lease_1', limit: 10 } },
    { operation: 'updateDelivery', input: update },
  ]);
});
