/**
 * Adapts whatsapp-template-management-service.ts (the concrete, db/Meta-API-
 * backed implementation v1's routes already use) to the pure v2 ports in
 * whatsapp-template-v2-service.ts.
 *
 * Security note (plan rule #3, "nunca reenviar error.message crudo a un
 * partner externo"): the management service's `create()` embeds a raw caught
 * exception's `.message` in exactly one case (a failed media upload to
 * Meta) — appropriate for v1, which only ever answers the company's own
 * authenticated staff, but not for v2, which answers external CRM partners.
 * `mapCreateFailure` below strips that one case down to a fixed, generic
 * message before it ever reaches a v2 caller; every other message the
 * management service returns is already deliberately worded about the
 * caller's *own* input (never a caught exception, never another company's
 * data) and is safe to reuse as-is.
 *
 * "Connection not found" / "unauthorized access to this connection" are
 * deliberately NOT surfaced as validation errors here — same convention as
 * crm-contact-sync-service.ts's "Integration does not belong to this
 * company" (see server/routes.ts) — so a v2 caller can't use `connectionId`
 * guesses to enumerate whether a connection exists on another company. Both
 * fall through to the generic 500 syncFailure() already applies to a thrown
 * plain Error.
 */

import type { WhatsAppTemplateOperationResult } from './whatsapp-template-management-service';
import {
  WhatsAppTemplateValidationError,
  type WhatsAppTemplatesReadPort,
  type WhatsAppTemplatesWritePort,
  type WhatsAppTemplateSummary,
  type CreateWhatsAppTemplateInput,
  type UpdateWhatsAppTemplateInput,
} from './whatsapp-template-v2-service';

const MEDIA_UPLOAD_FAILURE_PREFIX = 'Failed to upload media to WhatsApp:';

/** Messages the management service already words safely for an external caller — reused as-is. */
const SAFE_VALIDATION_MESSAGES = new Set([
  'Name and content are required',
  'Template name must contain only lowercase letters, numbers, and underscores',
  'WhatsApp connection is required',
  'A template with this name already exists',
  'Selected connection is not a WhatsApp Official channel',
  'WhatsApp Business Account ID or access token not found in connection',
  'App ID not found in connection. Media upload requires App ID for Resumable Upload API.',
  'A template with this name is currently being deleted. Please wait 1-2 minutes before creating a new template with the same name, or use a different name.',
  'A template with this name and language already exists. Please use a different name or delete the existing template first.',
  'Failed to upload media. Please try again or use a different image.',
]);

function mapCreateFailure(result: WhatsAppTemplateOperationResult): never {
  const rawMessage = typeof result.body.error === 'string' ? result.body.error : undefined;

  if (result.status === 400 && rawMessage) {
    if (rawMessage.startsWith(MEDIA_UPLOAD_FAILURE_PREFIX)) {
      throw new WhatsAppTemplateValidationError('Failed to upload media to WhatsApp');
    }
    if (SAFE_VALIDATION_MESSAGES.has(rawMessage)) {
      throw new WhatsAppTemplateValidationError(rawMessage);
    }
  }

  // 403/404 (unauthorized or unknown connectionId) and any unrecognized 400
  // fall through to a generic failure — never confirm/deny another
  // company's data from an input value the caller supplied.
  throw new Error(`Template creation failed (status ${result.status})`);
}

function toSummary(row: Record<string, unknown>): WhatsAppTemplateSummary {
  return row as unknown as WhatsAppTemplateSummary;
}

export type WhatsAppTemplateManagementRead = {
  listCompanyTemplates(companyId: number): Promise<WhatsAppTemplateOperationResult>;
  getCompanyTemplate(companyId: number, templateId: number): Promise<WhatsAppTemplateOperationResult>;
};

export type WhatsAppTemplateManagementWrite = {
  createCompanyTemplate(companyId: number, userId: number, input: CreateWhatsAppTemplateInput): Promise<WhatsAppTemplateOperationResult>;
  updateCompanyTemplate(companyId: number, templateId: number, input: UpdateWhatsAppTemplateInput): Promise<WhatsAppTemplateOperationResult>;
  deleteCompanyTemplate(companyId: number, templateId: number): Promise<WhatsAppTemplateOperationResult>;
};

export function createWhatsAppTemplatesReadAdapter(management: WhatsAppTemplateManagementRead): WhatsAppTemplatesReadPort {
  return {
    list: async (companyId) => {
      const result = await management.listCompanyTemplates(companyId);
      if (result.status !== 200) throw new Error(`Template list failed (status ${result.status})`);
      return (result.body as unknown as Record<string, unknown>[]).map(toSummary);
    },
    get: async (companyId, templateId) => {
      const result = await management.getCompanyTemplate(companyId, templateId);
      if (result.status === 404) return null;
      if (result.status !== 200) throw new Error(`Template read failed (status ${result.status})`);
      return toSummary(result.body);
    },
  };
}

export function createWhatsAppTemplatesWriteAdapter(management: WhatsAppTemplateManagementWrite): WhatsAppTemplatesWritePort {
  return {
    create: async (companyId, userId, input: CreateWhatsAppTemplateInput) => {
      const result = await management.createCompanyTemplate(companyId, userId, input);
      if (result.status !== 201) mapCreateFailure(result);
      return toSummary(result.body);
    },
    update: async (companyId, templateId, input: UpdateWhatsAppTemplateInput) => {
      const result = await management.updateCompanyTemplate(companyId, templateId, input);
      if (result.status === 404) return null;
      if (result.status !== 200) throw new Error(`Template update failed (status ${result.status})`);
      return toSummary(result.body);
    },
    delete: async (companyId, templateId) => {
      const result = await management.deleteCompanyTemplate(companyId, templateId);
      if (result.status === 404) return false;
      if (result.status !== 200) throw new Error(`Template delete failed (status ${result.status})`);
      return true;
    },
  };
}
