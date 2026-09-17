import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import express, { type NextFunction, type Request, type Response } from 'express';
import { createApiV2Router } from '../../server/routes/api-v2';
import type { CampaignBatchItem } from '../../server/services/campaign-batch-validation';
import type { CrmContactSyncService } from '../../server/services/crm-contact-sync-service';
import type { AppointmentV2Service } from '../../server/services/appointment-v2-service';
import type { CrmDealPipelineApiV2Service } from '../../server/services/crm-deal-pipeline-api-v2-service';
import type {
  InitialCrmSynchronizationInput,
  InitialCrmSynchronizationPlan,
} from '../../server/services/initial-crm-synchronization-plan';
import { planInitialCrmSynchronization } from '../../server/services/initial-crm-synchronization-plan';

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
  sendMedia?(input: {
    companyId: number;
    integrationId: number;
    channelId: number;
    to: string;
    caption?: string;
    externalMessageId?: string;
    origin: 'crm';
    media: { url: string; type: 'image' | 'video' | 'audio' | 'document'; filename?: string };
  }): Promise<{ id: string | number }>;
  sendTemplate?(input: {
    companyId: number;
    integrationId: number;
    channelId: number;
    to: string;
    externalMessageId?: string;
    origin: 'crm';
    template: { name: string; language: string; components?: unknown[] };
  }): Promise<{ id: string | number }>;
};

type MediaAccess = {
  upload: (req: Request, res: Response, next: NextFunction) => void;
  processUpload(input: { file: Express.Multer.File; companyId: number; baseUrl: string }): Promise<{
    url: string;
    mediaType: 'image' | 'video' | 'audio' | 'document';
    filename: string;
    size: number;
    mimetype: string;
  }>;
  findOwnerCompanyId(mediaPath: string): Promise<number | null>;
  resolveFilePath(mediaPath: string): string | null;
};

type ChannelsRead = {
  listChannels(companyId: number): Promise<Array<{ id: number; name: string; type: string; status: string; phoneNumber?: string; displayName?: string }>>;
};
type ConversationsRead = {
  listConversations(input: {
    companyId: number;
    filters?: { channelId?: number; status?: string; isGroup?: boolean };
    pagination?: { page?: number; limit?: number };
  }): Promise<{ conversations: unknown[]; total: number }>;
};
type MessageStatusRead = {
  getMessageStatus(input: { companyId: number; messageId: number }): Promise<{ status: string; timestamp: Date } | null>;
};
type IdempotencyRecord = { method: string; path: string; requestHash: string; responseStatus: number; responseBody: unknown };
type Idempotency = {
  find(input: { companyId: number; key: string }): Promise<IdempotencyRecord | null>;
  save(input: {
    companyId: number;
    integrationId: number;
    key: string;
    method: string;
    path: string;
    requestHash: string;
    responseStatus: number;
    responseBody: unknown;
  }): Promise<void>;
};

/** A minimal, in-memory stand-in for the real storage-backed idempotency port, scoped like the real one (companyId + key). */
function fakeIdempotencyStore(): Idempotency {
  const records = new Map<string, IdempotencyRecord>();
  return {
    find: async ({ companyId, key }) => records.get(`${companyId}:${key}`) ?? null,
    save: async (input) => {
      records.set(`${input.companyId}:${input.key}`, {
        method: input.method,
        path: input.path,
        requestHash: input.requestHash,
        responseStatus: input.responseStatus,
        responseBody: input.responseBody,
      });
    },
  };
}

type CampaignSync = {
  syncBatch(input: {
    companyId: number;
    integrationId: number;
    campaigns: CampaignBatchItem[];
  }): Promise<void>;
};

type AppointmentSync = Pick<AppointmentV2Service, 'sync'>;
type DealPipelineSync = CrmDealPipelineApiV2Service;
type InitialSync = {
  plan(input: InitialCrmSynchronizationInput & {
    companyId: number;
    integrationId: number;
    idempotencyKey: string;
  }): InitialCrmSynchronizationPlan | Promise<InitialCrmSynchronizationPlan>;
};

