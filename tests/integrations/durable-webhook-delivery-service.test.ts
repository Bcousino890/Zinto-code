import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDurableWebhookWorkerScheduler,
  DurableWebhookDeliveryWorker,
  StaleDurableWebhookLeaseError,
  type DurableWebhookDeliveryPersistence,
} from '../../server/services/durable-webhook-delivery-service';

const scope = { companyId: 41, integrationId: 9 };
const claimedEvent = {
  ...scope,
  eventId: '82789ebb-9317-454c-9002-7f8acdc70d1a',
  eventType: 'contact.updated',
  origin: 'zinto' as const,
  payload: { contactId: 'crm_contact_1' },
  occurredAt: new Date('2026-09-10T08:00:00.000Z'),
  attemptCount: 0,
  claimToken: '',
  claimExpiresAt: new Date('2026-09-10T08:05:00.000Z'),
};

test('claims and records a delivery with the same opaque token and tenant scope', async () => {
  const updates: unknown[] = [];
  const persistence: DurableWebhookDeliveryPersistence = {
    listCandidateScopes: async () => [scope],
    claimPending: async (input) => {
      assert.deepEqual({ ...input, claimToken: undefined }, {
        ...scope,
        claimToken: undefined,
        limit: 1,
      });
      assert.match(input.claimToken, /^[0-9a-f-]{36}$/);
      return { ...claimedEvent, claimToken: input.claimToken };
    },
    getDeliveryTarget: async (input) => {
      assert.deepEqual(input, scope);
      return { url: 'https://crm.example.test/hooks/zinto', secretEncrypted: 'stored-secret' };
    },
    updateDelivery: async (input) => {
      updates.push(input);
      return true;
    },
  };
  const deliveries: unknown[] = [];
  const worker = new DurableWebhookDeliveryWorker(persistence, {
    decryptSecret: (value) => {
      assert.equal(value, 'stored-secret');
      return 'webhook-secret';
    },
    deliver: async (delivery) => {
      deliveries.push(delivery);
      return { statusCode: 204 };
    },
  });

  assert.equal(await worker.processNext(new Date('2026-09-10T08:01:00.000Z')), true);
  assert.equal(deliveries.length, 1);
  assert.deepEqual(updates, [{
    ...scope,
    eventId: claimedEvent.eventId,
    claimToken: (updates[0] as { claimToken: string }).claimToken,
    status: 'delivered',
    nextAttemptAt: null,
    lastError: undefined,
  }]);
  assert.match((updates[0] as { claimToken: string }).claimToken, /^[0-9a-f-]{36}$/);
});

test('does not permit a stale lease to record an outcome', async () => {
  const persistence: DurableWebhookDeliveryPersistence = {
    listCandidateScopes: async () => [scope],
    claimPending: async (input) => ({ ...claimedEvent, claimToken: input.claimToken }),
    getDeliveryTarget: async () => ({ url: 'https://crm.example.test/hooks/zinto', secretEncrypted: 'stored-secret' }),
    updateDelivery: async () => false,
  };
  const worker = new DurableWebhookDeliveryWorker(persistence, {
    decryptSecret: () => 'webhook-secret',
    deliver: async () => ({ statusCode: 503 }),
  });

  await assert.rejects(
    worker.processNext(new Date('2026-09-10T08:01:00.000Z')),
    StaleDurableWebhookLeaseError,
  );
});

test('records a retry when the transport reports a network failure', async () => {
  const updates: unknown[] = [];
  const persistence: DurableWebhookDeliveryPersistence = {
    listCandidateScopes: async () => [scope],
    claimPending: async (input) => ({ ...claimedEvent, claimToken: input.claimToken }),
    getDeliveryTarget: async () => ({ url: 'https://crm.example.test/hooks/zinto', secretEncrypted: 'stored-secret' }),
    updateDelivery: async (input) => { updates.push(input); return true; },
  };
  const worker = new DurableWebhookDeliveryWorker(persistence, {
    decryptSecret: () => 'webhook-secret',
    deliver: async () => ({ networkError: true }),
  });

  assert.equal(await worker.processNext(new Date('2026-09-10T08:01:00.000Z')), true);
  assert.deepEqual(updates.map((update) => ({
    status: (update as { status: string }).status,
    nextAttemptAt: (update as { nextAttemptAt: Date | null }).nextAttemptAt,
  })), [{
    status: 'pending',
    nextAttemptAt: new Date('2026-09-10T08:01:15.000Z'),
  }]);
});

test('composes the lease-safe worker into a non-overlapping scheduler', async () => {
  const callbacks: Array<() => void> = [];
  let claims = 0;
  const persistence: DurableWebhookDeliveryPersistence = {
    listCandidateScopes: async () => [scope],
    claimPending: async (input) => {
      claims += 1;
      return claims === 1 ? { ...claimedEvent, claimToken: input.claimToken } : undefined;
    },
    getDeliveryTarget: async () => ({ url: 'https://crm.example.test/hooks/zinto', secretEncrypted: 'stored-secret' }),
    updateDelivery: async () => true,
  };
  const scheduler = createDurableWebhookWorkerScheduler(persistence, {
    decryptSecret: () => 'webhook-secret',
    deliver: async () => ({ statusCode: 204 }),
  }, {
    intervalMs: 1_000,
    schedule: (callback) => { callbacks.push(callback); return callbacks.length; },
    cancel: () => {},
  });

  assert.equal(scheduler.start(), true);
  callbacks[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(claims, 1);
});
