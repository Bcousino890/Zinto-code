import assert from 'node:assert/strict';
import test from 'node:test';

import { validateIncomingCrmAppointment } from '../../server/services/crm-appointment-sync-service';

const validAppointment = {
  contactId: 41,
  title: 'Initial consultation',
  externalId: 'crm-appointment-441',
  startsAt: '2026-09-07T09:00:00.000Z',
  endsAt: '2026-09-07T09:30:00.000Z',
  status: 'confirmed',
};

test('accepts a valid CRM appointment and applies CRM appointment ownership', () => {
  assert.deepEqual(validateIncomingCrmAppointment(validAppointment), {
    ...validAppointment,
    syncDecision: {
      owner: 'crm',
      action: 'apply_incoming',
      reason: 'entity_default',
    },
  });
});

test('rejects an appointment without an external ID', () => {
  assert.throws(
    () => validateIncomingCrmAppointment({ ...validAppointment, externalId: '  ' }),
    /externalId is required/,
  );
});

test('rejects invalid ISO appointment timestamps', () => {
  assert.throws(
    () => validateIncomingCrmAppointment({ ...validAppointment, startsAt: 'tomorrow morning' }),
    /startsAt must be a valid ISO timestamp/,
  );

  assert.throws(
    () => validateIncomingCrmAppointment({ ...validAppointment, endsAt: '2026-02-30T09:30:00.000Z' }),
    /endsAt must be a valid ISO timestamp/,
  );
});

test('rejects an appointment that does not end after it starts', () => {
  assert.throws(
    () => validateIncomingCrmAppointment({ ...validAppointment, endsAt: validAppointment.startsAt }),
    /endsAt must be after startsAt/,
  );
});

test('rejects an appointment without a status', () => {
  assert.throws(
    () => validateIncomingCrmAppointment({ ...validAppointment, status: '' }),
    /status is required/,
  );
});

test('rejects an appointment status outside the Zinto appointment lifecycle', () => {
  assert.throws(
    () => validateIncomingCrmAppointment({ ...validAppointment, status: 'tentative' }),
    /status must be a supported appointment status/,
  );
});
