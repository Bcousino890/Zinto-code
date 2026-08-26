import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { initFacebookSDK, setupWhatsAppSignupListener, launchWhatsAppSignup, FacebookLoginResponse } from '@/lib/facebook-sdk';
import { fetchMetaPartnerConfig, validateFacebookConfig, clearConfigCache } from '@/lib/facebook-config';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface TermsState {
  acceptTerms: boolean;
  acceptPrivacyPolicy: boolean;
}

export function WhatsAppEmbeddedSignup({ isOpen, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [sdkInitialized, setSdkInitialized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [configValid, setConfigValid] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [partnerConfig, setPartnerConfig] = useState<any>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [connectionName, setConnectionName] = useState('');
  const [signupMode, setSignupMode] = useState<'standard' | 'coexistence'>('standard');
  const signupProcessedRef = useRef(false); // Track if signup was processed via message listener (use ref for immediate updates)
  const authCodeRef = useRef<string | null>(null);

  const [terms, setTerms] = useState<TermsState>({
    acceptTerms: false,
    acceptPrivacyPolicy: false
  });

  useEffect(() => {
    if (isOpen) {
      signupProcessedRef.current = false; // Reset flag when dialog opens
      authCodeRef.current = null;
      loadPartnerConfiguration();
    }
  }, [isOpen]);

  const loadPartnerConfiguration = async () => {
    try {
      setConfigLoading(true);
      const config = await fetchMetaPartnerConfig();
      
      if (!config) {
        setConfigError('Meta Partner Configuration is not available');
        setConfigValid(false);
        toast({
          title: t('settings.whatsappEmbeddedSignup.toast_config_error', 'Configuration Error'),
          description: t('settings.whatsappEmbeddedSignup.toast_config_not_available', 'Meta WhatsApp Business API is not configured. Please contact your administrator.'),
          variant: "destructive"
        });
        return;
      }

      const validation = await validateFacebookConfig(config);
      if (!validation.isValid) {
        setConfigError(`Missing configuration: ${validation.missingFields.join(', ')}`);
        setConfigValid(false);
        toast({
          title: t('settings.whatsappEmbeddedSignup.toast_config_error', 'Configuration Error'),
          description: t('settings.whatsappEmbeddedSignup.toast_config_missing', 'Missing configuration: {{fields}}. Please contact your administrator.', { fields: validation.missingFields.join(', ') }),
          variant: "destructive"
        });
        return;
      }

      setPartnerConfig(config);
      setConfigValid(true);
      setConfigError(null);


      await initFacebookSDK(config.partnerApiKey, config.apiVersion || 'v25.0');
      setSdkInitialized(true);

      setupWhatsAppSignupListener((data) => {
   
        
        let signupData = data;
        if (data.data && typeof data.data === 'object' && !data.business_account_id && !data.wabaId) {
          const nestedData = data.data;
          signupData = {
            ...data,
            ...nestedData,

            business_account_id: nestedData.waba_id || nestedData.business_account_id,
            wabaId: nestedData.waba_id,
            businessId: nestedData.business_id || data.businessId, // Preserve businessId for business-level template fetching
            phoneNumberId: nestedData.phone_number_id,
            phone_numbers: nestedData.phone_numbers || (nestedData.phone_number_id ? [{
              phone_number_id: nestedData.phone_number_id,
              phone_number: nestedData.phone_number || '',
              display_name: nestedData.display_name || ''
            }] : [])
          };
        }

   

        // Check if this is a coexistence onboarding completion event
        const isCoexistenceOnboarding = signupData.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING';
        
     

        // Check for WABA/business account ID - support standard and coexistence field variations
        const hasWaba = !!(
          signupData.business_account_id || 
          signupData.wabaId || 
          signupData.waba_id ||
          signupData.businessAccountId || // Alternative camelCase format
          (signupData.data && (signupData.data.business_account_id || signupData.data.waba_id || signupData.data.wabaId))
        );
        
        // Check for phone number - support standard and coexistence field variations
        // For coexistence mode, phone number may be in data.waba_id structure
        const hasPhoneNumber = !!(
          signupData.phoneNumberId || 
          signupData.phone_number_id || 
          (signupData.phone_numbers && signupData.phone_numbers.length > 0) ||
          (signupData.phoneNumbers && signupData.phoneNumbers.length > 0) || // Alternative camelCase format
          (signupData.data && (
            signupData.data.phone_number_id || 
            signupData.data.phoneNumberId ||
            (signupData.data.phone_numbers && signupData.data.phone_numbers.length > 0) ||
            (signupData.data.phoneNumbers && signupData.data.phoneNumbers.length > 0)
          ))
        );
        
        // For coexistence onboarding, we need WABA ID at minimum (phone number registration is skipped)
        if (isCoexistenceOnboarding && hasWaba) {
        
          signupProcessedRef.current = true;
          handleSuccessfulSignup(signupData);
        } else if (hasWaba && hasPhoneNumber) {
       
          signupProcessedRef.current = true; // Mark that signup is being processed via message listener (use ref for immediate update)
          handleSuccessfulSignup(signupData);
        } else if (signupData.screen) {
          toast({
            title: t('settings.whatsappEmbeddedSignup.toast_signup_incomplete', 'Signup Incomplete'),
            description: t('settings.whatsappEmbeddedSignup.toast_signup_incomplete_desc', 'Signup was abandoned at the {{screen}} screen. Please try again.', { screen: signupData.screen }),
            variant: "destructive"
          });
        } else {
          toast({
            title: t('settings.whatsappEmbeddedSignup.toast_signup_error', 'Signup Error'),
            description: t('settings.whatsappEmbeddedSignup.toast_signup_error_desc', 'Received incomplete signup data. Please check the console for details.'),
            variant: "destructive"
          });
        }
      });
      
      

    } catch (error) {
      setConfigError('Failed to load partner configuration');
      toast({
        title: t('settings.whatsappEmbeddedSignup.toast_integration_error', 'Integration Error'),
        description: t('settings.whatsappEmbeddedSignup.toast_integration_error_desc', 'Failed to initialize the WhatsApp Business signup process. Please try again later.'),
        variant: "destructive"
      });
    } finally {
      setConfigLoading(false);
    }
  };

  const handleRefreshConfiguration = async () => {
    clearConfigCache();
    await loadPartnerConfiguration();
    toast({
      title: t('settings.whatsappEmbeddedSignup.toast_config_refreshed', 'Configuration Refreshed'),
      description: t('settings.whatsappEmbeddedSignup.toast_config_refreshed_desc', 'Configuration has been refreshed successfully.'),
    });
  };

  const handleTermsChange = (checked: boolean) => {
    setTerms({
      ...terms,
      acceptTerms: checked
    });
  };

  const handlePrivacyPolicyChange = (checked: boolean) => {
    setTerms({
      ...terms,
      acceptPrivacyPolicy: checked
    });
  };

  const handleFacebookLoginResponse = (response: FacebookLoginResponse) => {
    const code = response.authResponse?.code;

    if (code) {
      authCodeRef.current = code;

      // Fallback: if signup data never arrives via message listener within a bounded timeout,
      // attempt code-only onboarding using the legacy endpoint.
      const fallbackTimeoutMs = 3000;
      setTimeout(() => {
        if (!signupProcessedRef.current && authCodeRef.current === code) {
          exchangeCodeForWhatsAppConnection(code);
        }
      }, fallbackTimeoutMs);

      return;
    }

    if (!signupProcessedRef.current) {
      setLoading(false);
      toast({
        title: t('settings.whatsappEmbeddedSignup.toast_signup_cancelled', 'Signup Cancelled'),
        description: t('settings.whatsappEmbeddedSignup.toast_signup_cancelled_desc', 'The WhatsApp Business signup process was cancelled or encountered an error.'),
        variant: "destructive"
      });
    }
  };

  const exchangeCodeForWhatsAppConnection = async (code: string) => {
    try {
      const response = await fetch('/api/channel-connections/whatsapp-embedded-signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          code: code,
          connectionName: connectionName.trim() || undefined
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        
        toast({
          title: t('settings.whatsappEmbeddedSignup.toast_connection_success', 'Connection Successful'),
          description: t('settings.whatsappEmbeddedSignup.toast_connection_success_desc', 'Your WhatsApp Business account has been connected successfully.'),
        });
        
        
        onSuccess();
        onClose();
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Failed to connect WhatsApp Business account');
      }
    } catch (error: any) {
      toast({
        title: t('settings.whatsappEmbeddedSignup.toast_connection_error', 'Connection Error'),
        description: error.message || t('settings.whatsappEmbeddedSignup.toast_connection_error_desc', 'Failed to connect your WhatsApp Business account.'),
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSuccessfulSignup = async (signupData: any) => {
    const finalConnectionName = connectionName.trim() || 
      `WhatsApp Business - ${signupData.business_account_name || signupData.wabaId || 'Account'}`;


    let normalizedSignupData = signupData;
    

    if (signupData.wabaId && signupData.phoneNumberId && !signupData.business_account_id) {
      
      normalizedSignupData = {
        business_account_id: signupData.wabaId,
        business_account_name: 'WhatsApp Business Account',
        businessId: signupData.businessId, // Preserve businessId for business-level template fetching
        phone_numbers: [{
          phone_number_id: signupData.phoneNumberId,
          phone_number: '', // Will be fetched from API if needed
          display_name: 'WhatsApp Business'
        }]
      };
    }

    // Validate businessId is present for coexistence mode
    const hasBusinessId = !!(normalizedSignupData.businessId || normalizedSignupData.data?.business_id);
    if (normalizedSignupData.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' && !hasBusinessId) {
      console.warn('⚠️ [WHATSAPP EMBEDDED SIGNUP] businessId missing in coexistence mode payload:', {
        event: normalizedSignupData.event,
        availableKeys: Object.keys(normalizedSignupData),
        hasNestedData: !!normalizedSignupData.data,
        nestedDataKeys: normalizedSignupData.data ? Object.keys(normalizedSignupData.data) : [],
        impact: 'Backend will not enable business-level template fetching'
      });
    }

    try {
      setLoading(true);

      let authCodeToSend: string | null = null;
      const timeoutMs = 3000;
      const intervalMs = 200;
      const maxAttempts = Math.ceil(timeoutMs / intervalMs);

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (authCodeRef.current) {
          authCodeToSend = authCodeRef.current;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }

      const response = await fetch('/api/channel-connections/meta-whatsapp-embedded-signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          connectionName: finalConnectionName,
          signupData: normalizedSignupData,
          signupMode: signupMode,
          code: authCodeToSend || undefined,
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        
        // Check if response indicates success but no connections were created
        if (result.connections?.length === 0) {
          
          // Show different messages based on signup mode
          if (signupMode === 'coexistence') {
            toast({
              title: t('settings.whatsappEmbeddedSignup.toast_connection_issue', 'Connection Issue'),
              description: t('settings.whatsappEmbeddedSignup.toast_connection_issue_desc', 'WhatsApp Business Account connected, but no phone numbers found. Please verify your WABA has registered phone numbers and try again.'),
              variant: "destructive"
            });
          } else {
            toast({
              title: t('settings.whatsappEmbeddedSignup.toast_connection_warnings', 'Connection Created with Warnings'),
              description: t('settings.whatsappEmbeddedSignup.toast_connection_warnings_desc', 'WhatsApp Business account was connected, but phone number details are being configured. Please refresh the page in a moment.'),
              variant: "default"
            });
          }
        } else {
          const count = result.phoneNumbers?.length || 0;
          if (signupMode === 'coexistence') {
            toast({
              title: t('settings.whatsappEmbeddedSignup.toast_connection_success', 'Connection Successful'),
              description: t('settings.whatsappEmbeddedSignup.toast_connection_success_phones', 'WhatsApp Business Account connected successfully. {{count}} phone number(s) added.', { count }),
            });
          } else {
            toast({
              title: t('settings.whatsappEmbeddedSignup.toast_connection_success', 'Connection Successful'),
              description: t('settings.whatsappEmbeddedSignup.toast_connection_created_phones', 'WhatsApp Business Account created successfully. {{count}} phone number(s) added.', { count }),
            });
          }
        }
        
        onSuccess();
        onClose();
      } else {
        const error = await response.json();
        // 🔍 DEBUG: Log detailed error
        console.error('❌ [WHATSAPP EMBEDDED SIGNUP] API error response:', {
          status: response.status,
          statusText: response.statusText,
          error: error,
          fullError: error
        });
        throw new Error(error.message || 'Failed to connect WhatsApp Business account');
      }
    } catch (error: any) {
      // 🔍 DEBUG: Log error details
      console.error('❌ [WHATSAPP EMBEDDED SIGNUP] Error in handleSuccessfulSignup:', {
        error: error.message,
        stack: error.stack,
        fullError: error
      });
      toast({
        title: t('settings.whatsappEmbeddedSignup.toast_connection_error', 'Connection Error'),
        description: error.message || t('settings.whatsappEmbeddedSignup.toast_connection_error_desc', 'Failed to connect your WhatsApp Business account.'),
        variant: "destructive"
      });
    } finally {
      authCodeRef.current = null;
      setLoading(false);
    }
  };

  const launchSignup = () => {
    if (!connectionName.trim()) {
      toast({
        title: t('settings.whatsappEmbeddedSignup.toast_connection_name_required', 'Connection Name Required'),
        description: t('settings.whatsappEmbeddedSignup.toast_connection_name_required_desc', 'Please enter a connection name to continue.'),
        variant: "destructive"
      });
      return;
    }

    if (!terms.acceptTerms || !terms.acceptPrivacyPolicy) {
      toast({
        title: t('settings.whatsappEmbeddedSignup.toast_terms_required', 'Terms Required'),
        description: t('settings.whatsappEmbeddedSignup.toast_terms_required_desc', 'Please accept both the terms and privacy policy to continue.'),
        variant: "destructive"
      });
      return;
    }

    if (!configValid) {
      toast({
        title: t('settings.whatsappEmbeddedSignup.toast_config_error', 'Configuration Error'),
        description: configError || t('settings.whatsappEmbeddedSignup.toast_config_not_configured', 'WhatsApp Business API is not properly configured.'),
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    if (!sdkInitialized) {
      toast({
        title: t('settings.whatsappEmbeddedSignup.toast_please_wait', 'Please Wait'),
        description: t('settings.whatsappEmbeddedSignup.toast_please_wait_desc', 'The signup process is still initializing. Please try again in a moment.'),
      });
      setLoading(false);
      return;
    }

    if (!partnerConfig?.configId) {
      toast({
        title: t('settings.whatsappEmbeddedSignup.toast_config_error', 'Configuration Error'),
        description: t('settings.whatsappEmbeddedSignup.toast_config_id_not_set', 'WhatsApp Configuration ID is not set in partner configuration'),
        variant: "destructive"
      });
      return;
    }

    
    try {
      launchWhatsAppSignup(
        partnerConfig.configId,
        handleFacebookLoginResponse,
        signupMode
      );
      
    } catch (error: any) {
      toast({
        title: t('settings.whatsappEmbeddedSignup.toast_launch_error', 'Launch Error'),
        description: error.message || t('settings.whatsappEmbeddedSignup.toast_launch_error_desc', 'Failed to launch WhatsApp Business signup flow.'),
        variant: "destructive"
      });
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('settings.whatsappEmbeddedSignup.title', 'WhatsApp Business API - Easy Setup')}</DialogTitle>
          <DialogDescription>
            {t('settings.whatsappEmbeddedSignup.description', 'Connect your WhatsApp Business account to the Cloud API. Choose between creating a new account or connecting an existing WhatsApp Business app.')}
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-4 mb-4">
            <h3 className="text-sm font-medium mb-2">{t('settings.whatsappEmbeddedSignup.how_it_works', 'How it works:')}</h3>
            <ol className="list-decimal pl-5 text-sm text-gray-600 dark:text-gray-400 space-y-1">
            {signupMode === 'standard' ? (
              <>
                <li>{t('settings.whatsappEmbeddedSignup.step1_standard', 'A signup form will open from Meta to connect your business account')}</li>
                <li>{t('settings.whatsappEmbeddedSignup.step2_standard', 'Select an existing Facebook Business Manager account or create a new one')}</li>
                <li>{t('settings.whatsappEmbeddedSignup.step3_standard', 'Enter your business details and verify your phone number')}</li>
                <li>{t('settings.whatsappEmbeddedSignup.step4_standard', 'Once the signup is complete, a WhatsApp Business API connection will be created for you to use in the app')}</li>
              </>
            ) : (
              <>
                <li>{t('settings.whatsappEmbeddedSignup.step1_coexistence', 'A signup form will open from Meta to connect your existing WhatsApp Business app')}</li>
                <li>{t('settings.whatsappEmbeddedSignup.step2_coexistence', 'Select your existing Facebook Business Manager account')}</li>
                <li>{t('settings.whatsappEmbeddedSignup.step3_coexistence', 'Choose the WhatsApp Business app you want to connect')}</li>
                <li>{t('settings.whatsappEmbeddedSignup.step4_coexistence', 'Once connected, your app will sync with the Cloud API and messages will be available in both places')}</li>
              </>
            )}
            </ol>
            

            {!configLoading && !configValid && configError && (
              <div className="mt-3 flex flex-col p-2 text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
                <div className="flex items-start">
                  <i className="ri-error-warning-line mt-0.5 mr-2"></i>
                  <div className="flex-1">
                    <p className="text-xs font-medium">
                      <strong>{t('settings.whatsappEmbeddedSignup.config_error_label', 'Configuration Error:')}</strong> {configError}
                    </p>
                    <p className="text-xs mt-1">
                      {t('settings.whatsappEmbeddedSignup.config_contact_admin', 'Contact your administrator to configure the Meta Partner API credentials.')}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 text-xs"
                  onClick={handleRefreshConfiguration}
                >
                  <i className="ri-refresh-line mr-1"></i>
                  {t('settings.whatsappEmbeddedSignup.refresh_config', 'Refresh Configuration')}
                </Button>
              </div>
            )}


            {!configLoading && !configValid && !configError && (
              <div className="mt-3 flex p-2 text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800">
                <i className="ri-error-warning-line mt-0.5 mr-2"></i>
                <p className="text-xs">
                  <strong>{t('settings.whatsappEmbeddedSignup.note', 'Note:')}</strong> {t('settings.whatsappEmbeddedSignup.note_config_required', 'This feature requires configuration of a Meta Partner App with WhatsApp Business permissions. Contact your administrator to set up the app credentials.')}
                </p>
              </div>
            )}
          </div>
          
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-sm font-medium mb-3 block">{t('settings.whatsappEmbeddedSignup.select_signup_mode', 'Select Signup Mode')}</Label>
              <RadioGroup
                value={signupMode}
                onValueChange={(value) => setSignupMode(value as 'standard' | 'coexistence')}
                className="space-y-3"
              >
                <div className="flex items-start space-x-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary transition-colors">
                  <RadioGroupItem value="standard" id="mode-standard" className="mt-1" />
                  <label
                    htmlFor="mode-standard"
                    className="flex-1 cursor-pointer"
                  >
                    <div className="font-medium text-sm">{t('settings.whatsappEmbeddedSignup.mode_new_account', 'New WhatsApp Business Account')}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {t('settings.whatsappEmbeddedSignup.mode_new_account_desc', "Create a new WhatsApp Business API account through Meta's embedded signup")}
                    </div>
                  </label>
                </div>
                <div className="flex items-start space-x-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary transition-colors">
                  <RadioGroupItem value="coexistence" id="mode-coexistence" className="mt-1" />
                  <label
                    htmlFor="mode-coexistence"
                    className="flex-1 cursor-pointer"
                  >
                    <div className="font-medium text-sm">{t('settings.whatsappEmbeddedSignup.mode_existing_app', 'Existing WhatsApp Business App')}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {t('settings.whatsappEmbeddedSignup.mode_existing_app_desc', 'Connect your existing WhatsApp Business app (Coexistence mode). Your app will sync with the Cloud API.')}
                    </div>
                  </label>
                </div>
              </RadioGroup>
              {signupMode === 'coexistence' && (
                <div className="mt-3">
                  <div className="flex p-2 text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800">
                    <i className="ri-information-line mt-0.5 mr-2"></i>
                    <p className="text-xs">
                      <strong>{t('settings.whatsappEmbeddedSignup.note', 'Note:')}</strong> {t('settings.whatsappEmbeddedSignup.note_coexistence', 'When using Coexistence mode, some features like disappearing messages, broadcast lists, and message edit/revoke will be disabled.')}
                    </p>
                  </div>
                </div>
              )}
            </div>
            
            <div>
              <Label htmlFor="connectionName">{t('settings.whatsappEmbeddedSignup.connection_name', 'Connection Name')}</Label>
              <Input
                id="connectionName"
                value={connectionName}
                onChange={(e) => setConnectionName(e.target.value)}
                placeholder={t('settings.whatsappEmbeddedSignup.connection_name_placeholder', 'e.g. My WhatsApp Business')}
                className="mt-1"
                required
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t('settings.whatsappEmbeddedSignup.connection_name_hint', 'Give your WhatsApp connection a name to easily identify it')}
              </p>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="terms" 
                checked={terms.acceptTerms}
                onCheckedChange={(checked) => handleTermsChange(checked === true)}
              />
              <label
                htmlFor="terms"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                {t('settings.whatsappEmbeddedSignup.agree_terms', 'I agree to the ')}
                <a href="https://www.whatsapp.com/legal/business-terms" target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/90">WhatsApp Business API Terms of Service</a>
              </label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="privacy" 
                checked={terms.acceptPrivacyPolicy}
                onCheckedChange={(checked) => handlePrivacyPolicyChange(checked === true)}
              />
              <label
                htmlFor="privacy"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                {t('settings.whatsappEmbeddedSignup.agree_privacy', 'I agree to the ')}
                <a href="https://www.facebook.com/privacy/policy/" target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/90">Meta Privacy Policy</a>
              </label>
            </div>
          </div>
        </div>
        
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={loading}
          >
            {t('settings.whatsappEmbeddedSignup.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={launchSignup}
            disabled={loading || !sdkInitialized || !configValid || configLoading || !connectionName.trim()}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('settings.whatsappEmbeddedSignup.connecting', 'Connecting...')}
              </>
            ) : (
              <>
                <i className="ri-facebook-fill w-4 h-4 mr-2 text-white-600"></i>
                {t('settings.whatsappEmbeddedSignup.easy_signup', 'Easy Signup')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}