import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DurableWebhookWorkerLifecycle,
  shouldStartDurableWebhookWorker,
} from '../../server/services/durable-webhook-worker-lifecycle';

test('starts one durable webhook scheduler for repeated process startup attempts', () => {
  let starts = 0;
  let stops = 0;
  const lifecycle = new DurableWebhookWorkerLifecycle(() => ({
    start: () => { starts += 1; return true; },
    stop: () => { stops += 1; },
  }));

  assert.equal(lifecycle.start(), true);
  assert.equal(lifecycle.start(), false);
  assert.equal(starts, 1);

  lifecycle.stop();
  lifecycle.stop();
  assert.equal(stops, 1);
});

test('does not create the scheduler when the durable worker is disabled', () => {
  let created = 0;
  const lifecycle = new DurableWebhookWorkerLifecycle(() => {
    created += 1;
    return { start: () => true, stop: () => {} };
  }, { enabled: false });

  assert.equal(lifecycle.start(), false);
  assert.equal(created, 0);
});

test('does not allow the webhook worker to start before migrations succeed', () => {
  assert.equal(shouldStartDurableWebhookWorker({ migrationsReady: false }), false);
  assert.equal(shouldStartDurableWebhookWorker({ migrationsReady: true }), true);
});
