export type IntegrationHealth = 'healthy' | 'degraded' | 'down';

export type IntegrationOperationsTone = 'success' | 'warning' | 'critical';

export interface IntegrationOperationsStatusInput {
  health: IntegrationHealth;
  pendingEventCount: number;
  failedEventCount: number;
  conflictCount: number;
}

export interface IntegrationOperationsStatus {
  label: 'Operational' | 'Monitoring' | 'Needs attention';
  tone: IntegrationOperationsTone;
}

export function getIntegrationOperationsStatus({
  health,
  pendingEventCount,
  failedEventCount,
  conflictCount,
}: IntegrationOperationsStatusInput): IntegrationOperationsStatus {
  if (health === 'down' || failedEventCount > 0 || conflictCount > 0) {
    return { label: 'Needs attention', tone: 'critical' };
  }

  if (health === 'degraded' || pendingEventCount > 0) {
    return { label: 'Monitoring', tone: 'warning' };
  }

  return { label: 'Operational', tone: 'success' };
}
