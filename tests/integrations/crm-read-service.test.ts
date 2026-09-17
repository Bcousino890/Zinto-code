import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CrmChannelsReadService,
  CrmConversationsReadService,
  CrmMessageStatusReadService,
} from '../../server/services/crm-read-service';

test('CrmChannelsReadService forwards the companyId to the port and returns its result unchanged', async () => {
  const seen: number[] = [];
  const service = new CrmChannelsReadService({
    listChannels: async (companyId) => {
      seen.push(companyId);
      return [{ id: 1, name: 'WhatsApp principal', type: 'whatsapp', status: 'active' }];
    },
  });

  const result = await service.listChannels(12);

  assert.deepEqual(seen, [12]);
  assert.deepEqual(result, [{ id: 1, name: 'WhatsApp principal', type: 'whatsapp', status: 'active' }]);
});

test('CrmConversationsReadService defaults page/limit when pagination is omitted', async () => {
  const calls: Array<Record<string, unknown>> = [];
  const service = new CrmConversationsReadService({
    listConversations: async (input) => {
      calls.push(input);
      return { conversations: [], total: 0 };
    },
  });

  await service.listConversations({ companyId: 12 });

  assert.deepEqual(calls, [{ companyId: 12, page: 1, limit: 20, channelId: undefined, status: undefined, isGroup: undefined }]);
});

test('CrmConversationsReadService clamps an oversized limit to 100 and forwards filters as-is', async () => {
  const calls: Array<Record<string, unknown>> = [];
  const service = new CrmConversationsReadService({
    listConversations: async (input) => {
      calls.push(input);
      return { conversations: [], total: 0 };
    },
  });

  await service.listConversations({
    companyId: 12,
    filters: { channelId: 4, status: 'open', isGroup: false },
    pagination: { page: 3, limit: 500 },
  });

  assert.deepEqual(calls, [{ companyId: 12, page: 3, limit: 100, channelId: 4, status: 'open', isGroup: false }]);
});

test('CrmConversationsReadService falls back to defaults for a non-positive page or limit', async () => {
  const calls: Array<Record<string, unknown>> = [];
  const service = new CrmConversationsReadService({
    listConversations: async (input) => {
      calls.push(input);
      return { conversations: [], total: 0 };
    },
  });

  await service.listConversations({ companyId: 12, pagination: { page: -1, limit: 0 } });

  assert.deepEqual(calls, [{ companyId: 12, page: 1, limit: 20, channelId: undefined, status: undefined, isGroup: undefined }]);
});

test('CrmConversationsReadService returns the port result unchanged', async () => {
  const conversations = [{
    id: 5,
    contactId: 9,
    channelId: 2,
    channelType: 'whatsapp',
    status: 'open',
    isGroup: false,
    lastMessageAt: new Date('2026-09-01T00:00:00Z'),
    createdAt: new Date('2026-08-01T00:00:00Z'),
  }];
  const service = new CrmConversationsReadService({
    listConversations: async () => ({ conversations, total: 1 }),
  });

  const result = await service.listConversations({ companyId: 12 });

  assert.deepEqual(result, { conversations, total: 1 });
});

test('CrmMessageStatusReadService forwards the input and returns the port result unchanged', async () => {
  const calls: Array<{ companyId: number; messageId: number }> = [];
  const service = new CrmMessageStatusReadService({
    getMessageStatus: async (input) => {
      calls.push(input);
      return { status: 'delivered', timestamp: new Date('2026-09-01T00:00:00Z') };
    },
  });

  const result = await service.getMessageStatus({ companyId: 12, messageId: 77 });

  assert.deepEqual(calls, [{ companyId: 12, messageId: 77 }]);
  assert.deepEqual(result, { status: 'delivered', timestamp: new Date('2026-09-01T00:00:00Z') });
});

test('CrmMessageStatusReadService passes through null when the port reports no visible message', async () => {
  const service = new CrmMessageStatusReadService({
    getMessageStatus: async () => null,
  });

  const result = await service.getMessageStatus({ companyId: 12, messageId: 999 });

  assert.equal(result, null);
});
