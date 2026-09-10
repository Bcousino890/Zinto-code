import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DurableWebhookWorkerScheduler,
  resolveDurableWebhookWorkerIntervalMs,
} from '../../server/services/durable-webhook-worker-scheduler';

type ScheduledCallback = () => void;

function createClock() {
  const callbacks: ScheduledCallback[] = [];
  return {
    callbacks,
    schedule(callback: ScheduledCallback, _intervalMs: number) {
      callbacks.push(callback);
      return callbacks.length - 1;
    },
    cancel(_handle: number) {},
  };
}

test('starts one periodic worker loop when start is called more than once', async () => {
  const clock = createClock();
  let deliveries = 0;
  const scheduler = new DurableWebhookWorkerScheduler(
    { processNext: async () => { deliveries += 1; return false; } },
    { intervalMs: 2_000, schedule: clock.schedule, cancel: clock.cancel },
  );

  assert.equal(scheduler.start(), true);
  assert.equal(scheduler.start(), false);
  assert.equal(clock.callbacks.length, 1);

  clock.callbacks[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(deliveries, 1);
});

test('does not overlap webhook deliveries when an interval fires during an active delivery', async () => {
  const clock = createClock();
  let releaseDelivery: (() => void) | undefined;
  let deliveries = 0;
  const scheduler = new DurableWebhookWorkerScheduler(
    {
      processNext: async () => {
        deliveries += 1;
        await new Promise<void>(resolve => { releaseDelivery = resolve; });
        return true;
      },
    },
    { intervalMs: 2_000, schedule: clock.schedule, cancel: clock.cancel },
  );

  scheduler.start();
  clock.callbacks[0]();
  clock.callbacks[0]();
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(deliveries, 1);
  releaseDelivery?.();
});

test('does not start a queued interval callback after the scheduler is stopped', async () => {
  const clock = createClock();
  let deliveries = 0;
  const scheduler = new DurableWebhookWorkerScheduler(
    { processNext: async () => { deliveries += 1; return false; } },
    { intervalMs: 2_000, schedule: clock.schedule, cancel: clock.cancel },
  );

  scheduler.start();
  scheduler.stop();

  // A callback may already be queued when clearInterval runs during shutdown.
  clock.callbacks[0]();
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(deliveries, 0);
});

test('uses the configured durable webhook worker interval and falls back safely for invalid values', () => {
  assert.equal(resolveDurableWebhookWorkerIntervalMs('15000'), 15_000);
  assert.equal(resolveDurableWebhookWorkerIntervalMs('invalid'), 5_000);
  assert.equal(resolveDurableWebhookWorkerIntervalMs('0'), 5_000);
});
