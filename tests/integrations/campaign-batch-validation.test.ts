import assert from 'node:assert/strict';
import test from 'node:test';

import { validateCampaignBatch } from '../../server/services/campaign-batch-validation';

test('accepts a batch from one through one hundred campaigns with distinct external IDs', () => {
  const campaigns = Array.from({ length: 100 }, (_, index) => ({
    externalId: `crm-campaign-${index + 1}`,
    name: `Campaign ${index + 1}`,
    content: 'Hello',
  }));

  assert.doesNotThrow(() => validateCampaignBatch(campaigns));
});

test('rejects an empty campaign batch', () => {
  assert.throws(
    () => validateCampaignBatch([]),
    /Campaign sync batch must contain between 1 and 100 campaigns/,
  );
});

test('rejects a campaign batch larger than one hundred records', () => {
  const campaigns = Array.from({ length: 101 }, (_, index) => ({
    externalId: `crm-campaign-${index + 1}`,
    name: `Campaign ${index + 1}`,
    content: 'Hello',
  }));

  assert.throws(
    () => validateCampaignBatch(campaigns),
    /Campaign sync batch must contain between 1 and 100 campaigns/,
  );
});

test('rejects duplicate campaign external IDs in a batch', () => {
  assert.throws(
    () => validateCampaignBatch([
      { externalId: 'crm-campaign-42', name: 'Campaign', content: 'Hello' },
      { externalId: 'crm-campaign-42', name: 'Campaign', content: 'Hello' },
    ]),
    /Campaign sync batch contains duplicate external ID: crm-campaign-42/,
  );
});

test('requires a campaign name and content that can be stored in Zinto', () => {
  assert.throws(
    () => validateCampaignBatch([{ externalId: 'crm-campaign-42', name: ' ', content: 'Hello' }]),
    /Campaign name is required/,
  );
  assert.throws(
    () => validateCampaignBatch([{ externalId: 'crm-campaign-42', name: 'Campaign', content: ' ' }]),
    /Campaign content is required/,
  );
});
