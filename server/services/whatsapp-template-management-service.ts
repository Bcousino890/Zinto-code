/**
 * Company-scoped WhatsApp template management — list/get/create/update/delete
 * against Meta's WhatsApp Business API, plus the resumable media-upload flow
 * templates with an image/video/document header require.
 *
 * This is the extraction target described in the CRM API v2 parity plan
 * (`/home/deploy/.claude/plans/adaptive-mixing-wind.md`, Fase 1, item 1):
 * `server/routes/whatsapp-templates.ts` used to inline all of this directly
 * in its Express handlers. It now calls these same functions (see that file
 * for the thin `req`/`res` translation), and `whatsapp-template-v2-adapter.ts`
 * wraps them for the v2 CRM API — so there is exactly one implementation of
 * "create a template against Meta" instead of two.
 *
 * Every function returns `{ status, body }` (never throws for an expected
 * failure) so both call sites can do `res.status(status).json(body)`
 * unchanged from today's behavior. `body` mirrors the exact JSON shape the
 * v1 routes already returned — including the one case (media upload
 * failure) that embeds a caught exception's `.message`; that is intentional
 * for v1 (session-authenticated company staff debugging their own
 * template), but `whatsapp-template-v2-adapter.ts` deliberately does NOT
 * forward that raw text to v2's external CRM partners (see its own
 * comment) — never assume `body` is safe to reuse verbatim outside v1.
 */

import { storage } from '../storage';
import { db } from '../db';
import { campaignTemplates, channelConnections } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import axios from 'axios';
import { rawAxiosHeaderToString } from '../utils/axios-headers';
import { logger } from '../utils/logger';
import { assertPublicHttpUrl } from '../utils/ssrf-guard';

export const WHATSAPP_GRAPH_URL = 'https://graph.facebook.com';
export const WHATSAPP_API_VERSION = 'v23.0';

export type WhatsAppTemplateOperationResult = { status: number; body: Record<string, unknown> };

const MAX_TEMPLATE_MEDIA_REDIRECTS = 5;

/**
 * Downloads a template header image/video/document, refusing to reach a
 * private/internal address. This URL is caller-controlled — a company admin
 * via v1's own UI, or (since Fase 1 wired POST /templates into CRM API v2)
 * an external CRM partner — so it gets the same SSRF protection as
 * `crmIntegrations.webhookUrl` (see `server/utils/ssrf-guard.ts`). Plain
 * `axios.get` here would follow a 30x transparently, so redirects are
 * disabled and each hop is re-validated instead, mirroring
 * `durable-webhook-delivery-service.ts`'s redirect handling (the SSRF bypass
 * an adversarial review found there in Fase 0 — see the parity plan handoff,
 * section 3.2 — applies identically to any URL a caller can point elsewhere
 * with a redirect).
 */
