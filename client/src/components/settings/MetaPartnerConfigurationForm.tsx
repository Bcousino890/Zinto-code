import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Loader2, CheckCircle, Copy, RefreshCw, ChevronDown, ChevronUp, ExternalLink, AlertCircle } from 'lucide-react';
import { MetaWhatsAppIntegratedOnboarding } from './MetaWhatsAppIntegratedOnboarding';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface MetaPartnerConfigFormData {
  appId: string;
  appSecret: string;
  businessManagerId: string;
  webhookVerifyToken: string;
  accessToken: string;
  configId: string;
  instagramConfigId: string;
  messengerConfigId: string;
  metaChannelsConfigId: string;
  webhookUrl: string;
  instagramWebhookUrl: string;
  messengerWebhookUrl: string;
}

interface ValidationErrors {
  appId?: string;
  businessManagerId?: string;
  configId?: string;
  webhookUrl?: string;
  instagramWebhookUrl?: string;
  messengerWebhookUrl?: string;
}

const CHANNEL_STATUS_OK =
  'rounded border p-3 border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-200';
const CHANNEL_STATUS_MISSING =
  'rounded border p-3 border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200';
const PROSE_CODE =
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-foreground';

function channelConfigStatus(formData: MetaPartnerConfigFormData): {
  whatsapp: 'ok' | 'missing';
  instagram: 'ok' | 'missing' | 'shared';
  messenger: 'ok' | 'missing' | 'shared';
} {
  const shared = Boolean(formData.metaChannelsConfigId?.trim());
  return {
    whatsapp: formData.configId?.trim() ? 'ok' : 'missing',
    instagram: shared ? 'shared' : formData.instagramConfigId?.trim() ? 'ok' : 'missing',
    messenger: shared ? 'shared' : formData.messengerConfigId?.trim() ? 'ok' : 'missing',
  };
}

