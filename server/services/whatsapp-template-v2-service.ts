/**
 * Company-scoped WhatsApp template CRUD ports for CRM API v2 — `templates:read`/
 * `templates:write` (Fase 1, item 1 of the parity plan). Kept import-free,
 * like crm-read-service.ts and crm-contact-sync-service.ts, so api-v2.ts (and
 * its router unit tests) never transitively pull in server/db.ts through this
 * file. The concrete, db/Meta-API-backed implementation lives in
 * whatsapp-template-management-service.ts; whatsapp-template-v2-adapter.ts
 * wires the two together.
 */

export interface WhatsAppTemplateConnectionSummary {
  id: number;
  accountName: string | null;
  phoneNumber?: string;
  status: string;
}

export interface WhatsAppTemplateSummary {
  id: number;
  name: string;
  description: string | null;
  whatsappTemplateCategory: string | null;
  whatsappTemplateStatus: string | null;
  whatsappTemplateId: string | null;
  whatsappTemplateLanguage: string | null;
  content: string;
  variables: unknown;
  connectionId: number | null;
  isActive: boolean | null;
  usageCount: number | null;
  createdAt: Date | string | null;
  updatedAt?: Date | string | null;
  connection: WhatsAppTemplateConnectionSummary | null;
}

export interface CreateWhatsAppTemplateInput {
  name: string;
  content: string;
  connectionId: number;
  description?: string;
  whatsappTemplateCategory?: string;
  whatsappTemplateLanguage?: string;
  variables?: unknown[];
  headerType?: string;
  headerText?: string;
  headerMediaUrl?: string;
  footerText?: string;
}

export interface UpdateWhatsAppTemplateInput {
  description?: string;
  isActive?: boolean;
}

/**
 * A deliberately-worded, safe-to-show validation failure — same convention
 * as AppointmentV2ValidationError (api-v2.ts's syncOrValidationFailure maps
 * this to 400 VALIDATION_ERROR; anything else is hidden behind a generic
 * message). Thrown for input problems a CRM partner can actually fix
 * (missing/invalid fields, an unknown or foreign connectionId, wrong channel
 * type, a connection missing WhatsApp credentials).
 */
export class WhatsAppTemplateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WhatsAppTemplateValidationError';
  }
}

export interface WhatsAppTemplatesReadPort {
  list(companyId: number): Promise<WhatsAppTemplateSummary[]>;
  /** Resolves to `null` when the template doesn't exist, *or* belongs to a different company. */
  get(companyId: number, templateId: number): Promise<WhatsAppTemplateSummary | null>;
}

export interface WhatsAppTemplatesWritePort {
  /** Throws WhatsAppTemplateValidationError for a fixable input problem. */
  create(companyId: number, userId: number, input: CreateWhatsAppTemplateInput): Promise<WhatsAppTemplateSummary>;
  /** Resolves to `null` when the template doesn't exist, *or* belongs to a different company. */
  update(companyId: number, templateId: number, input: UpdateWhatsAppTemplateInput): Promise<WhatsAppTemplateSummary | null>;
  /** Resolves to `false` when the template doesn't exist, *or* belongs to a different company. */
  delete(companyId: number, templateId: number): Promise<boolean>;
}

export class WhatsAppTemplatesReadService {
  constructor(private readonly port: WhatsAppTemplatesReadPort) {}

  list(companyId: number): Promise<WhatsAppTemplateSummary[]> {
    return this.port.list(companyId);
  }

  get(companyId: number, templateId: number): Promise<WhatsAppTemplateSummary | null> {
    return this.port.get(companyId, templateId);
  }
}

export class WhatsAppTemplatesWriteService {
  constructor(private readonly port: WhatsAppTemplatesWritePort) {}

  create(companyId: number, userId: number, input: CreateWhatsAppTemplateInput): Promise<WhatsAppTemplateSummary> {
    return this.port.create(companyId, userId, input);
  }

  update(companyId: number, templateId: number, input: UpdateWhatsAppTemplateInput): Promise<WhatsAppTemplateSummary | null> {
    return this.port.update(companyId, templateId, input);
  }

  delete(companyId: number, templateId: number): Promise<boolean> {
    return this.port.delete(companyId, templateId);
  }
}
