import assert from 'node:assert/strict';
import test from 'node:test';

import { issueSessionCsrfToken, requireSessionCsrf } from '../server/middleware/csrf-protection';

function response() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

async function protect(request: Record<string, unknown>) {
  const res = response();
  let continued = false;
  await requireSessionCsrf(request as any, res as any, () => { continued = true; });
  return { res, continued };
}

test('rejects cross-site and missing-token session requests while accepting the session token from the same origin', async () => {
  const session: Record<string, unknown> = {};
  const req = {
    session,
    protocol: 'https',
    get(name: string) {
      return name === 'host' ? 'admin.zinto.test' : undefined;
    },
  };
  const token = issueSessionCsrfToken(req as any);

  const crossSite = await protect({
    ...req,
    get(name: string) {
      if (name === 'host') return 'admin.zinto.test';
      if (name === 'origin') return 'https://evil.example';
      if (name === 'x-csrf-token') return token;
      return undefined;
    },
  });
  assert.equal(crossSite.res.statusCode, 403);
  assert.equal(crossSite.continued, false);

  const missingToken = await protect({
    ...req,
    get(name: string) {
      if (name === 'host') return 'admin.zinto.test';
      if (name === 'origin') return 'https://admin.zinto.test';
      return undefined;
    },
  });
  assert.equal(missingToken.res.statusCode, 403);
  assert.equal(missingToken.continued, false);

  const valid = await protect({
    ...req,
    get(name: string) {
      if (name === 'host') return 'admin.zinto.test';
      if (name === 'referer') return 'https://admin.zinto.test/settings';
      if (name === 'x-csrf-token') return token;
      return undefined;
    },
  });
  assert.equal(valid.continued, true);
});
