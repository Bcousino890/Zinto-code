import assert from 'node:assert/strict';
import test from 'node:test';

import { createCrmApiV2MessageAdapter } from '../../server/services/crm-api-v2-message-adapter';

test('dispatches an owned CRM message and persists its CRM origin metadata', async () => {
  const sent: unknown[] = [];
  const updated: unknown[] = [];
  const adapter = createCrmApiV2MessageAdapter({
    crmIntegrationBelongsToCompany: async () => true,
    getMessageById: async () => ({
      id: 42,
      metadata: { existing: 'value' },
    }),
    updateMessage: async (_id, updates) => {
      updated.push(updates);
      return { id: 42 };
    },
    sendMessage: async (companyId, request) => {
      sent.push({ companyId, request });
      return { id: 42 };
    },
    sendMedia: async () => {
      throw new Error('sendMedia should not be called for a text message');
    },
  });

  const result = await adapter.send({
    companyId: 12,
    integrationId: 3,
    channelId: 44,
    to: '+56912345678',
    content: 'Appointment confirmed',
    externalMessageId: 'crm-message-441',
    origin: 'crm',
  });

  assert.deepEqual(result, { id: 42 });
  assert.deepEqual(sent, [{
    companyId: 12,
    request: {
      channelId: 44,
      to: '+56912345678',
      message: 'Appointment confirmed',
      messageType: 'text',
    },
  }]);
  assert.deepEqual(updated, [{
    metadata: {
      existing: 'value',
      crm: {
        origin: 'crm',
        integrationId: 3,
        externalMessageId: 'crm-message-441',
      },
    },
  }]);
});

test('refuses dispatch when the CRM integration does not belong to the company', async () => {
  let sent = false;
  const adapter = createCrmApiV2MessageAdapter({
    crmIntegrationBelongsToCompany: async () => false,
    getMessageById: async () => undefined,
    updateMessage: async () => ({ id: 42 }),
    sendMessage: async () => {
      sent = true;
      return { id: 42 };
    },
    sendMedia: async () => {
      throw new Error('sendMedia should not be called in this test');
    },
  });

  await assert.rejects(
    adapter.send({
      companyId: 12,
      integrationId: 3,
      channelId: 44,
      to: '+56912345678',
      content: 'Appointment confirmed',
      origin: 'crm',
    }),
    /Integration does not belong to this company/,
  );
  assert.equal(sent, false);
});

test('dispatches an owned CRM media message and persists its CRM origin metadata', async () => {
  const sent: unknown[] = [];
  const updated: unknown[] = [];
  const adapter = createCrmApiV2MessageAdapter({
    crmIntegrationBelongsToCompany: async () => true,
    getMessageById: async () => ({
      id: 77,
      metadata: { existing: 'value' },
    }),
    updateMessage: async (_id, updates) => {
      updated.push(updates);
      return { id: 77 };
    },
    sendMessage: async () => {
      throw new Error('sendMessage should not be called for a media message');
    },
    sendMedia: async (companyId, request) => {
      sent.push({ companyId, request });
      return { id: 77 };
    },
  });

  const result = await adapter.sendMedia({
    companyId: 12,
    integrationId: 3,
    channelId: 44,
    to: '+56912345678',
    caption: 'Photo of the property',
    externalMessageId: 'crm-message-442',
    origin: 'crm',
    media: { url: 'https://smartbc.example.com/photo.jpg', type: 'image', filename: 'photo.jpg' },
  });

  assert.deepEqual(result, { id: 77 });
  assert.deepEqual(sent, [{
    companyId: 12,
    request: {
      channelId: 44,
      to: '+56912345678',
      mediaType: 'image',
      mediaUrl: 'https://smartbc.example.com/photo.jpg',
      caption: 'Photo of the property',
      filename: 'photo.jpg',
    },
  }]);
  assert.deepEqual(updated, [{
    metadata: {
      existing: 'value',
      crm: {
        origin: 'crm',
        integrationId: 3,
        externalMessageId: 'crm-message-442',
      },
    },
  }]);
});

test('refuses media dispatch when the CRM integration does not belong to the company', async () => {
  let sent = false;
  const adapter = createCrmApiV2MessageAdapter({
    crmIntegrationBelongsToCompany: async () => false,
    getMessageById: async () => undefined,
    updateMessage: async () => ({ id: 77 }),
    sendMessage: async () => {
      throw new Error('sendMessage should not be called in this test');
    },
    sendMedia: async () => {
      sent = true;
      return { id: 77 };
    },
  });

  await assert.rejects(
    adapter.sendMedia({
      companyId: 12,
      integrationId: 3,
      channelId: 44,
      to: '+56912345678',
      origin: 'crm',
      media: { url: 'https://smartbc.example.com/photo.jpg', type: 'image' },
    }),
    /Integration does not belong to this company/,
  );
  assert.equal(sent, false);
});
