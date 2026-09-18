import { logger } from '../utils/logger';
import { sanitizeStripeCatalogError } from './stripe-client-provider';
import type { IStorage } from '../storage';
import type { StripeCatalogSyncJob } from '@shared/schema';
import type { StripeCatalogSyncService } from './stripe-catalog-sync-service';

type WorkerStorage = Pick<
  IStorage,
  | 'claimStripeCatalogSyncJobs'
  | 'completeStripeCatalogSyncJob'
  | 'failStripeCatalogSyncJob'
  | 'updatePlan'
  | 'updateCoupon'
>;
type SyncService = Pick<StripeCatalogSyncService, 'syncPlan' | 'syncCoupon' | 'archivePlan' | 'archiveCoupon'>;

export type StripeCatalogSyncJobOutcome = {
  jobId: number;
  entityType: StripeCatalogSyncJob['entityType'];
  entityId: number;
  message: string;
};

export type BatchResult = {
  /** Number of claimed jobs the batch attempted to process. */
  processed: number;
  /** Jobs whose Stripe sync call succeeded and were marked completed. */
  succeeded: number;
  /** Jobs that failed this attempt but were requeued with a backed-off `nextAttemptAt`. */
  retried: number;
  /** Jobs that exhausted their retry budget and were moved to the terminal `failed` state. */
  deadLettered: number;
  /**
   * complete/fail calls that lost the fencing check (the lease had already
   * expired or been reclaimed by another worker). Treated as a safe no-op:
   * never retried, never thrown, never double-applied.
   */
  staleLeases: number;
  errors: StripeCatalogSyncJobOutcome[];
};

export type StripeCatalogSyncBatchDependencies = {
  storage?: WorkerStorage;
  createSyncService?: () => Promise<SyncService> | SyncService;
  workerId?: string;
  lockTimeoutMs?: number;
  now?: () => Date;
};

const DEFAULT_BATCH_LIMIT = 10;

/**
 * Retry policy for catalog sync jobs: capped exponential backoff, terminal
 * (dead-letter) once the attempt budget is exhausted.
 *
 * `claimStripeCatalogSyncJobs` increments `attempts` as part of the claim
 * itself, so by the time a job reaches this function `attempts` already
 * counts the attempt that just failed (1 on the first failure). Storage's
 * `failStripeCatalogSyncJob` does not compute backoff itself - it simply
 * persists whatever `nextAttemptAt` it is given (or, when omitted, marks the
 * job `failed`) - so that decision is made here.
 */
const MAX_ATTEMPTS = 5;
const BASE_DELAY_SECONDS = 30;
const MAX_DELAY_SECONDS = 60 * 60;

export function decideStripeCatalogSyncJobRetry(attempts: number, now: Date): { nextAttemptAt: Date | null } {
  if (attempts >= MAX_ATTEMPTS) return { nextAttemptAt: null };
  const delaySeconds = Math.min(MAX_DELAY_SECONDS, BASE_DELAY_SECONDS * 2 ** (attempts - 1));
  return { nextAttemptAt: new Date(now.getTime() + delaySeconds * 1000) };
}

async function defaultStorage(): Promise<WorkerStorage> {
  const { storage } = await import('../storage');
  return storage;
}

/** Builds a real Stripe-backed sync service. Never used by tests - they always inject `createSyncService`. */
async function createDefaultSyncService(): Promise<SyncService> {
  const [{ storage }, { StripeCatalogSyncService }, { StripeClientProvider }] = await Promise.all([
    import('../storage'),
    import('./stripe-catalog-sync-service'),
    import('./stripe-client-provider'),
  ]);
  const stripe = await new StripeClientProvider(storage).getClient();
  return new StripeCatalogSyncService({ storage, stripe: stripe as any });
}

async function dispatchStripeCatalogSyncJob(
  service: SyncService,
  job: Pick<StripeCatalogSyncJob, 'operation' | 'entityType' | 'entityId'>,
): Promise<void> {
  if (job.operation === 'upsert' && job.entityType === 'plan') { await service.syncPlan(job.entityId); return; }
  if (job.operation === 'upsert' && job.entityType === 'coupon') { await service.syncCoupon(job.entityId); return; }
  if (job.operation === 'archive' && job.entityType === 'plan') { await service.archivePlan(job.entityId); return; }
  if (job.operation === 'archive' && job.entityType === 'coupon') { await service.archiveCoupon(job.entityId); return; }
  throw new Error(`Unsupported Stripe catalog sync job: operation=${job.operation} entityType=${job.entityType}`);
}

