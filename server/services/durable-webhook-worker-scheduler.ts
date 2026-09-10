export interface DurableWebhookWorker {
  /** Claims and processes at most one already-durable webhook event. */
  processNext(now: Date): Promise<boolean>;
}

type SchedulerHandle = ReturnType<typeof setInterval> | number;

export interface DurableWebhookWorkerSchedulerOptions {
  intervalMs?: number;
  schedule?: (callback: () => void, intervalMs: number) => SchedulerHandle;
  cancel?: (handle: SchedulerHandle) => void;
  now?: () => Date;
  onError?: (error: unknown) => void;
}

const DEFAULT_INTERVAL_MS = 5_000;
const MIN_INTERVAL_MS = 1_000;
const MAX_INTERVAL_MS = 60 * 60 * 1_000;

/**
 * Parses the runtime setting defensively so an invalid deployment variable
 * cannot turn the webhook worker into a tight loop.
 */
export function resolveDurableWebhookWorkerIntervalMs(
  configuredValue = process.env.DURABLE_WEBHOOK_WORKER_INTERVAL_MS,
): number {
  if (!configuredValue || !/^\d+$/.test(configuredValue.trim())) {
    return DEFAULT_INTERVAL_MS;
  }

  const intervalMs = Number(configuredValue);
  return Number.isSafeInteger(intervalMs) && intervalMs >= MIN_INTERVAL_MS && intervalMs <= MAX_INTERVAL_MS
    ? intervalMs
    : DEFAULT_INTERVAL_MS;
}

/**
 * Executes a durable webhook worker on one timer. A run that is still in
 * progress owns the loop; later ticks are deliberately skipped rather than
 * competing for database leases or issuing a duplicate delivery.
 */
export class DurableWebhookWorkerScheduler {
  private timer: SchedulerHandle | undefined;
  private started = false;
  private running = false;
  private readonly intervalMs: number;
  private readonly schedule: (callback: () => void, intervalMs: number) => SchedulerHandle;
  private readonly cancel: (handle: SchedulerHandle) => void;
  private readonly now: () => Date;
  private readonly onError: (error: unknown) => void;

  constructor(
    private readonly worker: DurableWebhookWorker,
    options: DurableWebhookWorkerSchedulerOptions = {},
  ) {
    this.intervalMs = options.intervalMs ?? resolveDurableWebhookWorkerIntervalMs();
    if (!Number.isSafeInteger(this.intervalMs) || this.intervalMs < MIN_INTERVAL_MS || this.intervalMs > MAX_INTERVAL_MS) {
      throw new Error(`durable webhook worker interval must be between ${MIN_INTERVAL_MS} and ${MAX_INTERVAL_MS}ms`);
    }
    this.schedule = options.schedule ?? setInterval;
    this.cancel = options.cancel ?? clearInterval;
    this.now = options.now ?? (() => new Date());
    this.onError = options.onError ?? ((error) => {
      console.error('Durable webhook worker run failed:', error);
    });
  }

  /** Starts the loop once; returns false for duplicate startup attempts. */
  start(): boolean {
    if (this.started) return false;

    this.started = true;
    this.timer = this.schedule(() => {
      // clearInterval cannot cancel a callback that the event loop already
      // queued. Do not let that stale callback claim another webhook after
      // shutdown has begun.
      if (!this.started) return;
      void this.runOnce();
    }, this.intervalMs);
    return true;
  }

  stop(): void {
    if (!this.started) return;
    if (this.timer !== undefined) this.cancel(this.timer);
    this.timer = undefined;
    this.started = false;
  }

  async runOnce(): Promise<boolean> {
    if (this.running) return false;

    this.running = true;
    try {
      return await this.worker.processNext(this.now());
    } catch (error) {
      this.onError(error);
      return false;
    } finally {
      this.running = false;
    }
  }
}