async function withServer(
  middleware: (req: Request, res: Response, next: NextFunction) => void,
  run: (baseUrl: string) => Promise<void>,
  contactSync?: Pick<CrmContactSyncService, 'upsert'>,
  messageSync?: MessageSync,
  campaignSync?: CampaignSync,
  appointmentSync?: AppointmentSync,
  dealPipelineSync?: DealPipelineSync,
  initialSync?: InitialSync,
  resolveIntegrationId?: (companyId: number, publicId: string) => Promise<number | undefined>,
  mediaAccess?: MediaAccess,
  channelsRead?: ChannelsRead,
  conversationsRead?: ConversationsRead,
  messageStatusRead?: MessageStatusRead,
  idempotency?: Idempotency,
) {
  const app = express();
  app.use(express.json());
  app.use('/api/v2', createApiV2Router({
    authenticate: middleware,
    contactSync,
    messageSync: messageSync as any,
    campaignSync,
    appointmentSync,
    dealPipelineSync,
    initialSync,
    resolveIntegrationId,
    mediaAccess,
    channelsRead,
    conversationsRead,
    messageStatusRead,
    idempotency,
  }));
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
    assert.match(response.headers.get('content-disposition') ?? '', /zinto-crm-api-v2\.openapi\.json/);
    const body = await response.json() as { openapi: string; paths: Record<string, unknown> };
    assert.equal(body.openapi, '3.1.0');
    assert.ok('/health' in body.paths);
    assert.ok('/capabilities' in body.paths);
    assert.ok('/contacts/{externalId}' in body.paths);
    assert.ok('/messages' in body.paths);
    assert.ok('/appointments/{externalId}' in body.paths);
    assert.ok('/deals' in body.paths);
  });
});

