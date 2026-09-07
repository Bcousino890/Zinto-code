/**
 * A route-independent boundary for CRM appointment synchronization.
 *
 * Routes supply the existing request validator and field-ownership policy; persistence
 * is deliberately a port so this service does not couple the public v2 contract to a
 * storage implementation.
 */

export type AppointmentV2SyncRequest<TAppointment = unknown> = {
  companyId: number;
  integrationId: string | number;
  externalId: string;
  idempotencyKey: string | undefined | null;
  appointment: TAppointment;
};

export type AppointmentV2UpsertInput<TAppointment> = {
  companyId: number;
  integrationId: string | number;
  externalId: string;
  idempotencyKey: string;
  appointment: TAppointment;
};

export type AppointmentV2UpsertResult = {
  id: string | number;
  created: boolean;
};

export interface AppointmentV2Port<TAppointment> {
  upsert(input: AppointmentV2UpsertInput<TAppointment>): Promise<AppointmentV2UpsertResult>;
}

export type AppointmentV2OwnershipContext<TAppointment> = {
  companyId: number;
  integrationId: string | number;
  externalId: string;
  appointment: TAppointment;
};

export type AppointmentV2Validator<TAppointment> = (
  appointment: unknown,
) => TAppointment | Promise<TAppointment>;

/** A policy may normalize the appointment or only throw when a field is not CRM-owned. */
export type AppointmentV2OwnershipPolicy<TAppointment> = (
  context: AppointmentV2OwnershipContext<TAppointment>,
) => TAppointment | void | Promise<TAppointment | void>;

export type AppointmentV2ServiceDependencies<TAppointment> = {
  port: AppointmentV2Port<TAppointment>;
  validate: AppointmentV2Validator<TAppointment>;
  ownershipPolicy: AppointmentV2OwnershipPolicy<TAppointment>;
};

export class AppointmentV2ValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AppointmentV2ValidationError';
    this.code = code;
  }
}

export class AppointmentV2Service<TAppointment = unknown> {
  constructor(private readonly dependencies: AppointmentV2ServiceDependencies<TAppointment>) {}

  async sync(
    request: AppointmentV2SyncRequest,
  ): Promise<AppointmentV2UpsertResult> {
    const idempotencyKey = requireIdempotencyKey(request.idempotencyKey);
    const appointment = (await this.dependencies.validate(request.appointment)) as TAppointment;
    const ownershipResult = (await this.dependencies.ownershipPolicy({
      companyId: request.companyId,
      integrationId: request.integrationId,
      externalId: request.externalId,
      appointment,
    })) as TAppointment | void;
    const approvedAppointment: TAppointment =
      ownershipResult === undefined ? appointment : (ownershipResult as TAppointment);

    return this.dependencies.port.upsert({
      companyId: request.companyId,
      integrationId: request.integrationId,
      externalId: request.externalId,
      idempotencyKey,
      appointment: approvedAppointment,
    });
  }
}

function requireIdempotencyKey(value: string | undefined | null): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppointmentV2ValidationError(
      'IDEMPOTENCY_KEY_REQUIRED',
      'Idempotency-Key is required',
    );
  }
  return value.trim();
}
