import type {
  IntegrationConflict,
  IntegrationOperationEvent,
} from './IntegrationOperationsView';
import type { IntegrationHealth } from './integration-operations-status';

export interface ApiKeyIntegrationSource {
  id: number;
  name: string;
  permissions: string[];
  isActive: boolean;
  lastUsedAt?: string;
}

export interface IntegrationOperationsData {
  integrationName: string;
  health: IntegrationHealth;
  pendingEvents: IntegrationOperationEvent[];
  failedEvents: IntegrationOperationEvent[];
  conflicts: IntegrationConflict[];
}

/**
 * Builds the operations overview from the API-key endpoint. Webhook delivery
 * events and sync conflicts deliberately remain empty: the current backend
 * does not expose read or retry operations for those records.
 */
export function buildIntegrationOperationsData(apiKeys: ApiKeyIntegrationSource[]): IntegrationOperationsData {
  const activeIntegrationKeys = apiKeys.filter((key) =>
    key.isActive && key.permissions.includes('integrations:manage'));

  return {
    integrationName: 'CRM API integration',
    health: activeIntegrationKeys.length === 0
      ? 'down'
      : activeIntegrationKeys.some((key) => Boolean(key.lastUsedAt))
        ? 'healthy'
        : 'degraded',
    pendingEvents: [],
    failedEvents: [],
    conflicts: [],
  };
}
