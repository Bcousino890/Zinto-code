import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ScopedWebhookDeliveryWorker,
  ScopedWebhookWorkerAdapter,
  StaleWebhookLeaseError,
  type ScopedWebhookEventPersistencePort,
} from '../../server/services/scoped-webhook-delivery-worker';

const scope = { companyId: 41, integrationId: 9 };
const claimedEvent = {
  eventId: '82789ebb-9317-454c-9002-7f8acdc70d1a',
  eventType: 'contact.updated',
  payload: { contactId: 'crm_contact_1' },
  attemptCount: 2,
  claimToken: 'lease:opaque/token==',
};

test('propagates the exact opaque claim token from claim through the delivery outcome', async () => {
  const outcomes: unknown[] = [];
  const persistence: ScopedWebhookEventPersistencePort = {
    claimPending: async (input) => {
      assert.deepEqual(input, { ...scope, workerId: 'worker-a', limit: 1 });
      return claimedEvent;
    },
    updateDelivery: async (input) => {
      outcomes.push(input);
      return true;
    },
  };
  const worker = new ScopedWebhookDeliveryWorker(
    new ScopedWebhookWorkerAdapter(persistence, scope, 'worker-a'),
    { deliver: async () => ({ statusCode: 204 }) },
  );

  assert.equal(await worker.processNext(new Date('2026-09-10T08:00:00.000Z')), true);
  assert.deepEqual(outcomes, [{
    ...scope,
    eventId: claimedEvent.eventId,
    claimToken: 'lease:opaque/token==',
    status: 'delivered',
    nextAttemptAt: null,
  }]);
});

test('rejects an outcome when the persistence port reports a stale lease', async () => {
  const persistence: ScopedWebhookEventPersistencePort = {
    claimPending: async () => claimedEvent,
    updateDelivery: async () => false,
  };
  const worker = new ScopedWebhookDeliveryWorker(
    new ScopedWebhookWorkerAdapter(persistence, scope, 'worker-a'),
    { deliver: async () => ({ statusCode: 503 }) },
  );

  await assert.rejects(
    worker.processNext(new Date('2026-09-10T08:00:00.000Z')),
    StaleWebhookLeaseError,
  );
});
