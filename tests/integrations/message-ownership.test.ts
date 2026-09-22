import assert from 'node:assert/strict';
import test from 'node:test';

import { decideMessageExternalIdAccess } from '../../server/services/message-ownership';

test('grants access to a message with a wamid that belongs to the caller\'s own company', () => {
  const result = decideMessageExternalIdAccess(
    { conversationId: 501, externalId: 'wamid.ABC123' },
    { companyId: 12 },
    12,
  );
  assert.deepEqual(result, { ok: true, externalId: 'wamid.ABC123' });
});

test('denies access when the message does not exist, without distinguishing it from a wrong-company message', () => {
  const notFound = decideMessageExternalIdAccess(undefined, undefined, 12);
  const wrongCompany = decideMessageExternalIdAccess(
    { conversationId: 501, externalId: 'wamid.ABC123' },
    { companyId: 99 },
    12,
  );
  assert.deepEqual(notFound, { ok: false, reason: 'not_found_or_denied' });
  assert.deepEqual(wrongCompany, { ok: false, reason: 'not_found_or_denied' });
  assert.deepEqual(notFound, wrongCompany, 'not-found and wrong-company must be indistinguishable to the caller');
});

test('denies access when the message\'s conversation is missing entirely', () => {
  const result = decideMessageExternalIdAccess({ conversationId: 501, externalId: 'wamid.ABC123' }, undefined, 12);
  assert.deepEqual(result, { ok: false, reason: 'not_found_or_denied' });
});

test('denies access with a distinct reason when the message has no WhatsApp id on file', () => {
  const result = decideMessageExternalIdAccess(
    { conversationId: 501, externalId: null },
    { companyId: 12 },
    12,
  );
  assert.deepEqual(result, { ok: false, reason: 'no_external_id' });
});

test('a null companyId on the conversation is never treated as matching the caller\'s companyId', () => {
  const result = decideMessageExternalIdAccess(
    { conversationId: 501, externalId: 'wamid.ABC123' },
    { companyId: null },
    12,
  );
  assert.deepEqual(result, { ok: false, reason: 'not_found_or_denied' });
});
