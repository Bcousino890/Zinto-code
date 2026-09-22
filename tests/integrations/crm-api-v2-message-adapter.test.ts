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
    sendTemplate: async () => {
      throw new Error('sendTemplate should not be called for a text message');
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
    sendTemplate: async () => {
      throw new Error('sendTemplate should not be called in this test');
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
    sendTemplate: async () => {
      throw new Error('sendTemplate should not be called for a media message');
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
    sendTemplate: async () => {
      throw new Error('sendTemplate should not be called in this test');
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

test('dispatches an owned CRM template message and persists its CRM origin metadata', async () => {
  const sent: unknown[] = [];
  const updated: unknown[] = [];
  const adapter = createCrmApiV2MessageAdapter({
    crmIntegrationBelongsToCompany: async () => true,
    getMessageById: async () => ({
      id: 91,
      metadata: { existing: 'value' },
    }),
    updateMessage: async (_id, updates) => {
      updated.push(updates);
      return { id: 91 };
    },
    sendMessage: async () => {
      throw new Error('sendMessage should not be called for a template message');
    },
    sendMedia: async () => {
      throw new Error('sendMedia should not be called for a template message');
    },
    sendTemplate: async (companyId, request) => {
      sent.push({ companyId, request });
      return { id: 91 };
    },
  });

  const result = await adapter.sendTemplate({
    companyId: 12,
    integrationId: 3,
    channelId: 44,
    to: '+56912345678',
    externalMessageId: 'crm-message-443',
    origin: 'crm',
    template: {
      name: 'appointment_confirmation',
      language: 'es',
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', text: 'Juan' }],
        },
      ],
    },
  });

  assert.deepEqual(result, { id: 91 });
  assert.deepEqual(sent, [{
    companyId: 12,
    request: {
      channelId: 44,
      to: '+56912345678',
      templateName: 'appointment_confirmation',
      templateLanguage: 'es',
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', text: 'Juan' }],
        },
      ],
    },
  }]);
  assert.deepEqual(updated, [{
    metadata: {
      existing: 'value',
      crm: {
        origin: 'crm',
        integrationId: 3,
        externalMessageId: 'crm-message-443',
      },
    },
  }]);
});

test('refuses template dispatch when the CRM integration does not belong to the company', async () => {
  let sent = false;
  const adapter = createCrmApiV2MessageAdapter({
    crmIntegrationBelongsToCompany: async () => false,
    getMessageById: async () => undefined,
    updateMessage: async () => ({ id: 91 }),
    sendMessage: async () => {
      throw new Error('sendMessage should not be called in this test');
    },
    sendMedia: async () => {
      throw new Error('sendMedia should not be called in this test');
    },
    sendTemplate: async () => {
      sent = true;
      return { id: 91 };
    },
  });

  await assert.rejects(
    adapter.sendTemplate({
      companyId: 12,
      integrationId: 3,
      channelId: 44,
      to: '+56912345678',
      origin: 'crm',
      template: { name: 'appointment_confirmation', language: 'es' },
    }),
    /Integration does not belong to this company/,
  );
  assert.equal(sent, false);
});

test('dispatches an owned CRM reaction and persists its CRM origin metadata', async () => {
  const sent: unknown[] = [];
  const updated: unknown[] = [];
  const adapter = createCrmApiV2MessageAdapter({
    crmIntegrationBelongsToCompany: async () => true,
    getMessageById: async () => ({ id: 55, metadata: { existing: 'value' } }),
    updateMessage: async (_id, updates) => { updated.push(updates); return { id: 55 }; },
    sendMessage: async () => { throw new Error('sendMessage should not be called for a reaction'); },
    sendMedia: async () => { throw new Error('sendMedia should not be called for a reaction'); },
    sendTemplate: async () => { throw new Error('sendTemplate should not be called for a reaction'); },
    sendReaction: async (companyId, request) => { sent.push({ companyId, request }); return { id: 55 }; },
  });

  const result = await adapter.sendReaction({
    companyId: 12,
    integrationId: 3,
    channelId: 44,
    to: '+56912345678',
    origin: 'crm',
    targetMessageId: 501,
    emoji: '👍',
  });

  assert.deepEqual(result, { id: 55 });
  assert.deepEqual(sent, [{ companyId: 12, request: { channelId: 44, to: '+56912345678', targetMessageId: 501, emoji: '👍' } }]);
  assert.deepEqual(updated, [{ metadata: { existing: 'value', crm: { origin: 'crm', integrationId: 3 } } }]);
});