async function fetchTemplateHeaderMedia(mediaUrl: string): Promise<{ data: Buffer; contentType: string }> {
  let currentUrl = await assertPublicHttpUrl(mediaUrl);

  for (let redirects = 0; ; redirects++) {
    const response = await axios.get(currentUrl.toString(), {
      responseType: 'arraybuffer',
      timeout: 30000,
      maxRedirects: 0,
      validateStatus: (status) => (status >= 200 && status < 300) || (status >= 300 && status < 400),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers['location'];
      if (!location || redirects >= MAX_TEMPLATE_MEDIA_REDIRECTS) {
        throw new Error('Too many redirects while downloading template media');
      }
      currentUrl = await assertPublicHttpUrl(new URL(location, currentUrl).toString());
      continue;
    }

    const contentType = rawAxiosHeaderToString(response.headers['content-type']) || 'application/octet-stream';
    return { data: response.data, contentType };
  }
}

export interface CreateWhatsAppTemplateInput {
  name?: unknown;
  description?: unknown;
  whatsappTemplateCategory?: unknown;
  whatsappTemplateLanguage?: unknown;
  content?: unknown;
  variables?: unknown;
  connectionId?: unknown;
  headerType?: unknown;
  headerText?: unknown;
  headerMediaUrl?: unknown;
  footerText?: unknown;
}

export interface UpdateWhatsAppTemplateInput {
  description?: unknown;
  isActive?: unknown;
}

/**
 * Upload media for template using WhatsApp Resumable Upload API.
 * This is required for template creation, not the regular media upload endpoint.
 * Reference: https://developers.facebook.com/docs/graph-api/guides/upload
 */
export async function uploadMediaForTemplate(
  mediaUrl: string,
  accessToken: string,
  wabaId: string,
  appId?: string
): Promise<string> {
  const uploadId = wabaId || appId;

  if (!uploadId) {
    throw new Error('Either WABA ID or App ID is required for media upload');
  }

  try {
    logger.info('whatsapp-templates', 'Starting Resumable Upload for template media', {
      mediaUrl,
      uploadId,
      usingWabaId: !!wabaId,
      usingAppId: !wabaId && !!appId
    });

    const { data: mediaData, contentType } = await fetchTemplateHeaderMedia(mediaUrl);
    const urlParts = mediaUrl.split('/');
    const filename = urlParts[urlParts.length - 1];
    const fileSize = mediaData.byteLength;

    logger.info('whatsapp-templates', 'Media downloaded', {
      filename,
      contentType,
      fileSize
    });

    const sessionUrl = `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${uploadId}/uploads?file_length=${fileSize}&file_type=${encodeURIComponent(contentType)}&access_token=${accessToken}`;

    logger.info('whatsapp-templates', 'Creating upload session', {
      sessionUrl: sessionUrl.replace(accessToken, 'REDACTED'),
      uploadId
    });

    const sessionResponse = await axios.post(sessionUrl, {}, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!sessionResponse.data?.id) {
      throw new Error('Failed to create upload session: No session ID returned');
    }

    const uploadSessionId = sessionResponse.data.id;
    logger.info('whatsapp-templates', 'Upload session created', {
      uploadSessionId
    });

    const uploadUrl = `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${uploadSessionId}`;

    logger.info('whatsapp-templates', 'Uploading file data', {
      uploadUrl,
      fileSize
    });

    const uploadResponse = await axios.post(uploadUrl, mediaData, {
      headers: {
        'Authorization': `OAuth ${accessToken}`,
        'file_offset': '0',
        'Content-Type': 'application/octet-stream'
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 120000
    });

    if (!uploadResponse.data?.h) {
      throw new Error('Failed to upload media: No media handle returned');
    }

    const mediaHandle = uploadResponse.data.h;
    logger.info('whatsapp-templates', 'Media uploaded successfully via Resumable Upload API', {
      mediaHandle
    });

    return mediaHandle;
  } catch (error: any) {
    logger.error('whatsapp-templates', 'Error uploading media for template', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      uploadId,
      usingWabaId: !!wabaId,
      usingAppId: !wabaId && !!appId
    });

    if (wabaId && appId && error.response?.status === 400) {
      logger.info('whatsapp-templates', 'Retrying with App ID instead of WABA ID');
      return uploadMediaForTemplate(mediaUrl, accessToken, '', appId);
    }

    throw error;
  }
}

/** Get all official WhatsApp templates for a company. */
export async function listCompanyTemplates(companyId: number): Promise<WhatsAppTemplateOperationResult> {
  try {
    const templates = await db
      .select({
        template: campaignTemplates,
        connection: channelConnections
      })
      .from(campaignTemplates)
      .leftJoin(channelConnections, eq(campaignTemplates.connectionId, channelConnections.id))
      .where(
        and(
          eq(campaignTemplates.companyId, companyId),
          eq(campaignTemplates.whatsappChannelType, 'official')
        )
      )
      .orderBy(desc(campaignTemplates.createdAt));

    const formattedTemplates = templates.map(({ template, connection }) => {
      const connectionData = connection?.connectionData as any;

      if (connectionData) {
        logger.info('whatsapp-templates', 'Template connection data structure', {
          templateId: template.id,
          templateName: template.name,
          connectionId: connection?.id,
          connectionDataKeys: Object.keys(connectionData),
          hasWabaId: !!(connectionData.wabaId || connectionData.businessAccountId || connectionData.waba_id),
          hasAccessToken: !!(connectionData.accessToken || connectionData.access_token),
          hasAppId: !!(connectionData.appId || connectionData.app_id),
          partnerManaged: connectionData.partnerManaged === true,
          phoneNumberId: connectionData.phoneNumberId || connectionData.phone_number_id
        });
      }

      return {
        ...template,
        connection: connection ? {
          id: connection.id,
          accountName: connection.accountName,
          phoneNumber: connectionData?.phoneNumber || connectionData?.phone_number,
          status: connection.status
        } : null
      };
    });

    return { status: 200, body: formattedTemplates as unknown as Record<string, unknown> };
  } catch (error) {
    logger.error('whatsapp-templates', 'Error fetching templates:', error);
    return { status: 500, body: { error: 'Failed to fetch templates' } };
  }
}

/** Get a single company-owned template by ID. */
export async function getCompanyTemplate(companyId: number, templateId: number): Promise<WhatsAppTemplateOperationResult> {
  try {
    const template = await db
      .select()
      .from(campaignTemplates)
      .where(
        and(
          eq(campaignTemplates.id, templateId),
          eq(campaignTemplates.companyId, companyId)
        )
      )
      .limit(1);

    if (!template || template.length === 0) {
      return { status: 404, body: { error: 'Template not found' } };
    }

    return { status: 200, body: template[0] as unknown as Record<string, unknown> };
  } catch (error) {
    logger.error('whatsapp-templates', 'Error fetching template:', error);
    return { status: 500, body: { error: 'Failed to fetch template' } };
  }
}

/** Create a new template and submit it to the WhatsApp Business API. */
export async function createCompanyTemplate(
  companyId: number,
  userId: number,
  input: CreateWhatsAppTemplateInput,
): Promise<WhatsAppTemplateOperationResult> {
  try {
    const {
      name,
      description,
      whatsappTemplateCategory,
      whatsappTemplateLanguage,
      content,
      variables,
      connectionId,
      headerType,
      headerText,
      headerMediaUrl,
      footerText,
    } = input as {
      name?: string; description?: string; whatsappTemplateCategory?: string; whatsappTemplateLanguage?: string;
      content?: string; variables?: unknown[]; connectionId?: number; headerType?: string; headerText?: string;
      headerMediaUrl?: string; footerText?: string;
    };

    if (!name || !content) {
      return { status: 400, body: { error: 'Name and content are required' } };
    }

    if (!/^[a-z0-9_]+$/.test(name)) {
      return { status: 400, body: { error: 'Template name must contain only lowercase letters, numbers, and underscores' } };
    }

    if (!connectionId) {
      return { status: 400, body: { error: 'WhatsApp connection is required' } };
    }

    const existingTemplate = await db
      .select()
      .from(campaignTemplates)
      .where(
        and(
          eq(campaignTemplates.companyId, companyId),
          eq(campaignTemplates.name, name)
        )
      )
      .limit(1);

    if (existingTemplate && existingTemplate.length > 0) {
      return { status: 400, body: { error: 'A template with this name already exists' } };
    }

    const whatsappChannel = await storage.getChannelConnection(connectionId);

    if (!whatsappChannel) {
      logger.error('whatsapp-templates', 'WhatsApp channel not found', { connectionId });
      return { status: 404, body: { error: 'WhatsApp connection not found' } };
    }

    if (whatsappChannel.companyId !== companyId) {
      logger.error('whatsapp-templates', 'Unauthorized access to channel', {
        connectionId,
        channelCompanyId: whatsappChannel.companyId,
        userCompanyId: companyId
      });
      return { status: 403, body: { error: 'Unauthorized access to this connection' } };
    }

    if (whatsappChannel.channelType !== 'whatsapp_official') {
      logger.error('whatsapp-templates', 'Invalid channel type', {
        connectionId,
        channelType: whatsappChannel.channelType
      });
      return { status: 400, body: { error: 'Selected connection is not a WhatsApp Official channel' } };
    }

    const connectionData = whatsappChannel.connectionData as any;

    logger.info('whatsapp-templates', 'Connection data structure for template creation', {
      connectionId,
      connectionDataKeys: Object.keys(connectionData || {}),
      connectionData: {
        wabaId: connectionData?.wabaId,
        businessAccountId: connectionData?.businessAccountId,
        waba_id: connectionData?.waba_id,
        accessToken: connectionData?.accessToken ? '***REDACTED***' : undefined,
        access_token: connectionData?.access_token ? '***REDACTED***' : undefined,
        appId: connectionData?.appId,
        app_id: connectionData?.app_id,
        phoneNumberId: connectionData?.phoneNumberId,
        phone_number_id: connectionData?.phone_number_id,
        partnerManaged: connectionData?.partnerManaged
      }
    });

    let wabaId = connectionData.wabaId || connectionData.businessAccountId || connectionData.waba_id;
    let accessToken = connectionData.accessToken || connectionData.access_token;
    const appIdFromConnection = connectionData.appId || connectionData.app_id;
    let appId = appIdFromConnection;
    const partnerManaged = connectionData.partnerManaged === true;

    if (partnerManaged && (!appId || !accessToken)) {
      try {
        const partnerConfig = await storage.getPartnerConfiguration('meta');
        if (partnerConfig) {
          logger.info('whatsapp-templates', 'Using partner configuration for template creation', {
            connectionId,
            hadAppId: !!appId,
            hadAccessToken: !!accessToken,
            partnerConfigHasAppId: !!partnerConfig.partnerApiKey,
            partnerConfigHasAccessToken: !!partnerConfig.accessToken
          });

          if (!appId && partnerConfig.partnerApiKey) {
            appId = partnerConfig.partnerApiKey;
          }
          if (!accessToken && partnerConfig.accessToken) {
            accessToken = partnerConfig.accessToken;
          }
        }
      } catch (partnerConfigError: any) {
        logger.error('whatsapp-templates', 'Error fetching partner configuration', {
          connectionId,
          error: partnerConfigError.message
        });
      }
    }

    logger.info('whatsapp-templates', 'Connection credentials', {
      hasWabaId: !!wabaId,
      wabaId: wabaId,
      hasAccessToken: !!accessToken,
      hasAppId: !!appId,
      appId: appId,
      partnerManaged,
      connectionDataKeys: Object.keys(connectionData || {}),
      tokenSource: partnerManaged && accessToken !== (connectionData.accessToken || connectionData.access_token)
        ? 'partner-config'
        : 'connection'
    });

    if (!wabaId || !accessToken) {
      return { status: 400, body: { error: 'WhatsApp Business Account ID or access token not found in connection' } };
    }

    let mediaHandle: string | undefined;

    logger.info('whatsapp-templates', 'Checking if media upload needed', {
      hasHeaderMediaUrl: !!headerMediaUrl,
      headerType,
      headerMediaUrl,
      shouldUpload: !!headerMediaUrl && ['image', 'video', 'document'].includes(headerType as string)
    });

    if (headerMediaUrl && ['image', 'video', 'document'].includes(headerType as string)) {
      if (!appId) {
        logger.error('whatsapp-templates', 'App ID not found in connection data', {
          connectionDataKeys: Object.keys(connectionData || {})
        });
        return { status: 400, body: { error: 'App ID not found in connection. Media upload requires App ID for Resumable Upload API.' } };
      }

      try {
        let fullMediaUrl = headerMediaUrl;

        if (!headerMediaUrl.startsWith('http')) {
          const baseUrl = process.env.APP_URL || process.env.BASE_URL || process.env.PUBLIC_URL;

          if (baseUrl) {
            const cleanBaseUrl = baseUrl.replace(/\/$/, '');
            const cleanMediaUrl = headerMediaUrl.startsWith('/') ? headerMediaUrl : `/${headerMediaUrl}`;
            fullMediaUrl = `${cleanBaseUrl}${cleanMediaUrl}`;
          } else {
            const basePort = process.env.PORT || '9000';
            const host = process.env.HOST || 'localhost';
            const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';

            if (host === 'localhost' || host === '127.0.0.1') {
              fullMediaUrl = `${protocol}://${host}:${basePort}${headerMediaUrl.startsWith('/') ? headerMediaUrl : `/${headerMediaUrl}`}`;
            } else {
              fullMediaUrl = `${protocol}://${host}${headerMediaUrl.startsWith('/') ? headerMediaUrl : `/${headerMediaUrl}`}`;
            }
          }
        }

        logger.info('whatsapp-templates', 'Uploading media for template using Resumable Upload API with App ID', {
          headerType,
          mediaUrl: fullMediaUrl,
          appId
        });

        mediaHandle = await uploadMediaForTemplate(fullMediaUrl, accessToken, '', appId);

        logger.info('whatsapp-templates', 'Media uploaded, got handle', { mediaHandle });
      } catch (error: any) {
        logger.error('whatsapp-templates', 'Failed to upload media', {
          error: error.message,
          stack: error.stack
        });
        return { status: 400, body: { error: 'Failed to upload media to WhatsApp: ' + error.message } };
      }
    }

    const components: any[] = [];

    if (headerType === 'text' && headerText) {
      components.push({ type: 'HEADER', format: 'TEXT', text: headerText });
    } else if (headerType === 'image' && mediaHandle) {
      components.push({ type: 'HEADER', format: 'IMAGE', example: { header_handle: [mediaHandle] } });
    } else if (headerType === 'video' && mediaHandle) {
      components.push({ type: 'HEADER', format: 'VIDEO', example: { header_handle: [mediaHandle] } });
    } else if (headerType === 'document' && mediaHandle) {
      components.push({ type: 'HEADER', format: 'DOCUMENT', example: { header_handle: [mediaHandle] } });
    }

    const bodyComponent: any = { type: 'BODY', text: content };

    if (variables && (variables as unknown[]).length > 0) {
      bodyComponent.example = {
        body_text: [(variables as unknown[]).map((_v, i) => `Example ${i + 1}`)]
      };
    }

    components.push(bodyComponent);

    if (footerText) {
      components.push({ type: 'FOOTER', text: footerText });
    }

    let whatsappTemplateId: string | undefined;
    let whatsappTemplateStatus = 'pending';

    try {
      const whatsappApiUrl = `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${wabaId}/message_templates`;
      const categoryUppercase = (whatsappTemplateCategory || 'utility').toUpperCase();

      const templatePayload = {
        name,
        language: whatsappTemplateLanguage || 'en',
        category: categoryUppercase,
        components,
      };

      logger.info('whatsapp-templates', 'Submitting template to WhatsApp API', {
        name,
        wabaId,
        category: categoryUppercase,
        language: whatsappTemplateLanguage || 'en',
        componentsCount: components.length,
        payload: JSON.stringify(templatePayload, null, 2)
      });

      const response = await axios.post(whatsappApiUrl, templatePayload, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      if (response.data && response.data.id) {
        whatsappTemplateId = response.data.id;
        whatsappTemplateStatus = (response.data.status || 'pending').toLowerCase();

        logger.info('whatsapp-templates', 'Template submitted successfully', {
          templateId: whatsappTemplateId,
          status: whatsappTemplateStatus,
          response: response.data
        });

        try {
          const templateDetailsUrl = `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${whatsappTemplateId}?fields=id,name,status,category,language`;
          const detailsResponse = await axios.get(templateDetailsUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            timeout: 30000,
          });

          if (detailsResponse.data && detailsResponse.data.status) {
            whatsappTemplateStatus = detailsResponse.data.status.toLowerCase();
            logger.info('whatsapp-templates', 'Fetched template status', {
              templateId: whatsappTemplateId,
              status: whatsappTemplateStatus,
              details: detailsResponse.data
            });
          }
        } catch (statusError: any) {
          logger.warn('whatsapp-templates', 'Could not fetch template status, using default', {
            error: statusError.message,
            defaultStatus: whatsappTemplateStatus
          });
        }
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error?.message || error.message;
      const errorDetails = error.response?.data?.error || error.response?.data || {};
      const errorSubcode = error.response?.data?.error?.error_subcode;

      const isNetworkError = error.code === 'ECONNABORTED' ||
                            error.code === 'ECONNRESET' ||
                            error.message?.includes('socket hang up') ||
                            error.message?.includes('timeout');

      logger.error('whatsapp-templates', 'Error submitting template to WhatsApp API', {
        message: errorMessage,
        errorCode: error.response?.data?.error?.code || error.code,
        errorType: error.response?.data?.error?.type,
        errorSubcode: errorSubcode,
        fullError: JSON.stringify(errorDetails, null, 2),
        statusCode: error.response?.status,
        isNetworkError,
        stack: error.stack
      });

      if (errorSubcode === 2388023) {
        return {
          status: 400,
          body: {
            error: 'A template with this name is currently being deleted. Please wait 1-2 minutes before creating a new template with the same name, or use a different name.',
            errorCode: errorSubcode,
            errorType: 'template_deletion_in_progress'
          }
        };
      }

      if (errorSubcode === 2388024) {
        return {
          status: 400,
          body: {
            error: 'A template with this name and language already exists. Please use a different name or delete the existing template first.',
            errorCode: errorSubcode,
            errorType: 'template_already_exists'
          }
        };
      }

      if (errorSubcode === 2494102) {
        return {
          status: 400,
          body: {
            error: 'Failed to upload media. Please try again or use a different image.',
            errorCode: errorSubcode,
            errorType: 'invalid_media_handle'
          }
        };
      }

      if (isNetworkError) {
        logger.warn('whatsapp-templates', 'Network error during template submission, checking if template exists', {
          templateName: name
        });

        try {
          const checkUrl = `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${wabaId}/message_templates?name=${encodeURIComponent(name)}`;
          const checkResponse = await axios.get(checkUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            timeout: 10000,
          });

          if (checkResponse.data?.data && Array.isArray(checkResponse.data.data)) {
            const found = checkResponse.data.data.find((t: any) =>
              t.name === name && t.language === (whatsappTemplateLanguage || 'en')
            );

            if (found) {
              whatsappTemplateId = found.id;
              whatsappTemplateStatus = (found.status || 'pending').toLowerCase();
              logger.info('whatsapp-templates', 'Found existing template after network error', {
                templateId: whatsappTemplateId,
                status: whatsappTemplateStatus
              });
            } else {
              whatsappTemplateStatus = 'pending';
            }
          } else {
            whatsappTemplateStatus = 'pending';
          }
        } catch (checkError: any) {
          logger.warn('whatsapp-templates', 'Could not verify template creation after network error', {
            error: checkError.message
          });
          whatsappTemplateStatus = 'pending';
        }
      } else {
        whatsappTemplateStatus = 'rejected';
      }
    }

    const newTemplate = await db
      .insert(campaignTemplates)
      .values({
        companyId,
        createdById: userId,
        connectionId: connectionId,
        name,
        description: description || null,
        category: 'whatsapp',
        whatsappTemplateCategory: whatsappTemplateCategory || 'utility',
        whatsappTemplateStatus: whatsappTemplateStatus as 'pending' | 'approved' | 'rejected' | 'disabled',
        whatsappTemplateId: whatsappTemplateId || null,
        whatsappTemplateName: name,
        whatsappTemplateLanguage: whatsappTemplateLanguage || 'en',
        content,
        variables: variables || [],
        mediaUrls: headerMediaUrl ? [headerMediaUrl] : [],
        mediaHandle: mediaHandle || null,
        channelType: 'whatsapp',
        whatsappChannelType: 'official',
        isActive: true,
        usageCount: 0,
      })
      .returning();

    return { status: 201, body: newTemplate[0] as unknown as Record<string, unknown> };
  } catch (error) {
    logger.error('whatsapp-templates', 'Error creating template:', error);
    return { status: 500, body: { error: 'Failed to create template' } };
  }
}

/** Update a template's mutable fields (description, isActive). */
export async function updateCompanyTemplate(
  companyId: number,
  templateId: number,
  input: UpdateWhatsAppTemplateInput,
): Promise<WhatsAppTemplateOperationResult> {
  try {
    const { description, isActive } = input;

    const existingTemplate = await db
      .select()
      .from(campaignTemplates)
      .where(
        and(
          eq(campaignTemplates.id, templateId),
          eq(campaignTemplates.companyId, companyId)
        )
      )
      .limit(1);

    if (!existingTemplate || existingTemplate.length === 0) {
      return { status: 404, body: { error: 'Template not found' } };
    }

    const updatedTemplate = await db
      .update(campaignTemplates)
      .set({
        description: description !== undefined ? (description as string | null) : existingTemplate[0].description,
        isActive: isActive !== undefined ? (isActive as boolean) : existingTemplate[0].isActive,
        updatedAt: new Date(),
      })
      .where(eq(campaignTemplates.id, templateId))
      .returning();

    return { status: 200, body: updatedTemplate[0] as unknown as Record<string, unknown> };
  } catch (error) {
    logger.error('whatsapp-templates', 'Error updating template:', error);
    return { status: 500, body: { error: 'Failed to update template' } };
  }
}

/** Delete a company-owned template. */
export async function deleteCompanyTemplate(companyId: number, templateId: number): Promise<WhatsAppTemplateOperationResult> {
  try {
    const existingTemplate = await db
      .select()
      .from(campaignTemplates)
      .where(
        and(
          eq(campaignTemplates.id, templateId),
          eq(campaignTemplates.companyId, companyId)
        )
      )
      .limit(1);

    if (!existingTemplate || existingTemplate.length === 0) {
      return { status: 404, body: { error: 'Template not found' } };
    }

    await db
      .delete(campaignTemplates)
      .where(eq(campaignTemplates.id, templateId));

    return { status: 200, body: { success: true, message: 'Template deleted successfully' } };
  } catch (error) {
    logger.error('whatsapp-templates', 'Error deleting template:', error);
    return { status: 500, body: { error: 'Failed to delete template' } };
  }
}
