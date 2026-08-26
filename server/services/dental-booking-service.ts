import type { ContactAppointment } from '@shared/schema';
import type { DentalBookingPolicy } from '@shared/types/dental-booking-types';
import {
  DEFAULT_DENTAL_AVAILABILITY_LIMIT,
  DEFAULT_DENTAL_SLOT_STEP_MINUTES,
  DENTAL_AVAILABILITY_MAX_LIMIT,
  appointmentEndsAt,
  appointmentsOverlap,
  findBookableCatalogItem,
  getProviderWorkStartMinutes,
  getSpecialistAllowedChairIds,
  isAiBookableSpecialist,
  isBookableDentist,
  isDentalBookingBlocking,
  isDentalBookingAwaitingStaff,
  isDentalSlotGridAligned,
  resolveProviderDaySchedules,
  specialistMatchesSpecialty,
  type DentalAvailableSlot,
  type DentalAwaitingStaffStatus,
  type DentalBookAppointmentInput,
  type DentalBookableCatalogItem,
  type DentalPendingBookingQuery,
} from '@shared/types/dental-booking-types';
import { getActiveBreaksForDay, parseTimeToMinutes, slotIntersectsAnyBreak } from '@shared/utils/calendar-breaks';
import { getZonedDateTimeParts } from '@shared/utils/agent-schedule';
import { ErpConflictError, ErpValidationError, storage } from '../storage';
import { getDentalBookingPolicy } from './dental-booking-policy-service';
import { normalizeTimezone, parseInZoneToUTC } from '../utils/timezone';

export type DentalAvailabilityQuery = {
  providerUserId: number;
  catalogItemId: string;
  from: string;
  to: string;
  limit?: number;
};

type PreparedBookingSlot = {
  policy: DentalBookingPolicy;
  catalogItem: DentalBookableCatalogItem;
  scheduledAt: Date;
  chairId: number | null;
  bookingStatus: 'confirmed' | 'held' | 'pending_request';
  holdExpiresAt: Date | null;
};

async function resolveCompanyTimezone(companyId: number): Promise<string> {
  const setting = await storage.getCompanySetting(companyId, 'defaultTimezone');
  const raw = typeof setting?.value === 'string' ? setting.value : 'UTC';
  return normalizeTimezone(raw);
}

async function sweepExpiredBookings(companyId: number): Promise<void> {
  await storage.expireDentalBookingHolds(companyId);
}

function formatMinutesAsTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

function buildDateKeysInRange(from: Date, to: Date, timezone: string): string[] {
  if (to <= from) return [];
  const keys: string[] = [];
  let key = getZonedDateTimeParts(from, timezone).dateKey;
  const endKey = getZonedDateTimeParts(new Date(to.getTime() - 1), timezone).dateKey;
  while (key <= endKey) {
    keys.push(key);
    key = addDaysToDateKey(key, 1);
  }
  return keys;
}

function filterBlockingAppointments(
  appointments: ContactAppointment[],
  now: Date = new Date(),
): ContactAppointment[] {
  return appointments.filter((apt) => isDentalBookingBlocking(apt.status, apt.holdExpiresAt, now));
}

function isProviderFree(
  blockingAppointments: ContactAppointment[],
  providerUserId: number,
  slotStart: Date,
  durationMinutes: number,
): boolean {
  return !blockingAppointments.some(
    (apt) =>
      apt.providerUserId === providerUserId &&
      appointmentsOverlap(slotStart, durationMinutes, apt.scheduledAt, apt.durationMinutes ?? 60),
  );
}

function findFreeChairId(
  chairs: Array<{ id: number }>,
  blockingAppointments: ContactAppointment[],
  slotStart: Date,
  durationMinutes: number,
): number | null {
  for (const chair of chairs) {
    const chairBusy = blockingAppointments.some(
      (apt) =>
        apt.chairId === chair.id &&
        appointmentsOverlap(slotStart, durationMinutes, apt.scheduledAt, apt.durationMinutes ?? 60),
    );
    if (!chairBusy) return chair.id;
  }
  return null;
}

