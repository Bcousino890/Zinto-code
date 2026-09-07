import {
  resolveSyncConflict,
  type SyncConflictDecision,
} from './scheduling-pipeline-sync-policy';

export interface IncomingCrmAppointmentInput {
  externalId: string;
  startsAt: string;
  endsAt: string;
  status: string;
}

export interface ValidatedIncomingCrmAppointment extends IncomingCrmAppointmentInput {
  syncDecision: SyncConflictDecision;
}

const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function assertNonEmptyString(value: unknown, field: 'externalId' | 'status'): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
}

function parseIsoTimestamp(value: unknown, field: 'startsAt' | 'endsAt'): number {
  const match = typeof value === 'string' ? ISO_TIMESTAMP_PATTERN.exec(value) : null;
  if (!match) {
    throw new Error(`${field} must be a valid ISO timestamp`);
  }

  const timestamp = Date.parse(value);
  const calendarDate = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const hasValidCalendarDate =
    calendarDate.getUTCFullYear() === Number(match[1]) &&
    calendarDate.getUTCMonth() === Number(match[2]) - 1 &&
    calendarDate.getUTCDate() === Number(match[3]);

  if (Number.isNaN(timestamp) || !hasValidCalendarDate) {
    throw new Error(`${field} must be a valid ISO timestamp`);
  }

  return timestamp;
}

/**
 * Validates an appointment received from a CRM and records the applicable
 * scheduling-pipeline ownership decision without performing I/O.
 */
export function validateIncomingCrmAppointment(
  input: IncomingCrmAppointmentInput,
): ValidatedIncomingCrmAppointment {
  assertNonEmptyString(input.externalId, 'externalId');
  const startsAt = parseIsoTimestamp(input.startsAt, 'startsAt');
  const endsAt = parseIsoTimestamp(input.endsAt, 'endsAt');
  assertNonEmptyString(input.status, 'status');

  if (endsAt <= startsAt) {
    throw new Error('endsAt must be after startsAt');
  }

  return {
    ...input,
    syncDecision: resolveSyncConflict({
      entity: 'appointment',
      incomingSource: 'crm',
    }),
  };
}

export const validateIncomingCrmAppointmentInput = validateIncomingCrmAppointment;
