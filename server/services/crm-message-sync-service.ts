export type CrmMessageOrigin = 'crm' | 'zinto' | 'system';

export interface OutboundCrmMessageRequest {
  companyId: number;
  integrationId: number;
  conversationId: number;
  content: string;
  externalMessageId: string;
  origin?: Exclude<CrmMessageOrigin, 'crm'>;
}

export interface NormalizedOutboundCrmMessageRequest extends Omit<OutboundCrmMessageRequest, 'origin'> {
  origin: Exclude<CrmMessageOrigin, 'crm'>;
}

export interface CrmMessageWebhookEvent {
  origin: CrmMessageOrigin;
}

export function normalizeOutboundCrmMessageRequest(
  request: OutboundCrmMessageRequest,
): NormalizedOutboundCrmMessageRequest {
  return {
    ...request,
    origin: request.origin ?? 'zinto',
  };
}

export function shouldEmitCrmMessageWebhook(event: CrmMessageWebhookEvent): boolean {
  return event.origin !== 'crm';
}
