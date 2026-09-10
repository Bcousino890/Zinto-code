import assert from 'node:assert/strict';
import test from 'node:test';

import { buildIntegrationOperationsData } from './integration-operations-data';

test('derives CRM API health from active integration-management keys without inventing delivery data', () => {
  const data = buildIntegrationOperationsData([
    {
      id: 12,
      name: 'CRM production',
      permissions: ['contacts:read', 'integrations:manage'],
      isActive: true,
      lastUsedAt: '2026-09-10T08:00:00.000Z',
    },
    {
      id: 13,
      name: 'Legacy automation',
      permissions: ['contacts:read'],
      isActive: true,
    },
  ]);

  assert.equal(data.integrationName, 'CRM API integration');
  assert.equal(data.health, 'healthy');
  assert.deepEqual(data.pendingEvents, []);
  assert.deepEqual(data.failedEvents, []);
  assert.deepEqual(data.conflicts, []);
});

test('reports an unavailable CRM API integration when no active management key exists', () => {
  const data = buildIntegrationOperationsData([
    {
      id: 14,
      name: 'Disabled CRM key',
      permissions: ['integrations:manage'],
      isActive: false,
    },
  ]);

  assert.equal(data.health, 'down');
});

test('reports monitoring until an active CRM API key has been used', () => {
  const data = buildIntegrationOperationsData([
    {
      id: 15,
      name: 'New CRM key',
      permissions: ['integrations:manage'],
      isActive: true,
    },
  ]);

  assert.equal(data.health, 'degraded');
});
