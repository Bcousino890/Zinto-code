export interface CampaignBatchItem {
  externalId: string;
  name: string;
  content: string;
  campaignType?: 'immediate' | 'scheduled' | 'drip' | 'recurring_daily';
  scheduledAt?: string;
  timezone?: string;
  channelType?: 'whatsapp' | 'email';
  channelId?: number;
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
    if (typeof campaign.name !== 'string' || !campaign.name.trim()) {
      throw new Error('Campaign name is required');
    }
    if (typeof campaign.content !== 'string' || !campaign.content.trim()) {
      throw new Error('Campaign content is required');
    }
    if (externalIds.has(campaign.externalId)) {
      throw new Error(`Campaign sync batch contains duplicate external ID: ${campaign.externalId}`);
    }
    externalIds.add(campaign.externalId);
  }
}
