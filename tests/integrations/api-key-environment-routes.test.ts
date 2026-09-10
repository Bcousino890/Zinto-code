import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import express from 'express';

process.env.NODE_ENV = 'development';
process.env.DATABASE_URL ??= 'postgres://test:test@127.0.0.1:5432/zinto_test';

type StoredApiKey = {
  id: number;
  companyId: number;
  userId: number;
  name: string;
  keyHash: string;
  keyPrefix: string;
  permissions: string[];
  isActive: boolean;
  rateLimitPerMinute: number;
  rateLimitPerHour: number;
  rateLimitPerDay: number;
  allowedIps: string[];
  webhookUrl: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date | null;
};

const apiKeys: StoredApiKey[] = [];
let nextApiKeyId = 1;

const storage = {
  async createApiKey(input: Omit<StoredApiKey, 'id' | 'createdAt' | 'updatedAt' | 'lastUsedAt'>) {
    const apiKey: StoredApiKey = {
      ...input,
      id: nextApiKeyId++,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastUsedAt: null,
    };
    apiKeys.push(apiKey);
    return apiKey;
  },
  async getApiKeysByCompanyId(companyId: number) {
    return apiKeys.filter((apiKey) => apiKey.companyId === companyId);
  },
  async updateApiKey(id: number, update: Partial<StoredApiKey>) {
    const apiKey = apiKeys.find((candidate) => candidate.id === id);
    if (!apiKey) throw new Error('API key not found');
    Object.assign(apiKey, update, { updatedAt: new Date() });
    return apiKey;
  },
};

const { registerApiKeySettingsRoutes } = await import('../../server/routes/api-key-settings-routes');

function resetApiKeys() {
  apiKeys.length = 0;
  nextApiKeyId = 1;
}

async function withApiKeyServer(run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { id: 73, companyId: 41, role: 'admin', isSuperAdmin: false };
    next();
  });
  registerApiKeySettingsRoutes(app, storage, (_req, _res, next) => next());

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

test('creates a sandbox API key with an HTTP localhost webhook and persists its environment', async () => {
  resetApiKeys();

  await withApiKeyServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/settings/api-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'CRM sandbox',
        environment: 'sandbox',
        webhookUrl: 'http://localhost:3000/hooks/zinto',
      }),
    });

    assert.equal(response.status, 201);
    assert.equal((await response.json()).name, 'CRM sandbox');
  });

  assert.deepEqual(apiKeys[0]?.metadata, { environment: 'sandbox' });
  assert.equal(apiKeys[0]?.webhookUrl, 'http://localhost:3000/hooks/zinto');
});

test('rejects a production API key that uses an HTTP or localhost webhook', async () => {
  resetApiKeys();

  await withApiKeyServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/settings/api-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'CRM production',
        environment: 'production',
        webhookUrl: 'http://localhost:3000/hooks/zinto',
      }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: 'VALIDATION_ERROR',
      message: 'Production webhook URL must use HTTPS',
    });
  });

  assert.equal(apiKeys.length, 0);
});

test('updates an existing sandbox key with a sandbox webhook and preserves unrelated metadata', async () => {
  resetApiKeys();
  apiKeys.push({
    id: nextApiKeyId++,
    companyId: 41,
    userId: 73,
    name: 'CRM sandbox',
    keyHash: 'hash',
    keyPrefix: 'znt_',
    permissions: ['contacts:read'],
    isActive: true,
    rateLimitPerMinute: 60,
    rateLimitPerHour: 1_000,
    rateLimitPerDay: 10_000,
    allowedIps: [],
    webhookUrl: 'http://localhost:3000/hooks/old',
    metadata: { environment: 'sandbox', integrationId: 'crm-41' },
    createdAt: new Date(),
    updatedAt: new Date(),
    lastUsedAt: null,
  });

  await withApiKeyServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/settings/api-keys/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl: 'http://localhost:3000/hooks/new' }),
    });

    assert.equal(response.status, 200);
  });

  assert.equal(apiKeys[0]?.webhookUrl, 'http://localhost:3000/hooks/new');
  assert.deepEqual(apiKeys[0]?.metadata, { environment: 'sandbox', integrationId: 'crm-41' });
});

test('switches a key to production only with a production-safe webhook and persists the new environment', async () => {
  resetApiKeys();
  apiKeys.push({
    id: nextApiKeyId++,
    companyId: 41,
    userId: 73,
    name: 'CRM sandbox',
    keyHash: 'hash',
    keyPrefix: 'znt_',
    permissions: ['contacts:read'],
    isActive: true,
    rateLimitPerMinute: 60,
    rateLimitPerHour: 1_000,
    rateLimitPerDay: 10_000,
    allowedIps: [],
    webhookUrl: 'http://localhost:3000/hooks/old',
    metadata: { environment: 'sandbox', integrationId: 'crm-41' },
    createdAt: new Date(),
    updatedAt: new Date(),
    lastUsedAt: null,
  });

  await withApiKeyServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/settings/api-keys/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        environment: 'production',
        webhookUrl: 'https://crm.example.com/hooks/zinto',
      }),
    });

    assert.equal(response.status, 200);
  });

  assert.equal(apiKeys[0]?.webhookUrl, 'https://crm.example.com/hooks/zinto');
  assert.deepEqual(apiKeys[0]?.metadata, { environment: 'production', integrationId: 'crm-41' });
});
