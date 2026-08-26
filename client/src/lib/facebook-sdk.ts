import {
  INSTAGRAM_LOGIN_SCOPES,
  MESSENGER_LOGIN_SCOPES,
} from '@shared/types/meta-partner';

declare global {
  interface Window {
    fbAsyncInit: () => void;
    FB: {
      init: (options: {
        appId: string;
        cookie?: boolean;
        autoLogAppEvents?: boolean;
        xfbml: boolean;
        version: string;
      }) => void;
      login: (
        callback: (response: any) => void,
        options?: {
          config_id?: string;
          response_type?: string;
          override_default_response_type?: boolean;
          extras?: {
            setup: Record<string, any>;
            featureType?: string;
            sessionInfoVersion: string;
          };
          scope?: string;
        }
      ) => void;
      getLoginStatus: (callback: (response: any) => void) => void;
      api: (path: string, callback: (response: any) => void) => void;
    };
  }
}

/**
 * Type definitions for response objects
 */
interface AuthResponse {
  accessToken?: string;
  userID: string;
  expiresIn: number;
  signedRequest: string;
  code?: string;
}

export interface FacebookLoginResponse {
  authResponse: AuthResponse | null;
  status: 'connected' | 'not_authorized' | 'unknown';
}

interface WhatsAppSignupData {
  type: 'WA_EMBEDDED_SIGNUP';
  event?: string; // 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' for coexistence mode
  wabaId?: string;
  phoneNumberId?: string;
  screen?: string;

  business_account_id?: string;
  business_account_name?: string;
  phone_numbers?: Array<{
    phone_number_id: string;
    phone_number: string;
    display_name?: string;
    quality_rating?: string;
    messaging_limit?: number;
    access_token?: string;
  }>;

  status?: string;
  [key: string]: any; // Allow additional fields from Meta
}

/**
 * Initialize Facebook SDK
 * @param appId Your Facebook App ID
 * @param version Graph API version (e.g., 'v25.0')
 */
export function initFacebookSDK(appId: string, version = 'v25.0'): Promise<void> {
  return new Promise((resolve, reject) => {

    if (document.getElementById('facebook-jssdk')) {

      if (window.FB) {
        window.FB.init({
          appId: appId,
          cookie: true,
          xfbml: true,
          version: version
        });
      }
      

      setTimeout(() => {
        if (window.FB && typeof window.FB.getLoginStatus === 'function') {
          resolve();
        } else {
          setTimeout(() => {
            if (window.FB && typeof window.FB.getLoginStatus === 'function') {
              resolve();
            } else {
              reject(new Error('Facebook SDK failed to initialize properly'));
            }
          }, 1000);
        }
      }, 1000); // Always wait 1 second for internal initialization
      return;
    }


    window.fbAsyncInit = function() {
      window.FB.init({
        appId: appId,
        cookie: true,
        xfbml: true,
        version: version
      });
      


      setTimeout(() => {
        resolve();
      }, 1000); // Wait 1 second for internal initialization
    };


    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    
    script.onerror = () => {
      reject(new Error('Failed to load Facebook SDK'));
    };
    
    document.head.appendChild(script);
  });
}

/**
 * Setup event listener for WhatsApp signup events
 * @param callback Function to call when a WhatsApp signup event is received
 */
export function setupWhatsAppSignupListener(callback: (data: WhatsAppSignupData) => void) {
  
  
  window.addEventListener('message', (event) => {

    if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") {
      return;
    }
    
    try {
      // Only parse if it looks like JSON (starts with '{' or '[')
      // This prevents parse errors from Facebook SDK callback parameters like "cb=fda8a33..."
      let data: any;
      if (typeof event.data === 'string') {
        const trimmed = event.data.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          data = JSON.parse(event.data);
        } else {
          // Not JSON, likely a callback parameter - skip processing
          return;
        }
      } else {
        data = event.data;
      }
      
   
      
      if (data.type === 'WA_EMBEDDED_SIGNUP') {
        let signupData = data;
        if (data.data && typeof data.data === 'object') {
          const nestedData = data.data;

        

          const businessId = nestedData.business_id;
 
          signupData = {
            ...data,
            ...nestedData,

            business_account_id: nestedData.waba_id || nestedData.business_account_id || nestedData.wabaId,

            wabaId: nestedData.waba_id || nestedData.wabaId,
            businessId: businessId, // Include business ID for business-level template fetching

            phoneNumberId: nestedData.phone_number_id || nestedData.phoneNumberId,


            phone_numbers: nestedData.phone_numbers || (nestedData.phone_number_id ? [{
              phone_number_id: nestedData.phone_number_id,
              phone_number: nestedData.phone_number || '',
              display_name: nestedData.display_name || nestedData.verified_name || ''
            }] : []),

            type: data.type
          };
          
      
        }
        
        callback(signupData);
      }
    } catch (error) {
      // Only log if it's not a callback parameter (which is expected and benign)
      const eventDataStr = typeof event.data === 'string' ? event.data : '';
      if (!eventDataStr.startsWith('cb=')) {
        console.error('❌ [FACEBOOK SDK] Error parsing message data:', error);
      }
      // Silently ignore callback parameter parse errors as they're expected from Facebook SDK
    }
  });
  
  
}

