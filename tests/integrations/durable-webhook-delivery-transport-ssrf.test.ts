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

test('does not follow a redirect from a validated destination to a private address', async () => {
  // The exact bypass an adversarial review found: a webhook URL that passes
  // validation (a public IP-literal) but whose server responds with a 302
  // pointing at an internal address. fetch()'s default redirect handling
  // would follow this automatically; redirect: 'manual' plus re-validating
  // the Location header must stop it here instead.
  const calls: string[] = [];
  const transport = createFetchWebhookDeliveryTransport(async (url) => {
    calls.push(String(url));
    if (String(url) === 'https://1.1.1.1/webhooks/zinto') {
      return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } });
    }
    throw new Error(`must not be reached: ${url}`);
  });

  const result = await transport.deliver(fakeDelivery('https://1.1.1.1/webhooks/zinto'));

  assert.deepEqual(calls, ['https://1.1.1.1/webhooks/zinto'], 'must stop at the first hop, never call fetch on the redirect target');
  assert.deepEqual(result, { networkError: true });
});

test('follows a redirect between two validated public destinations', async () => {
  const calls: string[] = [];
  const transport = createFetchWebhookDeliveryTransport(async (url) => {
    calls.push(String(url));
    if (String(url) === 'https://1.1.1.1/webhooks/zinto') {
      return new Response(null, { status: 301, headers: { location: 'https://9.9.9.9/webhooks/zinto-final' } });
    }
    return new Response('ok', { status: 200 });
  });

  const result = await transport.deliver(fakeDelivery('https://1.1.1.1/webhooks/zinto'));

  assert.deepEqual(calls, ['https://1.1.1.1/webhooks/zinto', 'https://9.9.9.9/webhooks/zinto-final']);
  assert.deepEqual(result, { statusCode: 200, retryAfterSeconds: undefined });
});

test('gives up after too many redirects instead of looping forever', async () => {
  let calls = 0;
  const transport = createFetchWebhookDeliveryTransport(async () => {
    calls++;
    return new Response(null, { status: 302, headers: { location: 'https://1.1.1.1/next' } });
  });

  const result = await transport.deliver(fakeDelivery('https://1.1.1.1/webhooks/zinto'));

  assert.ok(calls <= 6, `must cap redirect hops, got ${calls} calls`);
  assert.deepEqual(result, { networkError: true });
});