export function MetaPartnerConfigurationForm({ isOpen, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [existingConfig, setExistingConfig] = useState<any>(null);
  const [showTestOnboarding, setShowTestOnboarding] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

  const [formData, setFormData] = useState<MetaPartnerConfigFormData>({
    appId: '',
    appSecret: '',
    businessManagerId: '',
    webhookVerifyToken: '',
    accessToken: '',
    configId: '',
    instagramConfigId: '',
    messengerConfigId: '',
    metaChannelsConfigId: '',
    webhookUrl: '',
    instagramWebhookUrl: '',
    messengerWebhookUrl: '',
  });

  useEffect(() => {
    if (isOpen) {
      loadExistingConfiguration();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const origin = window.location.origin;
      setFormData(prev => ({
        ...prev,
        webhookUrl: prev.webhookUrl || `${origin}/api/webhooks/meta-whatsapp`,
        instagramWebhookUrl: prev.instagramWebhookUrl || `${origin}/api/webhooks/instagram`,
        messengerWebhookUrl: prev.messengerWebhookUrl || `${origin}/api/webhooks/messenger`,
      }));
    }
  }, [isOpen]);

  const loadExistingConfiguration = async () => {
    try {
      setIsLoading(true);
      
      const response = await fetch('/api/admin/partner-configurations/meta');
      
      if (response.ok) {
        const config = await response.json();
        setExistingConfig(config);
        
        const origin = window.location.origin;
        
        setFormData({
          appId: config.partnerApiKey || '',
          appSecret: config.partnerSecret || '',
          businessManagerId: config.partnerId || '',
          webhookVerifyToken: config.webhookVerifyToken || '',
          accessToken: config.accessToken || '',
          configId: config.configId || '',
          instagramConfigId: config.instagramConfigId || '',
          messengerConfigId: config.messengerConfigId || '',
          metaChannelsConfigId: config.metaChannelsConfigId || '',
          webhookUrl: config.partnerWebhookUrl || `${origin}/api/webhooks/meta-whatsapp`,
          instagramWebhookUrl: config.instagramWebhookUrl || `${origin}/api/webhooks/instagram`,
          messengerWebhookUrl: config.messengerWebhookUrl || `${origin}/api/webhooks/messenger`,
        });
      } else if (response.status !== 404) {
        throw new Error(t('settings.metaPartnerConfiguration.toast_load_failed', 'Failed to load existing configuration'));
      }
    } catch (error) {
      toast({
        title: t('settings.metaPartnerConfiguration.toast_error', 'Error'),
        description: t('settings.metaPartnerConfiguration.toast_load_failed', 'Failed to load existing configuration'),
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const generateWebhookVerifyToken = async () => {
    try {
      const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
      let token = '';
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      for (let i = 0; i < array.length; i++) {
        token += chars[array[i] % chars.length];
      }
      
      setFormData(prev => ({ ...prev, webhookVerifyToken: token }));
      toast({
        title: t('settings.metaPartnerConfiguration.toast_token_generated', 'Token Generated'),
        description: t('settings.metaPartnerConfiguration.toast_token_generated_desc', 'A new webhook verify token has been generated'),
      });
    } catch (error) {
      toast({
        title: t('settings.metaPartnerConfiguration.toast_error', 'Error'),
        description: t('settings.metaPartnerConfiguration.toast_generate_token_failed', 'Failed to generate token'),
        variant: "destructive"
      });
    }
  };

  const copyToClipboard = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    toast({
      title: t('settings.metaPartnerConfiguration.toast_copied', 'Copied'),
      description: t('settings.metaPartnerConfiguration.toast_copied_desc', '{{label}} copied to clipboard', { label }),
    });
  };

  const validateField = (name: string, value: string) => {
    const errors: ValidationErrors = { ...validationErrors };

    switch (name) {
      case 'appId':
        if (value && !/^\d+$/.test(value)) {
          errors.appId = t('settings.metaPartnerConfiguration.validation_app_id_numeric', 'App ID must be numeric');
        } else {
          delete errors.appId;
        }
        break;
      case 'businessManagerId':
        if (value && !/^\d+$/.test(value)) {
          errors.businessManagerId = t('settings.metaPartnerConfiguration.validation_business_manager_id_numeric', 'Business Manager ID must be numeric');
        } else {
          delete errors.businessManagerId;
        }
        break;
      case 'configId':
        if (value && value.length < 10) {
          errors.configId = t('settings.metaPartnerConfiguration.validation_config_id_short', 'Configuration ID appears to be too short');
        } else {
          delete errors.configId;
        }
        break;
      case 'webhookUrl':
      case 'instagramWebhookUrl':
      case 'messengerWebhookUrl':
        if (value && !value.startsWith('https://')) {
          errors[name as keyof ValidationErrors] = t('settings.metaPartnerConfiguration.validation_webhook_https', 'Webhook URL must use HTTPS');
        } else {
          delete errors[name as keyof ValidationErrors];
        }
        break;
    }

    setValidationErrors(errors);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    validateField(name, value);
  };

  const testWebhook = async () => {
    if (!formData.webhookUrl) {
      toast({
        title: t('settings.metaPartnerConfiguration.toast_error', 'Error'),
        description: t('settings.metaPartnerConfiguration.validation_webhook_required', 'Webhook URL is required'),
        variant: "destructive"
      });
      return;
    }

    try {
      setIsTestingWebhook(true);
      
      const response = await fetch('/api/admin/partner-configurations/test-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          webhookUrl: formData.webhookUrl,
          webhookVerifyToken: formData.webhookVerifyToken
        })
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: t('settings.metaPartnerConfiguration.toast_webhook_test_success', 'Webhook Test Successful'),
          description: t('settings.metaPartnerConfiguration.toast_webhook_test_success_desc', 'Webhook test was successful'),
        });
      } else {
        toast({
          title: t('settings.metaPartnerConfiguration.toast_webhook_test_failed', 'Webhook Test Failed'),
          description: result.error || t('settings.metaPartnerConfiguration.toast_webhook_not_reachable', 'Webhook is not reachable'),
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: t('settings.metaPartnerConfiguration.toast_error', 'Error'),
        description: t('settings.metaPartnerConfiguration.toast_test_webhook_failed', 'Failed to test webhook'),
        variant: "destructive"
      });
    } finally {
      setIsTestingWebhook(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.appId || !formData.appSecret || !formData.businessManagerId) {
      toast({
        title: t('settings.metaPartnerConfiguration.toast_error', 'Error'),
        description: t('settings.metaPartnerConfiguration.validation_required_credentials', 'App ID, App Secret, and Business Manager ID are required'),
        variant: "destructive"
      });
      return;
    }

    try {
      setIsSubmitting(true);

      let webhookVerifyToken = formData.webhookVerifyToken;
      if (!webhookVerifyToken) {
        const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
        let token = '';
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        for (let i = 0; i < array.length; i++) {
          token += chars[array[i] % chars.length];
        }
        webhookVerifyToken = token;
      }

      const optionalMetaChannelConfigId = (value: string | undefined): string | null => {
        const trimmed = value?.trim();
        return trimmed ? trimmed : null;
      };

      const configData = {
        provider: 'meta',
        partnerApiKey: formData.appId.trim(),
        partnerSecret: formData.appSecret.trim(),
        partnerId: formData.businessManagerId.trim(),
        webhookVerifyToken: webhookVerifyToken,
        accessToken: formData.accessToken?.trim() || undefined,
        configId: formData.configId?.trim() || undefined,
        instagramConfigId: optionalMetaChannelConfigId(formData.instagramConfigId),
        messengerConfigId: optionalMetaChannelConfigId(formData.messengerConfigId),
        metaChannelsConfigId: optionalMetaChannelConfigId(formData.metaChannelsConfigId),
        partnerWebhookUrl: formData.webhookUrl.trim(),
        instagramWebhookUrl: formData.instagramWebhookUrl.trim(),
        messengerWebhookUrl: formData.messengerWebhookUrl.trim(),
        redirectUrl: `${window.location.origin}/settings/channels/meta/callback`,
        isActive: true,
        apiVersion: 'v25.0'
      };

      const url = existingConfig 
        ? `/api/admin/partner-configurations/${existingConfig.id}`
        : '/api/admin/partner-configurations';
      
      const method = existingConfig ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(configData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || t('settings.metaPartnerConfiguration.toast_save_failed', 'Failed to save configuration')
        );
      }

      toast({
        title: t('settings.metaPartnerConfiguration.toast_success', 'Success'),
        description: existingConfig
          ? t('settings.metaPartnerConfiguration.toast_updated_success', 'Meta Partner API configuration updated successfully')
          : t('settings.metaPartnerConfiguration.toast_created_success', 'Meta Partner API configuration created successfully')
      });

      onSuccess();
      onClose();

    } catch (error) {
      toast({
        title: t('settings.metaPartnerConfiguration.toast_error', 'Error'),
        description: error instanceof Error ? error.message : t('settings.metaPartnerConfiguration.toast_save_failed', 'Failed to save configuration'),
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  const channelStatus = channelConfigStatus(formData);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('settings.metaPartnerConfiguration.title', 'Meta Partner Configuration')}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2 text-foreground">{t('settings.metaPartnerConfiguration.loading_configuration', 'Loading configuration...')}</span>
          </div>
        ) : (
          <div className={`space-y-6 ${PROSE_CODE}`}>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-amber-700 dark:text-amber-400 mt-0.5 shrink-0" />
                <div className="space-y-2 text-sm text-amber-900 dark:text-amber-200 [&_strong]:text-amber-950 dark:[&_strong]:text-amber-100">
                  <p className="font-medium">{t('settings.metaPartnerConfiguration.production_checklist_title', 'Production readiness checklist')}</p>
                  <ul className="list-disc pl-5 space-y-1 text-xs">
                    <li>
                      <strong>{t('settings.metaPartnerConfiguration.production_checklist_configuration_missing', 'Configuration missing: WhatsApp needs configId; Instagram and Messenger need a shared metaChannelsConfigId (preferred) or channel-specific Facebook Login for Business configuration IDs.')}</strong>
                    </li>
                    <li>
                      <strong>{t('settings.metaPartnerConfiguration.production_checklist_permission_restricted', 'Permission restricted: Standard Access limits external users. Complete Meta App Review and request Advanced Access for every permission in your Login for Business configuration.')}</strong>
                    </li>
                    <li>
                      <strong>{t('settings.metaPartnerConfiguration.production_checklist_app_review_pending', 'App review pending: Instagram and Messenger onboarding is blocked for users outside test roles until App Review is approved. Use Facebook Login for Business scopes only — do not mix instagram_business_* Instagram Login scopes with this flow.')}</strong>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className={channelStatus.whatsapp === 'ok' ? CHANNEL_STATUS_OK : CHANNEL_STATUS_MISSING}>
                <p className="font-medium">{t('settings.metaPartnerConfiguration.channel_whatsapp', 'WhatsApp')}</p>
                <p className="mt-0.5 opacity-90">{channelStatus.whatsapp === 'ok' ? t('settings.metaPartnerConfiguration.status_config_id_set', 'Configuration ID set') : t('settings.metaPartnerConfiguration.status_missing_whatsapp_config_id', 'Missing WhatsApp configId')}</p>
              </div>
              <div className={channelStatus.instagram !== 'missing' ? CHANNEL_STATUS_OK : CHANNEL_STATUS_MISSING}>
                <p className="font-medium">{t('settings.metaPartnerConfiguration.channel_instagram', 'Instagram')}</p>
                <p className="mt-0.5 opacity-90">
                  {channelStatus.instagram === 'ok' && t('settings.metaPartnerConfiguration.status_dedicated_config_id_set', 'Dedicated config ID set')}
                  {channelStatus.instagram === 'shared' && t('settings.metaPartnerConfiguration.status_using_shared_config_id', 'Using shared metaChannelsConfigId (overrides channel-specific ID)')}
                  {channelStatus.instagram === 'missing' && t('settings.metaPartnerConfiguration.status_missing_login_business_config_id', 'Missing Login for Business config ID')}
                </p>
              </div>
              <div className={channelStatus.messenger !== 'missing' ? CHANNEL_STATUS_OK : CHANNEL_STATUS_MISSING}>
                <p className="font-medium">{t('settings.metaPartnerConfiguration.channel_messenger', 'Messenger')}</p>
                <p className="mt-0.5 opacity-90">
                  {channelStatus.messenger === 'ok' && t('settings.metaPartnerConfiguration.status_dedicated_config_id_set', 'Dedicated config ID set')}
                  {channelStatus.messenger === 'shared' && t('settings.metaPartnerConfiguration.status_using_shared_config_id', 'Using shared metaChannelsConfigId (overrides channel-specific ID)')}
                  {channelStatus.messenger === 'missing' && t('settings.metaPartnerConfiguration.status_missing_login_business_config_id', 'Missing Login for Business config ID')}
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="border border-border rounded-lg">
                <button
                  type="button"
                  onClick={() => setShowInstructions(!showInstructions)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors"
                >
                  <h3 className="text-lg font-medium text-foreground">{t('settings.metaPartnerConfiguration.setup_instructions_title', 'Meta App Setup Instructions')}</h3>
                  {showInstructions ? (
                    <ChevronUp className="h-5 w-5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
                  )}
                </button>
                {showInstructions && (
                  <div className="p-4 border-t border-border space-y-4 text-sm text-muted-foreground">
                    <ol className="list-decimal pl-5 space-y-2">
                      <li>
                        {t('settings.metaPartnerConfiguration.setup_step_go_to_meta_prefix', 'Go to')}{' '}
                        <a
                          href="https://developers.facebook.com/apps"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 underline hover:text-blue-700 dark:hover:text-blue-300"
                        >
                          {t('settings.metaPartnerConfiguration.setup_step_go_to_meta_link', 'Meta for Developers')}
                        </a>{' '}
                        {t('settings.metaPartnerConfiguration.setup_step_go_to_meta_suffix', 'and create or select your app')}
                      </li>
                      <li>
                        {t('settings.metaPartnerConfiguration.setup_step_add_products', 'Add the products you need: WhatsApp, Messenger, Instagram, and')}{' '}
                        <strong className="text-foreground">
                          {t(
                            'settings.metaPartnerConfiguration.setup_step_add_products_facebook_login_business',
                            'Facebook Login for Business'
                          )}
                        </strong>
                      </li>
                      <li>
                        {t(
                          'settings.metaPartnerConfiguration.setup_step_open_login_business_prefix',
                          'In the Meta App Dashboard, open Facebook Login for Business and'
                        )}{' '}
                        <a
                          href="https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business#create-a-configuration"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 underline hover:text-blue-700 dark:hover:text-blue-300"
                        >
                          {t(
                            'settings.metaPartnerConfiguration.setup_step_open_login_business_link',
                            'create or edit a Login for Business configuration'
                          )}
                        </a>
                      </li>
                      <li>{t('settings.metaPartnerConfiguration.setup_step_configure_permissions', 'Configure permissions and asset selection in each Meta configuration (WhatsApp embedded signup uses its own configuration ID; Instagram and Messenger may share one or use separate IDs)')}</li>
                      <li>
                        {t('settings.metaPartnerConfiguration.setup_step_copy_config_id_prefix', 'Copy the generated')}{' '}
                        <code>config_id</code>{' '}
                        {t('settings.metaPartnerConfiguration.setup_step_copy_config_id_suffix', 'from each configuration into the fields below')}
                      </li>
                      <li>{t('settings.metaPartnerConfiguration.setup_step_request_advanced_access', 'Request Advanced Access through App Review before using the flow with external SaaS customers')}</li>
                      <li>{t('settings.metaPartnerConfiguration.setup_step_configure_webhooks', 'Configure separate webhook callback URLs per channel below unless your platform intentionally supports one verified multi-channel webhook endpoint')}</li>
                    </ol>

                    <div className="rounded-md border border-border bg-muted/40 p-3 space-y-3">
                      <p className="font-medium text-foreground">{t('settings.metaPartnerConfiguration.required_permissions_title', 'Required Meta dashboard permissions')}</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-border text-left text-foreground">
                              <th className="py-1 pr-3 font-medium">{t('settings.metaPartnerConfiguration.table_channel', 'Channel')}</th>
                              <th className="py-1 pr-3 font-medium">{t('settings.metaPartnerConfiguration.table_meta_products', 'Meta products')}</th>
                              <th className="py-1 font-medium">{t('settings.metaPartnerConfiguration.table_permissions', 'Permissions')}</th>
                            </tr>
                          </thead>
                          <tbody className="align-top">
                            <tr className="border-b border-border/60">
                              <td className="py-2 pr-3">{t('settings.metaPartnerConfiguration.channel_messenger_page_connection', 'Messenger / Page connection')}</td>
                              <td className="py-2 pr-3">{t('settings.metaPartnerConfiguration.products_messenger', 'Facebook Login for Business, Messenger, Webhooks')}</td>
                              <td className="py-2"><code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>pages_manage_metadata</code>, <code>pages_messaging</code></td>
                            </tr>
                            <tr className="border-b border-border/60">
                              <td className="py-2 pr-3">{t('settings.metaPartnerConfiguration.channel_instagram_facebook_login', 'Instagram via Facebook Login')}</td>
                              <td className="py-2 pr-3">{t('settings.metaPartnerConfiguration.products_instagram', 'Facebook Login for Business, Instagram Graph API or Instagram API with Facebook Login, Webhooks')}</td>
                              <td className="py-2"><code>instagram_basic</code>, <code>instagram_manage_messages</code>, <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>pages_manage_metadata</code></td>
                            </tr>
                            <tr>
                              <td className="py-2 pr-3">{t('settings.metaPartnerConfiguration.channel_instagram_messaging_webhooks', 'Instagram messaging webhooks')}</td>
                              <td className="py-2 pr-3">{t('settings.metaPartnerConfiguration.products_same_instagram', 'Same as Instagram above')}</td>
                              <td className="py-2">{t('settings.metaPartnerConfiguration.instagram_webhooks_permissions_note', 'Include pages_messaging if your implementation subscribes to Instagram messaging through Page-related webhook workflows')}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs">
                        {t('settings.metaPartnerConfiguration.business_management_note', 'Include business_management only if your backend continues to use /me/businesses or business asset discovery.')}
                      </p>
                      <div className="text-xs space-y-1">
                        <p className="font-medium text-foreground">{t('settings.metaPartnerConfiguration.optional_instagram_permissions_title', 'Optional Instagram permissions — request only if your SaaS uses the feature:')}</p>
                        <ul className="list-disc pl-5 space-y-0.5">
                          <li>{t('settings.metaPartnerConfiguration.optional_instagram_comments', 'instagram_manage_comments — comment management')}</li>
                          <li>{t('settings.metaPartnerConfiguration.optional_instagram_publish', 'instagram_content_publish — publishing')}</li>
                          <li>{t('settings.metaPartnerConfiguration.optional_instagram_insights', 'instagram_manage_insights — analytics/insights')}</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-medium text-foreground">{t('settings.metaPartnerConfiguration.tech_provider_credentials', 'Tech Provider Credentials')}</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="appId">{t('settings.metaPartnerConfiguration.app_id', 'App ID *')}</Label>
                    <Input id="appId" name="appId" value={formData.appId} onChange={handleInputChange} placeholder={t('settings.metaPartnerConfiguration.app_id_placeholder', 'Your Meta App ID')} required className={validationErrors.appId ? 'border-red-500 dark:border-red-400' : ''} />
                    {validationErrors.appId && <p className="text-sm text-red-500 dark:text-red-400 mt-1">{validationErrors.appId}</p>}
                  </div>
                  <div>
                    <Label htmlFor="appSecret">{t('settings.metaPartnerConfiguration.app_secret', 'App Secret *')}</Label>
                    <Input id="appSecret" name="appSecret" type="password" value={formData.appSecret} onChange={handleInputChange} placeholder={t('settings.metaPartnerConfiguration.app_secret_placeholder', 'Your Meta App Secret')} required />
                  </div>
                </div>

                <div>
                  <Label htmlFor="businessManagerId">{t('settings.metaPartnerConfiguration.business_manager_id', 'Business Manager ID *')}</Label>
                  <Input id="businessManagerId" name="businessManagerId" value={formData.businessManagerId} onChange={handleInputChange} placeholder={t('settings.metaPartnerConfiguration.business_manager_id_placeholder', 'Your Business Manager ID')} required className={validationErrors.businessManagerId ? 'border-red-500 dark:border-red-400' : ''} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="webhookVerifyToken">{t('settings.metaPartnerConfiguration.webhook_verify_token', 'Webhook Verify Token')}</Label>
                    <div className="flex gap-2">
                      <Input id="webhookVerifyToken" name="webhookVerifyToken" value={formData.webhookVerifyToken} onChange={handleInputChange} placeholder={t('settings.metaPartnerConfiguration.webhook_verify_token_placeholder', 'Webhook verification token')} className="flex-1" />
                      <Button type="button" variant="outline" onClick={generateWebhookVerifyToken} title={t('settings.metaPartnerConfiguration.generate_secure_random_token', 'Generate secure random token')}>
                        {formData.webhookVerifyToken ? <RefreshCw className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="accessToken">{t('settings.metaPartnerConfiguration.system_user_access_token', 'System User Access Token')}</Label>
                    <Input id="accessToken" name="accessToken" type="password" value={formData.accessToken} onChange={handleInputChange} placeholder={t('settings.metaPartnerConfiguration.system_user_access_token_placeholder', 'System user access token')} />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-medium text-foreground">{t('settings.metaPartnerConfiguration.channel_configuration_ids', 'Channel Configuration IDs')}</h3>
                <p className="text-sm text-muted-foreground">{t('settings.metaPartnerConfiguration.channel_configuration_ids_desc', 'Use Facebook Login for Business configuration IDs from the Meta App Dashboard. WhatsApp keeps the existing embedded signup configuration ID.')}</p>

                <div>
                  <Label htmlFor="configId">{t('settings.metaPartnerConfiguration.whatsapp_configuration_id', 'WhatsApp Configuration ID')}</Label>
                  <Input id="configId" name="configId" value={formData.configId} onChange={handleInputChange} placeholder={t('settings.metaPartnerConfiguration.whatsapp_configuration_id_placeholder', 'WhatsApp embedded signup Configuration ID')} className={validationErrors.configId ? 'border-red-500 dark:border-red-400' : ''} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="instagramConfigId">{t('settings.metaPartnerConfiguration.instagram_configuration_id', 'Instagram Configuration ID')}</Label>
                    <Input id="instagramConfigId" name="instagramConfigId" value={formData.instagramConfigId} onChange={handleInputChange} placeholder={t('settings.metaPartnerConfiguration.instagram_configuration_id_placeholder', 'Login for Business config for Instagram')} />
                  </div>
                  <div>
                    <Label htmlFor="messengerConfigId">{t('settings.metaPartnerConfiguration.messenger_configuration_id', 'Messenger Configuration ID')}</Label>
                    <Input id="messengerConfigId" name="messengerConfigId" value={formData.messengerConfigId} onChange={handleInputChange} placeholder={t('settings.metaPartnerConfiguration.messenger_configuration_id_placeholder', 'Login for Business config for Messenger')} />
                  </div>
                </div>

                <div>
                  <Label htmlFor="metaChannelsConfigId">{t('settings.metaPartnerConfiguration.shared_meta_channels_configuration_id', 'Shared Meta Channels Configuration ID (optional)')}</Label>
                  <Input id="metaChannelsConfigId" name="metaChannelsConfigId" value={formData.metaChannelsConfigId} onChange={handleInputChange} placeholder={t('settings.metaPartnerConfiguration.shared_meta_channels_configuration_id_placeholder', 'Shared Login for Business config for Instagram and Messenger')} />
                  <p className="text-xs text-muted-foreground mt-1">{t('settings.metaPartnerConfiguration.shared_meta_channels_precedence', 'Takes precedence over channel-specific Instagram and Messenger IDs when set.')}</p>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-medium text-foreground">{t('settings.metaPartnerConfiguration.webhook_urls', 'Webhook URLs')}</h3>

                <div>
                  <Label htmlFor="webhookUrl">{t('settings.metaPartnerConfiguration.whatsapp_webhook_url', 'WhatsApp Webhook URL')}</Label>
                  <div className="flex gap-2">
                    <Input id="webhookUrl" name="webhookUrl" value={formData.webhookUrl} onChange={handleInputChange} className={validationErrors.webhookUrl ? 'border-red-500 dark:border-red-400' : ''} />
                    <Button type="button" variant="outline" onClick={() => copyToClipboard(formData.webhookUrl, t('settings.metaPartnerConfiguration.whatsapp_webhook_url', 'WhatsApp Webhook URL'))}><Copy className="w-4 h-4" /></Button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="instagramWebhookUrl">{t('settings.metaPartnerConfiguration.instagram_webhook_url', 'Instagram Webhook URL')}</Label>
                  <div className="flex gap-2">
                    <Input id="instagramWebhookUrl" name="instagramWebhookUrl" value={formData.instagramWebhookUrl} onChange={handleInputChange} className={validationErrors.instagramWebhookUrl ? 'border-red-500 dark:border-red-400' : ''} />
                    <Button type="button" variant="outline" onClick={() => copyToClipboard(formData.instagramWebhookUrl, t('settings.metaPartnerConfiguration.instagram_webhook_url', 'Instagram Webhook URL'))}><Copy className="w-4 h-4" /></Button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="messengerWebhookUrl">{t('settings.metaPartnerConfiguration.messenger_webhook_url', 'Messenger Webhook URL')}</Label>
                  <div className="flex gap-2">
                    <Input id="messengerWebhookUrl" name="messengerWebhookUrl" value={formData.messengerWebhookUrl} onChange={handleInputChange} className={validationErrors.messengerWebhookUrl ? 'border-red-500 dark:border-red-400' : ''} />
                    <Button type="button" variant="outline" onClick={() => copyToClipboard(formData.messengerWebhookUrl, t('settings.metaPartnerConfiguration.messenger_webhook_url', 'Messenger Webhook URL'))}><Copy className="w-4 h-4" /></Button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <Button type="button" variant="outline" onClick={testWebhook} disabled={isTestingWebhook || !formData.webhookUrl} className="flex-1">
                  {isTestingWebhook ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                  {t('settings.metaPartnerConfiguration.test_whatsapp_webhook', 'Test WhatsApp Webhook')}
                </Button>
                <Button type="submit" disabled={isSubmitting} className="flex-1">
                  {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                  {existingConfig ? t('settings.metaPartnerConfiguration.update_configuration', 'Update Configuration') : t('settings.metaPartnerConfiguration.save_configuration', 'Save Configuration')}
                </Button>
              </div>
            </form>
          </div>
        )}
      </DialogContent>

      <MetaWhatsAppIntegratedOnboarding
        isOpen={showTestOnboarding}
        onClose={() => setShowTestOnboarding(false)}
        onSuccess={() => {
          setShowTestOnboarding(false);
          toast({
            title: t('settings.metaPartnerConfiguration.toast_test_success', 'Test Successful'),
            description: t('settings.metaPartnerConfiguration.toast_test_success_desc', 'The embedded signup flow is working correctly!'),
          });
        }}
      />
    </Dialog>
  );
}
