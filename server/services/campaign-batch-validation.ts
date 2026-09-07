export interface CampaignBatchItem {
  externalId: string;
}

/**
 * Enforces the constraints required before a CRM campaign batch is synced.
 */
export function validateCampaignBatch(campaigns: readonly CampaignBatchItem[]): void {
  if (campaigns.length < 1 || campaigns.length > 100) {
    throw new Error('Campaign sync batch must contain between 1 and 100 campaigns');
  }

  const externalIds = new Set<string>();
  for (const campaign of campaigns) {
    if (externalIds.has(campaign.externalId)) {
      throw new Error(`Campaign sync batch contains duplicate external ID: ${campaign.externalId}`);
    }
    externalIds.add(campaign.externalId);
  }
}
