import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { ApiKey } from '@shared/schema';

// `server/middleware/api-auth.ts` imports the `storage` singleton, which transitively imports
// `server/db.ts`. That module builds a `pg.Pool` at import time using `secureEnv.getDatabaseUrl()`,
// which throws synchronously unless `DATABASE_URL` is set. It never actually connects unless a
// query runs, so a syntactically-valid placeholder is enough to let the module load; every
// `storage` method this test exercises is stubbed below so no real query is ever issued.
//
// Static `import` declarations are hoisted above all other top-level code (even code textually
// above them), so setting `process.env` first only works if the modules that read it are loaded
// via a dynamic `import()` *after* that assignment runs - hence the awaited imports below instead
// of static ones for these two modules specifically.
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/testdb';

const {
  authenticateApiKey,
  isFailedAuthThrottled,
  recordFailedAuthAttempt,
  resetFailedAuthAttempts,
  __resetFailedAuthThrottleForTests,
} = await import('../../server/middleware/api-auth');
const { storage } = await import('../../server/storage');

function fakeApiKeyRecord(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: 1,
    companyId: 1,
    userId: 1,
    name: 'test key',
    keyHash: 'unused-in-tests',
    keyPrefix: 'aaaaaaaa',
    isActive: true,
    lastUsedAt: null,
    expiresAt: null,
    allowedIps: null,
    permissions: ['*'],
    rateLimitPerMinute: 300,
    rateLimitPerHour: 5000,
    rateLimitPerDay: 50000,
    webhookUrl: null,
    webhookSecret: null,
    webhookEvents: [],
    features: {},
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as ApiKey;
}

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const app = express();
  // Simulates requests arriving through a proxy/load balancer, and lets each test drive
  // `req.ip` (and therefore the per-IP throttle) via the `X-Forwarded-For` header.
  app.set('trust proxy', true);
  app.get('/protected', authenticateApiKey, (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });
  // Fallback error handler so a thrown error surfaces as a response instead of hanging the test.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: 'unexpected', message: String(err) });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function bearer(hexChar: string): string {
  return `Bearer pcp_${hexChar.repeat(64)}`;
}

test('repeated failed authentication attempts from the same IP eventually get throttled with 429', async () => {
  __resetFailedAuthThrottleForTests();
  storage.getApiKeyByHash = async () => undefined as unknown as ApiKey;
  storage.updateApiKeyLastUsed = async () => undefined as unknown as ApiKey;

  await withServer(async (baseUrl) => {
    const ip = '10.0.0.1';
    let sawThrottled = false;

    for (let i = 0; i < 25; i++) {
      const res = await fetch(`${baseUrl}/protected`, {
        headers: {
          Authorization: bearer('a'),
          'X-Forwarded-For': ip,
        },
      });

      if (res.status === 429) {
        sawThrottled = true;
        const body = await res.json() as { error: string };
        assert.equal(body.error, 'TOO_MANY_FAILED_ATTEMPTS');
        assert.ok(res.headers.get('retry-after'), 'expected a Retry-After header on the 429');
        break;
      }

      // Every attempt before the throttle kicks in should fail for the *documented* reason
      // (API_KEY_NOT_FOUND here), not be silently swallowed.
      assert.equal(res.status, 401);
      const body = await res.json() as { error: string };
      assert.equal(body.error, 'API_KEY_NOT_FOUND');
    }

    assert.ok(sawThrottled, 'expected repeated failed attempts to eventually receive a 429');
  });
});