test('refuses reaction dispatch when the CRM integration does not belong to the company', async () => {
  let sent = false;
  const adapter = createCrmApiV2MessageAdapter({
    crmIntegrationBelongsToCompany: async () => false,
    getMessageById: async () => undefined,
    updateMessage: async () => ({ id: 55 }),
    sendMessage: async () => { throw new Error('must not be called'); },
    sendMedia: async () => { throw new Error('must not be called'); },
    sendTemplate: async () => { throw new Error('must not be called'); },
    sendReaction: async () => { sent = true; return { id: 55 }; },
  });

  await assert.rejects(
    adapter.sendReaction({ companyId: 12, integrationId: 3, channelId: 44, to: '+56912345678', origin: 'crm', targetMessageId: 501, emoji: '👍' }),
    /Integration does not belong to this company/,
  );
  assert.equal(sent, false);
});

test('refuses a reaction when the integration has no reaction sender configured', async () => {
  const adapter = createCrmApiV2MessageAdapter({
    crmIntegrationBelongsToCompany: async () => true,
    getMessageById: async () => undefined,
    updateMessage: async () => ({ id: 55 }),
    sendMessage: async () => { throw new Error('must not be called'); },
    sendMedia: async () => { throw new Error('must not be called'); },
    sendTemplate: async () => { throw new Error('must not be called'); },
  });

  await assert.rejects(
    adapter.sendReaction({ companyId: 12, integrationId: 3, channelId: 44, to: '+56912345678', origin: 'crm', targetMessageId: 501, emoji: '👍' }),
    /Reactions are not configured for this integration/,
  );
});

test('dispatches an owned CRM location and persists its CRM origin metadata', async () => {
  const sent: unknown[] = [];
  const updated: unknown[] = [];
  const adapter = createCrmApiV2MessageAdapter({
    crmIntegrationBelongsToCompany: async () => true,
    getMessageById: async () => ({ id: 66, metadata: { existing: 'value' } }),
    updateMessage: async (_id, updates) => { updated.push(updates); return { id: 66 }; },
    sendMessage: async () => { throw new Error('sendMessage should not be called for a location'); },
    sendMedia: async () => { throw new Error('sendMedia should not be called for a location'); },
    sendTemplate: async () => { throw new Error('sendTemplate should not be called for a location'); },
    sendLocation: async (companyId, request) => { sent.push({ companyId, request }); return { id: 66 }; },
  });

  const result = await adapter.sendLocation({
    companyId: 12,
    integrationId: 3,
    channelId: 44,
    to: '+56912345678',
    origin: 'crm',
    location: { latitude: -33.45, longitude: -70.66, name: 'Oficina central' },
  });

  assert.deepEqual(result, { id: 66 });
  assert.deepEqual(sent, [{ companyId: 12, request: { channelId: 44, to: '+56912345678', location: { latitude: -33.45, longitude: -70.66, name: 'Oficina central' } } }]);
  assert.deepEqual(updated, [{ metadata: { existing: 'value', crm: { origin: 'crm', integrationId: 3 } } }]);
});

test('refuses location dispatch when the CRM integration does not belong to the company', async () => {
  let sent = false;
  const adapter = createCrmApiV2MessageAdapter({
    crmIntegrationBelongsToCompany: async () => false,
    getMessageById: async () => undefined,
    updateMessage: async () => ({ id: 66 }),
    sendMessage: async () => { throw new Error('must not be called'); },
    sendMedia: async () => { throw new Error('must not be called'); },
    sendTemplate: async () => { throw new Error('must not be called'); },
    sendLocation: async () => { sent = true; return { id: 66 }; },
  });

  await assert.rejects(
    adapter.sendLocation({ companyId: 12, integrationId: 3, channelId: 44, to: '+56912345678', origin: 'crm', location: { latitude: -33.45, longitude: -70.66 } }),
    /Integration does not belong to this company/,
  );
  assert.equal(sent, false);
});

