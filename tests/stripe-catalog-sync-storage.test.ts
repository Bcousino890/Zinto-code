import assert from 'node:assert/strict';
import test from 'node:test';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';

import { decideStripeCatalogSyncEnqueue } from '../server/services/stripe-catalog-sync-job-policy';
import { couponCodes, plans } from '../shared/schema';

const existing = {
  operation: 'upsert' as const,
  status: 'pending' as const,
  revision: 4,
};

test('encola archive como sucesor de un upsert pendiente con la misma huella', () => {
  assert.deepEqual(
    decideStripeCatalogSyncEnqueue(existing, 'archive'),
    { action: 'insert', revision: 5 },
  );
});

test('encola archive sin alterar el lease de un upsert en procesamiento', () => {
  assert.deepEqual(
    decideStripeCatalogSyncEnqueue({ ...existing, status: 'processing' }, 'archive'),
    { action: 'insert', revision: 5 },
  );
});

test('conserva el orden cuando un upsert sucede a un archive', () => {
  assert.deepEqual(
    decideStripeCatalogSyncEnqueue({ ...existing, operation: 'archive' }, 'upsert'),
    { action: 'insert', revision: 5 },
  );
});

test('deduplica la misma operación y reabre un trabajo fallido', () => {
  assert.deepEqual(decideStripeCatalogSyncEnqueue(existing, 'upsert'), { action: 'return' });
  assert.deepEqual(
    decideStripeCatalogSyncEnqueue({ ...existing, status: 'failed' }, 'upsert'),
    { action: 'retry' },
  );
});

test('Drizzle refleja los checks nombrados de estado Stripe', () => {
  assert.ok(getTableConfig(plans).checks.some(({ name }) => name === 'plans_stripe_sync_status_check'));
  assert.ok(getTableConfig(couponCodes).checks.some(({ name }) => name === 'coupon_codes_stripe_sync_status_check'));
});

test('devuelve trabajos reclamados con los decodificadores de Drizzle', async () => {
  process.env.NODE_ENV = 'development';
  process.env.DATABASE_URL = 'postgresql://localhost:5432/stripe_catalog_sync_test';
  const { DatabaseStorage } = await import('../server/storage');
  const now = new Date('2026-09-13T12:00:00.000Z');
  const decodedJob = {
    id: 42,
    entityType: 'plan' as const,
    entityId: 7,
    operation: 'upsert' as const,
    fingerprint: 'fp_7',
    revision: 1,
    status: 'processing' as const,
    attempts: 1,
    nextAttemptAt: now,
    lockedAt: now,
    lockedBy: 'worker-a',
    claimToken: 'lease-a',
    lastError: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const tx = {
    execute: async () => ({ rows: [{ id: '42' }] }),
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: async () => [decodedJob],
        }),
      }),
    }),
  };
  const storage = Object.create(DatabaseStorage.prototype) as InstanceType<typeof DatabaseStorage>;
  storage.db = { transaction: async (run: (transaction: typeof tx) => unknown) => run(tx) } as never;

  const [claimed] = await storage.claimStripeCatalogSyncJobs(1, 'worker-a');

  assert.equal(claimed, decodedJob);
  assert.equal(typeof claimed.id, 'number');
  assert.ok(claimed.nextAttemptAt instanceof Date);
});

test('genera un token opaco nuevo al reclamar de nuevo con el mismo worker', async () => {
  process.env.NODE_ENV = 'development';
  process.env.DATABASE_URL = 'postgresql://localhost:5432/stripe_catalog_sync_test';
  const { DatabaseStorage } = await import('../server/storage');
  const tokens: string[] = [];
  let currentToken = '';
  const dialect = new PgDialect();
  const tx = {
    execute: async (query: unknown) => {
      currentToken = dialect.sqlToQuery(query as never).params.find(
        (value): value is string => typeof value === 'string' && value !== 'worker-a',
      ) ?? '';
      tokens.push(currentToken);
      return { rows: [{ id: '42' }] };
    },
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: async () => [{ id: 42, claimToken: currentToken }],
        }),
      }),
    }),
  };
  const storage = Object.create(DatabaseStorage.prototype) as InstanceType<typeof DatabaseStorage>;
  storage.db = { transaction: async (run: (transaction: typeof tx) => unknown) => run(tx) } as never;

  const [first] = await storage.claimStripeCatalogSyncJobs(1, 'worker-a');
  const [second] = await storage.claimStripeCatalogSyncJobs(1, 'worker-a');

  assert.match(first.claimToken!, /^[0-9a-f-]{36}$/i);
  assert.match(second.claimToken!, /^[0-9a-f-]{36}$/i);
  assert.notEqual(first.claimToken, second.claimToken);
  assert.deepEqual(tokens, [first.claimToken, second.claimToken]);
});

test('un intento antiguo no puede completar el lease nuevo del mismo worker', async () => {
  process.env.NODE_ENV = 'development';
  process.env.DATABASE_URL = 'postgresql://localhost:5432/stripe_catalog_sync_test';
  const { DatabaseStorage } = await import('../server/storage');
  const currentClaimToken = 'new-lease-token';
  const completedJob = { id: 42, status: 'completed' as const };
  const dialect = new PgDialect();
  const db = {
    update: () => ({
      set: () => ({
        where: (condition: unknown) => {
          const query = dialect.sqlToQuery(condition as never);
          return {
            returning: async () => (
              query.sql.includes('"claim_token"') && query.params.includes(currentClaimToken)
                ? [completedJob]
                : []
            ),
          };
        },
      }),
    }),
  };
  const storage = Object.create(DatabaseStorage.prototype) as InstanceType<typeof DatabaseStorage>;
  storage.db = db as never;

  assert.equal(await storage.completeStripeCatalogSyncJob(42, 'old-lease-token'), undefined);
  assert.equal(await storage.completeStripeCatalogSyncJob(42, currentClaimToken), completedJob);
});

test('reactivating a dead-lettered job through the retry path grants a fresh retry budget by resetting attempts to 0', async () => {
  process.env.NODE_ENV = 'development';
  process.env.DATABASE_URL = 'postgresql://localhost:5432/stripe_catalog_sync_test';
  const { DatabaseStorage } = await import('../server/storage');
  const latestFailedJob = {
    id: 42,
    entityType: 'plan' as const,
    entityId: 7,
    operation: 'upsert' as const,
    fingerprint: 'fp-7',
    revision: 1,
    status: 'failed' as const,
    attempts: 5,
  };
  let capturedSet: Record<string, unknown> | undefined;
  const tx = {
    execute: async () => ({ rows: [] }),
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => ({
              for: async () => [latestFailedJob],
            }),
          }),
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        capturedSet = values;
        return { where: () => ({ returning: async () => [{ ...latestFailedJob, ...values }] }) };
      },
    }),
  };
  const storage = Object.create(DatabaseStorage.prototype) as InstanceType<typeof DatabaseStorage>;
  storage.db = { transaction: async (run: (transaction: typeof tx) => unknown) => run(tx) } as never;

  const result = await storage.enqueueStripeCatalogSync({
    entityType: 'plan',
    entityId: 7,
    operation: 'upsert',
    fingerprint: 'fp-7',
  });

  assert.equal(capturedSet?.attempts, 0, 'a reactivated dead-letter job must get a fresh retry budget, not resume from attempts=5');
  assert.equal(result.status, 'pending');
});