test('provides downloadable Postman and Markdown documentation', async () => {
  await withServer((_req, _res, next) => next(), async (baseUrl) => {
    const postman = await fetch(`${baseUrl}/api/v2/postman.json`);
    assert.equal(postman.status, 200);
    assert.match(postman.headers.get('content-disposition') ?? '', /attachment/);
    assert.equal((await postman.json() as { info: { name: string } }).info.name, 'Zinto CRM Integration API v2');

    const guide = await fetch(`${baseUrl}/api/v2/guide.md`);
    assert.equal(guide.status, 200);
    assert.match(guide.headers.get('content-disposition') ?? '', /zinto-crm-api-v2-guia\.md/);
    assert.match(await guide.text(), /Flujo bidireccional/);
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

test('resolves an opaque UUID integration ID before dispatching a CRM operation', async () => {
  const received: unknown[] = [];
  const contactSync = {
    upsert: async (input: unknown) => { received.push(input); return { created: false, contact: { id: 91 } }; },
  } as Pick<CrmContactSyncService, 'upsert'>;
  await withServer((req, _res, next) => {
    req.companyId = 12;
    req.apiKey = { permissions: ['contacts:write'] } as any;
    next();
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v2/contacts/crm-441`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Zinto-Integration-Id': '7f8c2a91-4e1b-4c70-bc3d-91a8e4f0d612' },
      body: JSON.stringify({ name: 'Andrea Díaz' }),
    });
    assert.equal(response.status, 200);
  }, contactSync, undefined, undefined, undefined, undefined, undefined,
    async (companyId, publicId) => {
      assert.equal(companyId, 12);
      assert.equal(publicId, '7f8c2a91-4e1b-4c70-bc3d-91a8e4f0d612');
      return 3;
    });
  assert.deepEqual(received, [{ companyId: 12, integrationId: 3, externalId: 'crm-441', contact: { name: 'Andrea Díaz' } }]);
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

test('queues a CRM media message, using the optional text as caption, from a permitted integration', async () => {
  const received: unknown[] = [];
  const messageSync: MessageSync = {
    send: async () => {
      throw new Error('send should not be called for a media message');
    },
    sendMedia: async (input) => {
      received.push(input);
      return { id: 'message-742' };
    },
  };

  await withServer((req, _res, next) => {
    req.companyId = 12;
    req.apiKey = { permissions: ['messages:send', 'media:upload'] } as any;
    next();
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v2/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Zinto-Integration-Id': '3' },
      body: JSON.stringify({
        channelId: 44,
        recipient: '+56912345678',
        text: 'Photo of the property',
        media: { url: 'https://smartbc.example.com/photo.jpg', type: 'image' },
        external_message_id: 'crm-message-442',
      }),
    });

    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), {
      data: { id: 'message-742', origin: 'crm', external_message_id: 'crm-message-442' },
    });
  }, undefined, messageSync);

  assert.deepEqual(received, [{
    companyId: 12,
    integrationId: 3,
    channelId: 44,
    to: '+56912345678',
    caption: 'Photo of the property',
    externalMessageId: 'crm-message-442',
    origin: 'crm',
    media: { url: 'https://smartbc.example.com/photo.jpg', type: 'image' },
  }]);
});

test('does not send CRM media without media:upload permission, even with messages:send', async () => {
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
        recipient: '+56912345678',
        media: { url: 'https://smartbc.example.com/photo.jpg', type: 'image' },
      }),
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'INSUFFICIENT_PERMISSIONS');
  }, undefined, {
    send: async () => ({ id: 1 }),
    sendMedia: async () => {
      throw new Error('sendMedia should not be called without media:upload');
    },
  });
});

test('rejects a CRM message with an invalid media object and no text', async () => {
  const messageSync: MessageSync = {
    send: async () => ({ id: 1 }),
    sendMedia: async () => {
      throw new Error('sendMedia should not be called for invalid media');
    },
  };
  for (const media of [
    { url: 'not-a-url', type: 'image' },
    { url: 'https://smartbc.example.com/photo.jpg', type: 'spreadsheet' },
    {},
  ]) {
    await withServer((req, _res, next) => {
      req.companyId = 12;
      req.apiKey = { permissions: ['messages:send', 'media:upload'] } as any;
      next();
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v2/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Zinto-Integration-Id': '3' },
        body: JSON.stringify({ channelId: 44, recipient: '+56912345678', media }),
      });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, 'VALIDATION_ERROR');
    }, undefined, messageSync);
  }
});

test('queues a CRM template message from a permitted integration', async () => {
  const received: unknown[] = [];
  const messageSync: MessageSync = {
    send: async () => {
      throw new Error('send should not be called for a template message');
    },
    sendTemplate: async (input) => {
      received.push(input);
      return { id: 'message-743' };
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
        recipient: '+56912345678',
        template: {
          name: 'appointment_reminder',
          language: 'es',
          components: [{ type: 'body', parameters: [{ type: 'text', text: 'mañana 10:00' }] }],
        },
        external_message_id: 'crm-message-443',
      }),
    });

    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), {
      data: { id: 'message-743', origin: 'crm', external_message_id: 'crm-message-443' },
    });
  }, undefined, messageSync);

  assert.deepEqual(received, [{
    companyId: 12,
    integrationId: 3,
    channelId: 44,
    to: '+56912345678',
    externalMessageId: 'crm-message-443',
    origin: 'crm',
    template: {
      name: 'appointment_reminder',
      language: 'es',
      components: [{ type: 'body', parameters: [{ type: 'text', text: 'mañana 10:00' }] }],
    },
  }]);
});

test('rejects a CRM message that combines media and template, or an invalid template object', async () => {
  const messageSync: MessageSync = {
    send: async () => ({ id: 1 }),
    sendTemplate: async () => {
      throw new Error('sendTemplate should not be called for invalid input');
    },
    sendMedia: async () => {
      throw new Error('sendMedia should not be called for invalid input');
    },
  };
  for (const body of [
    { channelId: 44, recipient: '+56912345678', template: { name: 'x', language: 'es' }, media: { url: 'https://smartbc.example.com/photo.jpg', type: 'image' } },
    { channelId: 44, recipient: '+56912345678', template: { language: 'es' } },
    { channelId: 44, recipient: '+56912345678', template: { name: 'x', language: 'es', components: [{ type: 'header', parameters: [123] }] } },
    { channelId: 44, recipient: '+56912345678', template: {} },
  ]) {
    await withServer((req, _res, next) => {
      req.companyId = 12;
      req.apiKey = { permissions: ['messages:send', 'media:upload'] } as any;
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

test('does not expose media upload or download when no media access dependency is supplied', async () => {
  await withServer((_req, _res, next) => next(), async (baseUrl) => {
    const upload = await fetch(`${baseUrl}/api/v2/media/upload`, { method: 'POST' });
    assert.equal(upload.status, 404);
    const download = await fetch(`${baseUrl}/api/v2/media?type=image&filename=x.jpg`);
    assert.equal(download.status, 404);
  });
});

test('uploads a file through media:upload and returns its resolved URL', async () => {
  const processed: unknown[] = [];
  const mediaAccess: MediaAccess = {
    upload: (req, _res, next) => {
      (req as any).file = { originalname: 'photo.jpg', mimetype: 'image/jpeg', size: 123, path: '/tmp/fake' };
      next();
    },
    processUpload: async (input) => {
      processed.push(input);
      return { url: 'https://crm.zinto.app/media/image/abc123.jpg', mediaType: 'image', filename: 'photo.jpg', size: 123, mimetype: 'image/jpeg' };
    },
    findOwnerCompanyId: async () => null,
    resolveFilePath: () => null,
  };

  await withServer((req, _res, next) => {
    req.companyId = 12;
    req.apiKey = { permissions: ['media:upload'] } as any;
    next();
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v2/media/upload`, {
      method: 'POST',
      headers: { 'X-Zinto-Integration-Id': '3' },
      body: new Uint8Array(),
    });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      data: { url: 'https://crm.zinto.app/media/image/abc123.jpg', type: 'image', filename: 'photo.jpg', size: 123, mimeType: 'image/jpeg' },
    });
  }, undefined, undefined, undefined, undefined, undefined, undefined, undefined, mediaAccess);

  assert.equal(processed.length, 1);
  assert.equal((processed[0] as { companyId: number }).companyId, 12);
});

test('does not upload media without media:upload permission', async () => {
  const mediaAccess: MediaAccess = {
    upload: (req, _res, next) => {
      (req as any).file = { originalname: 'photo.jpg', mimetype: 'image/jpeg', size: 123, path: '/tmp/fake' };
      next();
    },
    processUpload: async () => {
      throw new Error('processUpload should not be called without media:upload');
    },
    findOwnerCompanyId: async () => null,
    resolveFilePath: () => null,
  };

  await withServer((req, _res, next) => {
    req.companyId = 12;
    req.apiKey = { permissions: ['messages:send'] } as any;
    next();
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v2/media/upload`, {
      method: 'POST',
      headers: { 'X-Zinto-Integration-Id': '3' },
      body: new Uint8Array(),
    });
    assert.equal(response.status, 403);
  }, undefined, undefined, undefined, undefined, undefined, undefined, undefined, mediaAccess);
});

test('downloads media owned by the requesting company', async () => {
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const tmpFile = path.join(os.tmpdir(), `api-v2-media-test-${Date.now()}.jpg`);
  await fs.writeFile(tmpFile, 'fake-jpeg-bytes');

  try {
    const mediaAccess: MediaAccess = {
      upload: (_req, _res, next) => next(),
      processUpload: async () => {
        throw new Error('processUpload should not be called in this test');
      },
      findOwnerCompanyId: async (mediaPath) => (mediaPath === '/media/image/xyz789.jpg' ? 12 : null),
      resolveFilePath: (mediaPath) => (mediaPath === '/media/image/xyz789.jpg' ? tmpFile : null),
    };

    await withServer((req, _res, next) => {
      req.companyId = 12;
      req.apiKey = { permissions: ['media:read'] } as any;
      next();
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v2/media?type=image&filename=xyz789.jpg`, {
        headers: { 'X-Zinto-Integration-Id': '3' },
      });
      assert.equal(response.status, 200);
      assert.equal(await response.text(), 'fake-jpeg-bytes');
    }, undefined, undefined, undefined, undefined, undefined, undefined, undefined, mediaAccess);
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }
});

