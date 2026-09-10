import { randomUUID } from 'node:crypto';

import { buildWebhookDelivery, type WebhookDelivery } from './integration-webhook-service';
import { planWebhookDelivery, type WebhookDeliveryPlan } from './integration-webhook-worker';
import type {
  ClaimedDurableWebhookEvent,
  DurableWebhookClaimPendingInput,
  DurableWebhookDeliveryUpdate,
  DurableWebhookEventScope,
} from './durable-webhook-event-store';
import {
  DurableWebhookWorkerScheduler,
  type DurableWebhookWorker,
  type DurableWebhookWorkerSchedulerOptions,
} from './durable-webhook-worker-scheduler';

export interface DurableWebhookDeliveryTarget {
  url: string;
  secretEncrypted: string;
}

/**
 * This persistence boundary keeps the scheduler ignorant of tenant selection.
 * The database chooses candidate scopes and every mutation remains scoped by
 * the company and CRM integration that produced the claim.
 */
export interface DurableWebhookDeliveryPersistence {
  listCandidateScopes(): Promise<DurableWebhookEventScope[]>;
  claimPending(input: DurableWebhookClaimPendingInput): Promise<ClaimedDurableWebhookEvent | undefined>;
  getDeliveryTarget(scope: DurableWebhookEventScope): Promise<DurableWebhookDeliveryTarget | undefined>;
  updateDelivery(input: DurableWebhookDeliveryUpdate): Promise<boolean>;
}

export interface DurableWebhookDeliveryTransport {
  deliver(delivery: WebhookDelivery): Promise<{
    statusCode?: number;
    networkError?: boolean;
    retryAfterSeconds?: number;
  }>;
}

export interface DurableWebhookDeliveryWorkerDependencies extends DurableWebhookDeliveryTransport {
  decryptSecret(secretEncrypted: string): string;
  createClaimToken?: () => string;
}

export class StaleDurableWebhookLeaseError extends Error {
  constructor(eventId: string) {
    super(`Durable webhook delivery lease is stale for event ${eventId}`);
    this.name = 'StaleDurableWebhookLeaseError';
  }
}

/**
 * Claims and sends one durable webhook event. A fresh opaque token is assigned
 * for every claim and must match the active database lease when the result is
 * written, preventing a late worker from completing a superseded delivery.
 */
export class DurableWebhookDeliveryWorker implements DurableWebhookWorker {
  private readonly createClaimToken: () => string;

  constructor(
    private readonly persistence: DurableWebhookDeliveryPersistence,
    private readonly dependencies: DurableWebhookDeliveryWorkerDependencies,
  ) {
    this.createClaimToken = dependencies.createClaimToken ?? randomUUID;
  }

  async processNext(now: Date): Promise<boolean> {
    const scopes = await this.persistence.listCandidateScopes();
    for (const scope of scopes) {
      const claim = await this.persistence.claimPending({
        ...scope,
        claimToken: this.createClaimToken(),
        limit: 1,
      });
      if (!claim) continue;

      const target = await this.persistence.getDeliveryTarget(scope);
      if (!target) {
        await this.recordOutcome(claim, {
          status: 'failed',
          nextAttemptAt: null,
        }, 'The CRM integration no longer has an active webhook delivery target');
        return true;
      }

      let plan: WebhookDeliveryPlan;
      let lastError: string | undefined;
      try {
        const secret = this.dependencies.decryptSecret(target.secretEncrypted);
        const delivery = buildWebhookDelivery({
          url: target.url,
          secret,
          event: {
            id: claim.eventId,
            type: claim.eventType,
            occurredAt: claim.occurredAt.toISOString(),
            companyId: claim.companyId,
            integrationId: claim.integrationId,
            origin: claim.origin,
            data: claim.payload,
          },
        });
        const result = await this.dependencies.deliver(delivery);
        plan = planWebhookDelivery({
          attemptCount: claim.attemptCount,
          responseStatus: result.statusCode,
          networkError: result.networkError,
          retryAfterSeconds: result.retryAfterSeconds,
          now,
        });
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Webhook delivery transport failed';
        plan = planWebhookDelivery({
          attemptCount: claim.attemptCount,
          networkError: true,
          now,
        });
      }

      await this.recordOutcome(claim, plan, lastError);
      return true;
    }
    return false;
  }

  private async recordOutcome(
    claim: ClaimedDurableWebhookEvent,
    plan: WebhookDeliveryPlan,
    lastError?: string,
  ): Promise<void> {
    const updated = await this.persistence.updateDelivery({
      companyId: claim.companyId,
      integrationId: claim.integrationId,
      eventId: claim.eventId,
      claimToken: claim.claimToken,
      status: plan.status,
      nextAttemptAt: plan.nextAttemptAt,
      lastError,
    });
    if (!updated) throw new StaleDurableWebhookLeaseError(claim.eventId);
  }
}

/** Uses Node's fetch implementation and reports request failures as retries. */
export function createFetchWebhookDeliveryTransport(
  fetchImpl: typeof fetch = globalThis.fetch,
): DurableWebhookDeliveryTransport {
  return {
    async deliver(delivery) {
      try {
        const response = await fetchImpl(delivery.url, {
          method: 'POST',
          headers: delivery.headers,
          body: delivery.body,
        });
        const retryAfter = response.headers.get('retry-after');
        const retryAfterSeconds = retryAfter && /^\d+$/.test(retryAfter.trim())
          ? Number(retryAfter)
          : undefined;
        return { statusCode: response.status, retryAfterSeconds };
      } catch {
        return { networkError: true };
      }
    },
  };
}

/** Builds the production worker and scheduler without exposing an unscoped loop. */
export function createDurableWebhookWorkerScheduler(
  persistence: DurableWebhookDeliveryPersistence,
  dependencies: Omit<DurableWebhookDeliveryWorkerDependencies, 'deliver'> & Partial<DurableWebhookDeliveryTransport> = {
    decryptSecret: () => {
      throw new Error('A webhook secret decryptor is required');
    },
  },
  schedulerOptions: DurableWebhookWorkerSchedulerOptions = {},
): DurableWebhookWorkerScheduler {
  const transport = dependencies.deliver
    ? { deliver: dependencies.deliver }
    : createFetchWebhookDeliveryTransport();
  return new DurableWebhookWorkerScheduler(
    new DurableWebhookDeliveryWorker(persistence, { ...dependencies, ...transport }),
    schedulerOptions,
  );
}
