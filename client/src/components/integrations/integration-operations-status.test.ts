import assert from 'node:assert/strict';
import test from 'node:test';

import { getIntegrationOperationsStatus } from './integration-operations-status';

test('reports attention when failures or conflicts need an operator', () => {
  const status = getIntegrationOperationsStatus({
    health: 'healthy',
    pendingEventCount: 2,
    failedEventCount: 1,
    conflictCount: 0,
  });

  assert.deepEqual(status, {
    labelKey: 'integrations.operations.needs_attention',
    tone: 'critical',
  });
});

test('reports monitoring when the integration is degraded or has a backlog', () => {
  const status = getIntegrationOperationsStatus({
    health: 'degraded',
    pendingEventCount: 0,
    failedEventCount: 0,
    conflictCount: 0,
  });

  assert.deepEqual(status, {
    labelKey: 'integrations.operations.monitoring',
    tone: 'warning',
  });
});

test('reports healthy only when the integration is healthy and clear', () => {
  const status = getIntegrationOperationsStatus({
    health: 'healthy',
    pendingEventCount: 0,
    failedEventCount: 0,
    conflictCount: 0,
  });

  assert.deepEqual(status, {
    labelKey: 'integrations.operations.operational',
    tone: 'success',
  });
});

test('reports attention when the integration is unavailable', () => {
  const status = getIntegrationOperationsStatus({
    health: 'down',
    pendingEventCount: 0,
    failedEventCount: 0,
    conflictCount: 0,
  });

  assert.deepEqual(status, {
    labelKey: 'integrations.operations.needs_attention',
    tone: 'critical',
  });
});