test('a successful authentication resets the failed-attempt counter for that IP', async () => {
  __resetFailedAuthThrottleForTests();
  const ip = '10.0.0.2';

  await withServer(async (baseUrl) => {
    // 19 failed attempts: one under the documented limit of 20 per 5 minutes.
    storage.getApiKeyByHash = async () => undefined as unknown as ApiKey;
    storage.updateApiKeyLastUsed = async () => undefined as unknown as ApiKey;
    for (let i = 0; i < 19; i++) {
      const res = await fetch(`${baseUrl}/protected`, {
        headers: { Authorization: bearer('a'), 'X-Forwarded-For': ip },
      });
      assert.equal(res.status, 401, `attempt ${i} should fail with the normal auth error, not be throttled yet`);
    }

    // One successful authentication - this should reset the counter rather than count toward it.
    storage.getApiKeyByHash = async () => fakeApiKeyRecord();
    const successRes = await fetch(`${baseUrl}/protected`, {
      headers: { Authorization: bearer('b'), 'X-Forwarded-For': ip },
    });
    assert.equal(successRes.status, 200);

    // 19 more failed attempts. If the earlier failures plus this batch were counted together
    // (19 + 19 = 38), this would already be throttled well before the 19th of this batch. Seeing
    // plain 401s here proves the successful auth reset the counter instead of merely pausing it.
    storage.getApiKeyByHash = async () => undefined as unknown as ApiKey;
    for (let i = 0; i < 19; i++) {
      const res = await fetch(`${baseUrl}/protected`, {
        headers: { Authorization: bearer('a'), 'X-Forwarded-For': ip },
      });
      assert.equal(res.status, 401, `post-reset attempt ${i} should not be throttled`);
    }
  });
});

test('different client IPs have independent failed-attempt counters', async () => {
  __resetFailedAuthThrottleForTests();
  storage.getApiKeyByHash = async () => undefined as unknown as ApiKey;
  storage.updateApiKeyLastUsed = async () => undefined as unknown as ApiKey;

  await withServer(async (baseUrl) => {
    const throttledIp = '10.0.0.3';
    const otherIp = '10.0.0.4';

    // Exhaust the budget for `throttledIp` only.
    for (let i = 0; i < 20; i++) {
      const res = await fetch(`${baseUrl}/protected`, {
        headers: { Authorization: bearer('a'), 'X-Forwarded-For': throttledIp },
      });
      assert.equal(res.status, 401);
    }
    const throttledRes = await fetch(`${baseUrl}/protected`, {
      headers: { Authorization: bearer('a'), 'X-Forwarded-For': throttledIp },
    });
    assert.equal(throttledRes.status, 429);

    // A different IP should be entirely unaffected by `throttledIp`'s failures.
    const otherRes = await fetch(`${baseUrl}/protected`, {
      headers: { Authorization: bearer('a'), 'X-Forwarded-For': otherIp },
    });
    assert.equal(otherRes.status, 401);
    const otherBody = await otherRes.json() as { error: string };
    assert.equal(otherBody.error, 'API_KEY_NOT_FOUND');
  });
});

// --- Pure counter/throttle logic, independent of Express and `storage' entirely. ---

test('isFailedAuthThrottled / recordFailedAuthAttempt: throttles only once the limit is exceeded', () => {
  __resetFailedAuthThrottleForTests();
  const ip = '203.0.113.1';
  const t0 = 1_700_000_000_000;

  for (let i = 0; i < 20; i++) {
    assert.equal(isFailedAuthThrottled(ip, t0).throttled, false, `should not be throttled before attempt ${i}`);
    recordFailedAuthAttempt(ip, t0);
  }

  const afterLimit = isFailedAuthThrottled(ip, t0);
  assert.equal(afterLimit.throttled, true);
  assert.ok(afterLimit.retryAfterSeconds > 0);
});

test('isFailedAuthThrottled: window expiry clears the throttle', () => {
  __resetFailedAuthThrottleForTests();
  const ip = '203.0.113.2';
  const t0 = 1_700_000_000_000;
  const FIVE_MINUTES_MS = 5 * 60 * 1000;

  for (let i = 0; i < 20; i++) {
    recordFailedAuthAttempt(ip, t0);
  }
  assert.equal(isFailedAuthThrottled(ip, t0).throttled, true);

  // Just after the window elapses, the throttle should be gone.
  assert.equal(isFailedAuthThrottled(ip, t0 + FIVE_MINUTES_MS + 1).throttled, false);
});

test('resetFailedAuthAttempts: clears an IP\'s counter immediately', () => {
  __resetFailedAuthThrottleForTests();
  const ip = '203.0.113.3';
  const t0 = 1_700_000_000_000;

  for (let i = 0; i < 20; i++) {
    recordFailedAuthAttempt(ip, t0);
  }
  assert.equal(isFailedAuthThrottled(ip, t0).throttled, true);

  resetFailedAuthAttempts(ip);
  assert.equal(isFailedAuthThrottled(ip, t0).throttled, false);
});
