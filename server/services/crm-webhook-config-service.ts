/**
 * CRM API v2 self-service webhook config — `webhooks:manage`, activating a
 * scope that has existed in `shared/integrations/contracts.ts` since v2's
 * original design but never had a route behind it (Fase 2, item 2 of the
 * parity plan). Unlike `server/routes/crm-integration-management-routes.ts`
 * (a company-admin, session-authenticated CRUD over every integration by
 * id), this only ever lets an API key see/update the one integration it
 * authenticated as (`integrationId` resolved from `X-Zinto-Integration-Id`,
 * same as every other v2 route) — company-scoped via the same
 * `getCrmIntegrationByIdAndCompany`/`updateCrmIntegration` storage calls, so
 * there is exactly one place that owns "does this integration belong to
 * this company."
 *
 * Reuses `parseWebhookUrl` from the admin routes file rather than a second
 * implementation of its SSRF validation (plan rule: any partner/admin-
 * controlled URL must go through `assertPublicHttpUrl`).
 */

import { parseWebhookUrl } from '../routes/crm-integration-management-routes';
import { generateWebhookSecret } from '../utils/webhook-token-generator';

export type WebhookConfigResult = { status: number; body: Record<string, unknown> };

export type CrmWebhookConfigRecord = {
  webhookUrl: string | null;
  webhookSecretEncrypted?: string | null;
};

export type CrmWebhookConfigStorage = {
  getCrmIntegrationByIdAndCompany(id: number, companyId: number): Promise<CrmWebhookConfigRecord | undefined>;
  updateCrmIntegration(id: number, companyId: number, data: { webhookUrl?: string | null; webhookSecretEncrypted?: string }): Promise<CrmWebhookConfigRecord | undefined>;
};

export type CrmWebhookConfigCrypto = {
  encryptSecret(secret: string): string;
};

export function createWebhookSecret(): string {
  return `zinto_whsec_${generateWebhookSecret(32)}`;
}

export type CrmWebhookConfigService = {
  get(companyId: number, integrationId: number): Promise<WebhookConfigResult>;
  update(companyId: number, integrationId: number, input: { url?: string | null; rotateSecret?: boolean }): Promise<WebhookConfigResult>;
};

export function createWebhookConfigService(deps: CrmWebhookConfigStorage & CrmWebhookConfigCrypto): CrmWebhookConfigService {
  return {
    async get(companyId, integrationId) {
      const integration = await deps.getCrmIntegrationByIdAndCompany(integrationId, companyId);
      if (!integration) {
        return { status: 404, body: { error: 'Integration not found' } };
      }
      return {
        status: 200,
        body: { url: integration.webhookUrl ?? null, secretConfigured: Boolean(integration.webhookSecretEncrypted) },
      };
    },

    async update(companyId, integrationId, input) {
      const existing = await deps.getCrmIntegrationByIdAndCompany(integrationId, companyId);
      if (!existing) {
        return { status: 404, body: { error: 'Integration not found' } };
      }

      const data: { webhookUrl?: string | null; webhookSecretEncrypted?: string } = {};

      if (input.url !== undefined) {
        let parsedUrl: string | null | undefined;
        try {
          parsedUrl = await parseWebhookUrl(input.url);
        } catch {
          return { status: 400, body: { error: 'VALIDATION_ERROR', message: 'url must be a valid public HTTPS URL (or null to remove it)' } };
        }
        data.webhookUrl = parsedUrl ?? null;
      }

      const willHaveUrl = input.url !== undefined ? Boolean(data.webhookUrl) : Boolean(existing.webhookUrl);
      const needsFirstSecret = willHaveUrl && !existing.webhookSecretEncrypted;
      let freshSecret: string | undefined;
      if (input.rotateSecret || needsFirstSecret) {
        freshSecret = createWebhookSecret();
        data.webhookSecretEncrypted = deps.encryptSecret(freshSecret);
      }

      const updated = await deps.updateCrmIntegration(integrationId, companyId, data);
      if (!updated) {
        // The integration existed a moment ago (the check above) but is gone
        // now (deleted concurrently) — report it as not found rather than
        // claiming success for a write that didn't actually persist.
        return { status: 404, body: { error: 'Integration not found' } };
      }

      return {
        status: 200,
        body: {
          url: updated.webhookUrl ?? null,
          secretConfigured: Boolean(updated.webhookSecretEncrypted),
          ...(freshSecret ? { secret: freshSecret } : {}),
        },
      };
    },
  };
}
