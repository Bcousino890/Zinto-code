import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCrmChannelsReadAdapter,
  createCrmConversationsReadAdapter,
  createCrmMessageStatusReadAdapter,
} from '../../server/services/crm-read-storage-adapter';

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

test('channels adapter forwards companyId to the source and maps the returned fields exactly', async () => {
  const seen: number[] = [];
  const port = createCrmChannelsReadAdapter({
    getChannels: async (companyId) => {
      seen.push(companyId);
      return [
        { id: 1, name: 'WhatsApp principal', type: 'whatsapp', status: 'active', phoneNumber: '+56912345678', displayName: 'Ventas' },
        { id: 2, name: 'Telegram soporte', type: 'telegram', status: 'active' },
      ];
    },
  });

  const channels = await port.listChannels(12);

  assert.deepEqual(seen, [12]);
  assert.deepEqual(channels, [
    { id: 1, name: 'WhatsApp principal', type: 'whatsapp', status: 'active', phoneNumber: '+56912345678', displayName: 'Ventas' },
    { id: 2, name: 'Telegram soporte', type: 'telegram', status: 'active', phoneNumber: undefined, displayName: undefined },
  ]);
});

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

test('conversations adapter forwards companyId, pagination, and filters to the source unchanged', async () => {
  const calls: Array<{ companyId: number; options: Record<string, unknown> }> = [];
  const port = createCrmConversationsReadAdapter({
    getConversations: async (companyId, options) => {
      calls.push({ companyId, options });
      return { conversations: [], total: 0 };
    },
  });

  await port.listConversations({ companyId: 12, page: 2, limit: 50, channelId: 4, status: 'open', isGroup: true });

  assert.deepEqual(calls, [{ companyId: 12, options: { page: 2, limit: 50, channelId: 4, status: 'open', isGroup: true } }]);
});

test('conversations adapter maps each conversation field exactly and passes total through unchanged', async () => {
  const lastMessageAt = new Date('2026-09-10T12:00:00Z');
  const createdAt = new Date('2026-09-01T08:00:00Z');
  const port = createCrmConversationsReadAdapter({
    getConversations: async () => ({
      conversations: [{
        id: 5, contactId: 9, channelId: 2, channelType: 'whatsapp', status: 'open', isGroup: false, lastMessageAt, createdAt,
      }],
      total: 1,
    }),
  });

  const result = await port.listConversations({ companyId: 12, page: 1, limit: 20 });

  assert.deepEqual(result, {
    conversations: [{ id: 5, contactId: 9, channelId: 2, channelType: 'whatsapp', status: 'open', isGroup: false, lastMessageAt, createdAt }],
    total: 1,
  });
});

test('conversations adapter only ever queries the company it was called with (no cross-company parameter to smuggle in another one)', async () => {
  const calls: number[] = [];
  const port = createCrmConversationsReadAdapter({
    getConversations: async (companyId) => {
      calls.push(companyId);
      return { conversations: [], total: 0 };
    },
  });

  await port.listConversations({ companyId: 12, page: 1, limit: 20 });
  await port.listConversations({ companyId: 34, page: 1, limit: 20 });

  assert.deepEqual(calls, [12, 34]);
});

// ---------------------------------------------------------------------------
// Message status
// ---------------------------------------------------------------------------

test('message status adapter returns the source result unchanged for a message owned by the caller\'s company', async () => {
  const timestamp = new Date('2026-09-01T00:00:00Z');
  const port = createCrmMessageStatusReadAdapter({
    getMessageStatus: async () => ({ status: 'delivered', timestamp }),
  });

  const result = await port.getMessageStatus({ companyId: 12, messageId: 77 });

  assert.deepEqual(result, { status: 'delivered', timestamp });
});

test('message status adapter returns null when the source reports the message does not exist', async () => {
  const port = createCrmMessageStatusReadAdapter({
    getMessageStatus: async () => null,
  });

  const result = await port.getMessageStatus({ companyId: 12, messageId: 999 });

  assert.equal(result, null);
});

test('message status adapter refuses cross-company access: a message whose conversation belongs to another company resolves to null, not an error or its data', async () => {
  const port = createCrmMessageStatusReadAdapter({
    // Mirrors apiMessageService.getMessageStatus, which throws exactly this
    // message when `conversation.companyId !== companyId`.
    getMessageStatus: async () => { throw new Error('Message not found or access denied'); },
  });

  const result = await port.getMessageStatus({ companyId: 12, messageId: 77 });

  assert.equal(result, null);
});

test('message status adapter does not swallow unrelated errors as if the message were merely inaccessible', async () => {
  const port = createCrmMessageStatusReadAdapter({
    getMessageStatus: async () => { throw new Error('Database connection lost'); },
  });

  await assert.rejects(
    () => port.getMessageStatus({ companyId: 12, messageId: 77 }),
    /Database connection lost/,
  );
});
