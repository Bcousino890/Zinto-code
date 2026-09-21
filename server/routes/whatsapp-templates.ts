import express from 'express';
import { storage } from '../storage';
import { ensureAuthenticated, requirePermission } from '../middleware';
import { PERMISSIONS } from '@shared/schema';
import { db } from '../db';
import { campaignTemplates, channelConnections } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import axios from 'axios';
import { logger } from '../utils/logger';
import { syncSpecificTemplates } from '../services/template-status-sync';
import {
  WHATSAPP_GRAPH_URL,
  WHATSAPP_API_VERSION,
  listCompanyTemplates,
  getCompanyTemplate,
  createCompanyTemplate,
  updateCompanyTemplate,
  deleteCompanyTemplate,
} from '../services/whatsapp-template-management-service';

const router = express.Router();

/**
 * Get all templates for the company
 * Only returns official WhatsApp Business API templates
 */
router.get('/', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_TEMPLATES), async (req, res) => {
  const user = req.user as any;
  if (!user || !user.companyId) {
    return res.status(403).json({ error: 'No company association found' });
  }

  const { status, body } = await listCompanyTemplates(user.companyId);
  res.status(status).json(body);
});

/**
 * Get a single template by ID
 */
router.get('/:id', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_TEMPLATES), async (req, res) => {
  const user = req.user as any;
  const templateId = parseInt(req.params.id);

  if (!user || !user.companyId) {
    return res.status(403).json({ error: 'No company association found' });
  }

  const { status, body } = await getCompanyTemplate(user.companyId, templateId);
  res.status(status).json(body);
});

/**
 * Create a new template and submit to WhatsApp Business API
 */
router.post('/', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_TEMPLATES), async (req, res) => {
  const user = req.user as any;
  if (!user || !user.companyId) {
    return res.status(403).json({ error: 'No company association found' });
  }

  const { status, body } = await createCompanyTemplate(user.companyId, user.id, req.body);
  res.status(status).json(body);
});

/**
 * Update a template (limited fields)
 */
router.patch('/:id', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_TEMPLATES), async (req, res) => {
  const user = req.user as any;
  const templateId = parseInt(req.params.id);

  if (!user || !user.companyId) {
    return res.status(403).json({ error: 'No company association found' });
  }

  const { status, body } = await updateCompanyTemplate(user.companyId, templateId, req.body);
  res.status(status).json(body);
});

/**
 * Delete a template
 */
router.delete('/:id', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_TEMPLATES), async (req, res) => {
  const user = req.user as any;
  const templateId = parseInt(req.params.id);

  if (!user || !user.companyId) {
    return res.status(403).json({ error: 'No company association found' });
  }

  const { status, body } = await deleteCompanyTemplate(user.companyId, templateId);
  res.status(status).json(body);
});


/**
 * Sync template status with WhatsApp API
 * POST /api/whatsapp-templates/:id/sync-status
 */
router.post('/:id/sync-status', ensureAuthenticated, async (req, res) => {
  try {
    const user = (req as any).user;
    const templateId = parseInt(req.params.id);

    if (!user.companyId) {
      return res.status(403).json({ error: 'No company association found' });
    }


    const template = await db
      .select()
      .from(campaignTemplates)
      .where(
        and(
          eq(campaignTemplates.id, templateId),
          eq(campaignTemplates.companyId, user.companyId)
        )
      )
      .limit(1);

    if (!template || template.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }


    await syncSpecificTemplates([templateId]);


    const updatedTemplate = await db
      .select()
      .from(campaignTemplates)
      .where(eq(campaignTemplates.id, templateId))
      .limit(1);

    res.json({
      message: 'Template status synced successfully',
      template: updatedTemplate[0]
    });
  } catch (error) {
    logger.error('whatsapp-templates', 'Error syncing template status:', error);
    res.status(500).json({ error: 'Failed to sync template status' });
  }
});

/**
 * Fetch and sync all templates from WhatsApp API
 * POST /api/whatsapp-templates/sync-from-meta
 */
