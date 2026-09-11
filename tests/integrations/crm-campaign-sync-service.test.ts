import assert from 'node:assert/strict';
import test from 'node:test';

import { CrmCampaignSyncService } from '../../server/services/crm-campaign-sync-service';

test('creates CRM campaigns with the API-key owner and records their external mapping', async () => {
  const created: unknown[] = [];
  const mappings: unknown[] = [];
  const service = new CrmCampaignSyncService({
    integrationBelongsToCompany: async () => true,
    getCrmExternalMapping: async () => undefined,
    saveCrmExternalMapping: async (...input) => { mappings.push(input); },
  }, {
    createCampaign: async (...input) => {
      created.push(input);
      return { id: 71 } as any;
    },
    getCampaignById: async () => { throw new Error('not expected'); },
    updateCampaign: async () => { throw new Error('not expected'); },
  });

  await service.syncBatch({
    companyId: 12,
    integrationId: 3,
    actorUserId: 9,
    campaigns: [{ externalId: 'hubspot-campaign-7', name: 'September follow-up', content: 'Hello {{name}}' }],
  });

  assert.deepEqual(created, [[12, 9, {
    name: 'September follow-up',
    content: 'Hello {{name}}',
    channelType: 'whatsapp',
    campaignType: 'immediate',
  }]]);
  assert.deepEqual(mappings, [[12, 3, 'campaign', 'hubspot-campaign-7', 71]]);
});

test('updates the mapped campaign without creating a duplicate', async () => {
  const updates: unknown[] = [];
  const service = new CrmCampaignSyncService({
    integrationBelongsToCompany: async () => true,
    getCrmExternalMapping: async () => ({ zintoId: '71' }),
    saveCrmExternalMapping: async () => { throw new Error('not expected'); },
  }, {
    createCampaign: async () => { throw new Error('not expected'); },
    getCampaignById: async () => ({ id: 71, companyId: 12 }) as any,
    updateCampaign: async (...input) => { updates.push(input); return { id: 71 } as any; },
  });

  await service.syncBatch({
    companyId: 12,
    integrationId: 3,
    actorUserId: 9,
    campaigns: [{ externalId: 'hubspot-campaign-7', name: 'Updated follow-up', content: 'Updated copy', campaignType: 'scheduled', scheduledAt: '2026-10-01T10:00:00.000Z' }],
  });

  assert.deepEqual(updates, [[12, 71, {
    name: 'Updated follow-up',
    content: 'Updated copy',
    campaignType: 'scheduled',
    scheduledAt: '2026-10-01T10:00:00.000Z',
    channelType: 'whatsapp',
  }]]);
});

test('rejects a campaign sync for an integration outside the tenant', async () => {
  const service = new CrmCampaignSyncService({
    integrationBelongsToCompany: async () => false,
    getCrmExternalMapping: async () => undefined,
    saveCrmExternalMapping: async () => undefined,
  }, {} as any);

  await assert.rejects(() => service.syncBatch({
    companyId: 12,
    integrationId: 3,
    actorUserId: 9,
    campaigns: [{ externalId: 'hubspot-campaign-7', name: 'Follow-up', content: 'Hello' }],
  }), /Integration does not belong to this company/);
});
