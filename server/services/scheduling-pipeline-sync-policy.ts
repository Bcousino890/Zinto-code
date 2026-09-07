export type SyncEntity = 'appointment' | 'deal' | 'pipeline' | 'conversation' | 'message';
export type SyncOwner = 'crm' | 'zinto';
export type SyncAction = 'apply_incoming' | 'keep_existing';

export interface SyncConflictInput {
  entity: SyncEntity;
  incomingSource: SyncOwner;
  field?: string;
  fieldOwners?: Readonly<Record<string, SyncOwner>>;
}

export interface SyncConflictDecision {
  owner: SyncOwner;
  action: SyncAction;
  reason: 'entity_default' | 'field_override';
}

const entityOwners: Readonly<Record<SyncEntity, SyncOwner>> = {
  appointment: 'crm',
  deal: 'crm',
  pipeline: 'crm',
  conversation: 'zinto',
  message: 'zinto',
};

export function resolveSyncConflict(input: SyncConflictInput): SyncConflictDecision {
  const override = input.field === undefined ? undefined : input.fieldOwners?.[input.field];
  const owner = override ?? entityOwners[input.entity];

  return {
    owner,
    action: owner === input.incomingSource ? 'apply_incoming' : 'keep_existing',
    reason: override === undefined ? 'entity_default' : 'field_override',
  };
}
