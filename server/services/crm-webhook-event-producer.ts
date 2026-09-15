import type { IntegrationScope } from '../../shared/integrations/contracts';

export interface CrmWebhookEventProducerPort {
  getCrmIntegrationsByCompanyId(companyId: number): Promise<Array<{
    id: number;
    status: string;
    webhookUrl: string | null;
    webhookSecretEncrypted: string | null;
    scopes: unknown;
  }>>;
  enqueueCrmWebhookEvent(input: {
    companyId: number;
    integrationId: number;
    type: string;
    origin: 'crm' | 'zinto' | 'system';
    payload: Record<string, unknown>;
  }): Promise<void>;
}

/**
 * Maps each CRM v2 event type to the scope an integration must hold to
 * receive it. Message lifecycle events are gated behind `messages:read`
 * (observing message activity), independent of `messages:send` which only
 * covers the CRM pushing messages out.
 */
const EVENT_SCOPE: Record<string, IntegrationScope> = {
  'message.received': 'messages:read',
  'message.sent': 'messages:read',
  'message.delivered': 'messages:read',
  'message.read': 'messages:read',
  'message.failed': 'messages:read',
};

function hasScope(scopes: unknown, scope: IntegrationScope): boolean {
  return Array.isArray(scopes) && (scopes.includes('*') || scopes.includes(scope));
}

/**
 * Publishes a CRM v2 event to every active integration of a company that is
 * subscribed (via scope) to that event type. Best-effort: never throws, so a
 * failure here must not break the message pipeline that triggered it.
 */
export async function publishCrmEvent(
  port: CrmWebhookEventProducerPort,
  companyId: number,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const requiredScope = EVENT_SCOPE[type];
  if (!requiredScope || !Number.isSafeInteger(companyId) || companyId <= 0) return;

  try {
    const integrations = await port.getCrmIntegrationsByCompanyId(companyId);
    const eligible = integrations.filter((integration) =>
      integration.status === 'active'
      && integration.webhookUrl
      && integration.webhookSecretEncrypted
      && hasScope(integration.scopes, requiredScope));

    await Promise.all(eligible.map((integration) =>
      port.enqueueCrmWebhookEvent({
        companyId,
        integrationId: integration.id,
        type,
        origin: 'zinto',
        payload,
      }).catch((error) => {
        console.error(`[crm-webhook] failed to enqueue "${type}" for integration ${integration.id}:`, error);
      })));
  } catch (error) {
    console.error(`[crm-webhook] failed to publish "${type}" for company ${companyId}:`, error);
  }
}