test('refuses a location send when the integration has no location sender configured', async () => {
  const adapter = createCrmApiV2MessageAdapter({
    crmIntegrationBelongsToCompany: async () => true,
    getMessageById: async () => undefined,
    updateMessage: async () => ({ id: 66 }),
    sendMessage: async () => { throw new Error('must not be called'); },
    sendMedia: async () => { throw new Error('must not be called'); },
    sendTemplate: async () => { throw new Error('must not be called'); },
  });

  await assert.rejects(
    adapter.sendLocation({ companyId: 12, integrationId: 3, channelId: 44, to: '+56912345678', origin: 'crm', location: { latitude: -33.45, longitude: -70.66 } }),
    /Sending a location is not configured for this integration/,
  );
});

test('forwards replyToMessageId on a plain text send', async () => {
  const sent: unknown[] = [];
  const adapter = createCrmApiV2MessageAdapter({
    crmIntegrationBelongsToCompany: async () => true,
    getMessageById: async () => undefined,
    updateMessage: async () => ({ id: 88 }),
    sendMessage: async (companyId, request) => { sent.push({ companyId, request }); return { id: 88 }; },
    sendMedia: async () => { throw new Error('must not be called'); },
    sendTemplate: async () => { throw new Error('must not be called'); },
  });

  await adapter.send({
    companyId: 12,
    integrationId: 3,
    channelId: 44,
    to: '+56912345678',
    content: 'Sí, mañana a las 10',
    origin: 'crm',
    replyToMessageId: 501,
  });

  assert.deepEqual(sent, [{
    companyId: 12,
    request: { channelId: 44, to: '+56912345678', message: 'Sí, mañana a las 10', messageType: 'text', replyToMessageId: 501 },
  }]);
});

test('dispatches an owned CRM interactive button message and persists its CRM origin metadata', async () => {
  const sent: unknown[] = [];
  const updated: unknown[] = [];
  const adapter = createCrmApiV2MessageAdapter({
    crmIntegrationBelongsToCompany: async () => true,
    getMessageById: async () => ({ id: 71, metadata: { existing: 'value' } }),
    updateMessage: async (_id, updates) => { updated.push(updates); return { id: 71 }; },
    sendMessage: async () => { throw new Error('must not be called'); },
    sendMedia: async () => { throw new Error('must not be called'); },
    sendTemplate: async () => { throw new Error('must not be called'); },
    sendInteractiveMessage: async (companyId, request) => { sent.push({ companyId, request }); return { id: 71 }; },
  });

  const result = await adapter.sendInteractive({
    companyId: 12,
    integrationId: 3,
    channelId: 44,
    to: '+56912345678',
    origin: 'crm',
    interactiveType: 'button',
    content: { body: { text: '¿Confirmamos la cita?' } },
    options: { type: 'button', buttons: [{ id: 'yes', title: 'Sí' }, { id: 'no', title: 'No' }] },
  });

  assert.deepEqual(result, { id: 71 });
  assert.deepEqual(sent, [{
    companyId: 12,
    request: {
      channelId: 44,
      to: '+56912345678',
      interactiveType: 'button',
      content: { body: { text: '¿Confirmamos la cita?' } },
      options: { type: 'button', buttons: [{ id: 'yes', title: 'Sí' }, { id: 'no', title: 'No' }] },
    },
  }]);
  assert.deepEqual(updated, [{ metadata: { existing: 'value', crm: { origin: 'crm', integrationId: 3 } } }]);
});

