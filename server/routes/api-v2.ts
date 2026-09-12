import { Router, type NextFunction, type Request, type Response } from 'express';
import { integrationCapabilities, requireIntegrationScope } from '../middleware/integration-scope';
import { getApiV2OpenApiDocument } from './api-v2-openapi';
import { getApiV2PostmanCollection } from './api-v2-postman';
import { API_V2_GUIDE_MARKDOWN } from './api-v2-guide';
import { validateCampaignBatch, type CampaignBatchItem } from '../services/campaign-batch-validation';
import type { CrmContactSyncService } from '../services/crm-contact-sync-service';
import { normalizeOutboundCrmMessageRequest } from '../services/crm-message-sync-service';
import type { AppointmentV2Service } from '../services/appointment-v2-service';
import type { CrmDealPipelineApiV2Service } from '../services/crm-deal-pipeline-api-v2-service';
import type {
  InitialCrmSynchronizationInput,
  InitialCrmSynchronizationPlan,
} from '../services/initial-crm-synchronization-plan';

type AuthenticationMiddleware = (req: Request, res: Response, next: NextFunction) => void;
type IntegrationIdResolver = (companyId: number, publicId: string) => Promise<number | undefined>;
type MessageSync = {
  send(input: {
    companyId: number;
    integrationId: number;
    channelId: number;
    to: string;
    content: string;
    externalMessageId?: string;
    origin: 'crm';
  }): Promise<{ id: string | number }>;
};
type CampaignSync = {
  syncBatch(input: {
    companyId: number;
    integrationId: number;
    actorUserId?: number;
    campaigns: CampaignBatchItem[];
  }): Promise<void>;
};
type AppointmentSync = Pick<AppointmentV2Service, 'sync'>;
type DealPipelineSync = CrmDealPipelineApiV2Service;
type InitialSync = {
  plan(input: InitialCrmSynchronizationInput & {
    companyId: number;
    integrationId: number;
    idempotencyKey: string;
  }): InitialCrmSynchronizationPlan | Promise<InitialCrmSynchronizationPlan>;
};

