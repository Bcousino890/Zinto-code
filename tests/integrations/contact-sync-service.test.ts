import assert from 'node:assert/strict';
import test from 'node:test';

import { CrmContactSyncService } from '../../server/services/crm-contact-sync-service';

test('creates a Zinto contact and records its CRM external ID on first sync', async () => {
  const created: Array<Record<string, unknown>> = [];
  const mappings: Array<{ externalId: string; zintoId: number }> = [];
  const service = new CrmContactSyncService({
    integrationBelongsToCompany: async () => true,
    findByExternalId: async () => undefined,
    createContact: async (input) => { created.push(input); return { id: 91, ...input }; },
    updateContact: async () => { throw new Error('must not update'); },
    saveMapping: async (mapping) => { mappings.push(mapping); },
  });

  const result = await service.upsert({
    companyId: 12,
    integrationId: 3,
    externalId: 'hubspot-441',
    contact: { name: 'Andrea Díaz', phone: '+56912345678', email: 'andrea@example.com' },
  });

  assert.equal(result.created, true);
  assert.equal(result.contact.id, 91);
  assert.deepEqual(created, [{ companyId: 12, name: 'Andrea Díaz', phone: '+56912345678', email: 'andrea@example.com' }]);
  assert.deepEqual(mappings, [{ companyId: 12, integrationId: 3, externalId: 'hubspot-441', zintoId: 91 }]);
});

test('updates the mapped Zinto contact instead of creating a duplicate', async () => {
  const updated: Array<{ id: number; input: Record<string, unknown> }> = [];
  const service = new CrmContactSyncService({
    integrationBelongsToCompany: async () => true,
    findByExternalId: async () => ({ id: 91, name: 'Andrea anterior' }),
    createContact: async () => { throw new Error('must not create'); },
    updateContact: async (id, input) => { updated.push({ id, input }); return { id, ...input }; },
    saveMapping: async () => { throw new Error('must not remap'); },
  });

  const result = await service.upsert({
    companyId: 12,
    integrationId: 3,
    externalId: 'hubspot-441',
    contact: { name: 'Andrea Díaz' },
  });

  assert.equal(result.created, false);
  assert.deepEqual(updated, [{ id: 91, input: { name: 'Andrea Díaz' } }]);
});

test('refuses an integration ID that belongs to another company', async () => {
  const service = new CrmContactSyncService({
    integrationBelongsToCompany: async () => false,
    findByExternalId: async () => { throw new Error('must not query'); },
    createContact: async () => { throw new Error('must not create'); },
    updateContact: async () => { throw new Error('must not update'); },
    saveMapping: async () => { throw new Error('must not map'); },
  });

  await assert.rejects(
    () => service.upsert({ companyId: 12, integrationId: 999, externalId: 'other', contact: { name: 'Andrea Díaz' } }),
    /Integration does not belong to this company/,
  );
});