router.post('/sync-from-meta', ensureAuthenticated, async (req, res) => {
  let whatsappChannel: any[] | null = null;
  let fetchMethod: 'business' | 'waba' | 'unknown' = 'unknown'; // Track which fetch method was used
  
  try {
    const user = (req as any).user;
    const { connectionId } = req.body;

    if (!user.companyId) {
      return res.status(403).json({ error: 'No company association found' });
    }

    if (!connectionId) {
      return res.status(400).json({ error: 'Connection ID is required' });
    }


    whatsappChannel = await db
      .select()
      .from(channelConnections)
      .where(
        and(
          eq(channelConnections.id, connectionId),
          eq(channelConnections.companyId, user.companyId)
        )
      )
      .limit(1);

    if (!whatsappChannel || whatsappChannel.length === 0) {
      return res.status(404).json({ error: 'WhatsApp connection not found' });
    }


    const channelType = whatsappChannel[0].channelType;
    if (channelType !== 'whatsapp' && channelType !== 'whatsapp_official') {
      return res.status(400).json({ error: 'Selected connection is not a WhatsApp connection' });
    }

    const connectionData = whatsappChannel[0].connectionData as any;
    
    // Log complete connection data structure for debugging
    logger.info('whatsapp-templates', 'Connection data structure for template sync', {
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
    const originalAccessToken = connectionData.accessToken || connectionData.access_token;
    let accessToken = originalAccessToken;
    const appId = connectionData.appId || connectionData.app_id;
    const partnerManaged = connectionData.partnerManaged === true;
    const businessId = connectionData.businessId; // Extract business_id for business-level template fetching
    let tokenSource: 'connection' | 'partner-config' = 'connection';
    

    
    // Check if this is an embedded signup (partner-managed) connection
    if (partnerManaged) {
      logger.info('whatsapp-templates', 'Detected embedded signup (partner-managed) connection', {
        connectionId,
        hasConnectionToken: !!accessToken,
        wabaId,
        hasBusinessId: !!businessId
      });
    }
    
    // Add partner config fallback for embedded signup connections
    if (partnerManaged || !accessToken) {
      try {
        const partnerConfig = await storage.getPartnerConfiguration('meta');
        if (partnerConfig?.accessToken) {
          // Check if we're actually using a different token
          if (accessToken !== partnerConfig.accessToken) {
            tokenSource = 'partner-config';
            logger.info('whatsapp-templates', 'Using partner configuration access token', {
              connectionId,
              partnerManaged,
              hadConnectionToken: !!accessToken,
              usingPartnerToken: true,
              tokenSource: 'partner-config'
            });
            accessToken = partnerConfig.accessToken;
          } else {
            logger.info('whatsapp-templates', 'Partner config token matches connection token', {
              connectionId,
              partnerManaged,
              tokenSource: 'connection'
            });
          }
        } else if (!accessToken) {
          logger.warn('whatsapp-templates', 'No access token found in connection or partner config', {
            connectionId,
            partnerManaged,
            hasPartnerConfig: !!partnerConfig
          });
        }
      } catch (partnerConfigError: any) {
        logger.error('whatsapp-templates', 'Error fetching partner configuration', {
          connectionId,
          error: partnerConfigError.message
        });
      }
    }

    if (!wabaId || !accessToken) {
      const errorMessage = partnerManaged 
        ? 'WhatsApp Business Account ID or access token not found. Embedded signup connections may require system-level access token in partner configuration.'
        : 'WhatsApp Business Account ID or access token not found in connection';
      
      logger.error('whatsapp-templates', 'Missing credentials for template sync', {
        connectionId,
        hasWabaId: !!wabaId,
        hasAccessToken: !!accessToken,
        partnerManaged
      });
      
      return res.status(400).json({
        error: errorMessage
      });
    }
    
    // Compute safe token prefix with null/type checking
    const safeTokenPrefix = (typeof accessToken === 'string' && accessToken.length > 0)
      ? accessToken.slice(0, 10) + '...'
      : 'UNKNOWN';
    
    logger.info('whatsapp-templates', 'Fetching templates from Meta API', {
      wabaId,
      connectionId,
      tokenSource,
      tokenPrefix: safeTokenPrefix,
      partnerManaged,
      hasAppId: !!appId
    });

    // Attempt business-level template fetching for embedded signup connections
    let metaTemplates: any[] = [];
    fetchMethod = 'waba'; // Initialize to default, will be updated based on which method succeeds

    if (partnerManaged && businessId) {
      try {
        logger.info('whatsapp-templates', 'Attempting business-level template fetch', {
          businessId,
          wabaId,
          connectionId
        });

        const businessTemplatesUrl = `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${businessId}/message_templates?fields=id,name,status,category,language,components&limit=250`;
        
        const businessResponse = await axios.get(businessTemplatesUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
          timeout: 30000,
        });

        if (businessResponse.data?.data && businessResponse.data.data.length > 0) {
          metaTemplates = businessResponse.data.data;
          fetchMethod = 'business';
          logger.info('whatsapp-templates', 'Successfully fetched templates from business', {
            count: metaTemplates.length,
            businessId,
            fetchUrl: businessTemplatesUrl.replace(accessToken, 'REDACTED'),
            connectionType: 'embedded-signup',
            firstTemplate: metaTemplates.length > 0 ? {
              id: metaTemplates[0].id,
              name: metaTemplates[0].name,
              status: metaTemplates[0].status
            } : null
          });
        } else {
          // Empty response, fall back to WABA
          throw new Error('Business endpoint returned no templates');
        }
      } catch (businessFetchError: any) {
        logger.warn('whatsapp-templates', 'Business-level fetch failed, falling back to WABA', {
          businessId,
          wabaId,
          error: businessFetchError.message,
          statusCode: businessFetchError.response?.status,
          errorDetails: businessFetchError.response?.data
        });
        // Fall through to WABA fetch below
      }
    }

    // Fallback to WABA-level fetch if business fetch didn't succeed
    if (metaTemplates.length === 0) {
      // Log complete API request details before making the call
      const templatesUrl = `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${wabaId}/message_templates?fields=id,name,status,category,language,components&limit=250`;
      logger.info('whatsapp-templates', 'Meta API request details (WABA-level)', {
        url: templatesUrl.replace(accessToken, 'REDACTED'),
        wabaId,
        apiVersion: WHATSAPP_API_VERSION,
        tokenSource,
        partnerManaged,
        wasBusinessFetchAttempted: partnerManaged && !!businessId,
        reason: partnerManaged && !businessId 
          ? 'No businessId in connectionData' 
          : partnerManaged && businessId 
            ? 'Business fetch failed or returned no templates' 
            : 'Not a partner-managed connection',
        businessIdAvailable: !!businessId
      });

      let response;
      try {
        response = await axios.get(templatesUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
          timeout: 30000,
        });

        metaTemplates = response.data?.data || [];
        fetchMethod = 'waba';

        // Log response details after successful API call
        logger.info('whatsapp-templates', 'Fetched templates from Meta (WABA-level)', {
          count: metaTemplates.length,
          responseStatus: response.status,
          hasData: !!response.data?.data,
          firstTemplate: metaTemplates.length > 0 ? {
            id: metaTemplates[0].id,
            name: metaTemplates[0].name,
            status: metaTemplates[0].status,
            category: metaTemplates[0].category
          } : null
        });
      } catch (apiError: any) {
        // Enhanced error logging with detailed information
        const errorStatus = apiError.response?.status;
        const errorData = apiError.response?.data;
        const errorMessage = errorData?.error?.message || apiError.message;
        const errorCode = errorData?.error?.code;
        const errorType = errorData?.error?.type;
        const errorSubcode = errorData?.error?.error_subcode;
      
        // Handle code 100 error indicating message_templates on Business node type
        // This means the wabaId is actually a Business Manager ID, need to resolve actual WABA ID
        const isBusinessNodeError = errorCode === 100 && errorMessage && 
            errorMessage.includes('message_templates') && 
            (errorMessage.toLowerCase().includes('business') || 
             errorMessage.toLowerCase().includes('node type'));
        
        if (isBusinessNodeError) {
          logger.info('whatsapp-templates', 'Detected code 100 error - treating wabaId as Business Manager ID', {
            connectionId,
            currentWabaId: wabaId,
            errorMessage,
            errorCode
          });

          try {
            // Treat current wabaId as Business Manager ID
            const businessManagerId = wabaId;
            let resolvedWabaId: string | null = null;

            // Try to resolve WABA ID from owned_whatsapp_business_accounts
            try {
              const ownedWabaUrl = `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${businessManagerId}/owned_whatsapp_business_accounts?access_token=${accessToken}`;
              logger.info('whatsapp-templates', 'Attempting to resolve WABA from owned accounts', {
                businessManagerId,
                url: ownedWabaUrl.replace(accessToken, 'REDACTED')
              });

              const ownedResponse = await axios.get(ownedWabaUrl, {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                },
                timeout: 30000,
              });

              if (ownedResponse.data?.data && Array.isArray(ownedResponse.data.data) && ownedResponse.data.data.length > 0) {
                resolvedWabaId = ownedResponse.data.data[0].id;
                logger.info('whatsapp-templates', 'Resolved WABA ID from owned accounts', {
                  businessManagerId,
                  resolvedWabaId
                });
              }
            } catch (ownedError: any) {
              logger.warn('whatsapp-templates', 'Failed to fetch owned WABA accounts', {
                businessManagerId,
                error: ownedError.message,
                statusCode: ownedError.response?.status
              });
            }

            // If not found in owned accounts, try client_whatsapp_business_accounts (for partner-managed cases)
            if (!resolvedWabaId) {
              try {
                const clientWabaUrl = `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${businessManagerId}/client_whatsapp_business_accounts?access_token=${accessToken}`;
                logger.info('whatsapp-templates', 'Attempting to resolve WABA from client accounts', {
                  businessManagerId,
                  url: clientWabaUrl.replace(accessToken, 'REDACTED')
                });

                const clientResponse = await axios.get(clientWabaUrl, {
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                  },
                  timeout: 30000,
                });

                if (clientResponse.data?.data && Array.isArray(clientResponse.data.data) && clientResponse.data.data.length > 0) {
                  resolvedWabaId = clientResponse.data.data[0].id;
                  logger.info('whatsapp-templates', 'Resolved WABA ID from client accounts', {
                    businessManagerId,
                    resolvedWabaId
                  });
                }
              } catch (clientError: any) {
                logger.warn('whatsapp-templates', 'Failed to fetch client WABA accounts', {
                  businessManagerId,
                  error: clientError.message,
                  statusCode: clientError.response?.status
                });
              }
            }

            // If WABA ID was resolved, update connection data and retry
            if (resolvedWabaId) {
              logger.info('whatsapp-templates', 'Updating connection data with resolved WABA ID', {
                connectionId,
                oldWabaId: wabaId,
                newWabaId: resolvedWabaId,
                businessManagerId
              });

              // Update connection data to persist the resolved WABA ID
              const updatedConnectionData = {
                ...connectionData,
                wabaId: resolvedWabaId,
                businessAccountId: resolvedWabaId,
                waba_id: resolvedWabaId,
                businessId: businessManagerId // Also store the Business Manager ID for future reference
              };

              await storage.updateChannelConnection(connectionId, {
                connectionData: updatedConnectionData
              });

              // Retry template fetch with resolved WABA ID
              logger.info('whatsapp-templates', 'Retrying template fetch with resolved WABA ID', {
                connectionId,
                resolvedWabaId
              });

              const retryTemplatesUrl = `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${resolvedWabaId}/message_templates?fields=id,name,status,category,language,components&limit=250`;
              const retryResponse = await axios.get(retryTemplatesUrl, {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                },
                timeout: 30000,
              });

              metaTemplates = retryResponse.data?.data || [];
              fetchMethod = 'waba';
              
              // Update wabaId variable for consistency in subsequent code
              wabaId = resolvedWabaId;
              
              logger.info('whatsapp-templates', 'Successfully fetched templates after WABA ID resolution', {
                count: metaTemplates.length,
                originalBusinessManagerId: businessManagerId,
                resolvedWabaId
              });

              // Continue with template processing below (skip the error return)
            } else {
              // No WABA ID could be resolved
              logger.error('whatsapp-templates', 'Could not resolve WABA ID from Business Manager', {
                connectionId,
                businessManagerId: wabaId,
                errorMessage
              });

              return res.status(400).json({
                error: 'Unable to resolve WhatsApp Business Account ID. The provided ID appears to be a Business Manager ID. Please reconnect your WhatsApp account to ensure the correct WABA ID is stored.',
                details: errorMessage,
                errorCode,
                errorType,
                errorSubcode,
                partnerManaged,
                fetchMethod: 'waba',
                suggestion: 'Please disconnect and reconnect your WhatsApp account to update the connection with the correct WABA ID.'
              });
            }
          } catch (resolutionError: any) {
            logger.error('whatsapp-templates', 'Error during WABA ID resolution fallback', {
              connectionId,
              businessManagerId: wabaId,
              error: resolutionError.message,
              stack: resolutionError.stack
            });

            return res.status(500).json({
              error: 'Failed to resolve WhatsApp Business Account ID. Please reconnect your WhatsApp account.',
              details: resolutionError.message,
              errorCode,
              errorType,
              errorSubcode,
              partnerManaged,
              fetchMethod: 'waba'
            });
          }
        } else {
          // Original error handling for non-code-100 errors
          logger.error('whatsapp-templates', 'Meta API error during template fetch (WABA-level)', {
            connectionId,
            wabaId,
            statusCode: errorStatus,
            errorMessage,
            errorCode,
            errorType,
            errorSubcode,
            fullErrorResponse: JSON.stringify(errorData, null, 2),
            partnerManaged,
            tokenSource,
            wasBusinessFetchAttempted: partnerManaged && !!businessId,
            suggestions: {
              invalidToken: errorStatus === 401 ? 'Access token may be invalid or expired' : null,
              insufficientPermissions: errorStatus === 403 ? 'Access token may lack whatsapp_business_management permission scope' : null,
              wabaNotFound: errorStatus === 404 ? 'WABA ID may be incorrect or account not found' : null,
              partnerManagedIssue: partnerManaged && (errorStatus === 401 || errorStatus === 403) 
                ? 'Embedded signup connections may require system-level access token. Please verify partner configuration has valid token with template management permissions.'
                : null
            }
          });
        
          // Provide specific error messages based on status code
          let userFriendlyError = 'Failed to sync templates from Meta';
          if (errorStatus === 401) {
            userFriendlyError = partnerManaged
              ? 'Authentication failed. Embedded signup connections may require system-level access token. Please verify partner configuration.'
              : 'Authentication failed. Access token may be invalid or expired.';
          } else if (errorStatus === 403) {
            userFriendlyError = partnerManaged
              ? 'Permission denied. Embedded signup connections may require system-level access token with whatsapp_business_management permission scope. Please verify partner configuration.'
              : 'Permission denied. Access token may lack required permissions for template management.';
          } else if (errorStatus === 404) {
            userFriendlyError = 'WhatsApp Business Account not found. Please verify the connection configuration.';
          } else if (errorMessage) {
            userFriendlyError = `Failed to sync templates: ${errorMessage}`;
          }
          
          return res.status(errorStatus || 500).json({
            error: userFriendlyError,
            details: errorMessage,
            errorCode,
            errorType,
            errorSubcode,
            partnerManaged,
            fetchMethod: 'waba'
          });
        }
      }
    }

    // Log final fetch method used
    logger.info('whatsapp-templates', 'Template fetch completed', {
      method: fetchMethod,
      count: metaTemplates.length,
      connectionId,
      businessId: fetchMethod === 'business' ? businessId : undefined,
      wabaId: fetchMethod === 'waba' ? wabaId : undefined,
      recommendation: fetchMethod === 'waba' && partnerManaged && !businessId 
        ? 'Connection missing businessId - may show incomplete templates. Reconnect to fix.' 
        : null
    });

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const metaTemplate of metaTemplates) {
      try {

        const existingTemplate = await db
          .select()
          .from(campaignTemplates)
          .where(
            and(
              eq(campaignTemplates.whatsappTemplateId, metaTemplate.id),
              eq(campaignTemplates.companyId, user.companyId)
            )
          )
          .limit(1);

        const status = (metaTemplate.status || 'pending').toLowerCase();

        if (existingTemplate && existingTemplate.length > 0) {

          let mediaHandle: string | undefined;
          const mediaUrls: string[] = [];
          let headerFormat: string | undefined;

          if (metaTemplate.components && Array.isArray(metaTemplate.components)) {
            for (const component of metaTemplate.components) {
              if (component.type === 'HEADER') {
                headerFormat = component.format;
                

                if (headerFormat && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat)) {

                  if (component.example?.header_handle && Array.isArray(component.example.header_handle)) {
                    const handleValue = component.example.header_handle[0];


                    if (handleValue && !handleValue.startsWith('http://') && !handleValue.startsWith('https://')) {
                      mediaHandle = handleValue;
                    } else if (handleValue) {

                      mediaUrls.push(handleValue);
                    }
                  }
                  

                  if (component.example?.header_url && Array.isArray(component.example.header_url)) {
                    const url = component.example.header_url[0];
                    if (url) {
                      mediaUrls.push(url);
                    }
                  }
                  

                  if (component.url) {
                    mediaUrls.push(component.url);
                  }
                }
              }
            }
          }

          await db
            .update(campaignTemplates)
            .set({
              whatsappTemplateStatus: status as 'pending' | 'approved' | 'rejected' | 'disabled',
              whatsappTemplateCategory: metaTemplate.category?.toLowerCase() || 'utility',
              mediaUrls: mediaUrls.length > 0 ? mediaUrls : existingTemplate[0].mediaUrls,
              mediaHandle: mediaHandle || existingTemplate[0].mediaHandle,
            })
            .where(eq(campaignTemplates.id, existingTemplate[0].id));

          updatedCount++;
          logger.info('whatsapp-templates', 'Updated existing template', {
            templateId: metaTemplate.id,
            name: metaTemplate.name,
            status,
            hasMediaHandle: !!mediaHandle,
            hasMediaUrls: mediaUrls.length > 0,
            headerFormat
          });
        } else {


          let content = '';
          let headerText = '';
          let mediaHandle: string | undefined;
          const mediaUrls: string[] = [];
          let headerFormat: string | undefined;

          if (metaTemplate.components && Array.isArray(metaTemplate.components)) {
            for (const component of metaTemplate.components) {
              if (component.type === 'HEADER') {
                headerText = component.text || '';
                headerFormat = component.format;
                

                if (headerFormat && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat)) {

                  if (component.example?.header_handle && Array.isArray(component.example.header_handle)) {
                    const handleValue = component.example.header_handle[0];


                    if (handleValue && !handleValue.startsWith('http://') && !handleValue.startsWith('https://')) {
                      mediaHandle = handleValue;
                      logger.info('whatsapp-templates', 'Found media handle (ID) in template', {
                        templateId: metaTemplate.id,
                        templateName: metaTemplate.name,
                        mediaHandle,
                        format: headerFormat
                      });
                    } else if (handleValue) {

                      mediaUrls.push(handleValue);
                      logger.info('whatsapp-templates', 'Found media URL in header_handle', {
                        templateId: metaTemplate.id,
                        templateName: metaTemplate.name,
                        url: handleValue,
                        format: headerFormat
                      });
                    }
                  }
                  

                  if (component.example?.header_url && Array.isArray(component.example.header_url)) {
                    const url = component.example.header_url[0];
                    if (url) {
                      mediaUrls.push(url);
                      logger.info('whatsapp-templates', 'Found media URL in template', {
                        templateId: metaTemplate.id,
                        templateName: metaTemplate.name,
                        url,
                        format: headerFormat
                      });
                    }
                  }
                  

                  if (component.url) {
                    mediaUrls.push(component.url);
                    logger.info('whatsapp-templates', 'Found media URL directly in component', {
                      templateId: metaTemplate.id,
                      templateName: metaTemplate.name,
                      url: component.url,
                      format: headerFormat
                    });
                  }
                }
                
                if (headerText) {
                  content += headerText + '\n\n';
                }
              } else if (component.type === 'BODY') {
                content += component.text || '';
              } else if (component.type === 'FOOTER') {
                content += '\n\n' + (component.text || '');
              }
            }
          }

          await db
            .insert(campaignTemplates)
            .values({
              companyId: user.companyId,
              createdById: user.id,
              connectionId: connectionId,
              name: metaTemplate.name,
              description: `Synced from Meta - ${metaTemplate.category || 'Template'}`,
              category: 'whatsapp',
              whatsappTemplateCategory: metaTemplate.category?.toLowerCase() || 'utility',
              whatsappTemplateStatus: status as 'pending' | 'approved' | 'rejected' | 'disabled',
              whatsappTemplateId: metaTemplate.id,
              whatsappTemplateName: metaTemplate.name,
              whatsappTemplateLanguage: metaTemplate.language || 'en',
              content: content || 'Template content',
              variables: [],
              mediaUrls: mediaUrls,
              mediaHandle: mediaHandle,
              channelType: 'whatsapp',
              whatsappChannelType: 'official',
              isActive: true,
              usageCount: 0,
            });

          createdCount++;
          logger.info('whatsapp-templates', 'Created new template from Meta', {
            templateId: metaTemplate.id,
            name: metaTemplate.name,
            status,
            hasMediaHandle: !!mediaHandle,
            hasMediaUrls: mediaUrls.length > 0,
            headerFormat
          });
        }
      } catch (error: any) {
        logger.error('whatsapp-templates', 'Error syncing individual template', {
          templateId: metaTemplate.id,
          name: metaTemplate.name,
          error: error.message
        });
        skippedCount++;
      }
    }

    res.json({
      message: 'Templates synced successfully',
      summary: {
        total: metaTemplates.length,
        created: createdCount,
        updated: updatedCount,
        skipped: skippedCount
      },
      connectionType: {
        partnerManaged: partnerManaged || false
      },
      fetchMethod: fetchMethod // Include fetch method for frontend display
    });
  } catch (error: any) {
    // Enhanced error logging with full context
    // Note: whatsappChannel may be null if error occurred before it was fetched
    let connectionData: any = null;
    let partnerManaged = false;
    try {
      if (whatsappChannel && whatsappChannel.length > 0) {
        connectionData = whatsappChannel[0].connectionData as any;
        partnerManaged = connectionData?.partnerManaged === true;
      }
    } catch {
      // Ignore errors accessing whatsappChannel
    }
    
    logger.error('whatsapp-templates', 'Error syncing templates from Meta', {
      connectionId: req.body?.connectionId,
      error: error.message,
      stack: error.stack,
      response: error.response?.data,
      status: error.response?.status,
      partnerManaged,
      hasConnectionData: !!connectionData
    });
    
    // Provide more detailed error message
    let errorMessage = 'Failed to sync templates from Meta';
    if (error.response?.status === 401 || error.response?.status === 403) {
      errorMessage = partnerManaged
        ? 'Authentication or permission error. Embedded signup connections may require system-level access token. Please verify partner configuration.'
        : 'Authentication or permission error. Please verify the connection has valid credentials with template management permissions.';
    } else if (error.message) {
      errorMessage = `Failed to sync templates: ${error.message}`;
    }
    
    res.status(error.response?.status || 500).json({
      error: errorMessage,
      details: error.message,
      errorCode: error.response?.data?.error?.code,
      errorType: error.response?.data?.error?.type,
      partnerManaged,
      fetchMethod // Include fetch method for frontend error handling
    });
  }
});

export default router;