function isPositiveIntegrationId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function createApiV2Router({
  authenticate,
  contactSync,
  messageSync,
  campaignSync,
  appointmentSync,
  dealPipelineSync,
  initialSync,
  resolveIntegrationId,
}: {
  authenticate: AuthenticationMiddleware;
  contactSync?: Pick<CrmContactSyncService, 'upsert'>;
  messageSync?: MessageSync;
  campaignSync?: CampaignSync;
  appointmentSync?: AppointmentSync;
  dealPipelineSync?: DealPipelineSync;
  initialSync?: InitialSync;
  resolveIntegrationId?: IntegrationIdResolver;
}) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: 'v2' });
  });

  router.get('/openapi.json', (_req, res) => {
    res.type('application/json');
    res.set('Content-Disposition', 'attachment; filename="zinto-crm-api-v2.openapi.json"');
    res.json(getApiV2OpenApiDocument());
  });

  router.get('/postman.json', (_req, res) => {
    res.type('application/json');
    res.set('Content-Disposition', 'attachment; filename="zinto-crm-api-v2.postman_collection.json"');
    res.json(getApiV2PostmanCollection());
  });

  router.get('/guide.md', (_req, res) => {
    res.type('text/markdown; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="zinto-crm-api-v2-guia.md"');
    res.send(API_V2_GUIDE_MARKDOWN);
  });

  router.use(authenticate);

  const getIntegrationId = async (req: Request): Promise<number | undefined> => {
    const raw = req.header('X-Zinto-Integration-Id')?.trim();
    if (!raw) return undefined;
    if (/^\d+$/.test(raw)) {
      const legacyId = Number(raw);
      return Number.isSafeInteger(legacyId) && legacyId > 0 ? legacyId : undefined;
    }
    if (!req.companyId || !resolveIntegrationId) return undefined;
    return resolveIntegrationId(req.companyId, raw);
  };

  router.get('/capabilities', requireIntegrationScope('integrations:manage'), (_req, res) => {
    res.json(integrationCapabilities());
  });

  if (contactSync) {
    router.put('/contacts/:externalId', requireIntegrationScope('contacts:write'), async (req, res) => {
      const companyId = req.companyId;
      const integrationId = await getIntegrationId(req);
      const externalId = req.params.externalId?.trim();
      const contact = req.body;

      if (!companyId || !isPositiveIntegrationId(integrationId) || !externalId || typeof contact?.name !== 'string' || !contact.name.trim()) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'A company, integration ID, external ID and contact name are required' });
      }

      try {
        const result = await contactSync.upsert({
          companyId,
          integrationId,
          externalId,
          contact: {
            name: contact.name.trim(),
            ...(typeof contact.phone === 'string' ? { phone: contact.phone } : {}),
            ...(typeof contact.email === 'string' ? { email: contact.email } : {}),
            ...(typeof contact.company === 'string' ? { company: contact.company } : {}),
            ...(Array.isArray(contact.tags) ? { tags: contact.tags } : {}),
            ...(contact.customFields && typeof contact.customFields === 'object' ? { customFields: contact.customFields } : {}),
          },
        });
        return res.status(result.created ? 201 : 200).json({ data: result.contact, created: result.created });
      } catch (error) {
        return res.status(500).json({ error: 'CONTACT_SYNC_FAILED', message: error instanceof Error ? error.message : 'Contact synchronization failed' });
      }
    });
  }

  if (messageSync) {
    router.post('/messages', requireIntegrationScope('messages:send'), async (req, res) => {
      const companyId = req.companyId;
      const integrationId = await getIntegrationId(req);
      const { channelId, recipient, text, external_message_id: externalMessageId } = req.body ?? {};

      if (!companyId || !isPositiveIntegrationId(integrationId) || !Number.isInteger(channelId) || channelId <= 0 || typeof recipient !== 'string' || !recipient.trim() || typeof text !== 'string' || !text.trim() || (externalMessageId !== undefined && typeof externalMessageId !== 'string')) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'A company, integration ID, positive channel ID, recipient and text are required' });
      }

      const normalizedMessage = normalizeOutboundCrmMessageRequest({
        companyId,
        integrationId,
        conversationId: channelId,
        content: text.trim(),
        externalMessageId: externalMessageId?.trim() ?? '',
      });

      try {
        const result = await messageSync.send({
          companyId: normalizedMessage.companyId,
          integrationId: normalizedMessage.integrationId,
          channelId: normalizedMessage.conversationId,
          to: recipient.trim(),
          content: normalizedMessage.content,
          ...(normalizedMessage.externalMessageId ? { externalMessageId: normalizedMessage.externalMessageId } : {}),
          origin: 'crm',
        });
        return res.status(202).json({
          data: {
            id: result.id,
            origin: 'crm',
            ...(normalizedMessage.externalMessageId ? { external_message_id: normalizedMessage.externalMessageId } : {}),
          },
        });
      } catch (error) {
        return res.status(500).json({ error: 'MESSAGE_SYNC_FAILED', message: error instanceof Error ? error.message : 'Message synchronization failed' });
      }
    });
  }

  if (campaignSync) {
    router.post('/campaigns/batch', requireIntegrationScope('campaigns:write'), async (req, res) => {
      const companyId = req.companyId;
      const integrationId = await getIntegrationId(req);
      const campaigns = req.body?.campaigns;

      if (!companyId || !isPositiveIntegrationId(integrationId) || !Array.isArray(campaigns) || campaigns.some((campaign) => !campaign || typeof campaign.externalId !== 'string' || !campaign.externalId.trim())) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'A company, integration ID, and campaigns with external IDs are required' });
      }

      try {
        validateCampaignBatch(campaigns);
      } catch (error) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: error instanceof Error ? error.message : 'Campaign batch validation failed',
        });
      }

      try {
        await campaignSync.syncBatch({
          companyId,
          integrationId,
          ...(Number.isSafeInteger(req.apiKey?.userId) && req.apiKey!.userId > 0 ? { actorUserId: req.apiKey!.userId } : {}),
          campaigns,
        });
        return res.status(202).json({ count: campaigns.length });
      } catch (error) {
        return res.status(500).json({
          error: 'CAMPAIGN_SYNC_FAILED',
          message: error instanceof Error ? error.message : 'Campaign synchronization failed',
        });
      }
    });
  }

  if (appointmentSync) {
    router.put('/appointments/:externalId', requireIntegrationScope('appointments:write'), async (req, res) => {
      const companyId = req.companyId;
      const integrationId = await getIntegrationId(req);
      const externalId = req.params.externalId?.trim();
      const idempotencyKey = req.header('Idempotency-Key');

      if (!companyId || !isPositiveIntegrationId(integrationId) || !externalId || !idempotencyKey?.trim()) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'A company, integration ID, external ID, and Idempotency-Key are required' });
      }

      try {
        const result = await appointmentSync.sync({
          companyId,
          integrationId,
          externalId,
          idempotencyKey,
          appointment: { ...req.body, externalId },
        });
        return res.status(result.created ? 201 : 200).json({ data: { id: result.id }, created: result.created });
      } catch (error) {
        return res.status(500).json({
          error: 'APPOINTMENT_SYNC_FAILED',
          message: error instanceof Error ? error.message : 'Appointment synchronization failed',
        });
      }
    });
  }

  if (dealPipelineSync) {
    router.post('/deals', requireIntegrationScope('deals:write'), async (req, res) => {
      const companyId = req.companyId;
      const integrationId = await getIntegrationId(req);
      const idempotencyKey = req.header('Idempotency-Key');

      if (!companyId || !isPositiveIntegrationId(integrationId) || !idempotencyKey?.trim()) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'A company, integration ID, and Idempotency-Key are required' });
      }

      try {
        const result = await dealPipelineSync.upsert({
          companyId,
          integrationId,
          idempotencyKey,
          deal: req.body,
        });
        return res.status(result.created ? 201 : 200).json({ data: result.deal, created: result.created });
      } catch (error) {
        return res.status(500).json({
          error: 'DEAL_PIPELINE_SYNC_FAILED',
          message: error instanceof Error ? error.message : 'Deal pipeline synchronization failed',
        });
      }
    });
  }

  if (initialSync) {
    router.post('/sync-jobs', requireIntegrationScope('integrations:manage'), async (req, res) => {
      const companyId = req.companyId;
      const integrationId = await getIntegrationId(req);
      const idempotencyKey = req.header('Idempotency-Key');

      if (!companyId || !isPositiveIntegrationId(integrationId) || !idempotencyKey?.trim()) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'A company, integration ID, and Idempotency-Key are required' });
      }

      try {
        const plan = await initialSync.plan({
          ...req.body,
          companyId,
          integrationId,
          idempotencyKey,
        });
        return res.status(202).json({ data: plan });
      } catch (error) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: error instanceof Error ? error.message : 'Initial CRM synchronization validation failed',
        });
      }
    });
  }

  return router;
}
