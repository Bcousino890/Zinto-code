import assert from 'node:assert/strict';
import test from 'node:test';

import { planInitialCrmSynchronization } from '../../server/services/initial-crm-synchronization-plan';

test('creates deterministic entity-scoped batches with trackable job counts', () => {
  const plan = planInitialCrmSynchronization({
    contacts: [{ externalId: 'contact-1' }, { externalId: 'contact-2' }, { externalId: 'contact-3' }],
    appointments: [{ externalId: 'appointment-1' }],
    deals: [{ externalId: 'deal-1' }, { externalId: 'deal-2' }],
    campaigns: [{ externalId: 'campaign-1' }],
    batchSize: 2,
  });

  assert.deepEqual(plan.jobs, [
    { id: 'contacts:1', entity: 'contacts', records: [{ externalId: 'contact-1' }, { externalId: 'contact-2' }] },
    { id: 'contacts:2', entity: 'contacts', records: [{ externalId: 'contact-3' }] },
    { id: 'appointments:1', entity: 'appointments', records: [{ externalId: 'appointment-1' }] },
    { id: 'deals:1', entity: 'deals', records: [{ externalId: 'deal-1' }, { externalId: 'deal-2' }] },
    { id: 'campaigns:1', entity: 'campaigns', records: [{ externalId: 'campaign-1' }] },
  ]);
  assert.deepEqual(plan.jobCounts, {
    total: 5,
    byEntity: { contacts: 2, appointments: 1, deals: 1, campaigns: 1 },
  });
});

test('permits an external ID once per entity while rejecting a duplicate within an entity', () => {
  assert.doesNotThrow(() => planInitialCrmSynchronization({
    contacts: [{ externalId: 'shared-id' }],
    appointments: [{ externalId: 'shared-id' }],
    deals: [],
    campaigns: [],
  }));

  assert.throws(
    () => planInitialCrmSynchronization({
      contacts: [{ externalId: 'duplicate' }, { externalId: 'duplicate' }],
      appointments: [],
      deals: [],
      campaigns: [],
    }),
    /Duplicate external ID for contacts: duplicate/,
  );
});
