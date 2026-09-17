import { createHash } from 'crypto';
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
import type { CrmChannelsReadService, CrmConversationsReadService, CrmMessageStatusReadService } from '../services/crm-read-service';

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
  sendMedia(input: {
    companyId: number;
    integrationId: number;
    channelId: number;
    to: string;
    caption?: string;
    externalMessageId?: string;
    origin: 'crm';
    media: {
      url: string;
      type: 'image' | 'video' | 'audio' | 'document';
      filename?: string;
    };
  }): Promise<{ id: string | number }>;
  sendTemplate(input: {
    companyId: number;
    integrationId: number;
    channelId: number;
    to: string;
    externalMessageId?: string;
    origin: 'crm';
    template: {
      name: string;
      language: string;
      components?: Array<{
        type: 'header' | 'body' | 'button';
        parameters: Array<string | { type: 'text'; text: string }>;
      }>;
    };
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
type UploadedMedia = {
  url: string;
  mediaType: 'image' | 'video' | 'audio' | 'document';
  filename: string;
  size: number;
  mimetype: string;
};
type MediaAccess = {
  /** multer `.single('file')` middleware — populates `req.file`. */
  upload: AuthenticationMiddleware;
  processUpload(input: { file: Express.Multer.File; companyId: number; baseUrl: string }): Promise<UploadedMedia>;
  findOwnerCompanyId(mediaPath: string): Promise<number | null>;
  resolveFilePath(mediaPath: string): string | null;
};
type ChannelsRead = Pick<CrmChannelsReadService, 'listChannels'>;
type ConversationsRead = Pick<CrmConversationsReadService, 'listConversations'>;
type MessageStatusRead = Pick<CrmMessageStatusReadService, 'getMessageStatus'>;
type IdempotencyRecord = { method: string; path: string; requestHash: string; responseStatus: number; responseBody: unknown };
type Idempotency = {
  find(input: { companyId: number; key: string }): Promise<IdempotencyRecord | null>;
  save(input: {
    companyId: number;
    integrationId: number;
    key: string;
    method: string;
    path: string;
    requestHash: string;
    responseStatus: number;
    responseBody: unknown;
  }): Promise<void>;
};

function isPositiveIntegrationId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/**
 * For internal synchronization failures only (never for our own input-validation
 * errors, which are deliberately worded for the caller and should keep passing
 * through as-is). Logs the real error server-side and returns a fixed, generic
 * message — the underlying error can be a raw DB/driver message or internal
 * business-logic text ("Integration does not belong to this company") that
 * would otherwise leak implementation detail to an API caller.
 */
function syncFailure(res: Response, code: string, genericMessage: string, error: unknown, context: string): Response {
  console.error(`[api-v2] ${context} failed:`, error);
  return res.status(500).json({ error: code, message: genericMessage });
}

/** Same contract as syncFailure(), but returns a {status, body} pair for handlers wrapped in withIdempotency() rather than writing to `res` directly. */
function syncFailureResult(code: string, genericMessage: string, error: unknown, context: string): { status: number; body: unknown } {
  console.error(`[api-v2] ${context} failed:`, error);
  return { status: 500, body: { error: code, message: genericMessage } };
}

function requestFingerprint(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body ?? {})).digest('hex');
}

/**
 * Makes `Idempotency-Key` do what its name promises for routes that declare
 * one required: a retried request with the same key and body short-circuits
 * to the exact response the first attempt produced, instead of the sync
 * service (whose own upsert-by-externalId logic is a coarser, best-effort
 * safety net, not a literal replay of the same response). Only successful
 * (2xx) responses are cached — a failed attempt intentionally stays retryable
 * with the same key, since most failures here are transient (a downstream
 * sync error), not permanent.
 */
