import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WhatsAppTemplatesReadService,
  WhatsAppTemplatesWriteService,
  WhatsAppTemplateValidationError,
} from '../../server/services/whatsapp-template-v2-service';

test('WhatsAppTemplatesReadService forwards companyId and returns the port result unchanged', async () => {
  const seen: number[] = [];
  const service = new WhatsAppTemplatesReadService({
    list: async (companyId) => { seen.push(companyId); return [{ id: 1 } as any]; },
    get: async () => null,
  });

  const result = await service.list(12);

  assert.deepEqual(seen, [12]);
  assert.deepEqual(result, [{ id: 1 }]);
});

test('WhatsAppTemplatesReadService.get forwards companyId/templateId and passes through null', async () => {
  const seen: Array<[number, number]> = [];
  const service = new WhatsAppTemplatesReadService({
    list: async () => [],
    get: async (companyId, templateId) => { seen.push([companyId, templateId]); return null; },
  });

  const result = await service.get(12, 99);

  assert.deepEqual(seen, [[12, 99]]);
  assert.equal(result, null);
});

test('WhatsAppTemplatesWriteService.create forwards all arguments and returns the port result', async () => {
  const seen: unknown[] = [];
  const created = { id: 5, name: 'welcome' } as any;
  const service = new WhatsAppTemplatesWriteService({
    create: async (companyId, userId, input) => { seen.push([companyId, userId, input]); return created; },
    update: async () => null,
    delete: async () => false,
  });

  const result = await service.create(12, 3, { name: 'welcome', content: 'Hi', connectionId: 7 });

  assert.deepEqual(seen, [[12, 3, { name: 'welcome', content: 'Hi', connectionId: 7 }]]);
  assert.equal(result, created);
});

test('WhatsAppTemplatesWriteService.update/delete pass through not-found (null/false) unchanged', async () => {
  const service = new WhatsAppTemplatesWriteService({
    create: async () => ({ id: 1 } as any),
    update: async () => null,
    delete: async () => false,
  });

  assert.equal(await service.update(12, 99, { isActive: false }), null);
  assert.equal(await service.delete(12, 99), false);
});

test('WhatsAppTemplateValidationError carries a plain, safe-to-show message', () => {
  const error = new WhatsAppTemplateValidationError('Name and content are required');
  assert.equal(error.message, 'Name and content are required');
  assert.equal(error.name, 'WhatsAppTemplateValidationError');
  assert.ok(error instanceof Error);
});
