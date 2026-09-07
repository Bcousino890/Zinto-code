import assert from 'node:assert/strict';
import test from 'node:test';

import { planWebhookDelivery } from '../../server/services/integration-webhook-worker';

test('marks a 2xx webhook response as delivered', () => {
  assert.deepEqual(planWebhookDelivery({
    attemptCount: 0,
    responseStatus: 204,
    now: new Date('2026-09-07T00:00:00Z'),
  }), {
    status: 'delivered',
    nextAttemptAt: null,
  });
});

test('schedules a retry for a rate-limited webhook response', () => {
  assert.deepEqual(planWebhookDelivery({
    attemptCount: 1,
    responseStatus: 429,
    retryAfterSeconds: 300,
    now: new Date('2026-09-07T00:00:00Z'),
  }), {
    status: 'pending',
    nextAttemptAt: new Date('2026-09-07T00:05:00Z'),
  });
});

test('moves an exhausted server-error delivery to dead letter', () => {
  assert.deepEqual(planWebhookDelivery({
    attemptCount: 8,
    responseStatus: 503,
    now: new Date('2026-09-07T00:00:00Z'),
  }), {
    status: 'dead_letter',
    nextAttemptAt: null,
  });
});

test('schedules a retry when the webhook request has a network error', () => {
  assert.deepEqual(planWebhookDelivery({
    attemptCount: 0,
    networkError: true,
    now: new Date('2026-09-07T00:00:00Z'),
  }), {
    status: 'pending',
    nextAttemptAt: new Date('2026-09-07T00:00:15Z'),
  });
});

test('marks other client errors as permanently failed', () => {
  assert.deepEqual(planWebhookDelivery({
    attemptCount: 0,
    responseStatus: 422,
    now: new Date('2026-09-07T00:00:00Z'),
  }), {
    status: 'failed',
    nextAttemptAt: null,
  });
});
