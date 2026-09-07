import assert from 'node:assert/strict';
import test from 'node:test';

import { buildWebhookDelivery } from '../../server/services/integration-webhook-service';

test('creates a signed webhook delivery from the durable CRM event', () => {
  const delivery = buildWebhookDelivery({
    url: 'https://customer-crm.example/webhooks/zinto',
    secret: 'integration-secret',
    event: {
      id: 'evt_123',
      type: 'message.received',
      occurredAt: '2026-09-07T02:47:53.000Z',
      companyId: 42,
      integrationId: 7,
      origin: 'zinto',
      data: { messageId: 'msg_123' },
    },
  });

  assert.equal(delivery.url, 'https://customer-crm.example/webhooks/zinto');
  assert.equal(delivery.headers['X-Zinto-Event-Id'], 'evt_123');
  assert.equal(delivery.headers['X-Zinto-Timestamp'], '2026-09-07T02:47:53.000Z');
  assert.equal(delivery.headers['Content-Type'], 'application/json');
  assert.equal(
    delivery.headers['X-Zinto-Signature'],
    'v1=cf9501dad3e5f0bbcbb87e83d377f47b8ce2000157499fc4e688d51da0ffd71b'
  );
  assert.deepEqual(JSON.parse(delivery.body), {
    id: 'evt_123',
    type: 'message.received',
    occurred_at: '2026-09-07T02:47:53.000Z',
    company_id: 42,
    integration_id: 7,
    origin: 'zinto',
    data: { messageId: 'msg_123' },
  });
});

test('rejects a non-HTTPS CRM webhook endpoint', () => {
  assert.throws(
    () => buildWebhookDelivery({
      url: 'http://customer-crm.example/webhooks/zinto',
      secret: 'integration-secret',
      event: {
        id: 'evt_123', type: 'contact.updated', occurredAt: '2026-09-07T02:47:53.000Z',
        companyId: 42, integrationId: 7, origin: 'zinto', data: {},
      },
    }),
    /Webhook URL must use HTTPS/
  );
});
