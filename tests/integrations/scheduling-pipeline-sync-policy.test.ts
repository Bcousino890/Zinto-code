import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveSyncConflict } from '../../server/services/scheduling-pipeline-sync-policy';

test('applies a CRM appointment update because CRM owns appointments by default', () => {
  const decision = resolveSyncConflict({
    entity: 'appointment',
    incomingSource: 'crm',
  });

  assert.deepEqual(decision, {
    owner: 'crm',
    action: 'apply_incoming',
    reason: 'entity_default',
  });
});

test('keeps a Zinto conversation when the incoming update is from CRM', () => {
  const decision = resolveSyncConflict({
    entity: 'conversation',
    incomingSource: 'crm',
  });

  assert.deepEqual(decision, {
    owner: 'zinto',
    action: 'keep_existing',
    reason: 'entity_default',
  });
});

test('applies a Zinto deal update when its field ownership overrides the CRM default', () => {
  const decision = resolveSyncConflict({
    entity: 'deal',
    incomingSource: 'zinto',
    field: 'nextStep',
    fieldOwners: { nextStep: 'zinto' },
  });

  assert.deepEqual(decision, {
    owner: 'zinto',
    action: 'apply_incoming',
    reason: 'field_override',
  });
});
