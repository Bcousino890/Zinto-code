import test from 'node:test';
import assert from 'node:assert/strict';
import { getApiV2OpenApiDocument } from '../../server/routes/api-v2-openapi';
import { getApiV2PostmanCollection } from '../../server/routes/api-v2-postman';

test('OpenAPI document describes every public CRM v2 operation', () => {
  const document = getApiV2OpenApiDocument() as { servers: Array<{ url: string }>; paths: Record<string, unknown> };

  assert.equal(document.servers[0]?.url, 'https://crm.zinto.app/api/v2');
  for (const path of [
    '/health',
    '/capabilities',
    '/contacts/{externalId}',
    '/messages',
    '/campaigns/batch',
    '/appointments/{externalId}',
    '/deals',
    '/sync-jobs',
  ]) {
    assert.ok(document.paths[path], `Missing OpenAPI path ${path}`);
  }
});

test('downloadable Postman collection uses header authentication and v2 URLs', () => {
  const collection = getApiV2PostmanCollection() as { variable: Array<{ key: string; value: string }>; item: unknown[] };
  const serialized = JSON.stringify(collection);

  assert.equal(collection.variable.find((entry) => entry.key === 'baseUrl')?.value, 'https://crm.zinto.app');
  assert.match(serialized, /\/api\/v2/);
  assert.match(serialized, /Authorization/);
  assert.doesNotMatch(serialized, /\?api_key|["']apiKey["']\s*:/);
});
