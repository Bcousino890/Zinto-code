import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCrmDealPipelineApiV2Service,
  type CrmDealPipelineAdapter,
} from '../../server/services/crm-deal-pipeline-api-v2-service';

test('passes a validated CRM deal, ownership decision, and normalized idempotency key to the adapter', async () => {
  const received: unknown[] = [];
  const adapter: CrmDealPipelineAdapter = {
    upsert: async (input) => {
      received.push(input);
      return { created: true, deal: { id: 91 } };
    },
  };

  const service = createCrmDealPipelineApiV2Service(adapter);
  const result = await service.upsert({
    companyId: 12,
    integrationId: 3,
    idempotencyKey: ' crm-deal-441 ',
    deal: {
      externalId: 'hubspot-deal-441',
      title: 'Enterprise rollout',
      stage: 'proposal',
      value: 12500,
    },
  });

  assert.deepEqual(result, { created: true, deal: { id: 91 } });
  assert.deepEqual(received, [{
    companyId: 12,
    integrationId: 3,
    idempotencyKey: 'crm-deal-441',
    deal: {
      externalId: 'hubspot-deal-441',
      title: 'Enterprise rollout',
      stage: 'proposal',
      value: 12500,
    },
    ownership: {
      owner: 'crm',
      action: 'apply_incoming',
      reason: 'entity_default',
    },
  }]);
});

test('rejects a missing, short, or oversized idempotency key before calling the adapter', async () => {
  let calls = 0;
  const service = createCrmDealPipelineApiV2Service({
    upsert: async () => {
      calls += 1;
      return { created: true, deal: { id: 91 } };
    },
  });
  const deal = { externalId: 'hubspot-deal-441', title: 'Enterprise rollout', stage: 'lead', value: 0 };

  for (const idempotencyKey of [undefined, ' short ', 'x'.repeat(129)]) {
    await assert.rejects(
      () => service.upsert({ companyId: 12, integrationId: 3, idempotencyKey, deal }),
      /idempotencyKey must be a trimmed string between 8 and 128 characters/,
    );
  }
  assert.equal(calls, 0);
});

test('rejects an invalid company or integration before calling the adapter', async () => {
  let calls = 0;
  const service = createCrmDealPipelineApiV2Service({
    upsert: async () => {
      calls += 1;
      return { created: true, deal: { id: 91 } };
    },
  });
  const request = {
    idempotencyKey: 'crm-deal-441',
    deal: { externalId: 'hubspot-deal-441', title: 'Enterprise rollout', stage: 'lead', value: 0 },
  };

  await assert.rejects(() => service.upsert({ ...request, companyId: 0, integrationId: 3 }), /companyId must be a positive integer/);
  await assert.rejects(() => service.upsert({ ...request, companyId: 12, integrationId: 0 }), /integrationId must be a positive integer/);
  assert.equal(calls, 0);
});

test('uses the existing CRM deal validator before handing the request to the adapter', async () => {
  let calls = 0;
  const service = createCrmDealPipelineApiV2Service({
    upsert: async () => {
      calls += 1;
      return { created: true, deal: { id: 91 } };
    },
  });

  await assert.rejects(
    () => service.upsert({
      companyId: 12,
      integrationId: 3,
      idempotencyKey: 'crm-deal-441',
      deal: { externalId: 'hubspot-deal-441', title: 'Enterprise rollout', stage: 'won', value: 0 },
    }),
    /stage must be one of/,
  );
  assert.equal(calls, 0);
});