test('refuses to download media owned by another company', async () => {
  const mediaAccess: MediaAccess = {
    upload: (_req, _res, next) => next(),
    processUpload: async () => {
      throw new Error('processUpload should not be called in this test');
    },
    findOwnerCompanyId: async () => 999,
    resolveFilePath: () => {
      throw new Error('resolveFilePath should not be called when the owner does not match');
    },
  };

  await withServer((req, _res, next) => {
    req.companyId = 12;
    req.apiKey = { permissions: ['media:read'] } as any;
    next();
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v2/media?type=image&filename=xyz789.jpg`, {
      headers: { 'X-Zinto-Integration-Id': '3' },
    });
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error, 'NOT_FOUND');
  }, undefined, undefined, undefined, undefined, undefined, undefined, undefined, mediaAccess);
});

test('lists channels for the requesting company with channels:read', async () => {
  const channelsRead: ChannelsRead = {
    listChannels: async (companyId) => {
      assert.equal(companyId, 12);
      return [{ id: 44, name: 'WhatsApp Chile', type: 'whatsapp_official', status: 'active', phoneNumber: '+56912345678' }];
    },
  };

  await withServer((req, _res, next) => {
    req.companyId = 12;
    req.apiKey = { permissions: ['channels:read'] } as any;
    next();
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v2/channels`, { headers: { 'X-Zinto-Integration-Id': '3' } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      data: [{ id: 44, name: 'WhatsApp Chile', type: 'whatsapp_official', status: 'active', phoneNumber: '+56912345678' }],
    });
  }, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, channelsRead);
});

test('does not expose channel listing without channels:read', async () => {
  await withServer((req, _res, next) => {
    req.companyId = 12;
    req.apiKey = { permissions: ['messages:send'] } as any;
    next();
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v2/channels`, { headers: { 'X-Zinto-Integration-Id': '3' } });
    assert.equal(response.status, 403);
  }, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, {
    listChannels: async () => { throw new Error('must not list'); },
  });
});

test('lists conversations with filters and pagination for the requesting company', async () => {
  const received: unknown[] = [];
  const conversationsRead: ConversationsRead = {
    listConversations: async (input) => {
      received.push(input);
      return { conversations: [{ id: 91, contactId: 5, channelId: 44 }], total: 1 };
    },
  };

  await withServer((req, _res, next) => {
    req.companyId = 12;
    req.apiKey = { permissions: ['conversations:read'] } as any;
    next();
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v2/conversations?channelId=44&status=open&isGroup=false&page=2&limit=10`, {
      headers: { 'X-Zinto-Integration-Id': '3' },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { data: [{ id: 91, contactId: 5, channelId: 44 }], total: 1 });
  }, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, conversationsRead);

  assert.deepEqual(received, [{
    companyId: 12,
    filters: { channelId: 44, status: 'open', isGroup: false },
    pagination: { page: 2, limit: 10 },
  }]);
});

