import assert from 'node:assert/strict';
import test from 'node:test';

import { nextWebhookRetry } from '../../server/services/integration-webhook-retry';

test('retries a transient webhook failure with bounded exponential backoff', () => {
  assert.deepEqual(nextWebhookRetry({ attemptCount: 2, now: new Date('2026-09-07T00:00:00Z') }), {
    status: 'pending',
    nextAttemptAt: new Date('2026-09-07T00:01:00Z'),
  });
});

test('moves an exhausted webhook to dead letter instead of retrying forever', () => {
  assert.deepEqual(nextWebhookRetry({ attemptCount: 8, now: new Date('2026-09-07T00:00:00Z') }), {
    status: 'dead_letter',
    nextAttemptAt: null,
  });
});

test('uses the CRM Retry-After value when it is longer than exponential backoff', () => {
  assert.deepEqual(nextWebhookRetry({ attemptCount: 1, retryAfterSeconds: 300, now: new Date('2026-09-07T00:00:00Z') }), {
    status: 'pending',
    nextAttemptAt: new Date('2026-09-07T00:05:00Z'),
  });
});