async function withIdempotency(
  idempotency: Idempotency | undefined,
  params: { companyId: number; integrationId: number; key: string; method: string; path: string; body: unknown },
  work: () => Promise<{ status: number; body: unknown }>,
): Promise<{ status: number; body: unknown }> {
  if (!idempotency) return work();

  const hash = requestFingerprint(params.body);
  const existing = await idempotency.find({ companyId: params.companyId, key: params.key });
  if (existing) {
    if (existing.method !== params.method || existing.path !== params.path) {
      return { status: 409, body: { error: 'IDEMPOTENCY_KEY_REUSED', message: 'This Idempotency-Key was already used for a different operation' } };
    }
    if (existing.requestHash !== hash) {
      return { status: 409, body: { error: 'IDEMPOTENCY_KEY_CONFLICT', message: 'This Idempotency-Key was already used with a different request body' } };
    }
    return { status: existing.responseStatus, body: existing.responseBody };
  }

  const result = await work();
  if (result.status >= 200 && result.status < 300) {
    idempotency.save({
      companyId: params.companyId,
      integrationId: params.integrationId,
      key: params.key,
      method: params.method,
      path: params.path,
      requestHash: hash,
      responseStatus: result.status,
      responseBody: result.body,
    }).catch((error) => console.error('[api-v2] failed to persist idempotency record:', error));
  }
  return result;
}

