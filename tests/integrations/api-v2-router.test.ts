import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import express, { type NextFunction, type Request, type Response } from 'express';
import { createApiV2Router } from '../../server/routes/api-v2';

async function withServer(
  middleware: (req: Request, res: Response, next: NextFunction) => void,
  run: (baseUrl: string) => Promise<void>,
) {
  const app = express();
  app.use('/api/v2', createApiV2Router({ authenticate: middleware }));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('reports API v2 health without requiring a CRM credential', async () => {
  await withServer((_req, _res, next) => next(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v2/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', version: 'v2' });
  });
});

test('publishes an OpenAPI document for CRM developers', async () => {
  await withServer((_req, _res, next) => next(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v2/openapi.json`);
    assert.equal(response.status, 200);
    const body = await response.json() as { openapi: string; paths: Record<string, unknown> };
    assert.equal(body.openapi, '3.1.0');
    assert.ok('/health' in body.paths);
    assert.ok('/capabilities' in body.paths);
  });
});

test('does not disclose CRM capabilities to a key without integration permission', async () => {
  await withServer((req, _res, next) => {
    req.apiKey = { permissions: ['messages:send'] } as any;
    next();
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v2/capabilities`);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'INSUFFICIENT_PERMISSIONS');
  });
});

test('exposes the supported CRM scopes to an integration administrator', async () => {
  await withServer((req, _res, next) => {
    req.apiKey = { permissions: ['integrations:manage'] } as any;
    next();
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v2/capabilities`);
    assert.equal(response.status, 200);
    const body = await response.json() as { scopes: string[]; webhookSignature: string };
    assert.ok(body.scopes.includes('contacts:write'));
    assert.equal(body.webhookSignature, 'v1=hmac-sha256(timestamp.raw_body)');
  });
});
