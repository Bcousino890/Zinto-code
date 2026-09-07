import assert from 'node:assert/strict';
import test from 'node:test';
import { WebhookDeliveryWorker } from '../../server/services/webhook-delivery-worker';

test('records a delivered event after a successful webhook response', async () => {
  const updates: unknown[] = [];
  const worker = new WebhookDeliveryWorker({
    getNext: async () => ({ id: 'evt_1', attemptCount: 0 }),
    deliver: async () => ({ statusCode: 204 }),
    update: async (value) => { updates.push(value); },
  });
  await worker.processNext(new Date('2026-09-07T00:00:00Z'));
  assert.deepEqual(updates, [{ id: 'evt_1', status: 'delivered', nextAttemptAt: null }]);
});
