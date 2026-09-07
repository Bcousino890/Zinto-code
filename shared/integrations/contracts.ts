export const INTEGRATION_SCOPES = [
  'contacts:read',
  'contacts:write',
  'conversations:read',
  'conversations:write',
  'messages:read',
  'messages:send',
  'channels:read',
  'appointments:read',
  'appointments:write',
  'deals:read',
  'deals:write',
  'campaigns:read',
  'campaigns:write',
  'media:read',
  'media:upload',
  'webhooks:manage',
  'integrations:manage',
  'audit:read',
] as const;

export type IntegrationScope = (typeof INTEGRATION_SCOPES)[number];

export function assertIntegrationScopes(scopes: readonly string[]): IntegrationScope[] {
  for (const scope of scopes) {
    if (!(INTEGRATION_SCOPES as readonly string[]).includes(scope)) {
      throw new Error(`Unknown integration scope: ${scope}`);
    }
  }
  return [...scopes] as IntegrationScope[];
}

export function buildWebhookSignaturePayload(timestamp: string, rawBody: string): string {
  return `${timestamp}.${rawBody}`;
}

export function signWebhookPayload(secret: string, timestamp: string, rawBody: string): string {
  const payload = buildWebhookSignaturePayload(timestamp, rawBody);
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `v1=${signature}`;
}
import crypto from 'node:crypto';
