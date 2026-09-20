import { randomUUID } from 'node:crypto';

import { assertPublicHttpUrl, isReservedTestDomain } from '../utils/ssrf-guard';
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
        if (plan.status !== 'delivered') {
          lastError = result.networkError
            ? 'Webhook delivery transport failed'
            : `Webhook endpoint responded with HTTP ${result.statusCode ?? 'unknown status'}`;
        }
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

const MAX_WEBHOOK_REDIRECTS = 5;

/** Re-validates (unless it's a reserved test domain) and returns the given URL, or throws. */
async function assertDeliverableUrl(rawUrl: string): Promise<URL> {
  const url = new URL(rawUrl);
  if (isReservedTestDomain(url.hostname)) return url;
  return assertPublicHttpUrl(rawUrl);
}

/** Uses Node's fetch implementation and reports request failures as retries. */
export function createFetchWebhookDeliveryTransport(
  fetchImpl: typeof fetch = globalThis.fetch,
): DurableWebhookDeliveryTransport {
  return {
    async deliver(delivery) {
      try {
        // Re-validated immediately before the request (not just when the URL
        // was saved), so a domain that resolved publicly at config time and
        // was since repointed at a private address (DNS rebinding) can't be
        // used to reach internal services through a scheduled webhook
        // delivery. (.test/.example are exempt — see isReservedTestDomain —
        // everything else, including localhost, is checked for real.)
        //
        // redirect: 'manual' plus this same re-validation on every hop closes
        // the other half of this: fetch()'s default redirect handling would
        // otherwise let a webhook target that passes validation 302 the
        // request straight to an internal address, bypassing the check
        // entirely. A remaining, narrower gap this does NOT close - the
        // validating DNS lookup and fetch's own internal resolution are two
        // separate round trips, so a DNS-rebinding attacker with control over
        // answer timing could in principle still slip through - is the same
        // TOCTOU window assertPublicHttpUrl's own callers accept everywhere
        // else in this codebase (see its docstring); performFlowHttpRequest's
        // IP-pinning closes that fully but isn't reusable here without losing
        // this transport's injectable-fetch test seam.
        let currentUrl = await assertDeliverableUrl(delivery.url);
        let method = 'POST';
        let body: string | undefined = delivery.body;

        for (let redirects = 0; ; redirects++) {
          const response = await fetchImpl(currentUrl.toString(), {
            method,
            headers: delivery.headers,
            body: method === 'GET' ? undefined : body,
            redirect: 'manual',
          });

          const isRedirect = [301, 302, 303, 307, 308].includes(response.status);
          const location = response.headers.get('location');
          if (!isRedirect || !location) {
            const retryAfter = response.headers.get('retry-after');
            const retryAfterSeconds = retryAfter && /^\d+$/.test(retryAfter.trim())
              ? Number(retryAfter)
              : undefined;
            return { statusCode: response.status, retryAfterSeconds };
          }

          if (redirects >= MAX_WEBHOOK_REDIRECTS) {
            return { networkError: true };
          }

          currentUrl = await assertDeliverableUrl(new URL(location, currentUrl).toString());
          if (response.status !== 307 && response.status !== 308) {
            method = 'GET';
            body = undefined;
          }
        }
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
