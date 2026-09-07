import assert from 'node:assert/strict';
import test from 'node:test';

import { applyInboundFieldMapping } from '../../server/services/integration-field-mapping';

test('maps CRM field names into the canonical Zinto payload', () => {
  const result = applyInboundFieldMapping(
    {
      crm_name: 'Andrea Díaz',
      mobile_number: '+56912345678',
      deal_stage: 'qualified',
      ignored_field: 'never persisted',
    },
    {
      name: 'crm_name',
      phone: 'mobile_number',
      stage: 'deal_stage',
    },
  );

  assert.deepEqual(result, {
    name: 'Andrea Díaz',
    phone: '+56912345678',
    stage: 'qualified',
  });
});

test('does not write an undefined source field over existing Zinto data', () => {
  const result = applyInboundFieldMapping(
    { crm_name: 'Andrea Díaz' },
    { name: 'crm_name', phone: 'mobile_number' },
  );

  assert.deepEqual(result, { name: 'Andrea Díaz' });
});

test('rejects a mapping that attempts to use a protected Zinto field', () => {
  assert.throws(
    () => applyInboundFieldMapping({ company_id: 999 }, { companyId: 'company_id' }),
    /cannot map protected field: companyId/
  );
});
