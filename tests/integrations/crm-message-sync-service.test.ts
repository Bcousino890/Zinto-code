import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeOutboundCrmMessageRequest,
  shouldEmitCrmMessageWebhook,
} from '../../server/services/crm-message-sync-service';

test('normalizes an outbound Zinto message with its origin and external message ID', () => {
  const request = normalizeOutboundCrmMessageRequest({
    companyId: 12,
    integrationId: 3,
    conversationId: 44,
    content: 'Your appointment is confirmed.',
    externalMessageId: 'crm-message-441',
  });

  assert.deepEqual(request, {
    companyId: 12,
    integrationId: 3,
    conversationId: 44,
    content: 'Your appointment is confirmed.',
    origin: 'zinto',
    externalMessageId: 'crm-message-441',
  });
});

test('preserves a supplied non-CRM origin for an outbound CRM message', () => {
  const request = normalizeOutboundCrmMessageRequest({
    companyId: 12,
    integrationId: 3,
    conversationId: 44,
    content: 'System notification',
    origin: 'system',
    externalMessageId: 'notification-441',
  });

  assert.equal(request.origin, 'system');
  assert.equal(request.externalMessageId, 'notification-441');
});

test('does not re-emit a message webhook that originated from the CRM', () => {
  assert.equal(shouldEmitCrmMessageWebhook({ origin: 'crm' }), false);
});

test('emits message webhooks for Zinto and system-origin messages', () => {
  assert.equal(shouldEmitCrmMessageWebhook({ origin: 'zinto' }), true);
  assert.equal(shouldEmitCrmMessageWebhook({ origin: 'system' }), true);
});
