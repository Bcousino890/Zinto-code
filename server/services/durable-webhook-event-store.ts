/**
 * Persistence boundary for CRM webhook events that outlive a request.
 * Every storage operation is scoped by both tenant and CRM integration.
 */
export interface DurableWebhookEventScope {
  companyId: number;
  integrationId: number;
}

export interface DurableWebhookEvent extends DurableWebhookEventScope {
  eventId: string;
  eventType: string;
  origin: 'crm' | 'zinto' | 'system';
  payload: Record<string, unknown>;
}

export type DurableWebhookDeliveryStatus =
  | 'pending'
  | 'processing'
  | 'delivered'
  | 'failed'
  | 'dead_letter';

export interface DurableWebhookClaimPendingInput extends DurableWebhookEventScope {
  /** Opaque, unique value generated for this lease; never reuse a worker id. */
  claimToken: string;
  limit: number;
}

export interface ClaimedDurableWebhookEvent extends DurableWebhookEvent {
  attemptCount: number;
  occurredAt: Date;
  claimToken: string;
  claimExpiresAt: Date;
}

export interface DurableWebhookDeliveryUpdate extends DurableWebhookEventScope {
  eventId: string;
  /** Must exactly match the token returned by claimPending. */
  claimToken: string;
  status: DurableWebhookDeliveryStatus;
  deliveredAt?: Date;
  nextAttemptAt?: Date | null;
  lastError?: string;
}

/**
 * Database adapters must constrain both claim and delivery updates to the
 * company/integration pair. A false update result means no scoped event changed.
 */
export interface DurableWebhookEventStore {
  claimPending(input: DurableWebhookClaimPendingInput): Promise<ClaimedDurableWebhookEvent | undefined>;
  updateDelivery(input: DurableWebhookDeliveryUpdate): Promise<boolean>;
}

/** Rejects an event that cannot be safely stored or addressed by a tenant. */
export function assertDurableWebhookEvent(input: unknown): asserts input is DurableWebhookEvent {
  if (!isRecord(input)) {
    throw new Error('durable webhook event must be an object');
  }

  assertPositiveInteger(input.companyId, 'companyId');
  assertPositiveInteger(input.integrationId, 'integrationId');
  assertNonEmptyString(input.eventId, 'eventId');
  assertNonEmptyString(input.eventType, 'eventType');
  if (input.origin !== 'crm' && input.origin !== 'zinto' && input.origin !== 'system') {
    throw new Error('origin must be crm, zinto, or system');
  }

  if (!isRecord(input.payload) || Array.isArray(input.payload)) {
    throw new Error('payload must be an object');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function assertPositiveInteger(value: unknown, field: 'companyId' | 'integrationId'): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
}

function assertNonEmptyString(value: unknown, field: 'eventId' | 'eventType'): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
}
