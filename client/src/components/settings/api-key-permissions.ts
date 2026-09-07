export const API_KEY_SCOPES = [
  'contacts:read', 'contacts:write', 'conversations:read', 'conversations:write',
  'messages:read', 'messages:send', 'channels:read', 'appointments:read',
  'appointments:write', 'deals:read', 'deals:write', 'campaigns:read',
  'campaigns:write', 'media:read', 'media:upload', 'webhooks:manage',
  'integrations:manage', 'audit:read',
] as const;

export function toggleApiKeyScope(scopes: string[], scope: string): string[] {
  return scopes.includes(scope)
    ? scopes.filter((currentScope) => currentScope !== scope)
    : [...scopes, scope];
}
