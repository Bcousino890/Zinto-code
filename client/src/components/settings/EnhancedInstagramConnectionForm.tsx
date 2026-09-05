import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
import { 
  TestTube, 
  ExternalLink, 
  AlertCircle, 
  CheckCircle, 
  XCircle, 
  ChevronDown, 
  ChevronRight, 
  HelpCircle, 
  Zap, 
  Shield, 
  MessageSquare,
  Loader2,
  Copy,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';

interface InstagramFormData {
  accountName: string;
  instagramAccountId: string;
  accessToken: string;
  appId: string;
  appSecret: string;
  webhookUrl: string;
  verifyToken: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type SetupStep = 'intro' | 'meta-app' | 'credentials' | 'webhook' | 'test' | 'complete';

interface StepStatus {
  completed: boolean;
  error?: string;
}

export function EnhancedInstagramConnectionForm({ isOpen, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [currentStep, setCurrentStep] = useState<SetupStep>('intro');
  const [showPassword, setShowPassword] = useState(false);
  const [showAppSecret, setShowAppSecret] = useState(false);
  const [expandedHelp, setExpandedHelp] = useState<string | null>(null);
  
  const [stepStatus, setStepStatus] = useState<Record<SetupStep, StepStatus>>({
    intro: { completed: false },
    'meta-app': { completed: false },
    credentials: { completed: false },
    webhook: { completed: false },
    test: { completed: false },
    complete: { completed: false }
  });

  const [formData, setFormData] = useState<InstagramFormData>({
    accountName: '',
    instagramAccountId: '',
    accessToken: '',
    appId: '',
    appSecret: '',
    webhookUrl: `${window.location.origin}/api/webhooks/instagram`,
    verifyToken: `verify_${Math.random().toString(36).substr(2, 9)}`
  });

  const steps: Array<{ key: SetupStep; title: string; description: string }> = [
    { key: 'intro', title: t('settings.instagram.step_intro_title', 'Introduction'), description: t('settings.instagram.step_intro_desc', 'Overview of Instagram setup process') },
    { key: 'meta-app', title: t('settings.instagram.step_meta_app_title', 'Meta App Setup'), description: t('settings.instagram.step_meta_app_desc', 'Create and configure Meta Developer app') },
    { key: 'credentials', title: t('settings.instagram.step_credentials_title', 'Account Details'), description: t('settings.instagram.step_credentials_desc', 'Enter Instagram account information') },
    { key: 'webhook', title: t('settings.instagram_connection.webhook_configuration', 'Webhook Configuration'), description: t('settings.instagram.step_webhook_desc', 'Configure webhook settings') },
    { key: 'test', title: t('email.test_connection', 'Test Connection'), description: t('settings.instagram.step_test_desc', 'Verify everything is working') },
    { key: 'complete', title: t('emailCampaign.complete', 'Complete'), description: t('settings.instagram.step_complete_desc', 'Finalize Instagram connection') }
  ];

  const getCurrentStepIndex = () => steps.findIndex(step => step.key === currentStep);
  const getProgress = () => ((getCurrentStepIndex() + 1) / steps.length) * 100;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: t('settings.channel.embed_copied_title', 'Copied!'),
        description: t('settings.instagram.copied_to_clipboard', '{{label}} copied to clipboard', { label }),
      });
    } catch (err) {
      toast({
        title: t('admin.settings.copy_failed', 'Copy failed'),
        description: t('settings.instagram.copy_failed_desc', 'Please copy the text manually'),
        variant: "destructive",
      });
    }
  };

  const validateStep = (step: SetupStep): boolean => {
    switch (step) {
      case 'intro':
        return true;
      case 'meta-app':
        return formData.appId.trim() !== '' && formData.appSecret.trim() !== '';
      case 'credentials':
        return formData.accountName.trim() !== '' && 
               formData.instagramAccountId.trim() !== '' && 
               formData.accessToken.trim() !== '';
      case 'webhook':
        return formData.webhookUrl.trim() !== '' && formData.verifyToken.trim() !== '';
      case 'test':
        return stepStatus.test.completed;
      default:
        return false;
    }
  };

  const nextStep = () => {
    const currentIndex = getCurrentStepIndex();
    if (currentIndex < steps.length - 1) {
      const nextStepKey = steps[currentIndex + 1].key;
      setCurrentStep(nextStepKey);
      

      setStepStatus(prev => ({
        ...prev,
        [currentStep]: { completed: true }
      }));
    }
  };

  const prevStep = () => {
    const currentIndex = getCurrentStepIndex();
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1].key);
    }
  };

  const testWebhookConnection = async () => {
    setTestingWebhook(true);
    try {
      const response = await fetch('/api/instagram/test-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          webhookUrl: formData.webhookUrl,
          verifyToken: formData.verifyToken
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setStepStatus(prev => ({
          ...prev,
          test: { completed: true }
        }));
        toast({
          title: t('settings.instagram.webhook_test_successful', 'Webhook test successful!'),
          description: t('settings.whatsapp_business_api.webhook_test_success_desc', 'Your webhook configuration is working correctly.'),
        });
      } else {
        setStepStatus(prev => ({
          ...prev,
          test: { completed: false, error: result.message || t('settings.messenger_connection.webhook_test_failed_fallback', 'Webhook test failed') }
        }));
        toast({
          title: t('settings.instagram.webhook_test_failed', 'Webhook test failed'),
          description: result.message || t('settings.instagram.webhook_test_failed_desc', 'Please check your webhook configuration.'),
          variant: "destructive",
        });
      }
    } catch (error) {
      setStepStatus(prev => ({
        ...prev,
        test: { completed: false, error: t('settings.instagram.network_error_during_test', 'Network error during webhook test') }
      }));
      toast({
        title: t('whatsapp_business.test_failed', 'Test Failed'),
        description: t('settings.instagram.network_error', 'Network error. Please try again.'),
        variant: "destructive",
      });
    } finally {
      setTestingWebhook(false);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/channel-connections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channelType: 'instagram',
          accountId: formData.instagramAccountId,
          accountName: formData.accountName,
          accessToken: formData.accessToken,
          connectionData: {
            instagramAccountId: formData.instagramAccountId,
            appId: formData.appId,
            appSecret: formData.appSecret,
            webhookUrl: formData.webhookUrl,
            verifyToken: formData.verifyToken,
            features: {
              mediaMessages: true,
              stories: false,
              quickReplies: true,
              templates: true
            },
            settings: {
              autoResponses: false,
              messageTemplates: [],
              quickReplies: []
            }
          }
        })
      });

      if (response.ok) {
        const connection = await response.json();
        

        const connectResponse = await fetch(`/api/instagram/connect/${connection.id}`, {
          method: 'POST'
        });

        if (connectResponse.ok) {
          toast({
            title: t('settings.instagram.connected_successfully', 'Instagram connected successfully!'),
            description: t('settings.instagram.connected_successfully_desc', 'Your Instagram account is now connected and ready to use.'),
          });
          setCurrentStep('complete');
          onSuccess();
        } else {
          throw new Error(t('settings.instagram.establish_connection_failed', 'Failed to establish Instagram connection'));
        }
      } else {
        const error = await response.json();
        throw new Error(error.message || t('settings.twilio_voice.create_connection_failed', 'Failed to create connection'));
      }
    } catch (error: any) {
      toast({
        title: t('settings.instagram.connection_failed', 'Connection failed'),
        description: error.message || t('settings.instagram.connection_failed_desc', 'Please check your configuration and try again.'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 'intro':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <MessageSquare className="mx-auto h-16 w-16 text-pink-500 mb-4" />
              <h3 className="text-xl font-semibold mb-2">{t('settings.instagram.intro_title', 'Connect Your Instagram Account')}</h3>
              <p className="text-gray-600 mb-6">
                {t('settings.instagram.intro_description', 'This guided setup will help you connect your Instagram Business account to enable messaging capabilities.')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <Shield className="h-8 w-8 text-blue-500 mb-2" />
                  <h4 className="font-semibold mb-1">{t('settings.instagram.feature_secure_title', 'Secure')}</h4>
                  <p className="text-sm text-gray-600">{t('settings.instagram.feature_secure_desc', 'Your credentials are encrypted and stored securely')}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <Zap className="h-8 w-8 text-yellow-500 mb-2" />
                  <h4 className="font-semibold mb-1">{t('settings.instagram.feature_fast_title', 'Fast Setup')}</h4>
                  <p className="text-sm text-gray-600">{t('settings.instagram.feature_fast_desc', 'Complete setup in just a few minutes')}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <MessageSquare className="h-8 w-8 text-green-500 mb-2" />
                  <h4 className="font-semibold mb-1">{t('settings.instagram.feature_messaging_title', 'Rich Messaging')}</h4>
                  <p className="text-sm text-gray-600">{t('settings.instagram.feature_messaging_desc', 'Support for text, images, and quick replies')}</p>
                </CardContent>
              </Card>
            </div>

            <Alert>
              <HelpCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>{t('settings.instagram.prerequisites_label', 'Prerequisites:')}</strong> {t('settings.instagram.prerequisites_desc', "You'll need a Meta Developer account and an Instagram Business account. Don't worry - we'll guide you through each step!")}
              </AlertDescription>
            </Alert>
          </div>
        );

      case 'meta-app':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">{t('settings.instagram.meta_app_title', 'Meta Developer App Setup')}</h3>
              <p className="text-gray-600 mb-4">
                {t('settings.instagram.meta_app_description', 'First, you need to create a Meta Developer app to get your App ID and App Secret.')}
              </p>
            </div>

            <Collapsible 
              open={expandedHelp === 'meta-setup'} 
              onOpenChange={(open) => setExpandedHelp(open ? 'meta-setup' : null)}
            >
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <span className="flex items-center">
                    <HelpCircle className="h-4 w-4 mr-2" />
                    {t('settings.instagram.meta_setup_guide_toggle', 'Step-by-step Meta Developer setup guide')}
                  </span>
                  {expandedHelp === 'meta-setup' ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 mt-4">
                <Card>
                  <CardContent className="pt-4">
                    <ol className="list-decimal list-inside space-y-3 text-sm">
                      <li>{t('settings.instagram.meta_step_go_to', 'Go to')} <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center">{t('settings.instagram.meta_for_developers', 'Meta for Developers')} <ExternalLink className="h-3 w-3 ml-1" /></a></li>
                      <li>{t('settings.instagram.meta_step_create_app', 'Click "My Apps" and then "Create App"')}</li>
                      <li>{t('settings.instagram.meta_step_select_business', 'Select "Business" as the app type')}</li>
                      <li>{t('settings.instagram.meta_step_fill_details', 'Fill in your app details and create the app')}</li>
                      <li>{t('settings.instagram.meta_step_add_product', 'In the app dashboard, add the "Instagram Basic Display" product')}</li>
                      <li>{t('settings.instagram.meta_step_find_credentials', 'Go to App Settings → Basic to find your App ID and App Secret')}</li>
                      <li>{t('settings.instagram.meta_step_copy_credentials', 'Copy the App ID and App Secret to the form below')}</li>
                    </ol>
                  </CardContent>
                </Card>
              </CollapsibleContent>
            </Collapsible>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="appId">{t('settings.instagram_connection.app_id_label', 'App ID *')}</Label>
                <Input
                  id="appId"
                  name="appId"
                  value={formData.appId}
                  onChange={handleInputChange}
                  placeholder={t('settings.instagram.app_id_placeholder', 'Your Meta App ID')}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="appSecret">{t('settings.metaPartnerConfiguration.app_secret', 'App Secret *')}</Label>
                <div className="relative">
                  <Input
                    id="appSecret"
                    name="appSecret"
                    type={showAppSecret ? "text" : "password"}
                    value={formData.appSecret}
                    onChange={handleInputChange}
                    placeholder={t('settings.instagram.app_secret_placeholder', 'Your Meta App Secret')}
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowAppSecret(!showAppSecret)}
                  >
                    {showAppSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>

            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                {t('settings.instagram.app_secret_notice', 'Your App Secret will be encrypted and stored securely. Never share it publicly.')}
              </AlertDescription>
            </Alert>
          </div>
        );

      case 'credentials':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">{t('settings.instagram.account_details_title', 'Instagram Account Details')}</h3>
              <p className="text-gray-600 mb-4">
                {t('settings.instagram.account_details_description', 'Enter your Instagram Business account information and access token.')}
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="accountName">{t('settings.instagram.account_display_name_label', 'Account Display Name *')}</Label>
                <Input
                  id="accountName"
                  name="accountName"
                  value={formData.accountName}
                  onChange={handleInputChange}
                  placeholder={t('settings.instagram.account_display_name_placeholder', 'e.g., My Business Instagram')}
                  required
                />
                <p className="text-xs text-gray-500">{t('settings.instagram.account_display_name_help', 'This is how the connection will appear in your dashboard')}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="instagramAccountId">{t('settings.instagram_connection.instagram_account_id_label', 'Instagram Account ID *')}</Label>
                <Input
                  id="instagramAccountId"
                  name="instagramAccountId"
                  value={formData.instagramAccountId}
                  onChange={handleInputChange}
                  placeholder={t('settings.instagram.instagram_account_id_placeholder', 'Your Instagram Business Account ID')}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="accessToken">{t('settings.instagram_connection.access_token_label_required', 'Access Token *')}</Label>
                <div className="relative">
                  <Input
                    id="accessToken"
                    name="accessToken"
                    type={showPassword ? "text" : "password"}
                    value={formData.accessToken}
                    onChange={handleInputChange}
                    placeholder={t('settings.instagram.access_token_placeholder', 'Your long-lived page access token')}
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>

            <Collapsible
              open={expandedHelp === 'token-help'}
              onOpenChange={(open) => setExpandedHelp(open ? 'token-help' : null)}
            >
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <span className="flex items-center">
                    <HelpCircle className="h-4 w-4 mr-2" />
                    {t('settings.instagram.token_help_toggle', 'How to get your Instagram Account ID and Access Token')}
                  </span>
                  {expandedHelp === 'token-help' ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 mt-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-semibold mb-2">{t('settings.instagram.getting_account_id_title', 'Getting your Instagram Account ID:')}</h4>
                        <ol className="list-decimal list-inside space-y-1 text-sm">
                          <li>{t('settings.instagram.help_step_go_dashboard', 'Go to your Meta Developer app dashboard')}</li>
                          <li>{t('settings.instagram.help_step_navigate_basic_display', 'Navigate to Instagram Basic Display → Basic Display')}</li>
                          <li>{t('settings.instagram.help_step_account_id_listed', 'Your Instagram Account ID will be listed there')}</li>
                        </ol>
                      </div>
                      <div>
                        <h4 className="font-semibold mb-2">{t('settings.instagram.getting_access_token_title', 'Getting your Access Token:')}</h4>
                        <ol className="list-decimal list-inside space-y-1 text-sm">
                          <li>{t('settings.instagram.help_step_go_basic_display', 'In your Meta app, go to Instagram Basic Display')}</li>
                          <li>{t('settings.instagram.help_step_generate_token', 'Generate a long-lived access token')}</li>
                          <li>{t('settings.instagram.help_step_token_permissions', 'Make sure it has the necessary permissions for messaging')}</li>
                        </ol>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </CollapsibleContent>
            </Collapsible>
          </div>
        );

      case 'webhook':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">{t('settings.instagram_connection.webhook_configuration', 'Webhook Configuration')}</h3>
              <p className="text-gray-600 mb-4">
                {t('settings.instagram.webhook_description', 'Configure webhook settings to receive Instagram messages in real-time.')}
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="webhookUrl">{t('whatsapp_business.webhook_url', 'Webhook URL')}</Label>
                <div className="flex space-x-2">
                  <Input
                    id="webhookUrl"
                    name="webhookUrl"
                    value={formData.webhookUrl}
                    onChange={handleInputChange}
                    readOnly
                    className="bg-gray-50"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(formData.webhookUrl, t('whatsapp_business.webhook_url', 'Webhook URL'))}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-gray-500">{t('settings.instagram.webhook_url_help', 'This URL is automatically configured for your domain')}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="verifyToken">{t('settings.instagram.verify_token_label', 'Verify Token')}</Label>
                <div className="flex space-x-2">
                  <Input
                    id="verifyToken"
                    name="verifyToken"
                    value={formData.verifyToken}
                    onChange={handleInputChange}
                    placeholder={t('settings.instagram.verify_token_placeholder', 'Enter a verify token')}
                    required
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(formData.verifyToken, t('settings.instagram.verify_token_label', 'Verify Token'))}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-gray-500">{t('settings.instagram.verify_token_help', 'A random token has been generated for you')}</p>
              </div>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>{t('settings.instagram.important_label', 'Important:')}</strong> {t('settings.instagram.webhook_important_desc', "You'll need to configure these webhook settings in your Meta Developer app. Copy the URL and verify token to use in your Meta app webhook configuration.")}
              </AlertDescription>
            </Alert>

            <Collapsible
              open={expandedHelp === 'webhook-setup'}
              onOpenChange={(open) => setExpandedHelp(open ? 'webhook-setup' : null)}
            >
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <span className="flex items-center">
                    <HelpCircle className="h-4 w-4 mr-2" />
                    {t('settings.instagram.webhook_help_toggle', 'How to configure webhooks in Meta Developer Console')}
                  </span>
                  {expandedHelp === 'webhook-setup' ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 mt-4">
                <Card>
                  <CardContent className="pt-4">
                    <ol className="list-decimal list-inside space-y-2 text-sm">
                      <li>{t('settings.instagram.help_step_go_dashboard', 'Go to your Meta Developer app dashboard')}</li>
                      <li>{t('settings.instagram.webhook_step_navigate_configuration', 'Navigate to Instagram → Configuration')}</li>
                      <li>{t('settings.instagram.webhook_step_add_callback', 'In the Webhooks section, click "Add Callback URL"')}</li>
                      <li>{t('settings.instagram.webhook_step_paste_url', 'Paste the Webhook URL from above')}</li>
                      <li>{t('settings.instagram.webhook_step_enter_token', 'Enter the Verify Token from above')}</li>
                      <li>{t('settings.instagram.webhook_step_subscribe_messages', 'Subscribe to "messages" events')}</li>
                      <li>{t('settings.instagram.webhook_step_save', 'Save the configuration')}</li>
                    </ol>
                  </CardContent>
                </Card>
              </CollapsibleContent>
            </Collapsible>
          </div>
        );

      case 'test':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">{t('settings.instagram.test_title', 'Test Your Configuration')}</h3>
              <p className="text-gray-600 mb-4">
                {t('settings.instagram.test_description', "Let's test your webhook configuration to make sure everything is working correctly.")}
              </p>
            </div>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold">{t('settings.instagram.webhook_connection_test', 'Webhook Connection Test')}</h4>
                    <p className="text-sm text-gray-600">{t('settings.instagram.webhook_connection_test_desc', 'Verify that your webhook URL is accessible and configured correctly')}</p>
                  </div>
                  <Button
                    onClick={testWebhookConnection}
                    disabled={testingWebhook}
                    variant={stepStatus.test.completed ? "default" : "outline"}
                  >
                    {testingWebhook ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : stepStatus.test.completed ? (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    ) : (
                      <TestTube className="h-4 w-4 mr-2" />
                    )}
                    {testingWebhook ? t('settings.instagram_connection.testing_webhook', 'Testing...') : stepStatus.test.completed ? t('settings.instagram.test_passed', 'Test Passed') : t('whatsapp_business.test_webhook', 'Test Webhook')}
                  </Button>
                </div>

                {stepStatus.test.error && (
                  <Alert variant="destructive" className="mt-4">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>
                      {stepStatus.test.error}
                    </AlertDescription>
                  </Alert>
                )}

                {stepStatus.test.completed && (
                  <Alert className="mt-4">
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      {t('settings.instagram.test_success_alert', 'Webhook test successful! Your configuration is working correctly.')}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Alert>
              <HelpCircle className="h-4 w-4" />
              <AlertDescription>
                {t('settings.instagram.test_failure_hint', "If the test fails, please check that you've correctly configured the webhook URL and verify token in your Meta Developer app.")}
              </AlertDescription>
            </Alert>
          </div>
        );

      case 'complete':
        return (
          <div className="space-y-6 text-center">
            <div>
              <CheckCircle className="mx-auto h-16 w-16 text-green-500 mb-4" />
              <h3 className="text-xl font-semibold mb-2">{t('settings.instagram.complete_title', 'Instagram Connected Successfully!')}</h3>
              <p className="text-gray-600 mb-6">
                {t('settings.instagram.complete_description', 'Your Instagram Business account is now connected and ready to receive messages.')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <MessageSquare className="h-8 w-8 text-blue-500 mb-2 mx-auto" />
                  <h4 className="font-semibold mb-1">{t('settings.instagram.feature_message_management_title', 'Message Management')}</h4>
                  <p className="text-sm text-gray-600">{t('settings.instagram.feature_message_management_desc', 'Receive and respond to Instagram messages')}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <Zap className="h-8 w-8 text-yellow-500 mb-2 mx-auto" />
                  <h4 className="font-semibold mb-1">{t('settings.instagram.feature_rich_media_title', 'Rich Media')}</h4>
                  <p className="text-sm text-gray-600">{t('settings.instagram.feature_rich_media_desc', 'Send images, videos, and quick replies')}</p>
                </CardContent>
              </Card>
            </div>

            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>{t('settings.instagram.next_steps_label', 'Next steps:')}</strong> {t('settings.instagram.next_steps_desc', 'You can now start receiving Instagram messages. Visit the conversations page to see incoming messages and respond to your customers.')}
              </AlertDescription>
            </Alert>
          </div>
        );

      default:
        return <div>{t('settings.instagram.step_content_fallback', 'Step content for {{step}}', { step: currentStep })}</div>;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <MessageSquare className="h-5 w-5 mr-2 text-pink-500" />
            {t('settings.instagram.setup_dialog_title', 'Instagram Connection Setup')}
          </DialogTitle>
          <DialogDescription>
            {t('settings.instagram.setup_dialog_description', 'Connect your Instagram Business account to enable messaging')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{t('settings.instagram.step_progress', 'Step {{current}} of {{total}}', { current: getCurrentStepIndex() + 1, total: steps.length })}</span>
              <span>{t('settings.instagram.percent_complete', '{{percent}}% Complete', { percent: Math.round(getProgress()) })}</span>
            </div>
            <Progress value={getProgress()} className="w-full" />
          </div>

          {/* Step Indicators */}
          <div className="flex justify-between">
            {steps.map((step, index) => (
              <div key={step.key} className="flex flex-col items-center space-y-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  index <= getCurrentStepIndex() 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {stepStatus[step.key].completed ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span className="text-xs text-center max-w-16">{step.title}</span>
              </div>
            ))}
          </div>

          {/* Step Content */}
          <div className="min-h-[400px]">
            {renderStepContent()}
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          <Button
            variant="outline"
            onClick={prevStep}
            disabled={getCurrentStepIndex() === 0}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('common.pagination.previous', 'Previous')}
          </Button>
          
          <div className="flex space-x-2">
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel', 'Cancel')}
            </Button>
            
            {currentStep === 'complete' ? (
              <Button onClick={onClose}>
                <CheckCircle className="h-4 w-4 mr-2" />
                {t('erp.common.done', 'Done')}
              </Button>
            ) : currentStep === 'test' ? (
              <Button onClick={handleSubmit} disabled={loading || !validateStep(currentStep)}>
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                {t('settings.instagram.complete_setup_button', 'Complete Setup')}
              </Button>
            ) : (
              <Button
                onClick={nextStep}
                disabled={!validateStep(currentStep)}
              >
                {t('common.pagination.next', 'Next')}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
