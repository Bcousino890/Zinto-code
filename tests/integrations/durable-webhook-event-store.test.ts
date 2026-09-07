import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertDurableWebhookEvent,
  type DurableWebhookEventStore,
  type DurableWebhookDeliveryUpdate,
} from '../../server/services/durable-webhook-event-store';

const validEvent = {
  companyId: 41,
  integrationId: 9,
  eventId: 'evt_9c66',
  eventType: 'contact.updated',
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
    status: 'delivered',
    deliveredAt: new Date('2026-09-08T09:00:00.000Z'),
  };

  await store.claimPending({ ...scope, claimedBy: 'worker_1', limit: 10 });
  await store.updateDelivery(update);

  assert.deepEqual(calls, [
    { operation: 'claimPending', input: { ...scope, claimedBy: 'worker_1', limit: 10 } },
    { operation: 'updateDelivery', input: update },
  ]);
});
