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

export interface CrmOperationsSource {
  id: number;
  name: string;
  status: string;
  scopes: unknown;
  pendingEvents: Array<{ id: string; type: string; status: string; attemptCount: number; createdAt: string; lastError: string | null }>;
  failedEvents: Array<{ id: string; type: string; status: string; attemptCount: number; createdAt: string; lastError: string | null }>;
  conflicts: Array<{ id: number; entityType: string; externalId: string; status: string; createdAt: string }>;
}

export function buildCrmOperationsViewData(source: CrmOperationsSource): IntegrationOperationsData {
  const event = (item: CrmOperationsSource['pendingEvents'][number]): IntegrationOperationEvent => ({
    id: item.id, label: item.type, detail: item.lastError ?? undefined, occurredAt: item.createdAt,
  });
  return {
    integrationName: source.name,
    health: source.status === 'active' ? 'healthy' : 'down',
    pendingEvents: source.pendingEvents.map(event),
    failedEvents: source.failedEvents.map(event),
    conflicts: source.conflicts.map((conflict) => ({
      id: String(conflict.id),
      label: `${conflict.entityType} · ${conflict.externalId}`,
      detail: 'Pending review',
      detailTranslationKey: 'integrations.operations.pending_review',
    })),
  };
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
    integrationName: 'CRM API',
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
