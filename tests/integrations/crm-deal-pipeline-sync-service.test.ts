import assert from 'node:assert/strict';
import test from 'node:test';

import { validateIncomingCrmDeal } from '../../server/services/crm-deal-pipeline-sync-service';

test('accepts a complete CRM deal in an allowed pipeline stage', () => {
  const result = validateIncomingCrmDeal({
    externalId: 'hubspot-deal-441',
    title: 'Enterprise rollout',
    stage: 'proposal',
    value: 12500,
  });

  assert.deepEqual(result, {
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
  });
});

test('rejects a CRM deal without a non-blank external ID', () => {
  assert.throws(
    () => validateIncomingCrmDeal({ externalId: '  ', title: 'Enterprise rollout', stage: 'lead', value: 0 }),
    /externalId must be a non-blank string/,
  );
});

test('rejects a CRM deal without a non-blank title', () => {
  assert.throws(
    () => validateIncomingCrmDeal({ externalId: 'hubspot-deal-441', title: '', stage: 'lead', value: 0 }),
    /title must be a non-blank string/,
  );
});

test('rejects a CRM deal whose stage is outside the supported pipeline stages', () => {
  assert.throws(
    () => validateIncomingCrmDeal({ externalId: 'hubspot-deal-441', title: 'Enterprise rollout', stage: 'won', value: 0 }),
    /stage must be one of: lead, qualified, contacted, demo_scheduled, proposal, negotiation, closed_won, closed_lost/,
  );
});

test('rejects a CRM deal value that is negative, fractional, or non-numeric', () => {
  for (const value of [-1, 1.5, Number.NaN]) {
    assert.throws(
      () => validateIncomingCrmDeal({ externalId: 'hubspot-deal-441', title: 'Enterprise rollout', stage: 'lead', value }),
      /value must be a nonnegative integer/,
    );
  }
});