/**
 * Launch WhatsApp Business signup flow
 * @param configId Your WhatsApp Business configuration ID
 * @param callback Callback function to handle the login response
 * @param signupMode Signup mode: 'standard' for new account, 'coexistence' for existing WhatsApp Business app
 * @remarks For coexistence mode, featureType is set to 'whatsapp_business_app_onboarding' as per Facebook documentation
 */
export async function launchWhatsAppSignup(
  configId: string, 
  callback: (response: FacebookLoginResponse) => void,
  signupMode: 'standard' | 'coexistence' = 'standard'
) {
  if (!window.FB) {
    throw new Error('Facebook SDK not initialized. Please try again.');
  }

  if (!configId || configId.trim() === '') {
    throw new Error('WhatsApp Configuration ID is required. Please check your configuration.');
  }

  if (window.location.protocol !== 'https:') {
    throw new Error('WhatsApp signup requires HTTPS. Please access this application over HTTPS (https://) instead of HTTP.');
  }


  if (!window.FB || typeof window.FB.login !== 'function') {
    throw new Error('Facebook SDK is not properly initialized');
  }


  try {
    window.FB.getLoginStatus((response: any) => {
      
      
      

      window.FB.login((loginResponse: any) => {
        
        callback(loginResponse);
      }, {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          ...(signupMode === 'coexistence' ? { featureType: 'whatsapp_business_app_onboarding' } : {}),
          sessionInfoVersion: '3',
        }
      });
    });
  } catch (error) {
    throw new Error('Failed to launch WhatsApp signup. Please check your configuration.');
  }
}

type LoginCallback = (response: FacebookLoginResponse) => void;

function resolveConfigIdFirstArgs(
  configIdOrCallback: string | undefined | LoginCallback,
  callbackOrConfigId?: string | LoginCallback
): { configId: string | undefined; callback: LoginCallback } {
  if (typeof configIdOrCallback === 'function') {
    return {
      configId: typeof callbackOrConfigId === 'string' ? callbackOrConfigId : undefined,
      callback: configIdOrCallback,
    };
  }

  if (typeof callbackOrConfigId !== 'function') {
    throw new Error('Facebook Login callback is required.');
  }

  return {
    configId: typeof configIdOrCallback === 'string' ? configIdOrCallback : undefined,
    callback: callbackOrConfigId,
  };
}

/**
 * Launch Messenger signup using Facebook Login for Business when config_id is configured.
 * Falls back to manual scopes in development when no config_id is available.
 */
export async function launchMessengerSignup(
  configId: string | undefined,
  callback: LoginCallback
): Promise<void>;
/** @deprecated Pass configId first — callback-first order is retained for rollout compatibility only. */
export async function launchMessengerSignup(
  callback: LoginCallback,
  configId?: string
): Promise<void>;
export async function launchMessengerSignup(
  configIdOrCallback: string | undefined | LoginCallback,
  callbackOrConfigId?: string | LoginCallback
): Promise<void> {
  const { configId, callback } = resolveConfigIdFirstArgs(configIdOrCallback, callbackOrConfigId);

  if (!window.FB) {
    throw new Error('Facebook SDK not initialized. Please try again.');
  }

  if (window.location.protocol !== 'https:') {
    throw new Error('Messenger signup requires HTTPS. Please access this application over HTTPS (https://) instead of HTTP.');
  }

  if (!window.FB || typeof window.FB.login !== 'function') {
    throw new Error('Facebook SDK is not properly initialized');
  }

  const trimmedConfigId = configId?.trim();
  const useBusinessLogin = Boolean(trimmedConfigId);

  if (!useBusinessLogin && import.meta.env.PROD) {
    throw new Error(
      'Messenger Facebook Login for Business configuration ID is required in production. Contact your administrator.'
    );
  }

  if (!useBusinessLogin) {
    console.warn(
      '[DEV FALLBACK] Launching Messenger signup with manual scopes — not the official production onboarding path. Configure messengerConfigId or metaChannelsConfigId for Facebook Login for Business.'
    );
  }

  try {
    window.FB.getLoginStatus(() => {
      window.FB.login((loginResponse: any) => {
        callback(loginResponse);
      }, useBusinessLogin
        ? {
            config_id: trimmedConfigId,
            response_type: 'code',
            override_default_response_type: true,
            extras: {
              setup: {},
              sessionInfoVersion: '3',
            },
          }
        : {
            scope: MESSENGER_LOGIN_SCOPES.join(','),
          });
    });
  } catch (error) {
    throw new Error('Failed to launch Messenger signup. Please check your configuration.');
  }
}

