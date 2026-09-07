import { nextWebhookRetry } from './integration-webhook-retry';

export interface WebhookDeliveryPlanInput {
  attemptCount: number;
  responseStatus?: number;
  networkError?: boolean;
  retryAfterSeconds?: number;
  now: Date;
}

export type WebhookDeliveryPlan = {
  status: 'delivered' | 'failed' | 'pending' | 'dead_letter';
  nextAttemptAt: Date | null;
};

export function planWebhookDelivery({
  attemptCount,
  responseStatus,
  networkError,
  retryAfterSeconds,
  now,
}: WebhookDeliveryPlanInput): WebhookDeliveryPlan {
  if (responseStatus !== undefined && responseStatus >= 200 && responseStatus < 300) {
    return { status: 'delivered', nextAttemptAt: null };
  }

  if (networkError || responseStatus === 429 || (responseStatus !== undefined && responseStatus >= 500)) {
    return nextWebhookRetry({ attemptCount, retryAfterSeconds, now });
  }

  return { status: 'failed', nextAttemptAt: null };
}
