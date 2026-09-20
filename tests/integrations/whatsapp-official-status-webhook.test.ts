import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mapMetaStatusToInternalStatus,
  mapMetaTemplateStatus,
  mergeWhatsAppMessageMetadata,
  resolveWhatsAppStatusUpdate,
} from '../../server/services/channels/whatsapp-official-status';

// mapMetaStatusToInternalStatus -----------------------------------------
//
// Meta's WhatsApp Cloud API delivers `value.statuses[]` webhooks
// (sent/delivered/read/failed for outbound messages) at-least-once and not
// necessarily in order. These tests cover the forward-only progression and
// idempotency rules the mapping is meant to enforce.

test('moves forward through the sent -> delivered -> read ladder', () => {
  assert.equal(mapMetaStatusToInternalStatus('sending', 'sent'), 'sent');
  assert.equal(mapMetaStatusToInternalStatus('sent', 'delivered'), 'delivered');
  assert.equal(mapMetaStatusToInternalStatus('delivered', 'read'), 'read');
});

test('treats a redelivered status webhook (same status twice) as a no-op', () => {
  assert.equal(mapMetaStatusToInternalStatus('sent', 'sent'), null);
  assert.equal(mapMetaStatusToInternalStatus('delivered', 'delivered'), null);
  assert.equal(mapMetaStatusToInternalStatus('read', 'read'), null);
});

test('never downgrades status for a late/out-of-order webhook', () => {
  // 'read' already recorded; a late 'delivered' webhook must not revert it.
  assert.equal(mapMetaStatusToInternalStatus('read', 'delivered'), null);
  assert.equal(mapMetaStatusToInternalStatus('read', 'sent'), null);
  // 'delivered' already recorded; a late 'sent' webhook must not revert it.
  assert.equal(mapMetaStatusToInternalStatus('delivered', 'sent'), null);
});

test('allows a failure at any point before delivery is confirmed', () => {
  assert.equal(mapMetaStatusToInternalStatus('sending', 'failed'), 'failed');
  assert.equal(mapMetaStatusToInternalStatus('sent', 'failed'), 'failed');
  assert.equal(mapMetaStatusToInternalStatus(null, 'failed'), 'failed');
  assert.equal(mapMetaStatusToInternalStatus(undefined, 'failed'), 'failed');
});

test('does not let a stale failed webhook downgrade an already-delivered/read message', () => {
  assert.equal(mapMetaStatusToInternalStatus('delivered', 'failed'), null);
  assert.equal(mapMetaStatusToInternalStatus('read', 'failed'), null);
});

test('treats a redelivered failed webhook as a no-op', () => {
  assert.equal(mapMetaStatusToInternalStatus('failed', 'failed'), null);
});

test('never resurrects a failed message from a later sent/delivered/read webhook', () => {
  assert.equal(mapMetaStatusToInternalStatus('failed', 'sent'), null);
  assert.equal(mapMetaStatusToInternalStatus('failed', 'delivered'), null);
  assert.equal(mapMetaStatusToInternalStatus('failed', 'read'), null);
});

test('ignores unknown/future Meta status values defensively', () => {
  assert.equal(mapMetaStatusToInternalStatus('sent', 'warehoused'), null);
  assert.equal(mapMetaStatusToInternalStatus('sent', ''), null);
});

test('is case-insensitive on the incoming Meta status string', () => {
  assert.equal(mapMetaStatusToInternalStatus('sent', 'DELIVERED'), 'delivered');
});

// mergeWhatsAppMessageMetadata -------------------------------------------

test('merges a metadata patch into existing JSON-string metadata without dropping other fields', () => {
  const merged = mergeWhatsAppMessageMetadata(
    JSON.stringify({ whatsapp_message_id: 'wamid.abc', chunkIndex: 0 }),
    { whatsappStatusError: { code: 131047, title: 'Message failed to send' } }
  );

  assert.deepEqual(JSON.parse(merged), {
    whatsapp_message_id: 'wamid.abc',
    chunkIndex: 0,
    whatsappStatusError: { code: 131047, title: 'Message failed to send' },
  });
});

test('tolerates missing/invalid existing metadata', () => {
  assert.deepEqual(JSON.parse(mergeWhatsAppMessageMetadata(undefined, { a: 1 })), { a: 1 });
  assert.deepEqual(JSON.parse(mergeWhatsAppMessageMetadata('not json', { a: 1 })), { a: 1 });
});