function isWithinProviderHours(
  schedules: ReturnType<typeof resolveProviderDaySchedules>,
  dayIndex: number,
  slotStartMinutes: number,
  durationMinutes: number,
): boolean {
  const day = schedules.find((entry) => entry.dayIndex === dayIndex);
  if (!day?.enabled) return false;
  const workStart = parseTimeToMinutes(day.startTime);
  const workEnd = parseTimeToMinutes(day.endTime);
  if (workStart == null || workEnd == null || workEnd <= workStart) return false;
  const slotEndMinutes = slotStartMinutes + durationMinutes;
  if (slotStartMinutes < workStart || slotEndMinutes > workEnd) return false;
  const breaks = getActiveBreaksForDay(day);
  return !slotIntersectsAnyBreak(slotStartMinutes, slotEndMinutes, breaks);
}

async function loadBlockingAppointmentsInRange(
  companyId: number,
  from: Date,
  to: Date,
): Promise<ContactAppointment[]> {
  const appointments = await storage.listDentalAppointmentsOverlapping(companyId, from, to);
  return filterBlockingAppointments(appointments);
}

async function pickAvailableChair(
  companyId: number,
  providerUserId: number,
  scheduledAt: Date,
  durationMinutes: number,
  allowedChairIds?: number[] | null,
): Promise<number | null> {
  let chairs = await storage.listDentalChairs(companyId, { activeOnly: true });
  if (allowedChairIds && allowedChairIds.length > 0) {
    const allowed = new Set(allowedChairIds);
    chairs = chairs.filter((chair) => allowed.has(chair.id));
  }
  for (const chair of chairs) {
    try {
      await storage.assertDentalAppointmentSlotAvailable(companyId, {
        scheduledAt,
        durationMinutes,
        providerUserId,
        chairId: chair.id,
        capacityMode: 'provider_and_chair',
      });
      return chair.id;
    } catch (error) {
      if (error instanceof ErpConflictError) continue;
      throw error;
    }
  }
  return null;
}

function resolveBookingStatus(policy: DentalBookingPolicy): {
  status: PreparedBookingSlot['bookingStatus'];
  holdExpiresAt: Date | null;
} {
  if (policy.authorityMode === 'instant') {
    return { status: 'confirmed', holdExpiresAt: null };
  }
  const holdExpiresAt = new Date(Date.now() + policy.holdTimeoutMinutes * 60_000);
  if (policy.authorityMode === 'hold') {
    return { status: 'held', holdExpiresAt };
  }
  return { status: 'pending_request', holdExpiresAt };
}

/** When the specialist has an allow-list, AI (and capacity) must use those offices. */
function resolveEffectiveChairConstraint(
  policy: DentalBookingPolicy,
  providerUserId: number,
  bookingSource: DentalBookAppointmentInput['bookingSource'],
): { requireChair: boolean; allowedChairIds: number[] | null } {
  const allowedChairIds = getSpecialistAllowedChairIds(policy, providerUserId);
  if (allowedChairIds.length > 0) {
    return { requireChair: true, allowedChairIds };
  }
  if (policy.capacityMode === 'provider_and_chair') {
    return { requireChair: true, allowedChairIds: null };
  }
  // AI bookings with incomplete profiles should already be rejected upstream; staff can still book provider-only.
  if (bookingSource === 'ai_local') {
    return { requireChair: false, allowedChairIds: null };
  }
  return { requireChair: false, allowedChairIds: null };
}