function emptyBatchResult(): BatchResult {
  return { processed: 0, succeeded: 0, retried: 0, deadLettered: 0, staleLeases: 0, errors: [] };
}

/**
 * Once a job dead-letters (exhausts its retry budget), the underlying
 * `plans`/`coupon_codes` row would otherwise keep showing
 * `stripeSyncStatus: 'pending'` forever - nothing besides
 * `stripe_catalog_sync_jobs` itself records that the sync ultimately failed,
 * and the admin status endpoint reads only the plan/coupon row, never the
 * jobs table. This mirrors the same status/error-only update
 * `StripeCatalogSyncService`'s `syncedUpdate` already makes on its own
 * success path, but deliberately never touches `stripeSyncFingerprint`:
 * setting it here would make a later sync attempt see a fingerprint "match"
 * and skip retrying entirely, masking the failure instead of surfacing it.
 *
 * `stripeSyncStatus`/`stripeSyncError` are deliberately excluded from
 * `InsertPlan` (see `insertPlanSchema` in shared/schema.ts - they are
 * server-managed, not client-writable), so `updatePlan` needs the same `as
 * any` cast `server/plan-routes.ts` already uses to set `stripeSyncStatus:
 * 'pending'`; `updateCoupon` is untyped already, so no cast is needed there.
 *
 * Best-effort: the job itself is already correctly dead-lettered in
 * `stripe_catalog_sync_jobs` regardless of whether this secondary update
 * succeeds, so a failure here is logged rather than thrown - it must not
 * crash the batch or leave the job stuck.
 */
async function markStripeCatalogEntityFailed(
  storage: WorkerStorage,
  entityType: StripeCatalogSyncJob['entityType'],
  entityId: number,
  sanitizedMessage: string,
): Promise<void> {
  try {
    if (entityType === 'plan') {
      await storage.updatePlan(entityId, { stripeSyncStatus: 'failed', stripeSyncError: sanitizedMessage } as any);
    } else {
      await storage.updateCoupon(entityId, { stripeSyncStatus: 'failed', stripeSyncError: sanitizedMessage });
    }
  } catch (error) {
    logger.error(
      'stripe-catalog-sync-worker',
      `Dead-lettered ${entityType} ${entityId} but failed to mark stripeSyncStatus='failed' on its own record: ${sanitizeStripeCatalogError(error)}`,
    );
  }
}

/**
 * Claims up to `limit` due Stripe catalog sync jobs and processes them one at
 * a time, sequentially - never concurrently, even if the outbox happens to
 * contain more than one row for the same entity - so two jobs for the same
 * plan or coupon are never in flight together within a batch.
 *
 * Every completion/failure passes back the exact claim token the job was
 * claimed with. A fenced-out `undefined` result (the lease expired, or was
 * stolen by another worker) means someone else now owns the job: it is left
 * alone entirely - no retry, no throw, no double-apply - and counted under
 * `staleLeases` for observability only.
 */