test('reads a message status, 404s when the port returns null', async () => {
  const messageStatusRead: MessageStatusRead = {
    getMessageStatus: async ({ messageId }) => (messageId === 77 ? { status: 'delivered', timestamp: new Date('2026-01-01T00:00:00Z') } : null),
  };

  await withServer((req, _res, next) => {
    req.companyId = 12;
    req.apiKey = { permissions: ['messages:read'] } as any;
    next();
  }, async (baseUrl) => {
    const found = await fetch(`${baseUrl}/api/v2/messages/77/status`, { headers: { 'X-Zinto-Integration-Id': '3' } });
    assert.equal(found.status, 200);
    assert.deepEqual(await found.json(), { data: { status: 'delivered', timestamp: '2026-01-01T00:00:00.000Z' } });

    const missing = await fetch(`${baseUrl}/api/v2/messages/999/status`, { headers: { 'X-Zinto-Integration-Id': '3' } });
    assert.equal(missing.status, 404);
  }, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, messageStatusRead);
});

test('does not expose channels, conversations, or message status reads when their dependencies are not supplied', async () => {
  await withServer((_req, _res, next) => next(), async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/v2/channels`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/api/v2/conversations`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/api/v2/messages/1/status`)).status, 404);
  });
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

test('accepts a validated campaign batch from a permitted integration', async () => {
  const received: unknown[] = [];
  const campaignSync: CampaignSync = {
    syncBatch: async (input) => {
      received.push(input);
    },
  };

  await withServer((req, _res, next) => {
    req.companyId = 12;
    req.apiKey = { permissions: ['campaigns:write'], userId: 9 } as any;
    next();
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v2/campaigns/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Zinto-Integration-Id': '3', 'Idempotency-Key': 'crm-campaigns-batch-441' },
      body: JSON.stringify({ campaigns: [{ externalId: 'crm-campaign-441', name: 'Campaign 441', content: 'Hello' }, { externalId: 'crm-campaign-442', name: 'Campaign 442', content: 'Hello' }] }),
    });

    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { count: 2 });
  }, undefined, undefined, campaignSync);

  assert.deepEqual(received, [{
    companyId: 12,
    integrationId: 3,
    actorUserId: 9,
    campaigns: [{ externalId: 'crm-campaign-441', name: 'Campaign 441', content: 'Hello' }, { externalId: 'crm-campaign-442', name: 'Campaign 442', content: 'Hello' }],
  }]);
});

test('does not expose campaign batch synchronization when no campaign sync dependency is supplied', async () => {
  await withServer((_req, _res, next) => next(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v2/campaigns/batch`, { method: 'POST' });
    assert.equal(response.status, 404);
  });
});

test('does not synchronize campaigns without campaigns:write permission', async () => {
  await withServer((req, _res, next) => {
    req.companyId = 12;
    req.apiKey = { permissions: ['contacts:write'] } as any;
    next();
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v2/campaigns/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Zinto-Integration-Id': '3' },
      body: JSON.stringify({ campaigns: [{ externalId: 'crm-campaign-441', name: 'Campaign 441', content: 'Hello' }] }),
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'INSUFFICIENT_PERMISSIONS');
  }, undefined, undefined, { syncBatch: async () => undefined });
});

test('rejects campaign batches that violate the batch validation contract', async () => {
  await withServer((req, _res, next) => {
    req.companyId = 12;
    req.apiKey = { permissions: ['campaigns:write'] } as any;
    next();
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v2/campaigns/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Zinto-Integration-Id': '3', 'Idempotency-Key': 'crm-campaigns-batch-442' },
      body: JSON.stringify({ campaigns: [{ externalId: 'crm-campaign-441', name: 'Campaign 441', content: 'Hello' }, { externalId: 'crm-campaign-441', name: 'Campaign 441', content: 'Hello' }] }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: 'VALIDATION_ERROR',
      message: 'Campaign sync batch contains duplicate external ID: crm-campaign-441',
    });
  }, undefined, undefined, { syncBatch: async () => undefined });
});

test('reports a campaign sync failure separately from an invalid batch', async () => {
  await withServer((req, _res, next) => {
    req.companyId = 12;
    req.apiKey = { permissions: ['campaigns:write'] } as any;
    next();
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v2/campaigns/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Zinto-Integration-Id': '3', 'Idempotency-Key': 'crm-campaigns-batch-443' },
      body: JSON.stringify({ campaigns: [{ externalId: 'crm-campaign-441', name: 'Campaign 441', content: 'Hello' }] }),
    });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: 'CAMPAIGN_SYNC_FAILED',
      message: 'Campaign synchronization failed',
    });
  }, undefined, undefined, {
    syncBatch: async () => {
      throw new Error('Campaign queue unavailable');
    },
  });
});

