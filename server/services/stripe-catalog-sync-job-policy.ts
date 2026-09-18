export type StripeCatalogSyncOperation = 'upsert' | 'archive';
export type StripeCatalogSyncJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type StripeCatalogSyncEnqueueDecision =
  | { action: 'return' }
  | { action: 'retry' }
  | { action: 'insert'; revision: number };

export function decideStripeCatalogSyncEnqueue(
  latest: {
    operation: StripeCatalogSyncOperation;
    status: StripeCatalogSyncJobStatus;
    revision: number;
  } | undefined,
  requestedOperation: StripeCatalogSyncOperation,
): StripeCatalogSyncEnqueueDecision {
  if (!latest) {
    return { action: 'insert', revision: 1 };
  }
  if (latest.operation !== requestedOperation) {
    return { action: 'insert', revision: latest.revision + 1 };
  }
  if (latest.status === 'failed') {
    return { action: 'retry' };
  }
  return { action: 'return' };
}