async function prepareDentalBookingSlot(
  companyId: number,
  input: DentalBookAppointmentInput,
): Promise<PreparedBookingSlot> {
  const policy = await getDentalBookingPolicy(companyId);

  const patient = await storage.getDentalPatientByContactId(companyId, input.contactId);
  if (!patient) {
    throw new ErpValidationError('Contact is not a dental patient');
  }

  const catalogItem = findBookableCatalogItem(policy, input.catalogItemId);
  if (!catalogItem) {
    throw new ErpValidationError('Unknown or inactive catalog item');
  }
  if (!isBookableDentist(policy, input.providerUserId)) {
    throw new ErpValidationError('Provider is not bookable');
  }

  if (input.bookingSource === 'ai_local') {
    if (!isAiBookableSpecialist(policy, input.providerUserId)) {
      throw new ErpValidationError(
        'Provider is missing specialty or allowed office configuration for online booking',
      );
    }
    if (!specialistMatchesSpecialty(policy, input.providerUserId, catalogItem.specialtyId)) {
      throw new ErpValidationError('Provider specialty does not match the selected service');
    }
  }

  const scheduledAt = new Date(input.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new ErpValidationError('Invalid scheduledAt');
  }
  if (scheduledAt.getTime() < Date.now()) {
    throw new ErpValidationError('Cannot book an appointment in the past');
  }

  const timezone = await resolveCompanyTimezone(companyId);
  const parts = getZonedDateTimeParts(scheduledAt, timezone);
  const schedules = resolveProviderDaySchedules(policy, input.providerUserId);
  if (!isWithinProviderHours(schedules, parts.dayIndex, parts.timeMinutes, catalogItem.durationMinutes)) {
    throw new ErpValidationError('Requested time is outside provider working hours');
  }
  const workStartMinutes = getProviderWorkStartMinutes(schedules, parts.dayIndex);
  if (workStartMinutes == null || !isDentalSlotGridAligned(scheduledAt, timezone, workStartMinutes)) {
    throw new ErpValidationError('Requested time does not align with available booking slots');
  }

  const chairConstraint = resolveEffectiveChairConstraint(
    policy,
    input.providerUserId,
    input.bookingSource,
  );
  let chairId: number | null = input.chairId ?? null;

  if (chairConstraint.requireChair) {
    if (chairId != null) {
      const chair = await storage.getDentalChair(companyId, chairId);
      if (!chair?.isActive) {
        throw new ErpValidationError('Office is not active');
      }
      if (
        chairConstraint.allowedChairIds &&
        !chairConstraint.allowedChairIds.includes(chairId)
      ) {
        throw new ErpValidationError('Provider is not assigned to the selected office');
      }
    } else {
      chairId = await pickAvailableChair(
        companyId,
        input.providerUserId,
        scheduledAt,
        catalogItem.durationMinutes,
        chairConstraint.allowedChairIds,
      );
      if (chairId == null) {
        throw new ErpConflictError('No office available at the requested time');
      }
    }
  } else {
    chairId = null;
  }

  const { status, holdExpiresAt } = resolveBookingStatus(policy);
  return {
    policy,
    catalogItem,
    scheduledAt,
    chairId,
    bookingStatus: status,
    holdExpiresAt,
  };
}

export async function getDentalAvailableSlots(
  companyId: number,
  query: DentalAvailabilityQuery,
): Promise<DentalAvailableSlot[]> {
  await sweepExpiredBookings(companyId);

  const policy = await getDentalBookingPolicy(companyId);
  const catalogItem = findBookableCatalogItem(policy, query.catalogItemId);
  if (!catalogItem) {
    throw new ErpValidationError('Unknown or inactive catalog item');
  }
  if (!isBookableDentist(policy, query.providerUserId)) {
    throw new ErpValidationError('Provider is not bookable');
  }

  const from = new Date(query.from);
  const to = new Date(query.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new ErpValidationError('Invalid availability range');
  }
  if (to <= from) {
    throw new ErpValidationError('`to` must be after `from`');
  }

  const timezone = await resolveCompanyTimezone(companyId);
  const limit = Math.min(
    query.limit ?? DEFAULT_DENTAL_AVAILABILITY_LIMIT,
    DENTAL_AVAILABILITY_MAX_LIMIT,
  );
  const durationMinutes = catalogItem.durationMinutes;
  const schedules = resolveProviderDaySchedules(policy, query.providerUserId);
  const now = new Date();

  const rangeEnd = appointmentEndsAt(to, durationMinutes);
  const blockingAppointments = await loadBlockingAppointmentsInRange(
    companyId,
    from,
    rangeEnd,
  );

  let chairs: Array<{ id: number }> = [];
  const allowedChairIds = getSpecialistAllowedChairIds(policy, query.providerUserId);
  const requireChair =
    policy.capacityMode === 'provider_and_chair' || allowedChairIds.length > 0;
  if (requireChair) {
    chairs = await storage.listDentalChairs(companyId, { activeOnly: true });
    if (allowedChairIds.length > 0) {
      const allowed = new Set(allowedChairIds);
      chairs = chairs.filter((chair) => allowed.has(chair.id));
    }
    if (chairs.length === 0) return [];
  }

  const slots: DentalAvailableSlot[] = [];
  const dateKeys = buildDateKeysInRange(from, to, timezone);

  for (const dateKey of dateKeys) {
    const dayProbe = parseInZoneToUTC(`${dateKey}T12:00:00`, timezone);
    const dayIndex = getZonedDateTimeParts(dayProbe, timezone).dayIndex;
    const day = schedules.find((entry) => entry.dayIndex === dayIndex);
    if (!day?.enabled) continue;

    const workStart = parseTimeToMinutes(day.startTime);
    const workEnd = parseTimeToMinutes(day.endTime);
    if (workStart == null || workEnd == null || workEnd <= workStart) continue;

    for (
      let slotStartMinutes = workStart;
      slotStartMinutes + durationMinutes <= workEnd;
      slotStartMinutes += DEFAULT_DENTAL_SLOT_STEP_MINUTES
    ) {
      if (!isWithinProviderHours(schedules, dayIndex, slotStartMinutes, durationMinutes)) continue;

      const scheduledAt = parseInZoneToUTC(
        `${dateKey}T${formatMinutesAsTime(slotStartMinutes)}:00`,
        timezone,
      );
      if (scheduledAt < from || scheduledAt >= to || scheduledAt < now) continue;
      if (!isProviderFree(blockingAppointments, query.providerUserId, scheduledAt, durationMinutes)) {
        continue;
      }

      let chairId: number | null = null;
      if (requireChair) {
        chairId = findFreeChairId(chairs, blockingAppointments, scheduledAt, durationMinutes);
        if (chairId == null) continue;
      }

      slots.push({
        scheduledAt: scheduledAt.toISOString(),
        durationMinutes,
        providerUserId: query.providerUserId,
        chairId,
      });
      if (slots.length >= limit) return slots;
    }
  }

  return slots;
}

