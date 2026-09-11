export type IntegrationHealth = 'healthy' | 'degraded' | 'down';

export type IntegrationOperationsTone = 'success' | 'warning' | 'critical';

export interface IntegrationOperationsStatusInput {
  health: IntegrationHealth;
  pendingEventCount: number;
  failedEventCount: number;
  conflictCount: number;
}

export interface IntegrationOperationsStatus {
  labelKey:
    | 'integrations.operations.operational'
    | 'integrations.operations.monitoring'
    | 'integrations.operations.needs_attention';
  tone: IntegrationOperationsTone;
}

export function getIntegrationOperationsStatus({
  health,
  pendingEventCount,
  failedEventCount,
  conflictCount,
}: IntegrationOperationsStatusInput): IntegrationOperationsStatus {
  if (health === 'down' || failedEventCount > 0 || conflictCount > 0) {
    return { labelKey: 'integrations.operations.needs_attention', tone: 'critical' };
  }

  if (health === 'degraded' || pendingEventCount > 0) {
    return { labelKey: 'integrations.operations.monitoring', tone: 'warning' };
  }

  return { labelKey: 'integrations.operations.operational', tone: 'success' };
}
