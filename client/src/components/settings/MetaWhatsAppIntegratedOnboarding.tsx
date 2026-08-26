import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Loader2, ExternalLink, CheckCircle, AlertCircle } from 'lucide-react';
import { initFacebookSDK, setupWhatsAppSignupListener, launchWhatsAppSignup } from '@/lib/facebook-sdk';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function MetaWhatsAppIntegratedOnboarding({ isOpen, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [connectionName, setConnectionName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sdkInitialized, setSdkInitialized] = useState(false);
  const [partnerConfigured, setPartnerConfigured] = useState(false);
  const [isCheckingConfig, setIsCheckingConfig] = useState(false);
  const [partnerConfig, setPartnerConfig] = useState<any>(null);
  const [signupMode, setSignupMode] = useState<'standard' | 'coexistence'>('standard');

  useEffect(() => {
    if (isOpen) {
      checkPartnerConfiguration();
    }
  }, [isOpen]);

  const checkPartnerConfiguration = async () => {
    try {
      setIsCheckingConfig(true);
      const response = await fetch('/api/partner-configurations/meta/availability');
      
      if (response.ok) {
        const result = await response.json();
        setPartnerConfigured(result.isAvailable);
        
        if (result.isAvailable && result.config) {
          setPartnerConfig(result.config);
          await initializeFacebookSDK(result.config);
        }
      } else {
        setPartnerConfigured(false);
      }
    } catch (error) {
      console.error('Error checking Meta partner configuration:', error);
      setPartnerConfigured(false);
    } finally {
      setIsCheckingConfig(false);
    }
  };

  const initializeFacebookSDK = async (config: any) => {
    try {
      await initFacebookSDK(config.partnerApiKey);
      

      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setSdkInitialized(true);
      
      setupWhatsAppSignupListener((response: any) => {
        handleSignupResponse(response);
      });
      
    } catch (error) {
      console.error('Error initializing Facebook SDK:', error);
      toast({
        title: t('settings.whatsappOnboarding.toast_sdk_error', 'SDK Error'),
        description: t('settings.whatsappOnboarding.toast_sdk_error_desc', 'Failed to initialize Facebook SDK'),
        variant: "destructive"
      });
    }
  };

  const handleSignupResponse = (response: any) => {

    if (response.status === 'connected') {

      processSignupCallback(response).catch((error) => {
        console.error('Error processing signup callback:', error);
        toast({
          title: t('settings.whatsappOnboarding.toast_signup_error', 'Signup Error'),
          description: t('settings.whatsappOnboarding.toast_signup_error_process', 'Failed to process WhatsApp Business account signup'),
          variant: "destructive"
        });
      });
    } else {
      console.error('Signup was not completed successfully:', response);
      toast({
        title: t('settings.whatsappOnboarding.toast_signup_error', 'Signup Error'),
        description: t('settings.whatsappOnboarding.toast_signup_error_incomplete', 'WhatsApp signup was not completed successfully'),
        variant: "destructive"
      });
    }
  };

  const processSignupCallback = async (signupData: any) => {
    try {
      setIsSubmitting(true);
      
      const response = await fetch('/api/channel-connections/meta-whatsapp-embedded-signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          connectionName,
          signupData,
          signupMode
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to process signup');
      }

      const result = await response.json();
      
      toast({
        title: t('settings.whatsappOnboarding.toast_success', 'Success!'),
        description: t('settings.whatsappOnboarding.toast_success_desc', 'WhatsApp Business account connected successfully. {{count}} phone number(s) configured.', { count: result.phoneNumbers?.length || 0 })
      });

      onSuccess();
      onClose();

    } catch (error) {
      console.error('Error processing signup callback:', error);
      toast({
        title: t('settings.whatsappOnboarding.toast_error', 'Error'),
        description: error instanceof Error ? error.message : t('settings.whatsappOnboarding.toast_error_process_signup', 'Failed to process signup'),
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartOnboarding = async () => {
    if (!connectionName.trim()) {
      toast({
        title: t('settings.whatsappOnboarding.toast_error', 'Error'),
        description: t('settings.whatsappOnboarding.toast_error_connection_name', 'Please enter a connection name'),
        variant: "destructive"
      });
      return;
    }

    if (!sdkInitialized) {
      toast({
        title: t('settings.whatsappOnboarding.toast_error', 'Error'),
        description: t('settings.whatsappOnboarding.toast_error_sdk_not_init', 'Facebook SDK not initialized'),
        variant: "destructive"
      });
      return;
    }

    try {
      if (!partnerConfig?.configId) {
        toast({
          title: t('settings.whatsappOnboarding.toast_config_error', 'Configuration Error'),
          description: t('settings.whatsappOnboarding.toast_config_error_config_id', 'WhatsApp Configuration ID is not set in partner configuration'),
          variant: "destructive"
        });
        return;
      }


      if (!window.FB) {
        toast({
          title: t('settings.whatsappOnboarding.toast_sdk_error', 'SDK Error'),
          description: t('settings.whatsappOnboarding.toast_sdk_not_available', 'Facebook SDK is not available. Please refresh the page and try again.'),
          variant: "destructive"
        });
        return;
      }
      
      await launchWhatsAppSignup(partnerConfig.configId, handleSignupResponse, signupMode);
    } catch (error) {
      console.error('Error launching WhatsApp signup:', error);
      const errorMessage = error instanceof Error ? error.message : t('settings.whatsappOnboarding.toast_error_launch', 'Failed to launch WhatsApp signup');
      toast({
        title: t('settings.whatsappOnboarding.toast_error', 'Error'),
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setSignupMode('standard');
      onClose();
    }
  };

  if (isCheckingConfig) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">{t('settings.whatsappOnboarding.checking_config', 'Checking configuration...')}</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!partnerConfigured) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <AlertCircle className="h-5 w-5 text-yellow-500 dark:text-yellow-400 mr-2" />
              {t('settings.whatsappOnboarding.config_required', 'Configuration Required')}
            </DialogTitle>
            <DialogDescription>
              {t('settings.whatsappOnboarding.config_required_desc', 'Meta WhatsApp Business API Partner integration is not configured. Please contact your system administrator to set up the Partner API credentials.')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={handleClose} variant="outline">
              {t('settings.whatsappOnboarding.close', 'Close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('settings.whatsappOnboarding.title', 'Meta WhatsApp Business API - Easy Setup')}</DialogTitle>
          <DialogDescription>
            {t('settings.whatsappOnboarding.description', 'Connect your WhatsApp Business account in just a few clicks using our integrated onboarding flow.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="connectionName">{t('settings.whatsappOnboarding.connection_name', 'Connection Name')}</Label>
            <Input
              id="connectionName"
              value={connectionName}
              onChange={(e) => setConnectionName(e.target.value)}
              placeholder={t('settings.whatsappOnboarding.connection_name_placeholder', 'e.g., Main WhatsApp Business')}
              disabled={isSubmitting}
            />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {t('settings.whatsappOnboarding.connection_name_hint', 'Give this connection a memorable name')}
            </p>
          </div>

          <div>
            <Label className="text-sm font-medium mb-3 block">
              {t('settings.whatsappEmbeddedSignup.select_signup_mode', 'Select Signup Mode')}
            </Label>
            <RadioGroup
              value={signupMode}
              onValueChange={(value) => setSignupMode(value as 'standard' | 'coexistence')}
              className="space-y-3"
            >
              <div className="flex items-start space-x-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary transition-colors">
                <RadioGroupItem value="standard" id="integrated-mode-standard" className="mt-1" />
                <label
                  htmlFor="integrated-mode-standard"
                  className="flex-1 cursor-pointer"
                >
                  <div className="font-medium text-sm">
                    {t('settings.whatsappEmbeddedSignup.mode_new_account', 'New WhatsApp Business Account')}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t(
                      'settings.whatsappEmbeddedSignup.mode_new_account_desc',
                      "Create a new WhatsApp Business API account through Meta's embedded signup"
                    )}
                  </div>
                </label>
              </div>
              <div className="flex items-start space-x-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary transition-colors">
                <RadioGroupItem value="coexistence" id="integrated-mode-coexistence" className="mt-1" />
                <label
                  htmlFor="integrated-mode-coexistence"
                  className="flex-1 cursor-pointer"
                >
                  <div className="font-medium text-sm">
                    {t('settings.whatsappEmbeddedSignup.mode_existing_app', 'Existing WhatsApp Business App')}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t(
                      'settings.whatsappEmbeddedSignup.mode_existing_app_desc',
                      'Connect your existing WhatsApp Business app (Coexistence mode). Your app will sync with the Cloud API.'
                    )}
                  </div>
                </label>
              </div>
            </RadioGroup>
            {signupMode === 'coexistence' && (
              <div className="mt-3">
                <div className="flex p-2 text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800">
                  <i className="ri-information-line mt-0.5 mr-2"></i>
                  <p className="text-xs">
                    <strong>{t('settings.whatsappEmbeddedSignup.note', 'Note:')}</strong>{' '}
                    {t(
                      'settings.whatsappEmbeddedSignup.note_coexistence',
                      'When using Coexistence mode, some features like disappearing messages, broadcast lists, and message edit/revoke will be disabled.'
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 dark:text-blue-300 mb-2">{t('settings.whatsappOnboarding.what_happens_next', 'What happens next:')}</h4>
            <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
              <li>• {t('settings.whatsappOnboarding.step_connect_meta', 'Connect your Meta Business account')}</li>
              <li>• {t('settings.whatsappOnboarding.step_select_whatsapp', 'Select your WhatsApp Business account')}</li>
              <li>• {t('settings.whatsappOnboarding.step_choose_numbers', 'Choose phone numbers to integrate')}</li>
              <li>• {t('settings.whatsappOnboarding.step_auto_setup', 'Automatic configuration and setup')}</li>
            </ul>
          </div>

          {window.location.protocol !== 'https:' && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <div className="flex items-center">
                <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mr-2" />
                <div>
                  <h4 className="font-medium text-yellow-900 dark:text-yellow-300">{t('settings.whatsappOnboarding.https_required', 'HTTPS Required')}</h4>
                  <p className="text-sm text-yellow-800 dark:text-yellow-300 mt-1">
                    {t('settings.whatsappOnboarding.https_required_desc', 'WhatsApp signup requires HTTPS. Please access this application over HTTPS (https://) instead of HTTP.')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {!sdkInitialized && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <div className="flex items-center">
                <Loader2 className="h-4 w-4 text-yellow-600 dark:text-yellow-400 animate-spin mr-2" />
                <span className="text-sm text-yellow-800 dark:text-yellow-300">{t('settings.whatsappOnboarding.initializing_sdk', 'Initializing Facebook SDK...')}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button 
            onClick={handleClose} 
            variant="outline" 
            disabled={isSubmitting}
            className="w-full sm:w-auto"
          >
            {t('settings.whatsappOnboarding.cancel', 'Cancel')}
          </Button>
          <Button 
            onClick={handleStartOnboarding}
            disabled={isSubmitting || !sdkInitialized || !connectionName.trim() || window.location.protocol !== 'https:'}
            className="w-full sm:w-auto"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('settings.whatsappOnboarding.processing', 'Processing...')}
              </>
            ) : (
              <>
                <ExternalLink className="w-4 h-4 mr-2" />
                {t('settings.whatsappOnboarding.start_easy_setup', 'Start Easy Setup')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
