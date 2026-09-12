import { applyInboundFieldMapping } from './integration-field-mapping';

export const HUBSPOT_PROVIDER = 'hubspot' as const;
export const HUBSPOT_OAUTH_AUTHORIZE_URL = 'https://app.hubspot.com/oauth/authorize';

export type HubSpotAuthorizationMode = 'oauth' | 'private_app';
export type HubSpotEntityType = 'contact' | 'deal' | 'appointment' | 'campaign';

export interface HubSpotIntegrationConfig {
  companyId: number;
  integrationId: number;
  portalId: string;
  authorizationMode: HubSpotAuthorizationMode;
  fieldMappings: Partial<Record<HubSpotEntityType, Record<string, string>>>;
}

export interface HubSpotAuthorizationInput {
  companyId: number;
  integrationId: number;
  clientId: string;
  redirectUri: string;
  state: string;
  scopes: readonly string[];
}

export interface HubSpotAuthorizationRequest {
  provider: typeof HUBSPOT_PROVIDER;
  companyId: number;
  integrationId: number;
  url: string;
}

function assertPositiveId(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
}

function assertNonEmptyString(value: string, fieldName: string): void {
  if (!value.trim()) {
    throw new Error(`${fieldName} is required`);
  }
}

function assertSafeRedirectUri(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('redirectUri must be a valid HTTPS URL');
  }

  if (url.protocol !== 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    throw new Error('redirectUri must be an HTTPS URL that does not target localhost');
  }
}

/**
 * Builds the consent redirect only. Exchanging authorization codes and storing
 * access tokens must be delegated to a tenant-scoped credential vault.
 */
export function createHubSpotAuthorizationRequest(input: HubSpotAuthorizationInput): HubSpotAuthorizationRequest {
  assertPositiveId(input.companyId, 'companyId');
  assertPositiveId(input.integrationId, 'integrationId');
  assertNonEmptyString(input.clientId, 'clientId');
  assertNonEmptyString(input.state, 'state');
  assertSafeRedirectUri(input.redirectUri);

  if (input.scopes.length === 0 || input.scopes.some(scope => !scope.trim())) {
    throw new Error('At least one non-empty HubSpot scope is required');
  }

  const query = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    state: input.state,
    scope: input.scopes.join(' '),
  });

  return {
    provider: HUBSPOT_PROVIDER,
    companyId: input.companyId,
    integrationId: input.integrationId,
    url: `${HUBSPOT_OAUTH_AUTHORIZE_URL}?${query.toString()}`,
  };
}

/**
 * Validates public configuration. Credentials are deliberately absent: they
 * must only be retrieved by a tenant-scoped runtime credential resolver.
 */
export function validateHubSpotIntegrationConfig(config: HubSpotIntegrationConfig): HubSpotIntegrationConfig {
  assertPositiveId(config.companyId, 'companyId');
  assertPositiveId(config.integrationId, 'integrationId');
  assertNonEmptyString(config.portalId, 'portalId');

  if (config.authorizationMode !== 'oauth' && config.authorizationMode !== 'private_app') {
    throw new Error('authorizationMode must be oauth or private_app');
  }

  for (const mapping of Object.values(config.fieldMappings)) {
    if (!mapping) continue;
    for (const sourceField of Object.values(mapping)) {
      assertNonEmptyString(sourceField, 'HubSpot source field');
    }
    // Reuse the canonical mapping guard so protected tenant/audit fields can
    // never be accepted into connector configuration.
    applyInboundFieldMapping({}, mapping);
  }

  return {
    ...config,
    portalId: config.portalId.trim(),
  };
}

/** Maps an inbound HubSpot object's `properties` through the tenant's map. */
export function mapHubSpotInboundProperties(
  properties: Record<string, unknown>,
  mapping: Record<string, string>,
): Record<string, unknown> {
  return applyInboundFieldMapping(properties, mapping);
}

/**
 * Runtime boundary for any future HubSpot API client. Implementations must
 * scope lookups by both company and integration; no connector secret belongs
 * in route configuration, logs, tests, or build-time environment variables.
 */
export interface HubSpotCredentialResolver {
  getAccessToken(scope: Pick<HubSpotIntegrationConfig, 'companyId' | 'integrationId'>): Promise<string | null>;
}
