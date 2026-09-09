export const initialCrmSynchronizationEntities = [
  'contacts',
  'appointments',
  'deals',
  'campaigns',
] as const;

export type InitialCrmSynchronizationEntity = typeof initialCrmSynchronizationEntities[number];

export interface InitialCrmSynchronizationRecord {
  externalId: string;
  [field: string]: unknown;
}

export interface InitialCrmSynchronizationInput {
  contacts: readonly InitialCrmSynchronizationRecord[];
  appointments: readonly InitialCrmSynchronizationRecord[];
  deals: readonly InitialCrmSynchronizationRecord[];
  campaigns: readonly InitialCrmSynchronizationRecord[];
  batchSize?: number;
}

export interface InitialCrmSynchronizationJob {
  id: string;
  entity: InitialCrmSynchronizationEntity;
  records: readonly InitialCrmSynchronizationRecord[];
}

export interface InitialCrmSynchronizationPlan {
  jobs: readonly InitialCrmSynchronizationJob[];
  jobCounts: {
    total: number;
    byEntity: Record<InitialCrmSynchronizationEntity, number>;
  };
}

const DEFAULT_BATCH_SIZE = 100;

function validateBatchSize(batchSize: number | undefined): number {
  const resolvedBatchSize = batchSize ?? DEFAULT_BATCH_SIZE;
  if (!Number.isSafeInteger(resolvedBatchSize) || resolvedBatchSize < 1) {
    throw new TypeError('batchSize must be a positive safe integer');
  }
  return resolvedBatchSize;
}

function validateUniqueExternalIds(
  entity: InitialCrmSynchronizationEntity,
  records: readonly InitialCrmSynchronizationRecord[],
): void {
  const externalIds = new Set<string>();
  for (const record of records) {
    if (typeof record.externalId !== 'string' || record.externalId.trim().length === 0) {
      throw new TypeError(`externalId is required for ${entity}`);
    }
    if (externalIds.has(record.externalId)) {
      throw new Error(`Duplicate external ID for ${entity}: ${record.externalId}`);
    }
    externalIds.add(record.externalId);
  }
}

/**
 * Converts a CRM's initial entity snapshot into stable, entity-specific jobs.
 * The planner performs no I/O, so callers can persist or enqueue its jobs safely.
 */
export function planInitialCrmSynchronization(
  input: InitialCrmSynchronizationInput,
): InitialCrmSynchronizationPlan {
  const batchSize = validateBatchSize(input.batchSize);
  const jobs: InitialCrmSynchronizationJob[] = [];
  const byEntity = {
    contacts: 0,
    appointments: 0,
    deals: 0,
    campaigns: 0,
  };

  for (const entity of initialCrmSynchronizationEntities) {
    const records = input[entity];
    validateUniqueExternalIds(entity, records);

    for (let start = 0; start < records.length; start += batchSize) {
      const batchNumber = byEntity[entity] + 1;
      jobs.push({
        id: `${entity}:${batchNumber}`,
        entity,
        records: records.slice(start, start + batchSize),
      });
      byEntity[entity] = batchNumber;
    }
  }

  return { jobs, jobCounts: { total: jobs.length, byEntity } };
}