test('upserts a CRM appointment with its tenant, integration, and idempotency context', async () => {
  const received: unknown[] = [];
  const appointmentSync: AppointmentSync = {
    sync: async (input) => {
      received.push(input);
      return { id: 'appointment-441', created: true };
    },
  };

  await withServer((req, _res, next) => {
    req.companyId = 12;
    req.apiKey = { permissions: ['appointments:write'] } as any;
    next();
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v2/appointments/hubspot-appointment-441`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Zinto-Integration-Id': '3',
        'Idempotency-Key': 'crm-appointment-441',
      },
      body: JSON.stringify({ contactId: 41, title: 'Initial consultation', startsAt: '2026-10-03T09:00:00.000Z', endsAt: '2026-10-03T10:00:00.000Z', status: 'confirmed' }),
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { data: { id: 'appointment-441' }, created: true });
  }, undefined, undefined, undefined, appointmentSync);

  assert.deepEqual(received, [{
    companyId: 12,
    integrationId: 3,
    externalId: 'hubspot-appointment-441',
    idempotencyKey: 'crm-appointment-441',
    appointment: { contactId: 41, title: 'Initial consultation', startsAt: '2026-10-03T09:00:00.000Z', endsAt: '2026-10-03T10:00:00.000Z', status: 'confirmed', externalId: 'hubspot-appointment-441' },
  }]);
});

test('creates a CRM deal through the pipeline with tenant, integration, and idempotency context', async () => {
  const received: unknown[] = [];
  const dealPipelineSync: DealPipelineSync = {
    upsert: async (input) => {
      received.push(input);
      return { created: true, deal: { id: 91, externalId: 'hubspot-deal-441' } };
    },
  };

  await withServer((req, _res, next) => {
    req.companyId = 12;
    req.apiKey = { permissions: ['deals:write'] } as any;
    next();
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v2/deals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Zinto-Integration-Id': '3',
        'Idempotency-Key': 'crm-deal-441',
      },
      body: JSON.stringify({ externalId: 'hubspot-deal-441', contactId: 41, pipelineId: 52, title: 'Enterprise rollout', stage: 'proposal', value: 12500 }),
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { data: { id: 91, externalId: 'hubspot-deal-441' }, created: true });
  }, undefined, undefined, undefined, undefined, dealPipelineSync);

  assert.deepEqual(received, [{
    companyId: 12,
    integrationId: 3,
    idempotencyKey: 'crm-deal-441',
    deal: { externalId: 'hubspot-deal-441', contactId: 41, pipelineId: 52, title: 'Enterprise rollout', stage: 'proposal', value: 12500 },
  }]);
});

test('replays the cached response for a retried request with the same Idempotency-Key and body, without calling the sync service again', async () => {
  let callCount = 0;
  const dealPipelineSync: DealPipelineSync = {
    upsert: async () => {
      callCount += 1;
      return { created: true, deal: { id: 91, externalId: 'hubspot-deal-441' } };
    },
  };
  const idempotency = fakeIdempotencyStore();
  const body = JSON.stringify({ externalId: 'hubspot-deal-441', contactId: 41, pipelineId: 52, title: 'Enterprise rollout', stage: 'proposal', value: 12500 });

  await withServer((req, _res, next) => {
    req.companyId = 12;
    req.apiKey = { permissions: ['deals:write'] } as any;
    next();
  }, async (baseUrl) => {
    const headers = { 'Content-Type': 'application/json', 'X-Zinto-Integration-Id': '3', 'Idempotency-Key': 'crm-deal-retry-441' };
    const first = await fetch(`${baseUrl}/api/v2/deals`, { method: 'POST', headers, body });
    const second = await fetch(`${baseUrl}/api/v2/deals`, { method: 'POST', headers, body });

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.deepEqual(await first.json(), await second.json());
  }, undefined, undefined, undefined, undefined, dealPipelineSync, undefined, undefined, undefined, undefined, undefined, undefined, idempotency);

  assert.equal(callCount, 1, 'the sync service must only run once — the retry should be served from the idempotency cache');
});

test('rejects a retried Idempotency-Key whose request body changed, without calling the sync service again', async () => {
  let callCount = 0;
  const dealPipelineSync: DealPipelineSync = {
    upsert: async () => {
      callCount += 1;
      return { created: true, deal: { id: 91, externalId: 'hubspot-deal-441' } };
    },
  };
  const idempotency = fakeIdempotencyStore();

  await withServer((req, _res, next) => {
    req.companyId = 12;
    req.apiKey = { permissions: ['deals:write'] } as any;
    next();
  }, async (baseUrl) => {
    const headers = { 'Content-Type': 'application/json', 'X-Zinto-Integration-Id': '3', 'Idempotency-Key': 'crm-deal-conflict-441' };
    const first = await fetch(`${baseUrl}/api/v2/deals`, {
      method: 'POST', headers,
      body: JSON.stringify({ externalId: 'hubspot-deal-441', contactId: 41, pipelineId: 52, title: 'Enterprise rollout', stage: 'proposal', value: 12500 }),
    });
    assert.equal(first.status, 201);

    const second = await fetch(`${baseUrl}/api/v2/deals`, {
      method: 'POST', headers,
      body: JSON.stringify({ externalId: 'hubspot-deal-441', contactId: 41, pipelineId: 52, title: 'Enterprise rollout', stage: 'proposal', value: 99999 }),
    });
    assert.equal(second.status, 409);
    assert.equal((await second.json()).error, 'IDEMPOTENCY_KEY_CONFLICT');
  }, undefined, undefined, undefined, undefined, dealPipelineSync, undefined, undefined, undefined, undefined, undefined, undefined, idempotency);

  assert.equal(callCount, 1, 'the sync service must not run again for a conflicting retry');
});

test('rejects the same Idempotency-Key reused across two different operations', async () => {
  const dealPipelineSync: DealPipelineSync = {
    upsert: async () => ({ created: true, deal: { id: 91, externalId: 'hubspot-deal-441' } }),
  };
  const appointmentSync: AppointmentSync = {
    sync: async () => { throw new Error('must not sync — the shared key was already used for a deal'); },
  };
  const idempotency = fakeIdempotencyStore();

  await withServer((req, _res, next) => {
    req.companyId = 12;
    req.apiKey = { permissions: ['deals:write', 'appointments:write'] } as any;
    next();
  }, async (baseUrl) => {
    const sharedKey = 'crm-shared-key-441';
    const dealResponse = await fetch(`${baseUrl}/api/v2/deals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Zinto-Integration-Id': '3', 'Idempotency-Key': sharedKey },
      body: JSON.stringify({ externalId: 'hubspot-deal-441', contactId: 41, pipelineId: 52, title: 'Enterprise rollout', stage: 'proposal', value: 12500 }),
    });
    assert.equal(dealResponse.status, 201);

    const appointmentResponse = await fetch(`${baseUrl}/api/v2/appointments/hubspot-appointment-441`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Zinto-Integration-Id': '3', 'Idempotency-Key': sharedKey },
      body: JSON.stringify({ contactId: 41, title: 'Consult', startsAt: '2026-10-03T09:00:00.000Z', endsAt: '2026-10-03T10:00:00.000Z', status: 'confirmed' }),
    });
    assert.equal(appointmentResponse.status, 409);
    assert.equal((await appointmentResponse.json()).error, 'IDEMPOTENCY_KEY_REUSED');
  }, undefined, undefined, undefined, appointmentSync, dealPipelineSync, undefined, undefined, undefined, undefined, undefined, undefined, idempotency);
});

