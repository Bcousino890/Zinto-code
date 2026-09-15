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
  /**
   * True totals, independent of how many rows the lists above carry. The
   * lists are capped for display, so their .length understates the total
   * once a company passes that cap — these counts must be used for metrics.
   */
  pendingEventCount: number;
  failedEventCount: number;
  conflictCount: number;
}

export interface CrmOperationsSource {
  id: number;
  name: string;
  status: string;
  scopes: unknown;
  pendingEvents: Array<{ id: string; type: string; status: string; attemptCount: number; createdAt: string; lastError: string | null }>;
  failedEvents: Array<{ id: string; type: string; status: string; attemptCount: number; createdAt: string; lastError: string | null }>;
  pendingEventCount: number;
  failedEventCount: number;
  conflicts: Array<{ id: number; entityType: string; externalId: string; status: string; createdAt: string }>;
  conflictCount: number;
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
    pendingEventCount: source.pendingEventCount,
    failedEventCount: source.failedEventCount,
    conflictCount: source.conflictCount,
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
    pendingEventCount: 0,
    failedEventCount: 0,
    conflicts: [],
    conflictCount: 0,
  };
}
