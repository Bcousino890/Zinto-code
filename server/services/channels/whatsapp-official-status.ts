import type { InsertMessage } from '@shared/schema';

/**
 * One entry of Meta's WhatsApp Cloud API status webhook (`value.statuses[]`).
 * Sent for `change.field === 'messages'` payloads that report the
 * delivery/read/failure of an outbound message we previously sent - as
 * opposed to an inbound `value.messages[]` entry, which reports a new
 * message from the contact.
 *
 * https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples#message-status-updates
 */
export interface WhatsAppStatusWebhookEntry {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: Array<{ code?: number; title?: string; message?: string }>;
}

/** The subset of a stored message this module needs to decide on a status transition. */
export interface WhatsAppStatusTransitionInput {
  status?: string | null;
  metadata?: unknown;
}

const STATUS_RANK: Record<string, number> = {
  sending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

/**
 * Decides the next internal message status (if any) for an incoming Meta
 * status string, given the message's current internal status.
 *
 * Meta's status webhooks are delivered at-least-once and are not
 * guaranteed to arrive in order, so this only ever moves forward through
 * sent -> delivered -> read: a same-status redelivery (e.g. two 'delivered'
 * webhooks for the same message) or a late/out-of-order webhook (e.g.
 * 'delivered' arriving after 'read' was already recorded) resolves to null,
 * meaning the caller should not write anything.
 *
 * 'failed' is independent of that ladder - Meta reports it instead of
 * 'delivered' when a send didn't go through - but it is itself terminal and
 * won't downgrade a message that already reached 'delivered' or 'read',
 * since a message that has demonstrably arrived can't later "fail".
 *
 * Returns null when the caller should not call storage.updateMessage at all.
 */
export function mapMetaStatusToInternalStatus(
  currentStatus: string | null | undefined,
  metaStatus: string
): 'sent' | 'delivered' | 'read' | 'failed' | null {
  const incoming = metaStatus?.toLowerCase();

  if (incoming === 'failed') {
    if (currentStatus === 'failed') return null; // already recorded - duplicate webhook
    const currentRank = currentStatus ? STATUS_RANK[currentStatus] : undefined;
    if (currentRank !== undefined && currentRank >= STATUS_RANK.delivered) {
      // Already confirmed delivered/read - a late 'failed' webhook for this
      // message is stale and must not downgrade it.
      return null;
    }
    return 'failed';
  }

  if (incoming !== 'sent' && incoming !== 'delivered' && incoming !== 'read') {
    // Unknown/future Meta status value - ignore defensively rather than guess.
    return null;
  }

  if (currentStatus === 'failed') return null; // terminal - don't resurrect a failed message

  const currentRank = currentStatus && currentStatus in STATUS_RANK
    ? STATUS_RANK[currentStatus]
    : STATUS_RANK.sending;
  const incomingRank = STATUS_RANK[incoming];

  if (incomingRank <= currentRank) return null; // no forward progress: duplicate or out-of-order redelivery

  return incoming;
}

/** Parses a message's stored metadata (JSON string, already-parsed object, or absent) into a plain object. */
function parseWhatsAppMessageMetadata(existing: unknown): Record<string, unknown> {
  if (typeof existing === 'string' && existing.length > 0) {
    try {
      const parsed = JSON.parse(existing);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      // existing metadata wasn't valid JSON - fall through to an empty base
    }
    return {};
  }
  if (existing && typeof existing === 'object') {
    return { ...(existing as Record<string, unknown>) };
  }
  return {};
}

/**
 * Merges a metadata patch into a message's existing metadata, re-serialized
 * the same way the rest of whatsapp-official.ts stores it (a JSON string).
 */
export function mergeWhatsAppMessageMetadata(existing: unknown, patch: Record<string, unknown>): string {
  return JSON.stringify({ ...parseWhatsAppMessageMetadata(existing), ...patch });
}

/**
 * Computes the storage.updateMessage() payload (if any) for one Meta status
 * webhook entry against the internal message it refers to. Returns null
 * when nothing should be written - either the entry is malformed, or
 * mapMetaStatusToInternalStatus determined this is a duplicate/out-of-order
 * redelivery that shouldn't move the message's status.
 */
export function resolveWhatsAppStatusUpdate(
  currentMessage: WhatsAppStatusTransitionInput | null | undefined,
  statusEntry: WhatsAppStatusWebhookEntry
): Partial<InsertMessage> | null {
  if (!currentMessage) return null;
  if (typeof statusEntry?.status !== 'string' || !statusEntry.status) return null;

  const nextStatus = mapMetaStatusToInternalStatus(currentMessage.status, statusEntry.status);
  if (!nextStatus) return null;

  const updates: Partial<InsertMessage> = { status: nextStatus };

  if (nextStatus === 'failed') {
    const errors = Array.isArray(statusEntry.errors) ? statusEntry.errors : undefined;
    const primaryError = errors?.[0];
    const metadataPatch: Record<string, unknown> = {};
    if (primaryError) {
      metadataPatch.whatsappStatusError = {
        code: primaryError.code,
        title: primaryError.title,
        message: primaryError.message,
      };
    }
    if (errors) {
      metadataPatch.whatsappStatusErrors = errors;
    }
    if (Object.keys(metadataPatch).length > 0) {
      updates.metadata = mergeWhatsAppMessageMetadata(currentMessage.metadata, metadataPatch);
    }
  }

  return updates;
}

// message_template_status_update ------------------------------------------
//
// Meta's separate webhook field for template review status changes
// (approved/rejected/disabled/...) - unrelated to the message-status ladder
// above, but the same "pure decision, DB-free" shape.

const META_TEMPLATE_STATUS_MAP: Record<string, 'pending' | 'approved' | 'rejected' | 'disabled'> = {
  APPROVED: 'approved',
  REJECTED: 'rejected',
  PENDING: 'pending',
  DISABLED: 'disabled',
  PAUSED: 'disabled',
};

/**
 * Maps a Meta `message_template_status_update` webhook `event` string onto
 * our own campaignTemplates.whatsappTemplateStatus enum. PAUSED maps to
 * 'disabled' since a paused template can't be sent either, which is the
 * effect that matters to us. Anything else Meta might send (IN_APPEAL,
 * PENDING_DELETION, DELETED, FLAGGED, LOCKED, ...) has no equivalent in our
 * enum and returns null - the caller should skip persisting rather than
 * write a value the DB's enum constraint would reject.
 */
export function mapMetaTemplateStatus(event: string | null | undefined): 'pending' | 'approved' | 'rejected' | 'disabled' | null {
  if (typeof event !== 'string' || !event) return null;
  return META_TEMPLATE_STATUS_MAP[event.toUpperCase()] ?? null;
}