test('does not cache a failed sync attempt — a retry after a failure is free to try again', async () => {
  let callCount = 0;
  const dealPipelineSync: DealPipelineSync = {
    upsert: async () => {
      callCount += 1;
      if (callCount === 1) throw new Error('transient failure');
      return { created: true, deal: { id: 91, externalId: 'hubspot-deal-441' } };
    },
  };
  const idempotency = fakeIdempotencyStore();

  await withServer((req, _res, next) => {
    req.companyId = 12;
    req.apiKey = { permissions: ['deals:write'] } as any;
    next();
  }, async (baseUrl) => {
    const headers = { 'Content-Type': 'application/json', 'X-Zinto-Integration-Id': '3', 'Idempotency-Key': 'crm-deal-retry-after-failure-441' };
    const body = JSON.stringify({ externalId: 'hubspot-deal-441', contactId: 41, pipelineId: 52, title: 'Enterprise rollout', stage: 'proposal', value: 12500 });

    const first = await fetch(`${baseUrl}/api/v2/deals`, { method: 'POST', headers, body });
    assert.equal(first.status, 500);

    const second = await fetch(`${baseUrl}/api/v2/deals`, { method: 'POST', headers, body });
    assert.equal(second.status, 201);
  }, undefined, undefined, undefined, undefined, dealPipelineSync, undefined, undefined, undefined, undefined, undefined, undefined, idempotency);

  assert.equal(callCount, 2, 'the sync service must run again after a failed attempt with the same key');
});

test('does not expose appointment or deal synchronization without their dependencies', async () => {
  await withServer((_req, _res, next) => next(), async (baseUrl) => {
    const appointmentResponse = await fetch(`${baseUrl}/api/v2/appointments/hubspot-appointment-441`, { method: 'PUT' });
    assert.equal(appointmentResponse.status, 404);

    const dealResponse = await fetch(`${baseUrl}/api/v2/deals`, { method: 'POST' });
    assert.equal(dealResponse.status, 404);
  });
});

