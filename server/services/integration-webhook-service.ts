import { signWebhookPayload } from '../../shared/integrations/contracts';

export interface CrmWebhookEvent {
  id: string;
  type: string;
  occurredAt: string;
  companyId: number;
  integrationId: number;
  origin: 'crm' | 'zinto' | 'system';
  data: Record<string, unknown>;
}

export interface WebhookDelivery {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export function buildWebhookDelivery({
  url,
  secret,
  event,
}: {
  url: string;
  secret: string;
  event: CrmWebhookEvent;
}): WebhookDelivery {
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'https:') {
    throw new Error('Webhook URL must use HTTPS');
  }

  const body = JSON.stringify({
    id: event.id,
    type: event.type,
    occurred_at: event.occurredAt,
    company_id: event.companyId,
    integration_id: event.integrationId,
    origin: event.origin,
    data: event.data,
  });

  return {
    url: parsedUrl.toString(),
    headers: {
      'Content-Type': 'application/json',
      'X-Zinto-Event-Id': event.id,
      'X-Zinto-Timestamp': event.occurredAt,
      'X-Zinto-Signature': signWebhookPayload(secret, event.occurredAt, body),
    },
    body,
  };
}
