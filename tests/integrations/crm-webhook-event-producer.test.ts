import assert from 'node:assert/strict';
import test from 'node:test';

import { publishCrmEvent, type CrmWebhookEventProducerPort } from '../../server/services/crm-webhook-event-producer';

function fakePort(integrations: Array<{
  id: number;
  status: string;
  webhookUrl: string | null;
  webhookSecretEncrypted: string | null;
  scopes: unknown;
}>) {
  const enqueued: Array<{ companyId: number; integrationId: number; type: string; origin: string; payload: Record<string, unknown> }> = [];
  const port: CrmWebhookEventProducerPort = {
    getCrmIntegrationsByCompanyId: async () => integrations,
    enqueueCrmWebhookEvent: async (input) => { enqueued.push(input); },
  };
  return { port, enqueued };
}

test('enqueues an event only for active integrations holding the required scope', async () => {
  const { port, enqueued } = fakePort([
    { id: 1, status: 'active', webhookUrl: 'https://a.example.com/hook', webhookSecretEncrypted: 'enc', scopes: ['messages:read'] },
    { id: 2, status: 'active', webhookUrl: 'https://b.example.com/hook', webhookSecretEncrypted: 'enc', scopes: ['contacts:write'] },
  ]);

  await publishCrmEvent(port, 12, 'message.received', { message_id: 501 });

  assert.deepEqual(enqueued, [
    { companyId: 12, integrationId: 1, type: 'message.received', origin: 'zinto', payload: { message_id: 501 } },
  ]);
});

test('skips an integration missing a webhook URL or secret even when active with scope', async () => {
  const { port, enqueued } = fakePort([
    { id: 1, status: 'active', webhookUrl: null, webhookSecretEncrypted: 'enc', scopes: ['messages:read'] },
    { id: 2, status: 'active', webhookUrl: 'https://b.example.com/hook', webhookSecretEncrypted: null, scopes: ['messages:read'] },
  ]);

  await publishCrmEvent(port, 12, 'message.received', {});

  assert.deepEqual(enqueued, []);
});

test('skips a draft or inactive integration even when it has scope and a webhook configured', async () => {
  const { port, enqueued } = fakePort([
    { id: 1, status: 'draft', webhookUrl: 'https://a.example.com/hook', webhookSecretEncrypted: 'enc', scopes: ['messages:read'] },
    { id: 2, status: 'inactive', webhookUrl: 'https://b.example.com/hook', webhookSecretEncrypted: 'enc', scopes: ['messages:read'] },
  ]);

  await publishCrmEvent(port, 12, 'message.sent', {});

  assert.deepEqual(enqueued, []);
});

test('a wildcard scope receives every gated event type', async () => {
  const { port, enqueued } = fakePort([
    { id: 7, status: 'active', webhookUrl: 'https://a.example.com/hook', webhookSecretEncrypted: 'enc', scopes: ['*'] },
  ]);

  await publishCrmEvent(port, 12, 'message.delivered', {});

  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0].type, 'message.delivered');
});

test('does nothing for an event type with no scope mapping', async () => {
  const { port, enqueued } = fakePort([
    { id: 1, status: 'active', webhookUrl: 'https://a.example.com/hook', webhookSecretEncrypted: 'enc', scopes: ['*'] },
  ]);

  await publishCrmEvent(port, 12, 'contact.updated', {});

  assert.deepEqual(enqueued, []);
});

test('never throws when the port rejects', async () => {
  const port: CrmWebhookEventProducerPort = {
    getCrmIntegrationsByCompanyId: async () => { throw new Error('db down'); },
    enqueueCrmWebhookEvent: async () => { throw new Error('must not be called'); },
  };

  await assert.doesNotReject(() => publishCrmEvent(port, 12, 'message.received', {}));
});
