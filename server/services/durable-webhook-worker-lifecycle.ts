export interface DurableWebhookWorkerSchedulerLifecycle {
  start(): boolean;
  stop(): void;
}

export interface DurableWebhookWorkerLifecycleOptions {
  /**
   * Set DURABLE_WEBHOOK_WORKER_ENABLED=false on HTTP-only replicas. Database
   * leases still protect delivery when more than one worker replica is enabled.
   */
  enabled?: boolean;
}

/** The worker depends on columns introduced by the CRM webhook migrations. */
export function shouldStartDurableWebhookWorker(input: { migrationsReady: boolean }): boolean {
  return input.migrationsReady;
}

/**
 * Owns the one scheduler permitted inside a Node.js process. Keeping this
 * state outside HTTP route registration also makes repeated bootstrap calls
 * and graceful shutdown deterministic.
 */
export class DurableWebhookWorkerLifecycle {
  private scheduler: DurableWebhookWorkerSchedulerLifecycle | undefined;
  private stopped = false;
  private readonly enabled: boolean;

  constructor(
    private readonly createScheduler: () => DurableWebhookWorkerSchedulerLifecycle,
    options: DurableWebhookWorkerLifecycleOptions = {},
  ) {
    this.enabled = options.enabled ?? process.env.DURABLE_WEBHOOK_WORKER_ENABLED !== 'false';
  }

  start(): boolean {
    if (!this.enabled || this.scheduler) return false;
    this.scheduler = this.createScheduler();
    return this.scheduler.start();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.scheduler?.stop();
  }
}
