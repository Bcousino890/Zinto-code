import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AppointmentV2Service,
  AppointmentV2ValidationError,
} from '../../server/services/appointment-v2-service';

const request = {
  companyId: 7,
  integrationId: 'integration_7',
  externalId: 'crm-appointment-42',
  idempotencyKey: 'request-42',
  appointment: { contactId: 12, scheduledAt: '2026-10-03T09:00:00.000Z' },
};

test('rejects a blank idempotency key before appointment validation or persistence', async () => {
  let validated = false;
  let persisted = false;
  const service = new AppointmentV2Service({
    validate: () => {
      validated = true;
      return request.appointment;
    },
    ownershipPolicy: ({ appointment }) => appointment,
    port: {
      upsert: async () => {
        persisted = true;
        return { id: 'apt_1', created: true };
      },
    },
  });

  await assert.rejects(
    () => service.sync({ ...request, idempotencyKey: '   ' }),
    (error: unknown) =>
      error instanceof AppointmentV2ValidationError &&
      error.code === 'IDEMPOTENCY_KEY_REQUIRED' &&
      error.message === 'Idempotency-Key is required',
  );
  assert.equal(validated, false);
  assert.equal(persisted, false);
});

test('passes the validated and ownership-approved appointment to the route persistence port', async () => {
  const calls: string[] = [];
  const approvedAppointment = {
    contactId: 12,
    scheduledAt: '2026-10-03T09:00:00.000Z',
    title: 'Initial consultation',
  };
  let persistedInput: unknown;
  const service = new AppointmentV2Service({
    validate: (appointment) => {
      calls.push('validate');
      assert.deepEqual(appointment, request.appointment);
      return { ...appointment, title: 'Initial consultation' };
    },
    ownershipPolicy: ({ companyId, integrationId, externalId, appointment }) => {
      calls.push('ownership');
      assert.equal(companyId, 7);
      assert.equal(integrationId, 'integration_7');
      assert.equal(externalId, 'crm-appointment-42');
      assert.deepEqual(appointment, approvedAppointment);
      return appointment;
    },
    port: {
      upsert: async (input) => {
        calls.push('upsert');
        persistedInput = input;
        return { id: 99, created: false };
      },
    },
  });

  const result = await service.sync(request);

  assert.deepEqual(result, { id: 99, created: false });
  assert.deepEqual(calls, ['validate', 'ownership', 'upsert']);
  assert.deepEqual(persistedInput, {
    companyId: 7,
    integrationId: 'integration_7',
    externalId: 'crm-appointment-42',
    idempotencyKey: 'request-42',
    appointment: approvedAppointment,
  });
});

test('does not persist an appointment rejected by the ownership policy', async () => {
  let persisted = false;
  const service = new AppointmentV2Service({
    validate: (appointment) => appointment,
    ownershipPolicy: () => {
      throw new AppointmentV2ValidationError(
        'APPOINTMENT_FIELD_NOT_OWNED',
        'The CRM does not own scheduledAt',
      );
    },
    port: {
      upsert: async () => {
        persisted = true;
        return { id: 'apt_1', created: true };
      },
    },
  });

  await assert.rejects(
    () => service.sync(request),
    (error: unknown) =>
      error instanceof AppointmentV2ValidationError &&
      error.code === 'APPOINTMENT_FIELD_NOT_OWNED',
  );
  assert.equal(persisted, false);
});
