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

test('documentation explains how to obtain the company Integration ID', () => {
  const document = getApiV2OpenApiDocument() as {
    info: { description: string };
    components: { securitySchemes: Record<string, { description?: string }> };
  };
  assert.match(document.info.description, /Integration ID/i);
  assert.match(document.info.description, /Configuración.*Acceso API/i);
  assert.match(document.components.securitySchemes.bearerAuth?.description ?? '', /Integration ID/i);
});

test('downloadable Postman collection uses header authentication and v2 URLs', () => {
  const collection = getApiV2PostmanCollection() as { variable: Array<{ key: string; value: string }>; item: unknown[] };
  const serialized = JSON.stringify(collection);

  assert.equal(collection.variable.find((entry) => entry.key === 'baseUrl')?.value, 'https://crm.zinto.app');
  assert.match(serialized, /\/api\/v2/);
  assert.match(serialized, /Authorization/);
  assert.doesNotMatch(serialized, /\?api_key|["']apiKey["']\s*:/);
});

test('Postman never suggests a fake integration ID', () => {
  const collection = getApiV2PostmanCollection() as {
    variable: Array<{ key: string; value: string }>;
    info: { description: string };
  };
  assert.equal(collection.variable.find((entry) => entry.key === 'integrationId')?.value, 'REEMPLAZAR_CON_ID_DE_INTEGRACION');
  assert.match(collection.info.description, /Configuración.*Acceso API/i);
  assert.doesNotMatch(JSON.stringify(collection), /"key":"integrationId","value":"1"/);
});

test('Markdown guide includes the complete client onboarding handoff', async () => {
  const { API_V2_GUIDE_MARKDOWN } = await import('../../server/routes/api-v2-guide');
  assert.match(API_V2_GUIDE_MARKDOWN, /Obtener el Integration ID/);
  assert.match(API_V2_GUIDE_MARKDOWN, /Integraciones CRM/);
  assert.match(API_V2_GUIDE_MARKDOWN, /Integration ID.*no se coloca en la URL/);
  assert.match(API_V2_GUIDE_MARKDOWN, /postman\.json/);
});
