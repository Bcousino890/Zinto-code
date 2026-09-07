import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import express, { type NextFunction, type Request, type Response } from 'express';
import { createApiV2Router } from '../../server/routes/api-v2';
import type { CrmContactSyncService } from '../../server/services/crm-contact-sync-service';

type MessageSync = {
  send(input: {
    companyId: number;
    integrationId: number;
    channelId: number;
    to: string;
    content: string;
    externalMessageId?: string;
    origin: 'crm';
  }): Promise<{ id: string | number }>;
};

async function withServer(
  middleware: (req: Request, res: Response, next: NextFunction) => void,
  run: (baseUrl: string) => Promise<void>,
  contactSync?: Pick<CrmContactSyncService, 'upsert'>,
  messageSync?: MessageSync,
) {
  const app = express();
  app.use(express.json());
  app.use('/api/v2', createApiV2Router({ authenticate: middleware, contactSync, messageSync }));
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

test('upserts a contact from a permitted CRM without exposing another company', async () => {
  const received: unknown[] = [];
  const contactSync = {
    upsert: async (input: unknown) => {
      received.push(input);
      return { created: true, contact: { id: 91, name: 'Andrea Díaz' } };
    },
  } as Pick<CrmContactSyncService, 'upsert'>;
  await withServer((req, _res, next) => {
    req.companyId = 12;
    req.apiKey = { permissions: ['contacts:write'] } as any;
    next();
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v2/contacts/hubspot-441`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Zinto-Integration-Id': '3' },
      body: JSON.stringify({ name: 'Andrea Díaz', phone: '+56912345678' }),
    });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { data: { id: 91, name: 'Andrea Díaz' }, created: true });
  }, contactSync);
  assert.deepEqual(received, [{
    companyId: 12, integrationId: 3, externalId: 'hubspot-441',
    contact: { name: 'Andrea Díaz', phone: '+56912345678' },
  }]);
});

test('queues a normalized CRM message from a permitted integration', async () => {
  const received: unknown[] = [];
  const messageSync: MessageSync = {
    send: async (input) => {
      received.push(input);
      return { id: 'message-741' };
    },
  };

  await withServer((req, _res, next) => {
    req.companyId = 12;
    req.apiKey = { permissions: ['messages:send'] } as any;
    next();
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v2/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Zinto-Integration-Id': '3' },
      body: JSON.stringify({
        channelId: 44,
        recipient: ' +56912345678 ',
        text: ' Appointment confirmed ',
        external_message_id: 'crm-message-441',
      }),
    });

    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), {
      data: { id: 'message-741', origin: 'crm', external_message_id: 'crm-message-441' },
    });
  }, undefined, messageSync);

  assert.deepEqual(received, [{
    companyId: 12,
    integrationId: 3,
    channelId: 44,
    to: '+56912345678',
    content: 'Appointment confirmed',
    externalMessageId: 'crm-message-441',
    origin: 'crm',
  }]);
});

test('does not expose message dispatch when no message sync dependency is supplied', async () => {
  await withServer((_req, _res, next) => next(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v2/messages`, { method: 'POST' });
    assert.equal(response.status, 404);
  });
});

test('does not send a CRM message without messages:send permission', async () => {
  await withServer((req, _res, next) => {
    req.companyId = 12;
    req.apiKey = { permissions: ['contacts:write'] } as any;
    next();
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v2/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Zinto-Integration-Id': '3' },
      body: JSON.stringify({ channelId: 44, recipient: '+56912345678', text: 'Appointment confirmed' }),
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'INSUFFICIENT_PERMISSIONS');
  }, undefined, { send: async () => ({ id: 1 }) });
});

test('rejects CRM messages without a positive channel ID, recipient, or text', async () => {
  const messageSync: MessageSync = { send: async () => ({ id: 1 }) };
  for (const body of [
    { channelId: 0, recipient: '+56912345678', text: 'Appointment confirmed' },
    { channelId: 44, recipient: '  ', text: 'Appointment confirmed' },
    { channelId: 44, recipient: '+56912345678', text: '  ' },
  ]) {
    await withServer((req, _res, next) => {
      req.companyId = 12;
      req.apiKey = { permissions: ['messages:send'] } as any;
      next();
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v2/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Zinto-Integration-Id': '3' },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, 'VALIDATION_ERROR');
    }, undefined, messageSync);
  }
});

test('queues a CRM message without an external message ID', async () => {
  const received: unknown[] = [];
  await withServer((req, _res, next) => {
    req.companyId = 12;
    req.apiKey = { permissions: ['messages:send'] } as any;
    next();
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v2/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Zinto-Integration-Id': '3' },
      body: JSON.stringify({ channelId: 44, recipient: '+56912345678', text: 'Appointment confirmed' }),
    });
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { data: { id: 742, origin: 'crm' } });
  }, undefined, {
    send: async (input) => {
      received.push(input);
      return { id: 742 };
    },
  });
  assert.deepEqual(received, [{
    companyId: 12,
    integrationId: 3,
    channelId: 44,
    to: '+56912345678',
    content: 'Appointment confirmed',
    origin: 'crm',
  }]);
});
