import { storage } from '../../storage';
import {
  InsertMessage,
  InsertConversation,
  InsertContact,
  ChannelConnection,
  MetaWhatsappClient,
  MetaWhatsappPhoneNumber,
  metaWhatsappClients
} from '@shared/schema';
import { EventEmitter } from 'events';
import { setMaxListenersSafely } from '../../utils/event-emitter-monitor';
import axios from 'axios';
import path from 'path';
import fsExtra from 'fs-extra';
import crypto from 'crypto';
import { getDb } from '../../db';
import { eq } from 'drizzle-orm';

const activeConnections = new Map<number, boolean>();
const eventEmitter = new EventEmitter();
setMaxListenersSafely(eventEmitter, 0, 'whatsapp-meta-partner');

const WHATSAPP_API_VERSION = 'v25.0';
const WHATSAPP_GRAPH_URL = 'https://graph.facebook.com';

const MEDIA_DIR = path.join(process.cwd(), 'public', 'media');
fsExtra.ensureDirSync(MEDIA_DIR);

const mediaCache = new Map<string, string>();

/**
 * Meta WhatsApp Business API Partner Service
 * Implements Partner API architecture for Meta WhatsApp Business API
 */
class WhatsAppMetaPartnerService {
  
  /**
   * Get connection status
   */
  getConnectionStatus(connectionId: number): boolean {
    return activeConnections.get(connectionId) === true;
  }

