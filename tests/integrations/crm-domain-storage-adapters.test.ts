import assert from 'node:assert/strict';
import test from 'node:test';

import { createCrmAppointmentStorageAdapter, createCrmDealStorageAdapter } from '../../server/services/crm-domain-storage-adapters';

test('creates then updates a tenant-owned CRM appointment by its external mapping', async () => {
  const created: unknown[] = [];
  const updated: unknown[] = [];
  const mappings = new Map<string, number>();
  const adapter = createCrmAppointmentStorageAdapter({
    crmIntegrationBelongsToCompany: async () => true,
    getContact: async (id) => id === 41 ? { id, companyId: 12 } : undefined,
    getContactAppointment: async (id) => id === 71 ? { id, companyId: 12 } : undefined,
    createContactAppointment: async (input) => { created.push(input); return { id: 71 }; },
    updateContactAppointment: async (id, input) => { updated.push({ id, input }); return { id }; },
    getCrmExternalMapping: async (_companyId, _integrationId, entityType, externalId) =>
      mappings.get(`${entityType}:${externalId}`) === undefined ? undefined : { zintoId: String(mappings.get(`${entityType}:${externalId}`)) },
    saveCrmExternalMapping: async (_companyId, _integrationId, entityType, externalId, zintoId) => {
      mappings.set(`${entityType}:${externalId}`, Number(zintoId));
    },
  });

  const input = {
    companyId: 12, integrationId: 3, externalId: 'crm-appointment-71', idempotencyKey: 'crm-appointment-71',
    appointment: { contactId: 41, title: 'Consultation', startsAt: '2026-10-03T09:00:00.000Z', endsAt: '2026-10-03T10:30:00.000Z', status: 'confirmed' },
  };
  assert.deepEqual(await adapter.upsert(input), { id: 71, created: true });
  assert.deepEqual(await adapter.upsert({ ...input, appointment: { ...input.appointment, title: 'Updated consultation' } }), { id: 71, created: false });
  assert.deepEqual(created, [{ companyId: 12, contactId: 41, title: 'Consultation', scheduledAt: new Date('2026-10-03T09:00:00.000Z'), durationMinutes: 90, status: 'confirmed' }]);
  assert.deepEqual(updated, [{ id: 71, input: { title: 'Updated consultation', scheduledAt: new Date('2026-10-03T09:00:00.000Z'), durationMinutes: 90, status: 'confirmed' } }]);
});

test('creates then updates a CRM deal only within its tenant contact and pipeline', async () => {
  const created: unknown[] = [];
  const updated: unknown[] = [];
  const mappings = new Map<string, number>();
  const adapter = createCrmDealStorageAdapter({
    crmIntegrationBelongsToCompany: async () => true,
    getContact: async (id) => id === 41 ? { id, companyId: 12 } : undefined,
    getPipeline: async (id) => id === 52 ? { id, companyId: 12 } : undefined,
    getDeal: async (id) => id === 81 ? { id, companyId: 12 } : undefined,
    createDeal: async (input) => { created.push(input); return { id: 81 }; },
    updateDeal: async (id, input) => { updated.push({ id, input }); return { id }; },
    getCrmExternalMapping: async (_companyId, _integrationId, entityType, externalId) =>
      mappings.get(`${entityType}:${externalId}`) === undefined ? undefined : { zintoId: String(mappings.get(`${entityType}:${externalId}`)) },
    saveCrmExternalMapping: async (_companyId, _integrationId, entityType, externalId, zintoId) => {
      mappings.set(`${entityType}:${externalId}`, Number(zintoId));
    },
  });

  const input = { companyId: 12, integrationId: 3, idempotencyKey: 'crm-deal-81', deal: { externalId: 'crm-deal-81', contactId: 41, pipelineId: 52, title: 'Enterprise', stage: 'proposal' as const, value: 12500 } };
  assert.deepEqual(await adapter.upsert({ ...input, ownership: { owner: 'crm', action: 'apply_incoming', reason: 'entity_default' } }), { id: 81, created: true, deal: { id: 81 } });
  assert.deepEqual(await adapter.upsert({ ...input, deal: { ...input.deal, title: 'Enterprise renewed' }, ownership: { owner: 'crm', action: 'apply_incoming', reason: 'entity_default' } }), { id: 81, created: false, deal: { id: 81 } });
  assert.deepEqual(created, [{ companyId: 12, contactId: 41, pipelineId: 52, title: 'Enterprise', stage: 'proposal', value: 12500 }]);
  assert.deepEqual(updated, [{ id: 81, input: { contactId: 41, pipelineId: 52, title: 'Enterprise renewed', stage: 'proposal', value: 12500 } }]);
});

test('refuses a CRM domain object outside the integration tenant before mutation', async () => {
  const adapter = createCrmDealStorageAdapter({
    crmIntegrationBelongsToCompany: async () => true,
    getContact: async () => ({ id: 41, companyId: 99 }),
    getPipeline: async () => ({ id: 52, companyId: 12 }),
    getDeal: async () => undefined,
    createDeal: async () => { throw new Error('must not create'); },
    updateDeal: async () => { throw new Error('must not update'); },
    getCrmExternalMapping: async () => undefined,
    saveCrmExternalMapping: async () => undefined,
  });
  await assert.rejects(() => adapter.upsert({
    companyId: 12, integrationId: 3, idempotencyKey: 'crm-deal-81',
    deal: { externalId: 'crm-deal-81', contactId: 41, pipelineId: 52, title: 'Enterprise', stage: 'proposal', value: 12500 },
    ownership: { owner: 'crm', action: 'apply_incoming', reason: 'entity_default' },
  }), /Contact does not belong to this company/);
});