// resolveWhatsAppStatusUpdate ---------------------------------------------
//
// This is the function handleStatusWebhookUpdate() calls to build the
// storage.updateMessage() payload for one value.statuses[] entry - the
// smallest unit that touches both the status ladder and the failure
// metadata, without needing a real storage/DB dependency.

test('resolves a delivered status update with no metadata change', () => {
  const updates = resolveWhatsAppStatusUpdate(
    { status: 'sent', metadata: null },
    { id: 'wamid.123', status: 'delivered' }
  );

  assert.deepEqual(updates, { status: 'delivered' });
});

test('resolves a failed status update, folding Meta error info into metadata', () => {
  const updates = resolveWhatsAppStatusUpdate(
    { status: 'sent', metadata: JSON.stringify({ whatsapp_message_id: 'wamid.123' }) },
    {
      id: 'wamid.123',
      status: 'failed',
      errors: [{ code: 131047, title: 'Re-engagement message', message: 'More than 24 hours have passed' }],
    }
  );

  assert.equal(updates?.status, 'failed');
  assert.deepEqual(JSON.parse(updates!.metadata as string), {
    whatsapp_message_id: 'wamid.123',
    whatsappStatusError: {
      code: 131047,
      title: 'Re-engagement message',
      message: 'More than 24 hours have passed',
    },
    whatsappStatusErrors: [
      { code: 131047, title: 'Re-engagement message', message: 'More than 24 hours have passed' },
    ],
  });
});

test('returns null (no write) for a duplicate status redelivery', () => {
  const updates = resolveWhatsAppStatusUpdate(
    { status: 'delivered', metadata: null },
    { id: 'wamid.123', status: 'delivered' }
  );

  assert.equal(updates, null);
});

test('returns null (no write) when there is no message to update', () => {
  assert.equal(resolveWhatsAppStatusUpdate(null, { id: 'wamid.123', status: 'delivered' }), null);
  assert.equal(resolveWhatsAppStatusUpdate(undefined, { id: 'wamid.123', status: 'delivered' }), null);
});

test('returns null (no write) for a malformed status entry', () => {
  assert.equal(resolveWhatsAppStatusUpdate({ status: 'sent', metadata: null }, {}), null);
  assert.equal(resolveWhatsAppStatusUpdate({ status: 'sent', metadata: null }, { id: 'wamid.123' }), null);
});

// mapMetaTemplateStatus ----------------------------------------------------
//
// message_template_status_update is a separate Meta webhook field (template
// review status, not message delivery) that used to be silently discarded
// in processWebhook - this is the pure mapping its handler now uses to
// decide whether/how to persist an incoming event.

test('maps each Meta template event with a real DB-enum equivalent', () => {
  assert.equal(mapMetaTemplateStatus('APPROVED'), 'approved');
  assert.equal(mapMetaTemplateStatus('REJECTED'), 'rejected');
  assert.equal(mapMetaTemplateStatus('PENDING'), 'pending');
  assert.equal(mapMetaTemplateStatus('DISABLED'), 'disabled');
});

test('maps PAUSED to disabled, since a paused template cannot be sent either', () => {
  assert.equal(mapMetaTemplateStatus('PAUSED'), 'disabled');
});

test('is case-insensitive on the incoming Meta event string', () => {
  assert.equal(mapMetaTemplateStatus('approved'), 'approved');
  assert.equal(mapMetaTemplateStatus('Rejected'), 'rejected');
});

test('returns null for Meta events with no equivalent in our status enum', () => {
  assert.equal(mapMetaTemplateStatus('IN_APPEAL'), null);
  assert.equal(mapMetaTemplateStatus('PENDING_DELETION'), null);
  assert.equal(mapMetaTemplateStatus('DELETED'), null);
  assert.equal(mapMetaTemplateStatus('FLAGGED'), null);
  assert.equal(mapMetaTemplateStatus('LOCKED'), null);
});

test('returns null for a missing/malformed event value', () => {
  assert.equal(mapMetaTemplateStatus(undefined), null);
  assert.equal(mapMetaTemplateStatus(null), null);
  assert.equal(mapMetaTemplateStatus(''), null);
});