export function createApiV2Router({
  authenticate,
  contactSync,
  messageSync,
  campaignSync,
  appointmentSync,
  dealPipelineSync,
  initialSync,
  mediaAccess,
  channelsRead,
  conversationsRead,
  messageStatusRead,
  idempotency,
  resolveIntegrationId,
}: {
  authenticate: AuthenticationMiddleware;
  contactSync?: Pick<CrmContactSyncService, 'upsert'>;
  messageSync?: MessageSync;
  campaignSync?: CampaignSync;
  appointmentSync?: AppointmentSync;
  dealPipelineSync?: DealPipelineSync;
  initialSync?: InitialSync;
  mediaAccess?: MediaAccess;
  channelsRead?: ChannelsRead;
  conversationsRead?: ConversationsRead;
  messageStatusRead?: MessageStatusRead;
  idempotency?: Idempotency;
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
            ...(typeof contact.notes === 'string' ? { notes: contact.notes } : {}),
            ...(contact.customFields && typeof contact.customFields === 'object' ? { customFields: contact.customFields } : {}),
          },
        });
        return res.status(result.created ? 201 : 200).json({ data: result.contact, created: result.created });
      } catch (error) {
        return syncFailure(res, 'CONTACT_SYNC_FAILED', 'Contact synchronization failed', error, 'contact sync');
      }
    });
  }

  if (messageSync) {
    const MEDIA_TYPES = ['image', 'video', 'audio', 'document'] as const;

    const TEMPLATE_COMPONENT_TYPES = ['header', 'body', 'button'] as const;

    function isValidTemplateComponents(components: unknown): components is Array<{ type: 'header' | 'body' | 'button'; parameters: Array<string | { type: 'text'; text: string }> }> {
      if (components === undefined) return true;
      if (!Array.isArray(components)) return false;
      return components.every((component) =>
        component
        && TEMPLATE_COMPONENT_TYPES.includes(component.type)
        && Array.isArray(component.parameters)
        && component.parameters.every((param: unknown) =>
          typeof param === 'string'
          || (param && typeof param === 'object' && (param as any).type === 'text' && typeof (param as any).text === 'string'),
        ),
      );
    }

    router.post('/messages', requireIntegrationScope('messages:send'), async (req, res) => {
      const companyId = req.companyId;
      const integrationId = await getIntegrationId(req);
      const { channelId, recipient, text, external_message_id: externalMessageId, media, template } = req.body ?? {};

      const hasMedia = media !== undefined;
      const isMediaObject = hasMedia && typeof media === 'object' && media !== null;
      const mediaUrl = isMediaObject ? media.url : undefined;
      const mediaType = isMediaObject ? media.type : undefined;
      const mediaFilename = isMediaObject ? media.filename : undefined;
      const isValidMedia = !hasMedia || (
        isMediaObject
        && typeof mediaUrl === 'string' && /^https?:\/\//i.test(mediaUrl)
        && MEDIA_TYPES.includes(mediaType)
        && (mediaFilename === undefined || typeof mediaFilename === 'string')
      );

      const hasTemplate = template !== undefined;
      const isTemplateObject = hasTemplate && typeof template === 'object' && template !== null;
      const templateName = isTemplateObject ? template.name : undefined;
      const templateLanguage = isTemplateObject ? template.language : undefined;
      const templateComponents = isTemplateObject ? template.components : undefined;
      const isValidTemplate = !hasTemplate || (
        isTemplateObject
        && typeof templateName === 'string' && templateName.trim()
        && typeof templateLanguage === 'string' && templateLanguage.trim()
        && isValidTemplateComponents(templateComponents)
      );

      const hasText = typeof text === 'string' && text.trim().length > 0;

      if (
        !companyId || !isPositiveIntegrationId(integrationId) || !Number.isInteger(channelId) || channelId <= 0
        || typeof recipient !== 'string' || !recipient.trim()
        || !isValidMedia || !isValidTemplate
        || (hasMedia && hasTemplate)
        || (!hasMedia && !hasTemplate && !hasText)
        || (text !== undefined && typeof text !== 'string')
        || (externalMessageId !== undefined && typeof externalMessageId !== 'string')
      ) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'A company, integration ID, positive channel ID, recipient and one of text, a valid media object ({url, type, filename?}), or a valid template object ({name, language, components?}) are required' });
      }

      if (hasMedia) {
        const permissions = (req.apiKey?.permissions as string[] | undefined) ?? [];
        if (!permissions.includes('*') && !permissions.includes('media:upload')) {
          return res.status(403).json({ error: 'INSUFFICIENT_PERMISSIONS', message: "Permission 'media:upload' is required to send media" });
        }
      }

      const normalizedMessage = normalizeOutboundCrmMessageRequest({
        companyId,
        integrationId,
        conversationId: channelId,
        content: hasText ? text.trim() : '',
        externalMessageId: externalMessageId?.trim() ?? '',
      });

      try {
        const result = hasTemplate
          ? await messageSync.sendTemplate({
              companyId: normalizedMessage.companyId,
              integrationId: normalizedMessage.integrationId,
              channelId: normalizedMessage.conversationId,
              to: recipient.trim(),
              ...(normalizedMessage.externalMessageId ? { externalMessageId: normalizedMessage.externalMessageId } : {}),
              origin: 'crm',
              template: {
                name: templateName,
                language: templateLanguage,
                ...(templateComponents ? { components: templateComponents } : {}),
              },
            })
          : hasMedia
          ? await messageSync.sendMedia({
              companyId: normalizedMessage.companyId,
              integrationId: normalizedMessage.integrationId,
              channelId: normalizedMessage.conversationId,
              to: recipient.trim(),
              ...(hasText ? { caption: normalizedMessage.content } : {}),
              ...(normalizedMessage.externalMessageId ? { externalMessageId: normalizedMessage.externalMessageId } : {}),
              origin: 'crm',
              media: {
                url: mediaUrl,
                type: mediaType as typeof MEDIA_TYPES[number],
                ...(mediaFilename ? { filename: mediaFilename } : {}),
              },
            })
          : await messageSync.send({
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
        return syncFailure(res, 'MESSAGE_SYNC_FAILED', 'Message synchronization failed', error, 'message send');
      }
    });
  }

  if (mediaAccess) {
    router.post('/media/upload', requireIntegrationScope('media:upload'), mediaAccess.upload, async (req, res) => {
      const companyId = req.companyId;
      const integrationId = await getIntegrationId(req);

      if (!companyId || !isPositiveIntegrationId(integrationId)) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'A company and integration ID are required' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'No file was uploaded (multipart field name: file)' });
      }

      try {
        const uploaded = await mediaAccess.processUpload({
          file: req.file,
          companyId,
          baseUrl: process.env.BASE_URL || `${req.protocol}://${req.get('host')}`,
        });
        return res.status(201).json({
          data: {
            url: uploaded.url,
            type: uploaded.mediaType,
            filename: uploaded.filename,
            size: uploaded.size,
            mimeType: uploaded.mimetype,
          },
        });
      } catch (error) {
        return syncFailure(res, 'MEDIA_UPLOAD_FAILED', 'Media upload failed', error, 'media upload');
      }
    });

    router.get('/media', requireIntegrationScope('media:read'), async (req, res) => {
      const companyId = req.companyId;
      const integrationId = await getIntegrationId(req);
      const { type, filename } = req.query;

      if (!companyId || !isPositiveIntegrationId(integrationId) || typeof type !== 'string' || !type.trim() || typeof filename !== 'string' || !filename.trim()) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'A company, integration ID, and the type and filename query params (from data.media.url) are required' });
      }

      const mediaPath = `/media/${type}/${filename}`;
      const ownerCompanyId = await mediaAccess.findOwnerCompanyId(mediaPath);
      if (!ownerCompanyId || ownerCompanyId !== companyId) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Media not found' });
      }

      const filePath = mediaAccess.resolveFilePath(mediaPath);
      if (!filePath) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Media not found' });
      }

      res.setHeader('Cache-Control', 'private, no-store');
      res.sendFile(filePath, (error) => {
        if (error && !res.headersSent) {
          res.status(404).json({ error: 'NOT_FOUND', message: 'Media not found' });
        }
      });
    });
  }

  if (channelsRead) {
    router.get('/channels', requireIntegrationScope('channels:read'), async (req, res) => {
      const companyId = req.companyId;
      const integrationId = await getIntegrationId(req);

      if (!companyId || !isPositiveIntegrationId(integrationId)) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'A company and integration ID are required' });
      }

      try {
        const channels = await channelsRead.listChannels(companyId);
        return res.status(200).json({ data: channels });
      } catch (error) {
        return syncFailure(res, 'CHANNELS_READ_FAILED', 'Failed to read channels', error, 'channels read');
      }
    });
  }

  if (conversationsRead) {
    router.get('/conversations', requireIntegrationScope('conversations:read'), async (req, res) => {
      const companyId = req.companyId;
      const integrationId = await getIntegrationId(req);
      const { channelId, status, isGroup, page, limit } = req.query;

      const parsedChannelId = channelId !== undefined ? Number(channelId) : undefined;
      const parsedIsGroup = isGroup === undefined ? undefined : isGroup === 'true' ? true : isGroup === 'false' ? false : undefined;
      const parsedPage = page !== undefined ? Number(page) : undefined;
      const parsedLimit = limit !== undefined ? Number(limit) : undefined;

      if (
        !companyId || !isPositiveIntegrationId(integrationId)
        || (channelId !== undefined && (!Number.isFinite(parsedChannelId) || (parsedChannelId as number) <= 0))
        || (status !== undefined && typeof status !== 'string')
        || (isGroup !== undefined && parsedIsGroup === undefined)
        || (page !== undefined && (!Number.isFinite(parsedPage) || (parsedPage as number) <= 0))
        || (limit !== undefined && (!Number.isFinite(parsedLimit) || (parsedLimit as number) <= 0))
      ) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'A company and integration ID are required; optional query params channelId, status, isGroup, page, limit must be well-formed' });
      }

      try {
        const result = await conversationsRead.listConversations({
          companyId,
          ...(parsedChannelId !== undefined || status !== undefined || parsedIsGroup !== undefined ? {
            filters: {
              ...(parsedChannelId !== undefined ? { channelId: parsedChannelId } : {}),
              ...(typeof status === 'string' ? { status } : {}),
              ...(parsedIsGroup !== undefined ? { isGroup: parsedIsGroup } : {}),
            },
          } : {}),
          ...(parsedPage !== undefined || parsedLimit !== undefined ? {
            pagination: {
              ...(parsedPage !== undefined ? { page: parsedPage } : {}),
              ...(parsedLimit !== undefined ? { limit: parsedLimit } : {}),
            },
          } : {}),
        });
        return res.status(200).json({ data: result.conversations, total: result.total });
      } catch (error) {
        return syncFailure(res, 'CONVERSATIONS_READ_FAILED', 'Failed to read conversations', error, 'conversations read');
      }
    });
  }

  if (messageStatusRead) {
    router.get('/messages/:messageId/status', requireIntegrationScope('messages:read'), async (req, res) => {
      const companyId = req.companyId;
      const integrationId = await getIntegrationId(req);
      const messageId = Number(req.params.messageId);

      if (!companyId || !isPositiveIntegrationId(integrationId) || !Number.isSafeInteger(messageId) || messageId <= 0) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'A company, integration ID, and a positive message ID are required' });
      }

      try {
        const status = await messageStatusRead.getMessageStatus({ companyId, messageId });
        if (!status) {
          return res.status(404).json({ error: 'NOT_FOUND', message: 'Message not found' });
        }
        return res.status(200).json({ data: status });
      } catch (error) {
        return syncFailure(res, 'MESSAGE_STATUS_READ_FAILED', 'Failed to read message status', error, 'message status read');
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

      const idempotencyKey = req.header('Idempotency-Key');
      if (!idempotencyKey?.trim()) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'An Idempotency-Key header is required' });
      }

      const { status, body } = await withIdempotency(idempotency, {
        companyId, integrationId, key: idempotencyKey.trim(), method: 'POST', path: '/campaigns/batch', body: req.body,
      }, async () => {
        try {
          validateCampaignBatch(campaigns);
        } catch (error) {
          return { status: 400, body: { error: 'VALIDATION_ERROR', message: error instanceof Error ? error.message : 'Campaign batch validation failed' } };
        }

        try {
          await campaignSync.syncBatch({
            companyId,
            integrationId,
            ...(Number.isSafeInteger(req.apiKey?.userId) && req.apiKey!.userId > 0 ? { actorUserId: req.apiKey!.userId } : {}),
            campaigns,
          });
          return { status: 202, body: { count: campaigns.length } };
        } catch (error) {
          return syncFailureResult('CAMPAIGN_SYNC_FAILED', 'Campaign synchronization failed', error, 'campaign batch sync');
        }
      });
      return res.status(status).json(body);
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

      const { status, body } = await withIdempotency(idempotency, {
        companyId, integrationId, key: idempotencyKey.trim(), method: 'PUT', path: '/appointments/:externalId', body: req.body,
      }, async () => {
        try {
          const result = await appointmentSync.sync({
            companyId,
            integrationId,
            externalId,
            idempotencyKey,
            appointment: { ...req.body, externalId },
          });
          return { status: result.created ? 201 : 200, body: { data: { id: result.id }, created: result.created } };
        } catch (error) {
          return syncFailureResult('APPOINTMENT_SYNC_FAILED', 'Appointment synchronization failed', error, 'appointment sync');
        }
      });
      return res.status(status).json(body);
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

      const { status, body } = await withIdempotency(idempotency, {
        companyId, integrationId, key: idempotencyKey.trim(), method: 'POST', path: '/deals', body: req.body,
      }, async () => {
        try {
          const result = await dealPipelineSync.upsert({
            companyId,
            integrationId,
            idempotencyKey,
            deal: req.body,
          });
          return { status: result.created ? 201 : 200, body: { data: result.deal, created: result.created } };
        } catch (error) {
          return syncFailureResult('DEAL_PIPELINE_SYNC_FAILED', 'Deal pipeline synchronization failed', error, 'deal pipeline sync');
        }
      });
      return res.status(status).json(body);
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

      const { status, body } = await withIdempotency(idempotency, {
        companyId, integrationId, key: idempotencyKey.trim(), method: 'POST', path: '/sync-jobs', body: req.body,
      }, async () => {
        try {
          const plan = await initialSync.plan({
            ...req.body,
            companyId,
            integrationId,
            idempotencyKey,
          });
          return { status: 202, body: { data: plan } };
        } catch (error) {
          return {
            status: 400,
            body: { error: 'VALIDATION_ERROR', message: error instanceof Error ? error.message : 'Initial CRM synchronization validation failed' },
          };
        }
      });
      return res.status(status).json(body);
    });
  }

  return router;
}