export async function runStripeCatalogSyncBatch(
  limit: number = DEFAULT_BATCH_LIMIT,
  dependencies: StripeCatalogSyncBatchDependencies = {},
): Promise<BatchResult> {
  const storage = dependencies.storage ?? await defaultStorage();
  const now = dependencies.now ?? (() => new Date());
  const result = emptyBatchResult();

  let service: SyncService;
  try {
    service = await (dependencies.createSyncService ?? createDefaultSyncService)();
  } catch (error) {
    logger.error('stripe-catalog-sync-worker', `Stripe catalog sync client unavailable: ${sanitizeStripeCatalogError(error)}`);
    return result;
  }

  const jobs = await storage.claimStripeCatalogSyncJobs(limit, dependencies.workerId, dependencies.lockTimeoutMs);

  for (const job of jobs) {
    result.processed += 1;
    const claimToken = job.claimToken;
    if (!claimToken) {
      logger.error('stripe-catalog-sync-worker', `Claimed job ${job.id} has no claim token; skipping`);
      continue;
    }

    try {
      await dispatchStripeCatalogSyncJob(service, job);
      const completed = await storage.completeStripeCatalogSyncJob(job.id, claimToken);
      if (completed) result.succeeded += 1;
      else result.staleLeases += 1;
    } catch (error) {
      const message = sanitizeStripeCatalogError(error);
      const { nextAttemptAt } = decideStripeCatalogSyncJobRetry(job.attempts, now());
      const failed = await storage.failStripeCatalogSyncJob(job.id, claimToken, message, nextAttemptAt ?? undefined);
      if (!failed) {
        result.staleLeases += 1;
        continue;
      }
      result.errors.push({ jobId: job.id, entityType: job.entityType, entityId: job.entityId, message });
      if (nextAttemptAt) {
        result.retried += 1;
      } else {
        result.deadLettered += 1;
        await markStripeCatalogEntityFailed(storage, job.entityType, job.entityId, message);
      }
    }
  }

  logger.info(
    'stripe-catalog-sync-worker',
    `Batch complete: processed=${result.processed} succeeded=${result.succeeded} retried=${result.retried} deadLettered=${result.deadLettered} staleLeases=${result.staleLeases}`,
  );
  return result;
}

// --- Scheduler ---------------------------------------------------------

type TimerHandle = ReturnType<typeof setInterval>;

export type StripeCatalogSyncWorkerOptions = {
  intervalMs?: number;
  schedule?: (callback: () => void, intervalMs: number) => TimerHandle;
  cancel?: (handle: TimerHandle) => void;
  runBatch?: (limit?: number) => Promise<BatchResult>;
  /** Overrides the `STRIPE_CATALOG_AUTO_SYNC` feature-flag check; only ever used by tests. */
  isEnabled?: () => boolean;
};

const DEFAULT_INTERVAL_MS = 30_000;
const MIN_INTERVAL_MS = 1_000;
const MAX_INTERVAL_MS = 60 * 60 * 1_000;

/** Parses the runtime setting defensively so a bad deployment value cannot turn this into a tight loop. */
export function resolveStripeCatalogSyncIntervalMs(configuredValue = process.env.STRIPE_CATALOG_SYNC_INTERVAL_MS): number {
  if (!configuredValue || !/^\d+$/.test(configuredValue.trim())) return DEFAULT_INTERVAL_MS;
  const intervalMs = Number(configuredValue);
  return Number.isSafeInteger(intervalMs) && intervalMs >= MIN_INTERVAL_MS && intervalMs <= MAX_INTERVAL_MS
    ? intervalMs
    : DEFAULT_INTERVAL_MS;
}

/**
 * Starts the periodic Stripe catalog sync batch loop. Disabled by default: an
 * inert stop function is returned - no timer is ever scheduled and no batch
 * ever runs - unless `STRIPE_CATALOG_AUTO_SYNC` is exactly `'true'`.
 *
 * A run still in flight owns the loop; an interval tick that fires while a
 * batch is running is skipped rather than starting a second, overlapping
 * batch.
 */
export function startStripeCatalogSyncWorker(options: StripeCatalogSyncWorkerOptions = {}): () => void {
  const isEnabled = options.isEnabled ?? (() => process.env.STRIPE_CATALOG_AUTO_SYNC === 'true');
  if (!isEnabled()) {
    return () => {};
  }

  const intervalMs = options.intervalMs ?? resolveStripeCatalogSyncIntervalMs();
  const schedule = options.schedule ?? ((callback: () => void, ms: number) => setInterval(callback, ms));
  const cancel = options.cancel ?? ((handle: TimerHandle) => clearInterval(handle));
  const runBatch = options.runBatch ?? (() => runStripeCatalogSyncBatch());

  let stopped = false;
  let running = false;
  const timer = schedule(() => {
    // clearInterval cannot cancel a callback Node already queued; do not let
    // a stale tick start a batch after shutdown has begun.
    if (stopped || running) return;
    running = true;
    runBatch()
      .catch((error) => {
        logger.error('stripe-catalog-sync-worker', `Batch run failed: ${sanitizeStripeCatalogError(error)}`);
      })
      .finally(() => {
        running = false;
      });
  }, intervalMs);

  return () => {
    if (stopped) return;
    stopped = true;
    cancel(timer);
  };
}
