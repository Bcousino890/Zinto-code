import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseWhatsAppLocationMetadata,
  parseWhatsAppSharedContacts,
  summarizeWhatsAppSharedContacts,
  parseWhatsAppReaction,
} from '../../server/services/channels/whatsapp-official-inbound-parsing';

test('parseWhatsAppLocationMetadata captures coordinates and optional fields', () => {
  assert.deepEqual(
    parseWhatsAppLocationMetadata({ latitude: -33.45, longitude: -70.66, name: 'Oficina', address: 'Av. Siempre Viva 123' }),
    { latitude: -33.45, longitude: -70.66, name: 'Oficina', address: 'Av. Siempre Viva 123' },
  );
});

test('parseWhatsAppLocationMetadata omits name/address when Meta did not send them', () => {
  assert.deepEqual(parseWhatsAppLocationMetadata({ latitude: -33.45, longitude: -70.66 }), { latitude: -33.45, longitude: -70.66 });
});

test('parseWhatsAppLocationMetadata returns undefined for missing/malformed coordinates', () => {
  assert.equal(parseWhatsAppLocationMetadata(undefined), undefined);
  assert.equal(parseWhatsAppLocationMetadata(null), undefined);
  assert.equal(parseWhatsAppLocationMetadata({ latitude: '-33.45', longitude: -70.66 }), undefined);
  assert.equal(parseWhatsAppLocationMetadata({ longitude: -70.66 }), undefined);
});

test('parseWhatsAppSharedContacts maps Meta\'s contact card shape, filtering out non-string phones/emails', () => {
  const result = parseWhatsAppSharedContacts([
    {
      name: { formatted_name: 'Ada Lovelace' },
      phones: [{ phone: '+15551234567' }, { phone: null }],
      emails: [{ email: 'ada@example.com' }],
    },
  ]);
  assert.deepEqual(result, [{ name: 'Ada Lovelace', phones: ['+15551234567'], emails: ['ada@example.com'] }]);
});

test('parseWhatsAppSharedContacts omits emails entirely when there are none, and defaults name to null', () => {
  const result = parseWhatsAppSharedContacts([{ phones: [{ phone: '+15551234567' }] }]);
  assert.deepEqual(result, [{ name: null, phones: ['+15551234567'] }]);
  assert.ok(!('emails' in result[0]));
});

test('parseWhatsAppSharedContacts returns [] for a non-array input', () => {
  assert.deepEqual(parseWhatsAppSharedContacts(undefined), []);
  assert.deepEqual(parseWhatsAppSharedContacts('not an array'), []);
});

test('summarizeWhatsAppSharedContacts joins names, falling back to a fixed string when every name is missing', () => {
  assert.equal(summarizeWhatsAppSharedContacts([{ name: 'Ada Lovelace', phones: [] }, { name: 'Grace Hopper', phones: [] }]), 'Ada Lovelace, Grace Hopper');
  assert.equal(summarizeWhatsAppSharedContacts([{ name: null, phones: [] }]), 'Shared contact card');
  assert.equal(summarizeWhatsAppSharedContacts([]), 'Shared contact card');
});

test('parseWhatsAppReaction captures emoji and the target wamid', () => {
  assert.deepEqual(parseWhatsAppReaction({ emoji: '👍', message_id: 'wamid.ABC123' }), { emoji: '👍', externalMessageId: 'wamid.ABC123' });
});

test('parseWhatsAppReaction treats an empty/missing emoji as a removed reaction (null)', () => {
  assert.deepEqual(parseWhatsAppReaction({ emoji: '', message_id: 'wamid.ABC123' }), { emoji: null, externalMessageId: 'wamid.ABC123' });
  assert.deepEqual(parseWhatsAppReaction({ message_id: 'wamid.ABC123' }), { emoji: null, externalMessageId: 'wamid.ABC123' });
});

test('parseWhatsAppReaction tolerates a missing/malformed reaction object', () => {
  assert.deepEqual(parseWhatsAppReaction(undefined), { emoji: null, externalMessageId: null });
  assert.deepEqual(parseWhatsAppReaction({ emoji: 42, message_id: 99 }), { emoji: null, externalMessageId: null });
});
