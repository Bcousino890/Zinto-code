import type { CampaignBatchItem } from './campaign-batch-validation';

type CampaignRecord = { id: number; companyId?: number };

export type CrmCampaignMappingPort = {
  crmIntegrationBelongsToCompany(companyId: number, integrationId: number): Promise<boolean>;
  getCrmExternalMapping(
    companyId: number,
    integrationId: number,
    entityType: 'campaign',
    externalId: string,
  ): Promise<{ zintoId: string } | undefined>;
  saveCrmExternalMapping(
    companyId: number,
    integrationId: number,
    entityType: 'campaign',
    externalId: string,
    zintoId: number,
  ): Promise<void>;
};

export type CrmCampaignOperations = {
  createCampaign(companyId: number, userId: number, input: Record<string, unknown>): Promise<CampaignRecord>;
  getCampaignById(companyId: number, campaignId: number): Promise<CampaignRecord>;
  updateCampaign(companyId: number, campaignId: number, input: Record<string, unknown>): Promise<CampaignRecord>;
};

function campaignValues(campaign: CampaignBatchItem): Record<string, unknown> {
  return {
    name: campaign.name.trim(),
    content: campaign.content.trim(),
    campaignType: campaign.campaignType ?? 'immediate',
    ...(campaign.scheduledAt ? { scheduledAt: campaign.scheduledAt } : {}),
    ...(campaign.timezone ? { timezone: campaign.timezone } : {}),
    ...(campaign.channelId ? { channelId: campaign.channelId } : {}),
    channelType: campaign.channelType ?? 'whatsapp',
  };
}

/**
 * Synchronizes CRM campaign records through Zinto's established campaign
 * service. External IDs are only used as scoped mappings; they never become
 * a Zinto campaign identifier or bypass the company boundary.
 */
export class CrmCampaignSyncService {
  constructor(
    private readonly mappings: CrmCampaignMappingPort,
    private readonly campaigns: CrmCampaignOperations,
  ) {}

  async syncBatch(input: {
    companyId: number;
    integrationId: number;
    actorUserId?: number;
    campaigns: CampaignBatchItem[];
  }): Promise<void> {
    if (!await this.mappings.crmIntegrationBelongsToCompany(input.companyId, input.integrationId)) {
      throw new Error('Integration does not belong to this company');
    }
    const actorUserId = input.actorUserId;
    if (typeof actorUserId !== 'number' || !Number.isSafeInteger(actorUserId) || actorUserId <= 0) {
      throw new Error('A valid API-key owner is required to create campaigns');
    }

    for (const campaign of input.campaigns) {
      const values = campaignValues(campaign);
      const mapping = await this.mappings.getCrmExternalMapping(
        input.companyId,
        input.integrationId,
        'campaign',
        campaign.externalId,
      );
      if (mapping) {
        const campaignId = Number(mapping.zintoId);
        if (!Number.isSafeInteger(campaignId) || campaignId <= 0) {
          throw new Error('Mapped campaign ID must be a positive integer');
        }
        const existing = await this.campaigns.getCampaignById(input.companyId, campaignId);
        if (existing.companyId !== undefined && existing.companyId !== input.companyId) {
          throw new Error('Mapped campaign does not belong to this company');
        }
        await this.campaigns.updateCampaign(input.companyId, campaignId, values);
        continue;
      }

      const created = await this.campaigns.createCampaign(input.companyId, actorUserId, values);
      await this.mappings.saveCrmExternalMapping(
        input.companyId,
        input.integrationId,
        'campaign',
        campaign.externalId,
        created.id,
      );
    }
  }
}
