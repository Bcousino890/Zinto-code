import assert from 'node:assert/strict';
import test from 'node:test';

import {
  crmWebhookMediaPayload,
  crmWebhookContactAvatarField,
  crmWebhookMessageMetadataPayload,
} from '../../server/services/crm-webhook-message-payload';

test('crmWebhookMediaPayload omits media entirely for a plain-text message', () => {
  assert.deepEqual(crmWebhookMediaPayload({ mediaUrl: null, type: 'text' }), {});
});

test('crmWebhookMediaPayload builds a downloadable URL and MIME type for a media message', () => {
  const result = crmWebhookMediaPayload({ mediaUrl: '/media/image/abc123.jpg', type: 'image' });
  assert.equal(result.media?.type, 'image');
  assert.equal(result.media?.mime_type, 'image/jpeg');
  assert.ok(result.media?.url.includes('abc123.jpg'));
});

test('crmWebhookContactAvatarField omits avatar_url when there is no photo on file', () => {
  assert.deepEqual(crmWebhookContactAvatarField(null), {});
  assert.deepEqual(crmWebhookContactAvatarField(undefined), {});
});

test('crmWebhookContactAvatarField builds a downloadable URL when a photo is on file', () => {
  const result = crmWebhookContactAvatarField('/media/profile_pictures/xyz.jpg');
  assert.ok(result.avatar_url?.includes('xyz.jpg'));
});

test('crmWebhookMessageMetadataPayload returns {} for a plain-text message with no metadata', () => {
  assert.deepEqual(crmWebhookMessageMetadataPayload({ metadata: null }), {});
  assert.deepEqual(crmWebhookMessageMetadataPayload({ metadata: undefined }), {});
});

test('crmWebhookMessageMetadataPayload tolerates malformed metadata instead of throwing', () => {
  assert.deepEqual(crmWebhookMessageMetadataPayload({ metadata: '{not valid json' }), {});
  assert.deepEqual(crmWebhookMessageMetadataPayload({ metadata: 42 }), {});
});

test('crmWebhookMessageMetadataPayload surfaces a button reply', () => {
  const result = crmWebhookMessageMetadataPayload({ metadata: { button: { payload: 'opt_1', text: 'Sí, confirmo' } } });
  assert.deepEqual(result, { button: { payload: 'opt_1', text: 'Sí, confirmo' } });
});

test('crmWebhookMessageMetadataPayload surfaces a list reply, including an optional description', () => {
  const result = crmWebhookMessageMetadataPayload({ metadata: { list: { payload: 'row_2', text: 'Plan Pro', description: 'Hasta 10 usuarios' } } });
  assert.deepEqual(result, { list: { payload: 'row_2', text: 'Plan Pro', description: 'Hasta 10 usuarios' } });
});

test('crmWebhookMessageMetadataPayload surfaces a resolved reaction with its Zinto message id', () => {
  const result = crmWebhookMessageMetadataPayload({ metadata: { reaction: { emoji: '👍', messageId: 501 } } });
  assert.deepEqual(result, { reaction: { emoji: '👍', message_id: 501 } });
});

test('crmWebhookMessageMetadataPayload surfaces a reaction removal (emoji: null) and omits message_id when unresolved', () => {
  const result = crmWebhookMessageMetadataPayload({ metadata: { reaction: { emoji: null, externalMessageId: 'wamid.UNKNOWN' } } });
  assert.deepEqual(result, { reaction: { emoji: null } });
  assert.ok(!('message_id' in result.reaction!));
});

test('crmWebhookMessageMetadataPayload surfaces shared contact cards', () => {
  const result = crmWebhookMessageMetadataPayload({
    metadata: { contacts: [{ name: 'Ada Lovelace', phones: ['+15551234567'], emails: ['ada@example.com'] }] },
  });
  assert.deepEqual(result, { contacts: [{ name: 'Ada Lovelace', phones: ['+15551234567'], emails: ['ada@example.com'] }] });
});

test('crmWebhookMessageMetadataPayload omits emails entirely when a shared contact has none', () => {
  const result = crmWebhookMessageMetadataPayload({ metadata: { contacts: [{ name: 'Ada Lovelace', phones: ['+15551234567'] }] } });
  assert.deepEqual(result, { contacts: [{ name: 'Ada Lovelace', phones: ['+15551234567'] }] });
});

test('crmWebhookMessageMetadataPayload surfaces structured location, omitting name/address when absent', () => {
  assert.deepEqual(
    crmWebhookMessageMetadataPayload({ metadata: { location: { latitude: -33.45, longitude: -70.66, name: 'Oficina', address: 'Av. Siempre Viva 123' } } }),
    { location: { latitude: -33.45, longitude: -70.66, name: 'Oficina', address: 'Av. Siempre Viva 123' } },
  );
  assert.deepEqual(
    crmWebhookMessageMetadataPayload({ metadata: { location: { latitude: -33.45, longitude: -70.66 } } }),
    { location: { latitude: -33.45, longitude: -70.66 } },
  );
});

test('crmWebhookMessageMetadataPayload surfaces a reply-to reference only when it resolved to a Zinto message id', () => {
  assert.deepEqual(crmWebhookMessageMetadataPayload({ metadata: { replyTo: { messageId: 88, externalMessageId: 'wamid.ABC' } } }), { reply_to: { message_id: 88 } });
  assert.deepEqual(crmWebhookMessageMetadataPayload({ metadata: { replyTo: { externalMessageId: 'wamid.ABC' } } }), {});
});

test('crmWebhookMessageMetadataPayload combines multiple fields and ignores unrelated metadata keys', () => {
  const result = crmWebhookMessageMetadataPayload({
    metadata: JSON.stringify({
      messageId: 'wamid.SOMETHING',
      timestamp: 1234567890,
      reaction: { emoji: '❤️', messageId: 12 },
      replyTo: { messageId: 34, externalMessageId: 'wamid.OTHER' },
    }),
  });
  assert.deepEqual(result, {
    reaction: { emoji: '❤️', message_id: 12 },
    reply_to: { message_id: 34 },
  });
});

test('crmWebhookMessageMetadataPayload ignores malformed button/list/reaction shapes rather than guessing', () => {
  assert.deepEqual(crmWebhookMessageMetadataPayload({ metadata: { button: { payload: 'opt_1' } } }), {});
  assert.deepEqual(crmWebhookMessageMetadataPayload({ metadata: { reaction: { emoji: 42 } } }), {});
  assert.deepEqual(crmWebhookMessageMetadataPayload({ metadata: { contacts: 'not an array' } }), {});
  assert.deepEqual(crmWebhookMessageMetadataPayload({ metadata: { location: { latitude: 'not a number', longitude: -70 } } }), {});
});