test('refuses interactive dispatch when the CRM integration does not belong to the company', async () => {
  let sent = false;
  const adapter = createCrmApiV2MessageAdapter({
    crmIntegrationBelongsToCompany: async () => false,
    getMessageById: async () => undefined,
    updateMessage: async () => ({ id: 71 }),
    sendMessage: async () => { throw new Error('must not be called'); },
    sendMedia: async () => { throw new Error('must not be called'); },
    sendTemplate: async () => { throw new Error('must not be called'); },
    sendInteractiveMessage: async () => { sent = true; return { id: 71 }; },
  });

  await assert.rejects(
    adapter.sendInteractive({ companyId: 12, integrationId: 3, channelId: 44, to: '+56912345678', origin: 'crm', interactiveType: 'button', content: { body: { text: 'x' } }, options: { type: 'button', buttons: [{ id: 'a', title: 'A' }] } }),
    /Integration does not belong to this company/,
  );
  assert.equal(sent, false);
});

test('refuses an interactive send when the integration has no interactive sender configured', async () => {
  const adapter = createCrmApiV2MessageAdapter({
    crmIntegrationBelongsToCompany: async () => true,
    getMessageById: async () => undefined,
    updateMessage: async () => ({ id: 71 }),
    sendMessage: async () => { throw new Error('must not be called'); },
    sendMedia: async () => { throw new Error('must not be called'); },
    sendTemplate: async () => { throw new Error('must not be called'); },
  });

  await assert.rejects(
    adapter.sendInteractive({ companyId: 12, integrationId: 3, channelId: 44, to: '+56912345678', origin: 'crm', interactiveType: 'list', content: { body: { text: 'x' } }, options: { type: 'list', button: 'Ver opciones', sections: [{ rows: [{ id: 'a', title: 'A' }] }] } }),
    /Interactive messages are not configured for this integration/,
  );
});

test('marks a message as read for an owned integration', async () => {
  const marked: unknown[] = [];
  const adapter = createCrmApiV2MessageAdapter({
    crmIntegrationBelongsToCompany: async () => true,
    getMessageById: async () => undefined,
    updateMessage: async () => ({ id: 1 }),
    sendMessage: async () => { throw new Error('must not be called'); },
    sendMedia: async () => { throw new Error('must not be called'); },
    sendTemplate: async () => { throw new Error('must not be called'); },
    markMessageAsRead: async (companyId, request) => { marked.push({ companyId, request }); return { id: request.messageId }; },
  });

  const result = await adapter.markAsRead({ companyId: 12, integrationId: 3, messageId: 501 });

  assert.deepEqual(result, { id: 501 });
  assert.deepEqual(marked, [{ companyId: 12, request: { messageId: 501 } }]);
});

test('refuses to mark as read when the CRM integration does not belong to the company', async () => {
  let marked = false;
  const adapter = createCrmApiV2MessageAdapter({
    crmIntegrationBelongsToCompany: async () => false,
    getMessageById: async () => undefined,
    updateMessage: async () => ({ id: 1 }),
    sendMessage: async () => { throw new Error('must not be called'); },
    sendMedia: async () => { throw new Error('must not be called'); },
    sendTemplate: async () => { throw new Error('must not be called'); },
    markMessageAsRead: async () => { marked = true; return { id: 501 }; },
  });

  await assert.rejects(
    adapter.markAsRead({ companyId: 12, integrationId: 3, messageId: 501 }),
    /Integration does not belong to this company/,
  );
  assert.equal(marked, false);
});

test('refuses to mark as read when the integration has no mark-as-read sender configured', async () => {
  const adapter = createCrmApiV2MessageAdapter({
    crmIntegrationBelongsToCompany: async () => true,
    getMessageById: async () => undefined,
    updateMessage: async () => ({ id: 1 }),
    sendMessage: async () => { throw new Error('must not be called'); },
    sendMedia: async () => { throw new Error('must not be called'); },
    sendTemplate: async () => { throw new Error('must not be called'); },
  });

  await assert.rejects(
    adapter.markAsRead({ companyId: 12, integrationId: 3, messageId: 501 }),
    /Marking a message as read is not configured for this integration/,
  );
});
