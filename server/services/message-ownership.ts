/**
 * Pure company-ownership decision for "use this existing message as the
 * target of a new send" (a reaction, or a reply/quote) — extracted out of
 * api-message-service.ts's `resolveOwnMessageExternalId` so this
 * security-relevant scoping logic has direct unit test coverage without
 * needing `storage`/a live database. api-message-service.ts stays the "glue
 * code": it fetches the message + conversation, calls this, and turns the
 * result into a thrown error or a resolved wamid.
 *
 * "Not found" and "wrong company" deliberately produce the same
 * `not_found_or_denied` reason (never distinguished by the caller) — same
 * convention as `getMessageStatus` in api-message-service.ts and
 * `ACCESS_DENIED_MESSAGE` in crm-read-storage-adapter.ts — so a v2 partner
 * can't use a message id guess to enumerate whether it belongs to another
 * company.
 */

export type MessageExternalIdAccessResult =
  | { ok: true; externalId: string }
  | { ok: false; reason: 'not_found_or_denied' | 'no_external_id' };

export function decideMessageExternalIdAccess(
  message: { conversationId: number; externalId: string | null } | undefined | null,
  conversation: { companyId: number | null } | undefined | null,
  companyId: number,
): MessageExternalIdAccessResult {
  if (!message) {
    return { ok: false, reason: 'not_found_or_denied' };
  }
  if (!conversation || conversation.companyId !== companyId) {
    return { ok: false, reason: 'not_found_or_denied' };
  }
  if (!message.externalId) {
    return { ok: false, reason: 'no_external_id' };
  }
  return { ok: true, externalId: message.externalId };
}
