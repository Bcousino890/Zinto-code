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
};

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
) {
  const app = express();
  app.use(express.json());
  app.use('/api/v2', createApiV2Router({
    authenticate: middleware,
    contactSync,
    messageSync,
    campaignSync,
    appointmentSync,
    dealPipelineSync,
    initialSync,
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
    const body = await response.json() as { openapi: string; paths: Record<string, unknown> };
    assert.equal(body.openapi, '3.1.0');
    assert.ok('/health' in body.paths);
    assert.ok('/capabilities' in body.paths);
    assert.ok('/contacts/{externalId}' in body.paths);
    assert.ok('/messages' in body.paths);
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

test('accepts a validated campaign batch from a permitted integration', async () => {
  const received: unknown[] = [];
  const campaignSync: CampaignSync = {
    syncBatch: async (input) => {
      received.push(input);
    },
  };

  await withServer((req, _res, next) => {
    req.companyId = 12;
    req.apiKey = { permissions: ['campaigns:write'] } as any;
    next();
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v2/campaigns/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Zinto-Integration-Id': '3' },
      body: JSON.stringify({ campaigns: [{ externalId: 'crm-campaign-441' }, { externalId: 'crm-campaign-442' }] }),
    });

    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { count: 2 });
  }, undefined, undefined, campaignSync);

  assert.deepEqual(received, [{
    companyId: 12,
    integrationId: 3,
    campaigns: [{ externalId: 'crm-campaign-441' }, { externalId: 'crm-campaign-442' }],
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
      body: JSON.stringify({ campaigns: [{ externalId: 'crm-campaign-441' }] }),
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
      headers: { 'Content-Type': 'application/json', 'X-Zinto-Integration-Id': '3' },
      body: JSON.stringify({ campaigns: [{ externalId: 'crm-campaign-441' }, { externalId: 'crm-campaign-441' }] }),
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
      headers: { 'Content-Type': 'application/json', 'X-Zinto-Integration-Id': '3' },
      body: JSON.stringify({ campaigns: [{ externalId: 'crm-campaign-441' }] }),
    });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: 'CAMPAIGN_SYNC_FAILED',
      message: 'Campaign queue unavailable',
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
      body: JSON.stringify({ startsAt: '2026-10-03T09:00:00.000Z', endsAt: '2026-10-03T10:00:00.000Z', status: 'confirmed' }),
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { data: { id: 'appointment-441' }, created: true });
  }, undefined, undefined, undefined, appointmentSync);

  assert.deepEqual(received, [{
    companyId: 12,
    integrationId: 3,
    externalId: 'hubspot-appointment-441',
    idempotencyKey: 'crm-appointment-441',
    appointment: { startsAt: '2026-10-03T09:00:00.000Z', endsAt: '2026-10-03T10:00:00.000Z', status: 'confirmed' },
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
      body: JSON.stringify({ externalId: 'hubspot-deal-441', title: 'Enterprise rollout', stage: 'proposal', value: 12500 }),
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { data: { id: 91, externalId: 'hubspot-deal-441' }, created: true });
  }, undefined, undefined, undefined, undefined, dealPipelineSync);

  assert.deepEqual(received, [{
    companyId: 12,
    integrationId: 3,
    idempotencyKey: 'crm-deal-441',
    deal: { externalId: 'hubspot-deal-441', title: 'Enterprise rollout', stage: 'proposal', value: 12500 },
  }]);
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
      body: JSON.stringify({ startsAt: '2026-10-03T09:00:00.000Z', endsAt: '2026-10-03T10:00:00.000Z', status: 'confirmed' }),
    });
    assert.equal(appointmentResponse.status, 403);

    const dealResponse = await fetch(`${baseUrl}/api/v2/deals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Zinto-Integration-Id': '3', 'Idempotency-Key': 'crm-deal-441' },
      body: JSON.stringify({ externalId: 'hubspot-deal-441', title: 'Enterprise rollout', stage: 'proposal', value: 12500 }),
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
