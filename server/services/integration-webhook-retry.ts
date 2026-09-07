const MAX_WEBHOOK_ATTEMPTS = 8;
const BASE_DELAY_SECONDS = 15;
const MAX_DELAY_SECONDS = 60 * 60;

export function nextWebhookRetry({
  attemptCount,
  retryAfterSeconds,
  now,
}: {
  attemptCount: number;
  retryAfterSeconds?: number;
  now: Date;
}): { status: 'pending' | 'dead_letter'; nextAttemptAt: Date | null } {
  if (attemptCount >= MAX_WEBHOOK_ATTEMPTS) {
    return { status: 'dead_letter', nextAttemptAt: null };
  }

  const exponentialDelay = Math.min(MAX_DELAY_SECONDS, BASE_DELAY_SECONDS * 2 ** attemptCount);
  const delaySeconds = Math.max(exponentialDelay, retryAfterSeconds ?? 0);
  return {
    status: 'pending',
    nextAttemptAt: new Date(now.getTime() + delaySeconds * 1000),
  };
}
