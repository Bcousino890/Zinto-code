import {
  validateIncomingCrmDeal,
  type IncomingCrmDeal,
  type ValidatedIncomingCrmDeal,
} from './crm-deal-pipeline-sync-service';
import type { SyncConflictDecision } from './scheduling-pipeline-sync-policy';

export interface CrmDealPipelineAdapter<TDeal = unknown> {
  upsert(input: {
    companyId: number;
    integrationId: number;
    idempotencyKey: string;
    deal: IncomingCrmDeal;
    ownership: SyncConflictDecision;
  }): Promise<{ created: boolean; deal: TDeal }>;
}

export interface CrmDealPipelineApiV2Service<TDeal = unknown> {
  upsert(input: {
    companyId: number;
    integrationId: number;
    idempotencyKey: unknown;
    deal: unknown;
  }): Promise<{ created: boolean; deal: TDeal }>;
}

function requirePositiveInteger(value: unknown, name: 'companyId' | 'integrationId'): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return value;
}

function requireIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TypeError('idempotencyKey must be a trimmed string between 8 and 128 characters');
  }
  const key = value.trim();
  if (key.length < 8 || key.length > 128) {
    throw new TypeError('idempotencyKey must be a trimmed string between 8 and 128 characters');
  }
  return key;
}

export function createCrmDealPipelineApiV2Service<TDeal>(
  adapter: CrmDealPipelineAdapter<TDeal>,
): CrmDealPipelineApiV2Service<TDeal> {
  return {
    async upsert(input) {
      const companyId = requirePositiveInteger(input.companyId, 'companyId');
      const integrationId = requirePositiveInteger(input.integrationId, 'integrationId');
      const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
      const validated: ValidatedIncomingCrmDeal = validateIncomingCrmDeal(input.deal);

      return adapter.upsert({
        companyId,
        integrationId,
        idempotencyKey,
        deal: validated.deal,
        ownership: validated.ownership,
      });
    },
  };
}