  /**
   * Connect to Meta WhatsApp Business API using Partner credentials
   */
  async connect(connectionId: number): Promise<boolean> {
    try {
      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        throw new Error('Connection not found');
      }

      const partnerConfig = await storage.getPartnerConfiguration('meta');
      if (!partnerConfig) {
        throw new Error('Meta Partner API not configured');
      }

      const connectionData = connection.connectionData as any;
      const { phoneNumberId, accessToken } = connectionData || {};
      if (!phoneNumberId || !accessToken) {
        throw new Error('Invalid connection data');
      }

      const response = await axios.get(
        `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${phoneNumberId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (response.status === 200) {
        activeConnections.set(connectionId, true);
        
        return true;
      }

      return false;
    } catch (error) {
      console.error(`Error connecting Meta WhatsApp ${connectionId}:`, error);
      activeConnections.set(connectionId, false);
      return false;
    }
  }

  /**
   * Process Meta WhatsApp embedded signup callback
   */
  async processEmbeddedSignupCallback(
    companyId: number,
    signupData: any,
    connectionName?: string,
    signupMode?: string,
    enableHistorySync?: boolean,
    customerToken?: string
  ): Promise<any> {
    try {
      const isCoexistenceMode = signupMode === 'coexistence' || signupData.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING';

      // Sanitize signup data for logging to avoid leaking tokens or secrets
      const sanitizeForLogging = (value: any): any => {
        if (value === null || value === undefined) return value;
        if (typeof value !== 'object') return value;
        if (Array.isArray(value)) {
          return value.map(item => sanitizeForLogging(item));
        }
        const result: any = {};
        for (const [key, v] of Object.entries(value)) {
          const lowerKey = key.toLowerCase();
          if (lowerKey.includes('token') || lowerKey.includes('secret')) {
            if (typeof v === 'string' && v.length > 8) {
              result[key] = `${v.substring(0, 4)}...redacted`;
            } else {
              result[key] = '***redacted***';
            }
          } else {
            result[key] = sanitizeForLogging(v);
          }
        }
        return result;
      };

      const sanitizedSignupData = sanitizeForLogging(signupData);

      console.log('🔍 [META PARTNER SERVICE] processEmbeddedSignupCallback called:', {
        companyId,
        connectionName,
        signupMode: signupMode || 'standard',
        isCoexistenceMode,
        signupDataKeys: Object.keys(signupData),
        business_account_id: signupData.business_account_id,
        phone_numbers_count: signupData.phone_numbers?.length || 0,
        event: signupData.event
      });

      // 🔍 DEBUG: Log raw signupData structure (sanitized), especially nested data if present
      console.log('🔍 [META PARTNER SERVICE] Raw signupData structure:', {
        hasData: !!signupData.data,
        dataKeys: signupData.data ? Object.keys(signupData.data) : [],
        nestedData: sanitizeForLogging(signupData.data),
        phone_number_id_in_data: signupData.data?.phone_number_id,
        phone_number_id_top_level: signupData.phoneNumberId || signupData.phone_number_id,
        fullSignupData: JSON.stringify(sanitizedSignupData, null, 2)
      });

      const { 
        business_account_id,
        business_account_name,
        phone_numbers = []
      } = signupData;
      
      // 🔍 DEBUG: Extract phone_number_id from nested data for coexistence mode
      const phoneNumberIdFromNested = signupData.data?.phone_number_id || signupData.phoneNumberId || signupData.phone_number_id;
      console.log('🔍 [META PARTNER SERVICE] Extracted phone_number_id:', {
        fromNestedData: signupData.data?.phone_number_id,
        fromTopLevel: signupData.phoneNumberId || signupData.phone_number_id,
        finalPhoneNumberId: phoneNumberIdFromNested
      });

      // Extract business_id from signup data (available in nested data for coexistence mode)
      // Try all possible sources to ensure we capture it
      const businessIdFromNested = signupData.data?.business_id;
      const businessIdFromTopLevel = signupData.business_id;
      const businessIdFromCamelCase = signupData.businessId;
      const businessId = businessIdFromNested || businessIdFromTopLevel || businessIdFromCamelCase;

      console.log('🔍 [META PARTNER SERVICE] Extracted business_id for business-level templates:', {
        extractionSources: {
          nestedData: businessIdFromNested || 'not found',
          topLevelSnakeCase: businessIdFromTopLevel || 'not found',
          topLevelCamelCase: businessIdFromCamelCase || 'not found'
        },
        finalBusinessId: businessId || 'MISSING',
        hasBusinessId: !!businessId,
        willEnableBusinessLevelTemplates: !!businessId,
        isCoexistenceMode,
        impact: businessId 
          ? 'Business-level template fetching enabled (all business templates)' 
          : 'Only WABA-level templates will be available (phone number specific)'
      });

      // Validation: warn if businessId is missing in coexistence mode
      if (isCoexistenceMode && !businessId) {
        console.warn('⚠️ [META PARTNER SERVICE] businessId missing in coexistence mode signup:', {
          signupDataKeys: Object.keys(signupData),
          hasNestedData: !!signupData.data,
          nestedDataKeys: signupData.data ? Object.keys(signupData.data) : [],
          recommendation: 'Verify frontend normalization includes businessId from data.business_id',
          consequence: 'Template sync will only fetch WABA-level templates, not full business portfolio'
        });
      }

      if (!business_account_id) {
        console.error('❌ [META PARTNER SERVICE] Business Account ID is missing');
        throw new Error('Business Account ID is required');
      }

      
      let client = await storage.getMetaWhatsappClientByBusinessAccountId(business_account_id);
      
      if (!client) {
        
        client = await storage.createMetaWhatsappClient({
          companyId,
          businessAccountId: business_account_id,
          businessAccountName: business_account_name || 'WhatsApp Business Account',
          status: 'active',
          onboardedAt: new Date()
        });
        
      } else {
        
        client = await storage.updateMetaWhatsappClient(client.id, {
          businessAccountName: business_account_name || client.businessAccountName,
          status: 'active'
        });
        
      }

      console.log('🔍 [META PARTNER SERVICE] Processing phone numbers:', {
        count: phone_numbers.length,
        isCoexistenceMode,
        phone_numbers: phone_numbers.map((p: any) => ({
          phone_number_id: p.phone_number_id,
          phone_number: p.phone_number,
          display_name: p.display_name
        }))
      });

      const createdPhoneNumbers = [];
      const createdConnections = [];
      
      // For coexistence mode, phone number registration is skipped as the number is already registered
      // We still process phone_numbers if provided, but it's optional
      if (isCoexistenceMode && phone_numbers.length === 0) {
        console.log('ℹ️ [META PARTNER SERVICE] Coexistence mode: Attempting to fetch phone numbers for WABA');
        
        // Always attempt to fetch ALL phone numbers for the WABA in coexistence mode
        // regardless of whether phone_number_id is provided
        try {
          const partnerConfig = await storage.getPartnerConfiguration('meta');
          if (!partnerConfig) {
            console.warn('⚠️ [META PARTNER SERVICE] Partner configuration not found, cannot fetch phone numbers');
          } else {
            const accessToken = customerToken || partnerConfig.accessToken;
            if (!accessToken) {
              console.warn('⚠️ [META PARTNER SERVICE] Access token not found in partner configuration');
            } else {
              // 🔍 DEBUG: Log before fetch
              console.log('🔍 [META PARTNER SERVICE] Fetching all phone numbers for WABA:', {
                wabaId: business_account_id,
                hasAccessToken: !!accessToken,
                apiEndpoint: `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${business_account_id}/phone_numbers`
              });
              
              // Fetch all phone numbers for the WABA
              const fetchedPhoneNumbers = await this.fetchAllPhoneNumbersForWaba(
                business_account_id,
                accessToken
              );
              
              if (fetchedPhoneNumbers && fetchedPhoneNumbers.length > 0) {
                // Iterate through fetched phone numbers and add to phone_numbers array
                // quality_rating is already normalized to lowercase by fetchAllPhoneNumbersForWaba
                for (const fetchedPhone of fetchedPhoneNumbers) {
                  phone_numbers.push({
                    phone_number_id: fetchedPhone.id,
                    phone_number: fetchedPhone.display_phone_number || fetchedPhone.id,
                    display_name: fetchedPhone.verified_name || fetchedPhone.display_phone_number || fetchedPhone.id,
                    quality_rating: fetchedPhone.quality_rating || 'unknown'
                  });
                }
                
                console.log('✅ [META PARTNER SERVICE] Successfully fetched phone numbers for WABA:', {
                  count: fetchedPhoneNumbers.length,
                  phoneNumberIds: fetchedPhoneNumbers.map(p => p.id),
                  phoneNumbers: fetchedPhoneNumbers.map(p => ({
                    id: p.id,
                    display_phone_number: p.display_phone_number,
                    verified_name: p.verified_name
                  }))
                });
              } else {
                console.warn('⚠️ [META PARTNER SERVICE] Could not fetch phone numbers for WABA:', {
                  wabaId: business_account_id,
                  reason: 'Fetch returned empty or null',
                  message: 'No connections will be created.'
                });
              }
            }
          }
        } catch (error: any) {
          console.error('❌ [META PARTNER SERVICE] Error fetching phone numbers for WABA:', {
            wabaId: business_account_id,
            error: error.message,
            statusCode: error.response?.status,
            errorDetails: error.response?.data,
            stack: error.stack
          });
        }
      }
      
      // 🔍 DEBUG: Log phone numbers array before processing
      console.log('🔍 [META PARTNER SERVICE] Phone numbers array before processing:', {
        count: phone_numbers.length,
        wasProvided: phone_numbers.length > 0 && !isCoexistenceMode,
        wasFetched: isCoexistenceMode && phone_numbers.length > 0,
        fetchMethod: isCoexistenceMode && phone_numbers.length > 0 ? 'waba_list' : 'provided',
        fetchedPhoneNumberIds: phone_numbers.map((p: any) => p.phone_number_id),
        phone_numbers: phone_numbers.map((p: any) => ({
          phone_number_id: p.phone_number_id,
          phone_number: p.phone_number,
          display_name: p.display_name
        }))
      });
      
      for (const phoneData of phone_numbers) {
        const {
          phone_number_id,
          phone_number,
          display_name,
          quality_rating,
          messaging_limit,
          access_token
        } = phoneData;

        

        if (!phone_number_id) {
          // 🔍 DEBUG: Enhanced logging when skipping phone number
          console.warn('⚠️ [META PARTNER SERVICE] Skipping phone number - missing phone_number_id:', {
            has_phone_number_id: !!phone_number_id,
            has_phone_number: !!phone_number,
            phoneData: phoneData,
            reason: 'missing phone_number_id'
          });
          continue;
        }



        // For coexistence mode, allow connection creation even if only phone_number_id is available
        const finalPhoneNumber = phone_number || phone_number_id;
        
        if (!finalPhoneNumber) {
          // 🔍 DEBUG: Enhanced logging when skipping phone number
          console.warn('⚠️ [META PARTNER SERVICE] Skipping phone number - no phone number available:', {
            phone_number_id,
            phone_number,
            isCoexistenceMode,
            reason: 'missing both phone_number and phone_number_id'
          });
          continue;
        }

        let phoneNumberRecord = await storage.getMetaWhatsappPhoneNumberByPhoneNumberId(phone_number_id);
        
        if (!phoneNumberRecord) {
          
          // Normalize quality_rating to lowercase, default to 'unknown' for new phone numbers
          const normalizedQualityRating = quality_rating?.toLowerCase() || 'unknown';
          
          if (quality_rating && quality_rating !== normalizedQualityRating) {
            console.log('🔍 [META PARTNER SERVICE] Normalized quality_rating from uppercase to lowercase:', {
              phoneNumberId: phone_number_id,
              original: quality_rating,
              normalized: normalizedQualityRating
            });
          } else if (!quality_rating) {
            console.log('🔍 [META PARTNER SERVICE] Applying default quality_rating: unknown (new phone number)');
          }
          
          phoneNumberRecord = await storage.createMetaWhatsappPhoneNumber({
            clientId: client.id,
            phoneNumberId: phone_number_id,
            phoneNumber: finalPhoneNumber,
            displayName: display_name || finalPhoneNumber,
            status: 'verified',
            qualityRating: normalizedQualityRating,
            messagingLimit: messaging_limit || 1000,
            accessToken: access_token
          });
          
        } else {
          
          // Normalize quality_rating to lowercase if provided
          const normalizedQualityRating = quality_rating 
            ? quality_rating.toLowerCase() 
            : phoneNumberRecord.qualityRating;
          
          if (quality_rating && quality_rating !== normalizedQualityRating) {
            console.log('🔍 [META PARTNER SERVICE] Normalized quality_rating from uppercase to lowercase:', {
              phoneNumberId: phone_number_id,
              original: quality_rating,
              normalized: normalizedQualityRating
            });
          }
          
          phoneNumberRecord = await storage.updateMetaWhatsappPhoneNumber(phoneNumberRecord.id, {
            displayName: display_name || phoneNumberRecord.displayName,
            status: 'verified',
            qualityRating: normalizedQualityRating,
            messagingLimit: messaging_limit || phoneNumberRecord.messagingLimit,
            accessToken: access_token || phoneNumberRecord.accessToken
          });
          
        }

        createdPhoneNumbers.push(phoneNumberRecord);

        console.log('🔍 [META PARTNER SERVICE] Passing businessId to createChannelConnection:', {
          phoneNumberId: phoneNumberRecord.phoneNumberId,
          businessId: businessId || 'null (will not enable business-level templates)',
          hasBusinessId: !!businessId
        });

        // Idempotent: avoid duplicate connections for the same phone number (e.g. double signup callback or duplicate API call)
        const existingForCompany = await storage.getChannelConnections(null, companyId);
        const existingForThisPhone = existingForCompany.filter((conn: ChannelConnection) => {
          if (conn.channelType !== 'whatsapp_official') return false;
          const data = conn.connectionData as any;
          return data?.phoneNumberId === phoneNumberRecord.phoneNumberId;
        });
        let connection: ChannelConnection;
        if (existingForThisPhone.length > 0) {
          connection = existingForThisPhone[0];
          console.log('🔍 [META PARTNER SERVICE] Reusing existing channel connection for phone number:', { connectionId: connection.id, phoneNumberId: phoneNumberRecord.phoneNumberId });
        } else {
          connection = await this.createChannelConnection(companyId, phoneNumberRecord, connectionName, businessId, enableHistorySync, customerToken);
        }
        createdConnections.push(connection);
        
        // 🔍 DEBUG: Log created connection details
        console.log('🔍 [META PARTNER SERVICE] Connection created:', {
          connectionId: connection.id,
          accountName: connection.accountName,
          channelType: connection.channelType,
          status: connection.status,
          connectionDataKeys: connection.connectionData ? Object.keys(connection.connectionData as any) : []
        });
        
      }

      // 🔍 DEBUG: Summary logging
      console.log('✅ [META PARTNER SERVICE] processEmbeddedSignupCallback completed successfully:', {
        clientId: client.id,
        phoneNumbersCount: createdPhoneNumbers.length,
        connectionsCount: createdConnections.length,
        connectionsCreatedWithBusinessId: createdConnections.filter(c => (c.connectionData as any)?.businessId).length,
        totalConnections: createdConnections.length,
        businessIdPropagated: !!businessId,
        businessIdValue: businessId || 'not extracted',
        connections: createdConnections.map(c => ({
          id: c.id,
          accountName: c.accountName,
          channelType: c.channelType,
          status: c.status,
          hasBusinessId: !!(c.connectionData as any)?.businessId
        })),
        connectionIds: createdConnections.map(c => c.id),
        isCoexistenceMode,
        summary: {
          totalPhoneNumbersProcessed: createdPhoneNumbers.length,
          totalConnectionsCreated: createdConnections.length,
          connectionIds: createdConnections.map(c => c.id),
          wasCoexistenceMode: isCoexistenceMode
        }
      });

      return {
        client,
        phoneNumbers: createdPhoneNumbers,
        connections: createdConnections,
        message: 'Meta WhatsApp Business account onboarded successfully'
      };

    } catch (error) {
      console.error('Error processing Meta WhatsApp embedded signup callback:', error);
      throw error;
    }
  }

  /**
   * Create channel connection for a Meta WhatsApp phone number
   */
  async createChannelConnection(
    companyId: number,
    phoneNumber: MetaWhatsappPhoneNumber,
    connectionName?: string,
    businessId?: string,
    enableHistorySync?: boolean,
    customerToken?: string
  ): Promise<ChannelConnection> {
    try {
      


      const dbInstance = getDb();
      const [client] = await dbInstance
        .select()
        .from(metaWhatsappClients)
        .where(eq(metaWhatsappClients.id, phoneNumber.clientId))
        .limit(1);
      
      if (!client) {
        throw new Error('Meta WhatsApp client not found for phone number');
      }
      
      


      const partnerConfig = await storage.getPartnerConfiguration('meta');
      if (!partnerConfig) {
        console.warn('⚠️ [META PARTNER SERVICE] Partner configuration not found, connection will use phone number access token');
      }

      const users = await storage.getUsersByCompany(companyId);
      console.log('🔍 [META PARTNER SERVICE] Found users for company:', {
        usersCount: users.length,
        userIds: users.map(u => ({ id: u.id, role: u.role }))
      });

      const adminUser = users.find(user => user.role === 'admin') || users[0];
      
      if (!adminUser) {
        console.error('❌ [META PARTNER SERVICE] No user found for company:', companyId);
        throw new Error('No user found for company');
      }

      

      const accessToken = customerToken || partnerConfig?.accessToken || phoneNumber.accessToken;
      const appId = partnerConfig?.partnerApiKey || undefined;

      

      const connectionData = {
        phoneNumberId: phoneNumber.phoneNumberId,
        phoneNumber: phoneNumber.phoneNumber,
        displayName: phoneNumber.displayName,

        accessToken: accessToken,

        wabaId: client.businessAccountId,
        businessAccountId: client.businessAccountId, // Also store as businessAccountId for compatibility
        businessId: businessId, // Meta Business Manager ID for business-level template fetching

        appId: appId,
        qualityRating: phoneNumber.qualityRating,
        messagingLimit: phoneNumber.messagingLimit,
        partnerManaged: true,
        historySyncEnabled: enableHistorySync || false,
        historySyncStatus: enableHistorySync ? 'pending' : 'disabled'
      };

      // Log businessId storage for debugging (always log to confirm status)
      console.log('🔍 [META PARTNER SERVICE] Storing businessId in connectionData:', {
        businessId: businessId || null,
        willEnableBusinessLevelTemplates: !!businessId,
        phoneNumberId: phoneNumber.phoneNumberId,
        wabaId: client.businessAccountId,
        templateFetchScope: businessId ? 'business-level (all templates)' : 'WABA-level (phone number only)'
      });

      // Resolve display phone number and verified name from Meta API for the label
      let displayPhoneForLabel = phoneNumber.phoneNumber;
      let verifiedNameFromMeta: string | undefined;
      if (accessToken && client.businessAccountId) {
        try {
          const details = await this.fetchPhoneNumberDetails(client.businessAccountId, phoneNumber.phoneNumberId, accessToken);
          if (details?.display_phone_number) {
            displayPhoneForLabel = details.display_phone_number;
          }
          if (details?.verified_name) {
            verifiedNameFromMeta = details.verified_name;
          }
        } catch (e) {
          // keep displayPhoneForLabel as phoneNumber.phoneNumber
        }
      }

      // Client sends "WhatsApp Business - {wabaId}" when user left Connection Name empty; treat as no user name and use Meta name + number
      const isClientFallbackName = /^WhatsApp Business - \d+$/.test(connectionName?.trim() || '') ||
        (connectionName?.trim() === 'WhatsApp Business - WhatsApp Business Account');

      const templateLiteralValue = `${phoneNumber.displayName} (${displayPhoneForLabel})`;

      // Use Connection Name from Easy Setup when user provided one; else use Meta verified_name + number; else display number only.
      const accountName = connectionName?.trim() && !isClientFallbackName
        ? `${connectionName.trim()} (${displayPhoneForLabel})`
        : (verifiedNameFromMeta
          ? `${verifiedNameFromMeta} (${displayPhoneForLabel})`
          : (templateLiteralValue?.trim() || displayPhoneForLabel || phoneNumber.phoneNumberId));

      console.log('🔍 [META PARTNER SERVICE] Creating channel connection with data:', {
        userId: adminUser.id,
        channelType: 'whatsapp_official',
        accountId: phoneNumber.phoneNumberId,
        accountName,
        hasConnectionData: !!connectionData,
        connectionDataKeys: Object.keys(connectionData)
      });

      const connectionDataToCreate = {
        userId: adminUser.id,
        companyId: companyId, // CRITICAL: Include companyId for multi-tenant filtering
        channelType: 'whatsapp_official',
        accountId: phoneNumber.phoneNumberId,
        accountName: accountName,
        connectionData,
        status: 'active'
      };

      

      const connection = await storage.createChannelConnection(connectionDataToCreate);

      
      
      return connection;

    } catch (error) {
      console.error('Error creating Meta WhatsApp channel connection:', error);
      throw error;
    }
  }

  /**
   * Send message through Meta WhatsApp Business API
   */
  async sendMessage(
    connectionId: number,
    userId: number,
    phoneNumber: string,
    message: string,
    mediaUrl?: string,
    mediaType?: string
  ): Promise<any> {
    try {
      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        throw new Error('Connection not found');
      }

      const connectionData = connection.connectionData as any;
      const { phoneNumberId, accessToken } = connectionData || {};
      if (!phoneNumberId || !accessToken) {
        throw new Error('Invalid connection configuration');
      }

      const messageData: any = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: mediaUrl ? mediaType || 'image' : 'text'
      };

      if (mediaUrl) {
        messageData[mediaType || 'image'] = {
          link: mediaUrl,
          caption: message || ''
        };
      } else {
        messageData.text = { body: message };
      }

      const response = await axios.post(
        `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`,
        messageData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data && response.data.messages && response.data.messages[0]) {
        const messageId = response.data.messages[0].id;
        
        await storage.createMessage({
          conversationId: 0,
          senderId: userId,
          content: message,
          type: mediaUrl ? 'media' : 'text',
          direction: 'outbound',
          externalId: messageId,
          metadata: {
            phoneNumber,
            mediaUrl,
            mediaType,
            whatsappMessageId: messageId
          }
        });

        return {
          success: true,
          messageId,
          data: response.data
        };
      }

      throw new Error('Failed to send message');

    } catch (error) {
      console.error('Error sending Meta WhatsApp message:', error);
      throw error;
    }
  }

  /**
   * Fetch phone number details from Meta's Graph API
   * @param wabaId WhatsApp Business Account ID
   * @param phoneNumberId Phone number ID
   * @param accessToken Access token for API requests
   * @returns Phone number details or null if fetch fails
   */
  private async fetchPhoneNumberDetails(
    wabaId: string,
    phoneNumberId: string,
    accessToken: string
  ): Promise<any | null> {
    try {
      console.log('🔍 [META PARTNER SERVICE] Fetching phone number details:', {
        phoneNumberId,
        wabaId
      });
      
      // First, try to fetch individual phone number details
      const phoneNumberUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating&access_token=${accessToken}`;
      
      try {
        const response = await axios.get(phoneNumberUrl);
        
        if (response.status === 200 && response.data) {
          console.log('✅ [META PARTNER SERVICE] Successfully fetched phone number details:', {
            phoneNumberId: response.data.id,
            display_phone_number: response.data.display_phone_number,
            verified_name: response.data.verified_name,
            quality_rating: response.data.quality_rating
          });
          
          // Normalize quality_rating to lowercase for database consistency
          const normalizedQualityRating = response.data.quality_rating?.toLowerCase() || 'unknown';
          
          if (response.data.quality_rating && response.data.quality_rating !== normalizedQualityRating) {
            console.log('🔍 [META PARTNER SERVICE] Normalized quality_rating from uppercase to lowercase:', {
              original: response.data.quality_rating,
              normalized: normalizedQualityRating
            });
          }
          
          return {
            id: response.data.id,
            display_phone_number: response.data.display_phone_number,
            verified_name: response.data.verified_name,
            quality_rating: normalizedQualityRating
          };
        }
      } catch (individualFetchError: any) {
        console.warn('⚠️ [META PARTNER SERVICE] Could not fetch individual phone number, trying WABA phone numbers list:', {
          error: individualFetchError.message,
          phoneNumberId
        });
        
        // Fallback: fetch all phone numbers for the WABA
        const wabaPhoneNumbersUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${wabaId}/phone_numbers?access_token=${accessToken}`;
        
        try {
          const wabaResponse = await axios.get(wabaPhoneNumbersUrl);
          
          if (wabaResponse.status === 200 && wabaResponse.data && wabaResponse.data.data) {
            const phoneNumbers = wabaResponse.data.data;
            const matchingPhoneNumber = phoneNumbers.find((pn: any) => pn.id === phoneNumberId);
            
            if (matchingPhoneNumber) {
              console.log('✅ [META PARTNER SERVICE] Found phone number in WABA phone numbers list:', {
                phoneNumberId: matchingPhoneNumber.id,
                display_phone_number: matchingPhoneNumber.display_phone_number,
                verified_name: matchingPhoneNumber.verified_name
              });
              
              // Normalize quality_rating to lowercase for database consistency
              const normalizedQualityRating = matchingPhoneNumber.quality_rating?.toLowerCase() || 'unknown';
              
              if (matchingPhoneNumber.quality_rating && matchingPhoneNumber.quality_rating !== normalizedQualityRating) {
                console.log('🔍 [META PARTNER SERVICE] Normalized quality_rating from uppercase to lowercase:', {
                  original: matchingPhoneNumber.quality_rating,
                  normalized: normalizedQualityRating
                });
              }
              
              return {
                id: matchingPhoneNumber.id,
                display_phone_number: matchingPhoneNumber.display_phone_number,
                verified_name: matchingPhoneNumber.verified_name,
                quality_rating: normalizedQualityRating
              };
            } else {
              console.warn('⚠️ [META PARTNER SERVICE] Phone number not found in WABA phone numbers list:', {
                phoneNumberId,
                availablePhoneNumberIds: phoneNumbers.map((pn: any) => pn.id)
              });
            }
          }
        } catch (wabaFetchError: any) {
          console.error('❌ [META PARTNER SERVICE] Error fetching WABA phone numbers:', {
            error: wabaFetchError.message,
            wabaId
          });
        }
      }
      
      return null;
    } catch (error) {
      console.error('❌ [META PARTNER SERVICE] Error in fetchPhoneNumberDetails:', error);
      return null;
    }
  }

  /**
   * Fetch all phone numbers for a WhatsApp Business Account
   * @param wabaId WhatsApp Business Account ID
   * @param accessToken Access token for API requests
   * @returns Array of phone number objects or empty array on failure
   */
  private async fetchAllPhoneNumbersForWaba(
    wabaId: string,
    accessToken: string
  ): Promise<any[]> {
    try {
      console.log('🔍 [META PARTNER SERVICE] Fetching all phone numbers for WABA:', {
        wabaId,
        apiEndpoint: `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${wabaId}/phone_numbers`
      });
      
      const wabaPhoneNumbersUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${wabaId}/phone_numbers?access_token=${accessToken}`;
      
      const response = await axios.get(wabaPhoneNumbersUrl);
      
      if (response.status === 200 && response.data && response.data.data) {
        const phoneNumbers = response.data.data;
        
        console.log('✅ [META PARTNER SERVICE] Successfully fetched phone numbers for WABA:', {
          wabaId,
          count: phoneNumbers.length,
          phoneNumberIds: phoneNumbers.map((pn: any) => pn.id),
          phoneNumbers: phoneNumbers.map((pn: any) => ({
            id: pn.id,
            display_phone_number: pn.display_phone_number,
            verified_name: pn.verified_name,
            quality_rating: pn.quality_rating
          }))
        });
        
        // Return array of phone number objects with required fields
        // Normalize quality_rating to lowercase for database consistency
        return phoneNumbers.map((pn: any) => {
          const normalizedQualityRating = pn.quality_rating?.toLowerCase() || 'unknown';
          
          if (pn.quality_rating && pn.quality_rating !== normalizedQualityRating) {
            console.log('🔍 [META PARTNER SERVICE] Normalized quality_rating from uppercase to lowercase:', {
              phoneNumberId: pn.id,
              original: pn.quality_rating,
              normalized: normalizedQualityRating
            });
          }
          
          return {
            id: pn.id,
            display_phone_number: pn.display_phone_number,
            verified_name: pn.verified_name,
            quality_rating: normalizedQualityRating
          };
        });
      } else {
        console.warn('⚠️ [META PARTNER SERVICE] Unexpected response when fetching WABA phone numbers:', {
          wabaId,
          status: response.status,
          hasData: !!response.data,
          hasDataArray: !!(response.data && response.data.data)
        });
        return [];
      }
    } catch (error: any) {
      console.error('❌ [META PARTNER SERVICE] Error fetching all phone numbers for WABA:', {
        wabaId,
        error: error.message,
        statusCode: error.response?.status,
        errorDetails: error.response?.data,
        stack: error.stack
      });
      return [];
    }
  }

  /**
   * Disconnect embedded signup connection by deregistering phone number and unsubscribing from webhooks
   */
  async disconnectEmbeddedSignupConnection(connectionId: number, companyId: number): Promise<any> {
    try {
      console.log('🔍 [META PARTNER SERVICE] disconnectEmbeddedSignupConnection called:', {
        connectionId,
        companyId,
        timestamp: new Date().toISOString()
      });

      // Fetch the connection and validate it belongs to the company
      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        throw new Error(`Connection with ID ${connectionId} not found`);
      }

      if (connection.companyId !== companyId) {
        throw new Error(`Access denied: Connection does not belong to company ${companyId}`);
      }

      // Guard: Only WhatsApp Business API connections are supported
      if (connection.channelType !== 'whatsapp_official') {
        throw new Error('Only WhatsApp Business API connections are supported by this disconnect method');
      }

      // Validate the connection has partnerManaged: true flag
      const connectionData = connection.connectionData as any;
      if (!connectionData?.partnerManaged) {
        throw new Error('This connection is not an embedded signup connection and cannot be disconnected using this method');
      }

      // Check if connection is already disconnected
      if (connection.status === 'disconnected') {
        console.warn('⚠️ [META PARTNER SERVICE] Connection is already disconnected:', connectionId);
        return {
          success: true,
          message: 'Connection is already disconnected',
          connection
        };
      }

      // Extract phoneNumberId and wabaId from connectionData
      const phoneNumberId = connectionData.phoneNumberId;
      const wabaId = connectionData.wabaId || connectionData.businessAccountId;

      if (!phoneNumberId) {
        throw new Error('Phone number ID is missing from connection data');
      }

      if (!wabaId) {
        throw new Error('WABA ID is missing from connection data');
      }

      // Get access token: first try connectionData.accessToken, then fall back to partner configuration
      let accessToken = connectionData.accessToken;
      if (!accessToken) {
        const partnerConfig = await storage.getPartnerConfiguration('meta');
        if (partnerConfig?.accessToken) {
          accessToken = partnerConfig.accessToken;
          console.log('🔍 [META PARTNER SERVICE] Using access token from partner configuration');
        }
      }

      if (!accessToken) {
        throw new Error('Access token is missing from connection data and partner configuration');
      }

      console.log('🔍 [META PARTNER SERVICE] Deregistering phone number:', {
        phoneNumberId,
        wabaId,
        hasAccessToken: !!accessToken
      });

      // Call Meta Graph API POST /{phoneNumberId}/deregister to deregister the phone number
      try {
        const deregisterUrl = `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${phoneNumberId}/deregister`;
        console.log('🔍 [META PARTNER SERVICE] Calling Meta API to deregister phone number:', deregisterUrl);
        
        const deregisterResponse = await axios.post(
          deregisterUrl,
          {},
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        console.log('✅ [META PARTNER SERVICE] Phone number deregistered successfully:', {
          phoneNumberId,
          responseStatus: deregisterResponse.status,
          responseData: deregisterResponse.data
        });
      } catch (deregisterError: any) {
        // Handle already deregistered or other API errors gracefully
        const errorMessage = deregisterError.response?.data?.error?.message || deregisterError.message;
        const errorCode = deregisterError.response?.data?.error?.code;
        
        if (errorCode === 100 || errorMessage?.includes('already deregistered')) {
          console.warn('⚠️ [META PARTNER SERVICE] Phone number already deregistered:', {
            phoneNumberId,
            errorMessage
          });
        } else {
          console.error('❌ [META PARTNER SERVICE] Error deregistering phone number:', {
            phoneNumberId,
            errorMessage,
            errorCode,
            statusCode: deregisterError.response?.status,
            errorDetails: deregisterError.response?.data
          });
          throw new Error(`Failed to deregister phone number: ${errorMessage}`);
        }
      }

      // Call Meta Graph API DELETE /{wabaId}/subscribed_apps to unsubscribe from webhooks
      try {
        const unsubscribeUrl = `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${wabaId}/subscribed_apps`;
        console.log('🔍 [META PARTNER SERVICE] Calling Meta API to unsubscribe from webhooks:', unsubscribeUrl);
        
        const unsubscribeResponse = await axios.delete(
          unsubscribeUrl,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        console.log('✅ [META PARTNER SERVICE] Unsubscribed from webhooks successfully:', {
          wabaId,
          responseStatus: unsubscribeResponse.status,
          responseData: unsubscribeResponse.data
        });
      } catch (unsubscribeError: any) {
        // Handle already unsubscribed or other API errors gracefully
        const errorMessage = unsubscribeError.response?.data?.error?.message || unsubscribeError.message;
        const errorCode = unsubscribeError.response?.data?.error?.code;
        
        if (errorCode === 100 || errorMessage?.includes('not subscribed')) {
          console.warn('⚠️ [META PARTNER SERVICE] Already unsubscribed from webhooks:', {
            wabaId,
            errorMessage
          });
        } else {
          console.error('❌ [META PARTNER SERVICE] Error unsubscribing from webhooks:', {
            wabaId,
            errorMessage,
            errorCode,
            statusCode: unsubscribeError.response?.status,
            errorDetails: unsubscribeError.response?.data
          });
          // Don't throw here - deregistration is the critical step, webhook unsubscription is secondary
          console.warn('⚠️ [META PARTNER SERVICE] Continuing despite webhook unsubscription error');
        }
      }

      // Update connection status to 'disconnected' in database
      const updatedConnection = await storage.updateChannelConnectionStatus(connectionId, 'disconnected');
      console.log('✅ [META PARTNER SERVICE] Connection status updated to disconnected:', {
        connectionId,
        newStatus: updatedConnection.status
      });

      // Update associated meta_whatsapp_phone_numbers record status to 'deregistered'
      try {
        const phoneNumberRecord = await storage.getMetaWhatsappPhoneNumberByPhoneNumberId(phoneNumberId);
        if (phoneNumberRecord) {
          await storage.updateMetaWhatsappPhoneNumber(phoneNumberRecord.id, {
            status: 'deregistered'
          });
          console.log('✅ [META PARTNER SERVICE] Phone number record status updated to deregistered:', {
            phoneNumberId: phoneNumberRecord.id,
            phoneNumberIdValue: phoneNumberRecord.phoneNumberId
          });
        } else {
          console.warn('⚠️ [META PARTNER SERVICE] Phone number record not found for phoneNumberId:', phoneNumberId);
        }
      } catch (phoneNumberUpdateError: any) {
        console.error('❌ [META PARTNER SERVICE] Error updating phone number record:', {
          phoneNumberId,
          error: phoneNumberUpdateError.message
        });
        // Don't throw - connection status update is more important
      }

      console.log('✅ [META PARTNER SERVICE] disconnectEmbeddedSignupConnection completed successfully:', {
        connectionId,
        phoneNumberId,
        wabaId
      });

      return {
        success: true,
        message: 'WhatsApp number disconnected successfully',
        connection: updatedConnection
      };

    } catch (error: any) {
      console.error('❌ [META PARTNER SERVICE] Error in disconnectEmbeddedSignupConnection:', {
        connectionId,
        companyId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get event emitter for real-time updates
   */
  getEventEmitter(): EventEmitter {
    return eventEmitter;
  }
}

export default new WhatsAppMetaPartnerService();
