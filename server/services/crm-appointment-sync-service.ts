import {
  resolveSyncConflict,
  type SyncConflictDecision,
} from './scheduling-pipeline-sync-policy';
import { CONTACT_APPOINTMENT_STATUSES, type ContactAppointmentStatus } from '@shared/types/dental-booking-types';

export interface IncomingCrmAppointmentInput {
  contactId: number;
  title: string;
  externalId: string;
  startsAt: string;
  endsAt: string;
  status: ContactAppointmentStatus;
}

export interface ValidatedIncomingCrmAppointment extends IncomingCrmAppointmentInput {
  syncDecision: SyncConflictDecision;
}

const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function assertNonEmptyString(value: unknown, field: 'externalId' | 'title' | 'status'): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
}

function assertPositiveInteger(value: unknown, field: 'contactId'): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
}

function assertSupportedStatus(value: unknown): asserts value is ContactAppointmentStatus {
  if (
    typeof value !== 'string' ||
    !CONTACT_APPOINTMENT_STATUSES.some((status) => status === value)
  ) {
    throw new Error('status must be a supported appointment status');
  }
}

function parseIsoTimestamp(
  value: unknown,
  field: 'startsAt' | 'endsAt',
): { isoTimestamp: string; timestamp: number } {
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a valid ISO timestamp`);
  }

  const match = ISO_TIMESTAMP_PATTERN.exec(value);
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

  return { isoTimestamp: value, timestamp };
}

/**
 * Validates an appointment received from a CRM and records the applicable
 * scheduling-pipeline ownership decision without performing I/O.
 */
export function validateIncomingCrmAppointment(
  input: unknown,
): ValidatedIncomingCrmAppointment {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('incoming CRM appointment must be an object');
  }

  const record = input as Record<string, unknown>;
  assertPositiveInteger(record.contactId, 'contactId');
  assertNonEmptyString(record.title, 'title');
  assertNonEmptyString(record.externalId, 'externalId');
  const startsAt = parseIsoTimestamp(record.startsAt, 'startsAt');
  const endsAt = parseIsoTimestamp(record.endsAt, 'endsAt');
  assertNonEmptyString(record.status, 'status');
  assertSupportedStatus(record.status);

  if (endsAt.timestamp <= startsAt.timestamp) {
    throw new Error('endsAt must be after startsAt');
  }

  return {
    contactId: record.contactId,
    title: record.title,
    externalId: record.externalId,
    startsAt: startsAt.isoTimestamp,
    endsAt: endsAt.isoTimestamp,
    status: record.status,
    syncDecision: resolveSyncConflict({
      entity: 'appointment',
      incomingSource: 'crm',
    }),
  };
}

export const validateIncomingCrmAppointmentInput = validateIncomingCrmAppointment;
