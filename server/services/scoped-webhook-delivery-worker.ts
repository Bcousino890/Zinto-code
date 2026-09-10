import {
  planWebhookDelivery,
  type WebhookDeliveryPlan,
} from './integration-webhook-worker';

export type ScopedWebhookDeliveryStatus = WebhookDeliveryPlan['status'];

export interface ScopedWebhookClaim {
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  attemptCount: number;
  /**
   * An opaque, per-claim value. It must be supplied verbatim when recording
   * the outcome so persistence can reject an expired or superseded lease.
   */
  claimToken: string;
}

export interface ScopedWebhookEventPersistencePort {
  claimPending(input: {
    companyId: number;
    integrationId: number;
    workerId: string;
    limit: number;
  }): Promise<ScopedWebhookClaim | undefined>;
  updateDelivery(input: {
    companyId: number;
    integrationId: number;
    eventId: string;
    claimToken: string;
    status: ScopedWebhookDeliveryStatus;
    nextAttemptAt: Date | null;
  }): Promise<boolean>;
}

export interface ScopedWebhookDeliveryTransport {
  deliver(event: ScopedWebhookClaim): Promise<{
    statusCode?: number;
    networkError?: boolean;
    retryAfterSeconds?: number;
  }>;
}

export class StaleWebhookLeaseError extends Error {
  constructor(eventId: string) {
    super(`Webhook delivery lease is stale for event ${eventId}`);
    this.name = 'StaleWebhookLeaseError';
  }
}

/**
 * Tenant-scoped bridge between a lease-aware persistence port and a worker.
 * The fixed scope prevents callers from accidentally changing tenants between
 * claim and outcome, and the claim token is never interpreted or regenerated.
 */
export class ScopedWebhookWorkerAdapter {
  constructor(
    private readonly persistence: ScopedWebhookEventPersistencePort,
    private readonly scope: { companyId: number; integrationId: number },
    private readonly workerId: string,
  ) {}

  async claimNext(): Promise<ScopedWebhookClaim | undefined> {
    return this.persistence.claimPending({
      ...this.scope,
      workerId: this.workerId,
      limit: 1,
    });
  }

  async recordOutcome(
    claim: Pick<ScopedWebhookClaim, 'eventId' | 'claimToken'>,
    outcome: WebhookDeliveryPlan,
  ): Promise<void> {
    const updated = await this.persistence.updateDelivery({
      ...this.scope,
      eventId: claim.eventId,
      claimToken: claim.claimToken,
      status: outcome.status,
      nextAttemptAt: outcome.nextAttemptAt,
    });
    if (!updated) {
      throw new StaleWebhookLeaseError(claim.eventId);
    }
  }
}

/** Processes one claimed CRM webhook while preserving its lease token. */
export class ScopedWebhookDeliveryWorker {
  constructor(
    private readonly adapter: ScopedWebhookWorkerAdapter,
    private readonly transport: ScopedWebhookDeliveryTransport,
  ) {}

  async processNext(now: Date): Promise<boolean> {
    const claim = await this.adapter.claimNext();
    if (!claim) return false;

    const result = await this.transport.deliver(claim);
    const outcome = planWebhookDelivery({
      attemptCount: claim.attemptCount,
      responseStatus: result.statusCode,
      networkError: result.networkError,
      retryAfterSeconds: result.retryAfterSeconds,
      now,
    });
    await this.adapter.recordOutcome(claim, outcome);
    return true;
  }
}