export async function bookDentalAppointment(
  companyId: number,
  input: DentalBookAppointmentInput,
  createdBy?: number,
) {
  await sweepExpiredBookings(companyId);

  const prepared = await prepareDentalBookingSlot(companyId, input);
  const capacityMode =
    prepared.chairId != null ? 'provider_and_chair' : prepared.policy.capacityMode;

  return storage.createDentalScheduleAppointment(
    {
      companyId,
      contactId: input.contactId,
      title: prepared.catalogItem.label,
      description: null,
      location: null,
      scheduledAt: prepared.scheduledAt,
      durationMinutes: prepared.catalogItem.durationMinutes,
      type: prepared.catalogItem.visitType ?? 'consultation',
      status: prepared.bookingStatus,
      providerUserId: input.providerUserId,
      chairId: prepared.chairId,
      isRecall: false,
      recallDueAt: null,
      holdExpiresAt: prepared.holdExpiresAt,
      bookingSource: input.bookingSource,
      bookingServiceKey: prepared.catalogItem.id,
      bookingServiceLabel: prepared.catalogItem.label,
      createdBy: createdBy ?? null,
    },
    { capacityMode },
  );
}

export async function listPendingDentalBookings(
  companyId: number,
  query: DentalPendingBookingQuery = {},
) {
  await sweepExpiredBookings(companyId);

  const statuses: DentalAwaitingStaffStatus[] | undefined =
    query.status && query.status !== 'all' ? [query.status] : undefined;

  let from: Date | undefined;
  let to: Date | undefined;
  if (query.from) {
    from = new Date(query.from);
    if (Number.isNaN(from.getTime())) throw new ErpValidationError('Invalid `from` date');
  }
  if (query.to) {
    to = new Date(query.to);
    if (Number.isNaN(to.getTime())) throw new ErpValidationError('Invalid `to` date');
  }

  return storage.listPendingDentalBookings(companyId, {
    providerUserId: query.providerUserId,
    from,
    to,
    statuses,
  });
}

export async function confirmDentalBooking(companyId: number, appointmentId: number) {
  await sweepExpiredBookings(companyId);
  const policy = await getDentalBookingPolicy(companyId);
  return storage.confirmDentalScheduleBooking(companyId, appointmentId, 'held', policy.capacityMode);
}

export async function approveDentalBookingRequest(companyId: number, appointmentId: number) {
  await sweepExpiredBookings(companyId);
  const policy = await getDentalBookingPolicy(companyId);
  return storage.confirmDentalScheduleBooking(
    companyId,
    appointmentId,
    'pending_request',
    policy.capacityMode,
  );
}

export async function declineDentalBooking(companyId: number, appointmentId: number) {
  const existing = await storage.getDentalScheduleAppointment(companyId, appointmentId);
  if (!existing) throw new ErpValidationError('Appointment not found');
  if (!isDentalBookingAwaitingStaff(existing.status)) {
    throw new ErpValidationError('Appointment cannot be declined in its current status');
  }
  return storage.declineDentalScheduleBooking(companyId, appointmentId, ['held', 'pending_request']);
}

export async function expireDentalBookingHolds(companyId?: number): Promise<{ expiredCount: number }> {
  const expiredCount = await storage.expireDentalBookingHolds(companyId);
  return { expiredCount };
}
