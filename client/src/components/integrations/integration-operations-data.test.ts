import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCrmOperationsViewData, buildIntegrationOperationsData } from './integration-operations-data';

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

test('renders server-provided webhook and conflict records without using their payloads', () => {
  const data = buildCrmOperationsViewData({
    id: 9, name: 'HubSpot', status: 'active', scopes: [],
    pendingEvents: [{ id: 'evt-1', type: 'contact.updated', status: 'pending', attemptCount: 2, createdAt: '2026-09-10T08:00:00.000Z', lastError: null }],
    failedEvents: [{ id: 'evt-2', type: 'deal.updated', status: 'failed', attemptCount: 4, createdAt: '2026-09-10T07:00:00.000Z', lastError: 'Timeout' }],
    conflicts: [{ id: 3, entityType: 'contact', externalId: 'crm-4', status: 'pending', createdAt: '2026-09-10T06:00:00.000Z' }],
  });
  assert.equal(data.health, 'healthy');
  assert.deepEqual(data.failedEvents[0], { id: 'evt-2', label: 'deal.updated', detail: 'Timeout', occurredAt: '2026-09-10T07:00:00.000Z' });
  assert.deepEqual(data.conflicts[0], { id: '3', label: 'contact · crm-4', detail: 'Pending review' });
});
