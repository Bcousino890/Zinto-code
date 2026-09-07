import {
  resolveSyncConflict,
  type SyncConflictDecision,
} from './scheduling-pipeline-sync-policy';

export const crmDealPipelineStages = [
  'lead',
  'qualified',
  'contacted',
  'demo_scheduled',
  'proposal',
  'negotiation',
  'closed_won',
  'closed_lost',
] as const;

export type CrmDealPipelineStage = typeof crmDealPipelineStages[number];

export interface IncomingCrmDeal {
  externalId: string;
  title: string;
  stage: CrmDealPipelineStage;
  value: number;
}

export interface ValidatedIncomingCrmDeal {
  deal: IncomingCrmDeal;
  ownership: SyncConflictDecision;
}

const stageSet: ReadonlySet<string> = new Set(crmDealPipelineStages);

function requireNonBlankString(value: unknown, name: 'externalId' | 'title'): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-blank string`);
  }
  return value;
}

function requirePipelineStage(value: unknown): CrmDealPipelineStage {
  if (typeof value !== 'string' || !stageSet.has(value)) {
    throw new TypeError(`stage must be one of: ${crmDealPipelineStages.join(', ')}`);
  }
  return value as CrmDealPipelineStage;
}

function requireNonnegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new TypeError('value must be a nonnegative integer');
  }
  return value;
}

export function validateIncomingCrmDeal(input: unknown): ValidatedIncomingCrmDeal {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('incoming CRM deal must be an object');
  }

  const record = input as Record<string, unknown>;
  const deal: IncomingCrmDeal = {
    externalId: requireNonBlankString(record.externalId, 'externalId'),
    title: requireNonBlankString(record.title, 'title'),
    stage: requirePipelineStage(record.stage),
    value: requireNonnegativeInteger(record.value),
  };

  return {
    deal,
    ownership: resolveSyncConflict({ entity: 'deal', incomingSource: 'crm' }),
  };
}