test('does not synchronize appointments or deals without their write scopes', async () => {
  const appointmentSync: AppointmentSync = { sync: async () => ({ id: 1, created: true }) };
  const dealPipelineSync: DealPipelineSync = { upsert: async () => ({ created: true, deal: { id: 1 } }) };
  await withServer((req, _res, next) => {
    req.companyId = 12;
    req.apiKey = { permissions: ['contacts:write'] } as any;
    next();
  }, async (baseUrl) => {
    const appointmentResponse = await fetch(`${baseUrl}/api/v2/appointments/hubspot-appointment-441`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Zinto-Integration-Id': '3', 'Idempotency-Key': 'crm-appointment-441' },
      body: JSON.stringify({ contactId: 41, title: 'Initial consultation', startsAt: '2026-10-03T09:00:00.000Z', endsAt: '2026-10-03T10:00:00.000Z', status: 'confirmed' }),
    });
    assert.equal(appointmentResponse.status, 403);

    const dealResponse = await fetch(`${baseUrl}/api/v2/deals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Zinto-Integration-Id': '3', 'Idempotency-Key': 'crm-deal-441' },
      body: JSON.stringify({ externalId: 'hubspot-deal-441', contactId: 41, pipelineId: 52, title: 'Enterprise rollout', stage: 'proposal', value: 12500 }),
    });
    assert.equal(dealResponse.status, 403);
  }, undefined, undefined, undefined, appointmentSync, dealPipelineSync);
});

test('plans initial CRM synchronization jobs with tenant, integration, and idempotency context', async () => {
  const received: unknown[] = [];
  const plan = {
    jobs: [{ id: 'contacts:1', entity: 'contacts' as const, records: [{ externalId: 'contact-441' }] }],
    jobCounts: {
      total: 1,
      byEntity: { contacts: 1, appointments: 0, deals: 0, campaigns: 0 },
    },
  };
  const initialSync: InitialSync = {
    plan: async (input) => {
      received.push(input);
      return plan;
    },
  };

  await withServer((req, _res, next) => {
    req.companyId = 12;
    req.apiKey = { permissions: ['integrations:manage'] } as any;
    next();
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v2/sync-jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Zinto-Integration-Id': '3',
        'Idempotency-Key': 'crm-initial-sync-441',
      },
      body: JSON.stringify({
        companyId: 99,
        integrationId: 98,
        idempotencyKey: 'untrusted-body-value',
        contacts: [{ externalId: 'contact-441' }],
        appointments: [],
        deals: [],
        campaigns: [],
      }),
    });

    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { data: plan });
  }, undefined, undefined, undefined, undefined, undefined, initialSync);

  assert.deepEqual(received, [{
    companyId: 12,
    integrationId: 3,
    idempotencyKey: 'crm-initial-sync-441',
    contacts: [{ externalId: 'contact-441' }],
    appointments: [],
    deals: [],
    campaigns: [],
  }]);
});

test('does not expose initial CRM synchronization planning without its dependency', async () => {
  await withServer((_req, _res, next) => next(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v2/sync-jobs`, { method: 'POST' });
    assert.equal(response.status, 404);
  });
});

test('does not plan initial CRM synchronization without integrations:manage permission', async () => {
  await withServer((req, _res, next) => {
    req.companyId = 12;
    req.apiKey = { permissions: ['contacts:write'] } as any;
    next();
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v2/sync-jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Zinto-Integration-Id': '3',
        'Idempotency-Key': 'crm-initial-sync-441',
      },
      body: JSON.stringify({ contacts: [], appointments: [], deals: [], campaigns: [] }),
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'INSUFFICIENT_PERMISSIONS');
  }, undefined, undefined, undefined, undefined, undefined, { plan: () => ({ jobs: [], jobCounts: { total: 0, byEntity: { contacts: 0, appointments: 0, deals: 0, campaigns: 0 } } }) });
});

test('returns planner validation failures as bad requests', async () => {
  await withServer((req, _res, next) => {
    req.companyId = 12;
    req.apiKey = { permissions: ['integrations:manage'] } as any;
    next();
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v2/sync-jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Zinto-Integration-Id': '3',
        'Idempotency-Key': 'crm-initial-sync-441',
      },
      body: JSON.stringify({ contacts: [], appointments: [], deals: [], campaigns: [], batchSize: 0 }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: 'VALIDATION_ERROR',
      message: 'batchSize must be a positive safe integer',
    });
  }, undefined, undefined, undefined, undefined, undefined, { plan: planInitialCrmSynchronization });
});
