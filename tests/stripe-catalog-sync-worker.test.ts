import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decideStripeCatalogSyncJobRetry,
  runStripeCatalogSyncBatch,
  startStripeCatalogSyncWorker,
  type BatchResult,
} from '../server/services/stripe-catalog-sync-worker';

type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';
type EntityType = 'plan' | 'coupon';
type Operation = 'upsert' | 'archive';

type FakeJob = {
  id: number;
  entityType: EntityType;
  entityId: number;
  operation: Operation;
  fingerprint: string;
  revision: number;
  status: JobStatus;
  attempts: number;
  nextAttemptAt: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  claimToken: string | null;
  lastError: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function createClock(initial: Date) {
  let current = initial;
  return {
    now: () => current,
    advance(ms: number) { current = new Date(current.getTime() + ms); },
    set(date: Date) { current = date; },
  };
}

/**
 * Mirrors the real `claimStripeCatalogSyncJobs` semantics closely enough for
 * worker-level tests: due/pending or expired-processing rows are claimable,
 * only the earliest unresolved job per entity is eligible (same guard the
 * real SQL applies via its NOT EXISTS clause), and the claim mutation itself
 * runs synchronously (no internal await) so it stays atomic even when two
 * `runStripeCatalogSyncBatch` calls race against the same storage instance,
 * exactly like the real transaction's row locks would.
 */
class FakeStripeCatalogJobStorage {
  private nextId = 1;
  private tokenSeq = 1;
  readonly jobs: FakeJob[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  seed(input: { entityType: EntityType; entityId: number; operation: Operation; fingerprint: string } & Partial<FakeJob>): FakeJob {
    const now = this.now();
    const job: FakeJob = {
      id: this.nextId++,
      revision: 1,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: now,
      lockedAt: null,
      lockedBy: null,
      claimToken: null,
      lastError: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      ...input,
    };
    this.jobs.push(job);
    return job;
  }

  async claimStripeCatalogSyncJobs(limit = 10, workerId = 'test-worker', lockTimeoutMs = 5 * 60 * 1000): Promise<FakeJob[]> {
    const now = this.now();
    const claimable = this.jobs.filter((job) => {
      const due = job.nextAttemptAt.getTime() <= now.getTime();
      const isPending = job.status === 'pending';
      const isExpiredProcessing = job.status === 'processing'
        && job.lockedAt !== null
        && job.lockedAt.getTime() < now.getTime() - lockTimeoutMs;
      if (!due || !(isPending || isExpiredProcessing)) return false;

      const earlierUnresolved = this.jobs.some((other) => (
        other.entityType === job.entityType
        && other.entityId === job.entityId
        && other.id < job.id
        && (other.status === 'pending' || other.status === 'processing')
      ));
      return !earlierUnresolved;
    })
      .sort((a, b) => a.nextAttemptAt.getTime() - b.nextAttemptAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, limit);

    // No `await` above this line: the selection-then-mutation below runs as
    // one atomic synchronous step, exactly like the real UPDATE ... FROM
    // claimable transaction.
    return claimable.map((job) => {
      job.status = 'processing';
      job.attempts += 1;
      job.lockedAt = now;
      job.lockedBy = workerId;
      job.claimToken = `tok-${this.tokenSeq++}`;
      job.lastError = null;
      job.updatedAt = now;
      return { ...job };
    });
  }

  async completeStripeCatalogSyncJob(jobId: number, claimToken: string): Promise<FakeJob | undefined> {
    const job = this.jobs.find((candidate) => candidate.id === jobId);
    if (!job || job.status !== 'processing' || job.claimToken !== claimToken) return undefined;
    job.status = 'completed';
    job.completedAt = this.now();
    job.lockedAt = null;
    job.lockedBy = null;
    job.claimToken = null;
    job.lastError = null;
    job.updatedAt = this.now();
    return { ...job };
  }

  async failStripeCatalogSyncJob(jobId: number, claimToken: string, error: string, nextAttemptAt?: Date): Promise<FakeJob | undefined> {
    const job = this.jobs.find((candidate) => candidate.id === jobId);
    if (!job || job.status !== 'processing' || job.claimToken !== claimToken) return undefined;
    job.status = nextAttemptAt ? 'pending' : 'failed';
    job.nextAttemptAt = nextAttemptAt ?? this.now();
    job.lockedAt = null;
    job.lockedBy = null;
    job.claimToken = null;
    job.lastError = error;
    job.updatedAt = this.now();
    return { ...job };
  }
}

const NOOP_SERVICE = {
  syncPlan: async () => { throw new Error('syncPlan should not be called in this test'); },
  syncCoupon: async () => { throw new Error('syncCoupon should not be called in this test'); },
  archivePlan: async () => { throw new Error('archivePlan should not be called in this test'); },
  archiveCoupon: async () => { throw new Error('archiveCoupon should not be called in this test'); },
};

function emptyResult(): BatchResult {
  return { processed: 0, succeeded: 0, retried: 0, deadLettered: 0, staleLeases: 0, errors: [] };
}

test('dispatches each claimed job to the sync-service method matching its operation and entity type', async () => {
  const now = new Date('2026-09-14T00:00:00.000Z');
  const jobs: FakeJob[] = [
    { id: 1, entityType: 'plan', entityId: 10, operation: 'upsert', fingerprint: 'f1', revision: 1, status: 'processing', attempts: 1, nextAttemptAt: now, lockedAt: now, lockedBy: 'w', claimToken: 'tok-1', lastError: null, completedAt: null, createdAt: now, updatedAt: now },
    { id: 2, entityType: 'coupon', entityId: 20, operation: 'upsert', fingerprint: 'f2', revision: 1, status: 'processing', attempts: 1, nextAttemptAt: now, lockedAt: now, lockedBy: 'w', claimToken: 'tok-2', lastError: null, completedAt: null, createdAt: now, updatedAt: now },
    { id: 3, entityType: 'plan', entityId: 30, operation: 'archive', fingerprint: 'f3', revision: 1, status: 'processing', attempts: 1, nextAttemptAt: now, lockedAt: now, lockedBy: 'w', claimToken: 'tok-3', lastError: null, completedAt: null, createdAt: now, updatedAt: now },
    { id: 4, entityType: 'coupon', entityId: 40, operation: 'archive', fingerprint: 'f4', revision: 1, status: 'processing', attempts: 1, nextAttemptAt: now, lockedAt: now, lockedBy: 'w', claimToken: 'tok-4', lastError: null, completedAt: null, createdAt: now, updatedAt: now },
  ];
  const completed: Array<{ jobId: number; claimToken: string }> = [];
  const calls: Array<{ kind: string; id: number }> = [];
  const storage = {
    claimStripeCatalogSyncJobs: async () => jobs,
    completeStripeCatalogSyncJob: async (jobId: number, claimToken: string) => { completed.push({ jobId, claimToken }); return jobs.find((job) => job.id === jobId); },
    failStripeCatalogSyncJob: async () => undefined,
  };
  const service = {
    syncPlan: async (id: number) => { calls.push({ kind: 'syncPlan', id }); return {} as any; },
    syncCoupon: async (id: number) => { calls.push({ kind: 'syncCoupon', id }); return {} as any; },
    archivePlan: async (id: number) => { calls.push({ kind: 'archivePlan', id }); return {} as any; },
    archiveCoupon: async (id: number) => { calls.push({ kind: 'archiveCoupon', id }); return {} as any; },
  };

  const result = await runStripeCatalogSyncBatch(10, { storage, createSyncService: () => service });

  assert.deepEqual(calls, [
    { kind: 'syncPlan', id: 10 },
    { kind: 'syncCoupon', id: 20 },
    { kind: 'archivePlan', id: 30 },
    { kind: 'archiveCoupon', id: 40 },
  ]);
  assert.equal(result.processed, 4);
  assert.equal(result.succeeded, 4);
  assert.equal(completed.length, 4);
});

test('never processes two jobs for the same entity concurrently within one batch', async () => {
  const now = new Date('2026-09-14T00:00:00.000Z');
  const baseJob = { entityType: 'plan' as const, entityId: 100, operation: 'upsert' as const, revision: 1, status: 'processing' as const, attempts: 1, nextAttemptAt: now, lockedAt: now, lockedBy: 'w', lastError: null, completedAt: null, createdAt: now, updatedAt: now };
  const jobA: FakeJob = { ...baseJob, id: 1, fingerprint: 'stale', claimToken: 'tok-a' };
  const jobB: FakeJob = { ...baseJob, id: 2, fingerprint: 'fresh', claimToken: 'tok-b' };

  const order: string[] = [];
  const violations: string[] = [];
  const active = new Set<string>();
  const releases: Array<() => void> = [];
  const gatedSyncPlan = async (planId: number) => {
    const key = `plan:${planId}`;
    if (active.has(key)) violations.push(key);
    active.add(key);
    order.push(`start:${key}`);
    await new Promise<void>((resolve) => releases.push(resolve));
    active.delete(key);
    order.push(`end:${key}`);
    return {} as any;
  };

  const completed: number[] = [];
  const storage = {
    claimStripeCatalogSyncJobs: async () => [jobA, jobB],
    completeStripeCatalogSyncJob: async (jobId: number) => { completed.push(jobId); return jobA; },
    failStripeCatalogSyncJob: async () => undefined,
  };

  const batchPromise = runStripeCatalogSyncBatch(10, {
    storage,
    createSyncService: () => ({ ...NOOP_SERVICE, syncPlan: gatedSyncPlan }),
  });

  await flush();
  assert.deepEqual(order, ['start:plan:100']);
  assert.equal(releases.length, 1);

  releases[0]();
  await flush();
  assert.deepEqual(order, ['start:plan:100', 'end:plan:100', 'start:plan:100']);
  assert.equal(releases.length, 2);

  releases[1]();
  const result = await batchPromise;

  assert.deepEqual(violations, []);
  assert.deepEqual(completed, [1, 2]);
  assert.equal(result.succeeded, 2);
});

test('concurrent batches never both claim and process the same job', async () => {
  const clock = createClock(new Date('2026-09-14T00:00:00.000Z'));
  const storage = new FakeStripeCatalogJobStorage(clock.now);
  storage.seed({ entityType: 'plan', entityId: 1, operation: 'upsert', fingerprint: 'fp-1' });
  storage.seed({ entityType: 'plan', entityId: 2, operation: 'upsert', fingerprint: 'fp-2' });

  const seen: number[] = [];
  const makeService = () => ({
    ...NOOP_SERVICE,
    syncPlan: async (id: number) => { seen.push(id); return {} as any; },
  });

  const [resultA, resultB] = await Promise.all([
    runStripeCatalogSyncBatch(1, { storage, now: clock.now, workerId: 'worker-a', createSyncService: makeService }),
    runStripeCatalogSyncBatch(1, { storage, now: clock.now, workerId: 'worker-b', createSyncService: makeService }),
  ]);

  assert.equal(resultA.processed + resultB.processed, 2);
  assert.deepEqual([...seen].sort((a, b) => a - b), [1, 2]);
  assert.equal(new Set(seen).size, 2);
  assert.equal(storage.jobs.filter((job) => job.status === 'completed').length, 2);
});

test('an expired lease becomes claimable by another worker; the original claimant late-completing with its stale token is a safe no-op', async () => {
  const clock = createClock(new Date('2026-09-14T00:00:00.000Z'));
  const storage = new FakeStripeCatalogJobStorage(clock.now);
  storage.seed({ entityType: 'plan', entityId: 42, operation: 'upsert', fingerprint: 'fp-42' });

  let releaseWorkerA: (() => void) | undefined;
  const workerAService = {
    ...NOOP_SERVICE,
    syncPlan: async () => { await new Promise<void>((resolve) => { releaseWorkerA = resolve; }); return {} as any; },
  };

  const batchAPromise = runStripeCatalogSyncBatch(1, {
    storage, now: clock.now, workerId: 'worker-a', lockTimeoutMs: 1_000,
    createSyncService: () => workerAService,
  });

  await flush();
  assert.equal(storage.jobs[0].status, 'processing');
  const claimTokenA = storage.jobs[0].claimToken;
  assert.ok(claimTokenA);

  clock.advance(5_000); // well past lockTimeoutMs

  const workerBService = { ...NOOP_SERVICE, syncPlan: async () => ({} as any) };
  const resultB = await runStripeCatalogSyncBatch(1, {
    storage, now: clock.now, workerId: 'worker-b', lockTimeoutMs: 1_000,
    createSyncService: () => workerBService,
  });

  assert.equal(resultB.succeeded, 1);
  assert.equal(storage.jobs[0].status, 'completed');
  assert.notEqual(storage.jobs[0].claimToken, claimTokenA);

  releaseWorkerA?.();
  const resultA = await batchAPromise;

  assert.equal(resultA.staleLeases, 1);
  assert.equal(resultA.succeeded, 0);
  assert.equal(storage.jobs[0].status, 'completed');
});

test('retries a failing job with capped backoff up to the attempt limit, then dead-letters it and stops retrying', async () => {
  const clock = createClock(new Date('2026-09-14T00:00:00.000Z'));
  const storage = new FakeStripeCatalogJobStorage(clock.now);
  storage.seed({ entityType: 'coupon', entityId: 7, operation: 'upsert', fingerprint: 'fp-7' });

  const secretSubstring = 'sk_live_abcdefghijklmnopqrstuvwx';
  const failingService = {
    ...NOOP_SERVICE,
    syncCoupon: async () => { throw new Error(`Stripe request failed: ${secretSubstring}`); },
  };

  const expectedDelaySeconds = [30, 60, 120, 240];
  for (const delaySeconds of expectedDelaySeconds) {
    const before = clock.now();
    const result = await runStripeCatalogSyncBatch(1, { storage, now: clock.now, createSyncService: () => failingService });
    assert.equal(result.retried, 1);
    assert.equal(result.deadLettered, 0);
    const job = storage.jobs[0];
    assert.equal(job.status, 'pending');
    assert.equal(job.nextAttemptAt.getTime(), before.getTime() + delaySeconds * 1000);
    assert.ok(job.lastError && !job.lastError.includes(secretSubstring), 'persisted error must not contain the raw secret');
    clock.set(job.nextAttemptAt);
  }

  const finalResult = await runStripeCatalogSyncBatch(1, { storage, now: clock.now, createSyncService: () => failingService });
  assert.equal(finalResult.deadLettered, 1);
  assert.equal(finalResult.retried, 0);
  assert.equal(storage.jobs[0].status, 'failed');

  clock.advance(10 * 60 * 60 * 1000);
  const noMore = await runStripeCatalogSyncBatch(10, { storage, now: clock.now, createSyncService: () => failingService });
  assert.equal(noMore.processed, 0, 'a terminal failed job must never be reclaimed - it must not retry forever');
});

test('decideStripeCatalogSyncJobRetry backs off exponentially and terminates at the attempt limit', () => {
  const now = new Date('2026-09-14T00:00:00.000Z');
  assert.equal(decideStripeCatalogSyncJobRetry(1, now).nextAttemptAt?.getTime(), now.getTime() + 30_000);
  assert.equal(decideStripeCatalogSyncJobRetry(2, now).nextAttemptAt?.getTime(), now.getTime() + 60_000);
  assert.equal(decideStripeCatalogSyncJobRetry(3, now).nextAttemptAt?.getTime(), now.getTime() + 120_000);
  assert.equal(decideStripeCatalogSyncJobRetry(4, now).nextAttemptAt?.getTime(), now.getTime() + 240_000);
  assert.equal(decideStripeCatalogSyncJobRetry(5, now).nextAttemptAt, null);
  assert.equal(decideStripeCatalogSyncJobRetry(99, now).nextAttemptAt, null);
});

test('startStripeCatalogSyncWorker is disabled by default and never schedules a timer or runs a batch', () => {
  const originalFlag = process.env.STRIPE_CATALOG_AUTO_SYNC;
  delete process.env.STRIPE_CATALOG_AUTO_SYNC;
  try {
    let scheduled = 0;
    let batches = 0;
    const stop = startStripeCatalogSyncWorker({
      schedule: () => { scheduled += 1; return 0 as unknown as ReturnType<typeof setInterval>; },
      cancel: () => {},
      runBatch: async () => { batches += 1; return emptyResult(); },
    });
    assert.equal(scheduled, 0);
    assert.equal(batches, 0);
    assert.doesNotThrow(() => stop());

    process.env.STRIPE_CATALOG_AUTO_SYNC = 'false';
    const stop2 = startStripeCatalogSyncWorker({
      schedule: () => { scheduled += 1; return 0 as unknown as ReturnType<typeof setInterval>; },
      cancel: () => {},
      runBatch: async () => { batches += 1; return emptyResult(); },
    });
    assert.equal(scheduled, 0);
    stop2();
  } finally {
    if (originalFlag === undefined) delete process.env.STRIPE_CATALOG_AUTO_SYNC;
    else process.env.STRIPE_CATALOG_AUTO_SYNC = originalFlag;
  }
});

test('startStripeCatalogSyncWorker runs batches on its interval once enabled, never overlaps, and stops cleanly', async () => {
  const originalFlag = process.env.STRIPE_CATALOG_AUTO_SYNC;
  process.env.STRIPE_CATALOG_AUTO_SYNC = 'true';
  try {
    const callbacks: Array<() => void> = [];
    const cancelled: unknown[] = [];
    let batches = 0;
    let releaseBatch: (() => void) | undefined;
    const stop = startStripeCatalogSyncWorker({
      intervalMs: 2_000,
      schedule: (callback) => { callbacks.push(callback); return (callbacks.length - 1) as unknown as ReturnType<typeof setInterval>; },
      cancel: (handle) => { cancelled.push(handle); },
      runBatch: async () => {
        batches += 1;
        await new Promise<void>((resolve) => { releaseBatch = resolve; });
        return emptyResult();
      },
    });

    assert.equal(callbacks.length, 1);
    callbacks[0]();
    callbacks[0](); // fires again while the first run is still in flight
    await flush();
    assert.equal(batches, 1, 'an in-flight batch must not be started a second time');

    releaseBatch?.();
    await flush();

    stop();
    assert.deepEqual(cancelled, [0]);

    callbacks[0](); // a tick that fires after stop must do nothing
    await flush();
    assert.equal(batches, 1);
  } finally {
    if (originalFlag === undefined) delete process.env.STRIPE_CATALOG_AUTO_SYNC;
    else process.env.STRIPE_CATALOG_AUTO_SYNC = originalFlag;
  }
});
