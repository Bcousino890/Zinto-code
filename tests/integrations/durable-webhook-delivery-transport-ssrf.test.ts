import assert from 'node:assert/strict';
import test from 'node:test';

import { createFetchWebhookDeliveryTransport } from '../../server/services/durable-webhook-delivery-service';

function fakeDelivery(url: string) {
  return { url, headers: { 'Content-Type': 'application/json' }, body: '{}' } as any;
}

test('blocks delivery to a loopback address instead of calling fetch', async () => {
  let fetchCalled = false;
  const transport = createFetchWebhookDeliveryTransport(async () => {
    fetchCalled = true;
    return new Response('ok', { status: 200 });
  });

  const result = await transport.deliver(fakeDelivery('http://127.0.0.1:9000/webhook'));

  assert.equal(fetchCalled, false, 'must never reach the network for a loopback destination');
  assert.deepEqual(result, { networkError: true });
});

test('blocks delivery to a private RFC1918 address instead of calling fetch', async () => {
  let fetchCalled = false;
  const transport = createFetchWebhookDeliveryTransport(async () => {
    fetchCalled = true;
    return new Response('ok', { status: 200 });
  });

  const result = await transport.deliver(fakeDelivery('http://10.0.0.5/webhook'));

  assert.equal(fetchCalled, false);
  assert.deepEqual(result, { networkError: true });
});

test('blocks delivery to the cloud metadata address instead of calling fetch', async () => {
  let fetchCalled = false;
  const transport = createFetchWebhookDeliveryTransport(async () => {
    fetchCalled = true;
    return new Response('ok', { status: 200 });
  });

  const result = await transport.deliver(fakeDelivery('http://169.254.169.254/latest/meta-data/'));

  assert.equal(fetchCalled, false);
  assert.deepEqual(result, { networkError: true });
});

test('still delivers to a normal public destination', async () => {
  // A literal public IP, not a hostname: assertPublicHttpUrl skips DNS
  // resolution for IP-literal hosts (net.isIP short-circuits it), so this
  // stays deterministic without depending on this sandbox having outbound
  // DNS access.
  const received: unknown[] = [];
  const transport = createFetchWebhookDeliveryTransport(async (url, init) => {
    received.push({ url: String(url), init });
    return new Response('ok', { status: 202, headers: { 'retry-after': '5' } });
  });

  const result = await transport.deliver(fakeDelivery('https://1.1.1.1/webhooks/zinto'));

  assert.equal(received.length, 1, 'a public destination must still reach fetch');
  assert.deepEqual(result, { statusCode: 202, retryAfterSeconds: 5 });
});
