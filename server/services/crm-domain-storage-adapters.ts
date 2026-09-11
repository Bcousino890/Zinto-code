import type { ContactAppointmentStatus } from '@shared/types/dental-booking-types';
import type { AppointmentV2Port } from './appointment-v2-service';
import type { CrmDealPipelineAdapter } from './crm-deal-pipeline-api-v2-service';
import type { IncomingCrmDeal } from './crm-deal-pipeline-sync-service';

type Mapping = { zintoId: string };
type ScopedRecord = { id: number; companyId: number | null };
type CrmMappingStorage = {
  crmIntegrationBelongsToCompany(companyId: number, integrationId: number): Promise<boolean>;
  getCrmExternalMapping(companyId: number, integrationId: number, entityType: 'appointment' | 'deal', externalId: string): Promise<Mapping | undefined>;
  saveCrmExternalMapping(companyId: number, integrationId: number, entityType: 'appointment' | 'deal', externalId: string, zintoId: number): Promise<void>;
};

export type CrmAppointmentPayload = {
  contactId: number;
  title: string;
  startsAt: string;
  endsAt: string;
  status: ContactAppointmentStatus;
};

type AppointmentStorage = CrmMappingStorage & {
  getContact(id: number): Promise<ScopedRecord | undefined>;
  getContactAppointment(id: number): Promise<ScopedRecord | undefined>;
  createContactAppointment(input: {
    companyId: number;
    contactId: number;
    title: string;
    scheduledAt: Date;
    durationMinutes: number;
    status: ContactAppointmentStatus;
  }): Promise<{ id: number }>;
  updateContactAppointment(id: number, input: {
    title: string;
    scheduledAt: Date;
    durationMinutes: number;
    status: ContactAppointmentStatus;
  }): Promise<{ id: number }>;
};

type DealStorage = CrmMappingStorage & {
  getContact(id: number): Promise<ScopedRecord | undefined>;
  getPipeline(id: number): Promise<ScopedRecord | undefined>;
  getDeal(id: number): Promise<ScopedRecord | undefined>;
  createDeal(input: { companyId: number; contactId: number; pipelineId: number; title: string; stage: IncomingCrmDeal['stage']; value: number }): Promise<{ id: number }>;
  updateDeal(id: number, input: { contactId: number; pipelineId: number; title: string; stage: IncomingCrmDeal['stage']; value: number }): Promise<{ id: number }>;
};

function assertTenantRecord(record: ScopedRecord | undefined, companyId: number, label: string): void {
  if (!record || record.companyId !== companyId) {
    throw new Error(`${label} does not belong to this company`);
  }
}

function assertPositiveInteger(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
}

function appointmentValues(appointment: CrmAppointmentPayload) {
  assertPositiveInteger(appointment.contactId, 'contactId');
  if (typeof appointment.title !== 'string' || !appointment.title.trim()) throw new Error('title is required');
  const startsAt = new Date(appointment.startsAt);
  const endsAt = new Date(appointment.endsAt);
  const durationMinutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
  if (!Number.isSafeInteger(durationMinutes) || durationMinutes <= 0) throw new Error('Appointment duration must be positive');
  return { title: appointment.title.trim(), scheduledAt: startsAt, durationMinutes, status: appointment.status };
}

export function createCrmAppointmentStorageAdapter(storage: AppointmentStorage): AppointmentV2Port<CrmAppointmentPayload> {
  return {
    async upsert(input) {
      if (!await storage.crmIntegrationBelongsToCompany(input.companyId, Number(input.integrationId))) {
        throw new Error('Integration does not belong to this company');
      }
      const values = appointmentValues(input.appointment);
      assertTenantRecord(await storage.getContact(input.appointment.contactId), input.companyId, 'Contact');
      const mapping = await storage.getCrmExternalMapping(input.companyId, Number(input.integrationId), 'appointment', input.externalId);
      if (mapping) {
        const appointmentId = Number(mapping.zintoId);
        assertPositiveInteger(appointmentId, 'Mapped appointment ID');
        assertTenantRecord(await storage.getContactAppointment(appointmentId), input.companyId, 'Appointment');
        await storage.updateContactAppointment(appointmentId, values);
        return { id: appointmentId, created: false };
      }
      const appointment = await storage.createContactAppointment({ companyId: input.companyId, contactId: input.appointment.contactId, ...values });
      await storage.saveCrmExternalMapping(input.companyId, Number(input.integrationId), 'appointment', input.externalId, appointment.id);
      return { id: appointment.id, created: true };
    },
  };
}

export function createCrmDealStorageAdapter(storage: DealStorage): CrmDealPipelineAdapter<{ id: number }> {
  return {
    async upsert(input) {
      if (!await storage.crmIntegrationBelongsToCompany(input.companyId, input.integrationId)) {
        throw new Error('Integration does not belong to this company');
      }
      assertPositiveInteger(input.deal.contactId, 'contactId');
      assertPositiveInteger(input.deal.pipelineId, 'pipelineId');
      assertTenantRecord(await storage.getContact(input.deal.contactId), input.companyId, 'Contact');
      assertTenantRecord(await storage.getPipeline(input.deal.pipelineId), input.companyId, 'Pipeline');
      const values = { contactId: input.deal.contactId, pipelineId: input.deal.pipelineId, title: input.deal.title.trim(), stage: input.deal.stage, value: input.deal.value };
      const mapping = await storage.getCrmExternalMapping(input.companyId, input.integrationId, 'deal', input.deal.externalId);
      if (mapping) {
        const dealId = Number(mapping.zintoId);
        assertPositiveInteger(dealId, 'Mapped deal ID');
        assertTenantRecord(await storage.getDeal(dealId), input.companyId, 'Deal');
        await storage.updateDeal(dealId, values);
        return { id: dealId, created: false, deal: { id: dealId } };
      }
      const deal = await storage.createDeal({ companyId: input.companyId, ...values });
      await storage.saveCrmExternalMapping(input.companyId, input.integrationId, 'deal', input.deal.externalId, deal.id);
      return { id: deal.id, created: true, deal: { id: deal.id } };
    },
  };
}