/**
 * Launch Instagram signup using Facebook Login for Business when config_id is configured.
 * Falls back to manual scopes in development when no config_id is available.
 */
export async function launchInstagramSignup(
  configId: string | undefined,
  callback: LoginCallback
): Promise<void>;
/** @deprecated Pass configId first — callback-first order is retained for rollout compatibility only. */
export async function launchInstagramSignup(
  callback: LoginCallback,
  configId?: string
): Promise<void>;
export async function launchInstagramSignup(
  configIdOrCallback: string | undefined | LoginCallback,
  callbackOrConfigId?: string | LoginCallback
): Promise<void> {
  const { configId, callback } = resolveConfigIdFirstArgs(configIdOrCallback, callbackOrConfigId);

  if (!window.FB) {
    throw new Error('Facebook SDK not initialized. Please try again.');
  }

  if (window.location.protocol !== 'https:') {
    throw new Error('Instagram signup requires HTTPS. Please access this application over HTTPS (https://) instead of HTTP.');
  }

  if (!window.FB || typeof window.FB.login !== 'function') {
    throw new Error('Facebook SDK is not properly initialized');
  }

  const trimmedConfigId = configId?.trim();
  const useBusinessLogin = Boolean(trimmedConfigId);

  if (!useBusinessLogin && import.meta.env.PROD) {
    throw new Error(
      'Instagram Facebook Login for Business configuration ID is required in production. Contact your administrator.'
    );
  }

  if (!useBusinessLogin) {
    console.warn(
      '[DEV FALLBACK] Launching Instagram signup with manual scopes — not the official production onboarding path. Configure instagramConfigId or metaChannelsConfigId for Facebook Login for Business.'
    );
  }

  try {
    window.FB.getLoginStatus(() => {
      window.FB.login((loginResponse: any) => {
        callback(loginResponse);
      }, useBusinessLogin
        ? {
            config_id: trimmedConfigId,
            response_type: 'code',
            override_default_response_type: true,
            extras: {
              setup: {},
              sessionInfoVersion: '3',
            },
          }
        : {
            scope: INSTAGRAM_LOGIN_SCOPES.join(','),
          });
    });
  } catch (error) {
    throw new Error('Failed to launch Instagram signup. Please check your configuration.');
  }
}

/**
 * Launch unified Meta Channels signup using the shared metaChannelsConfigId.
 * Uses Facebook Login for Business with code-based response (single-use authorization code).
 */
export async function launchMetaChannelsSignup(
  configId: string | undefined,
  callback: LoginCallback
): Promise<void> {
  if (!window.FB) {
    throw new Error('Facebook SDK not initialized. Please try again.');
  }

  if (window.location.protocol !== 'https:') {
    throw new Error(
      'Meta Channels signup requires HTTPS. Please access this application over HTTPS (https://) instead of HTTP.'
    );
  }

  if (!window.FB || typeof window.FB.login !== 'function') {
    throw new Error('Facebook SDK is not properly initialized');
  }

  const trimmedConfigId = configId?.trim();
  const useBusinessLogin = Boolean(trimmedConfigId);

  if (!useBusinessLogin && import.meta.env.PROD) {
    throw new Error(
      'Meta Channels Facebook Login for Business configuration ID is required in production. Contact your administrator.'
    );
  }

  if (!useBusinessLogin) {
    throw new Error(
      'Meta Channels Facebook Login for Business configuration ID (metaChannelsConfigId) is required.'
    );
  }

  try {
    window.FB.getLoginStatus(() => {
      window.FB.login((loginResponse: any) => {
        callback(loginResponse);
      }, {
        config_id: trimmedConfigId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          sessionInfoVersion: '3',
        },
      });
    });
  } catch (error) {
    throw new Error('Failed to launch Meta Channels signup. Please check your configuration.');
  }
}