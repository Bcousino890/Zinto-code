import { assertIntegrationScopes, type IntegrationScope } from '../../shared/integrations/contracts';

export class ApiKeyConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiKeyConfigurationError';
  }
}

export interface ApiKeyConfigurationUpdate {
  permissions?: IntegrationScope[];
  rateLimitPerMinute?: number;
  rateLimitPerHour?: number;
  rateLimitPerDay?: number;
  allowedIps?: string[];
  webhookUrl?: string | null;
  expiresAt?: Date | null;
}

export function validateApiKeyConfigurationUpdate(input: Record<string, unknown>): ApiKeyConfigurationUpdate {
  const update: ApiKeyConfigurationUpdate = {};

  if (input.permissions !== undefined) {
    if (!Array.isArray(input.permissions) || input.permissions.some((scope) => typeof scope !== 'string')) {
      throw new ApiKeyConfigurationError('permissions must be an array of scopes');
    }
    try {
      update.permissions = assertIntegrationScopes(input.permissions);
    } catch (error) {
      throw new ApiKeyConfigurationError(error instanceof Error ? error.message : 'Invalid permissions');
    }
  }

  for (const field of ['rateLimitPerMinute', 'rateLimitPerHour', 'rateLimitPerDay'] as const) {
    const value = input[field];
    if (value === undefined) continue;
    if (!Number.isInteger(value) || (value as number) <= 0) {
      throw new ApiKeyConfigurationError(`${field} must be a positive integer`);
    }
    update[field] = value as number;
  }

  if (input.allowedIps !== undefined) {
    if (!Array.isArray(input.allowedIps) || input.allowedIps.some((ip) => typeof ip !== 'string' || !ip.trim())) {
      throw new ApiKeyConfigurationError('allowedIps must be an array of non-empty IP addresses');
    }
    update.allowedIps = input.allowedIps.map((ip) => ip.trim());
  }

  if (input.webhookUrl !== undefined) {
    if (input.webhookUrl === null || input.webhookUrl === '') {
      update.webhookUrl = null;
    } else if (typeof input.webhookUrl === 'string') {
      const url = new URL(input.webhookUrl);
      if (url.protocol !== 'https:') throw new ApiKeyConfigurationError('Webhook URL must use HTTPS');
      update.webhookUrl = url.toString();
    } else {
      throw new ApiKeyConfigurationError('webhookUrl must be a URL or null');
    }
  }

  return update;
}
