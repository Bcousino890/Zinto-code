import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Loader2, Edit, Eye, EyeOff } from 'lucide-react';

interface EditWhatsAppBusinessApiFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  connectionId: number;
}

interface BusinessApiFormData {
  accountName: string;
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
  appId: string;
  appSecret: string;
  webhookUrl: string;
  verifyToken: string;
}

export function EditWhatsAppBusinessApiForm({ isOpen, onClose, onSuccess, connectionId }: EditWhatsAppBusinessApiFormProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAppSecret, setShowAppSecret] = useState(false);
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [isTestingTemplate, setIsTestingTemplate] = useState(false);
  
  const [formData, setFormData] = useState<BusinessApiFormData>({
    accountName: '',
    phoneNumberId: '',
    businessAccountId: '',
    accessToken: '',
    appId: '',
    appSecret: '',
    webhookUrl: '',
    verifyToken: 'default_verify_token'
  });


  useEffect(() => {
    if (isOpen && connectionId) {
      loadWhatsAppConfiguration();
    }
  }, [isOpen, connectionId]);


  useEffect(() => {
    const currentDomain = window.location.origin;
    const webhookUrl = `${currentDomain}/api/webhooks/whatsapp`;
    setFormData(prev => ({ ...prev, webhookUrl }));
  }, []);

  const loadWhatsAppConfiguration = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/channel-connections/${connectionId}`, {
        method: 'GET',
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 404) {
          throw new Error(errorData.message || t('settings.whatsapp_business_api.error_not_found', 'WhatsApp connection not found.'));
        } else if (response.status === 403) {
          throw new Error(errorData.message || t('settings.whatsapp_business_api.error_access_denied', 'Access denied. You do not have permission to edit this connection.'));
        } else {
          throw new Error(errorData.message || t('settings.email_channel.error_server', 'Server error: {{status}}. Please try again later.', { status: response.status }));
        }
      }

      const connection = await response.json();
      if (connection && connection.connectionData) {
        const data = connection.connectionData;
        const currentDomain = window.location.origin;
        const webhookUrl = `${currentDomain}/api/webhooks/whatsapp`;
        
        setFormData({
          accountName: connection.accountName || '',
          phoneNumberId: data.phoneNumberId || '',
          businessAccountId: data.businessAccountId || data.wabaId || '',
          accessToken: '', // Don't populate for security
          appId: data.appId || '',
          appSecret: '', // Don't populate for security
          webhookUrl: data.webhookUrl || webhookUrl,
          verifyToken: data.verifyToken || 'default_verify_token'
        });
      }
    } catch (error: any) {
      console.error('Error loading WhatsApp configuration:', error);
      toast({
        title: t('common.error', 'Error'),
        description: error.message || t('settings.whatsapp_business_api.load_failed_desc', 'Failed to load WhatsApp configuration'),
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const validateCredentials = async () => {
    if (!formData.accessToken || !formData.phoneNumberId) {
      toast({
        title: t('whatsapp_business.validation_error', 'Validation Error'),
        description: t('whatsapp_business.required_fields', 'Access Token and Phone Number ID are required for validation.'),
        variant: "destructive"
      });
      return false;
    }

    setIsValidating(true);
    try {
      const response = await fetch(`https://graph.facebook.com/v25.0/${formData.phoneNumberId}?access_token=${formData.accessToken}`);

      if (response.ok) {
        const data = await response.json();
        toast({
          title: t('whatsapp_business.credentials_valid', 'Credentials Valid'),
          description: t('whatsapp_business.validation_success', 'Successfully validated phone number: {{phoneNumber}}', { phoneNumber: data.display_phone_number || formData.phoneNumberId }),
        });
        return true;
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || t('whatsapp_business.invalid_credentials', 'Invalid credentials'));
      }
    } catch (error: any) {
      toast({
        title: t('whatsapp_business.validation_failed', 'Validation Failed'),
        description: error.message || t('whatsapp_business.validation_failed_desc', 'Failed to validate WhatsApp Business API credentials.'),
        variant: "destructive"
      });
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  const testTemplate = async () => {
    if (!testPhone) {
      toast({
        title: t('whatsapp_business.test_error', 'Test Error'),
        description: t('whatsapp_business.phone_required', 'Please enter a phone number to test the template message.'),
        variant: "destructive"
      });
      return;
    }

    if (!connectionId) {
      toast({
        title: t('whatsapp_business.test_error', 'Test Error'),
        description: t('settings.whatsapp_business_api.connection_id_required', 'Connection ID is required for testing.'),
        variant: "destructive"
      });
      return;
    }

    setIsTestingTemplate(true);
    try {
      const testResponse = await fetch(`/api/whatsapp/test-template/${connectionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          phoneNumber: testPhone,
          templateName: 'hello_world',
          languageCode: 'en_US'
        })
      });

      if (testResponse.ok) {
        const result = await testResponse.json();
        toast({
          title: t('whatsapp_business.template_test_successful', 'Template Test Successful'),
          description: t('whatsapp_business.template_test_success_desc', 'Template message sent successfully to {{phone}}. Message ID: {{messageId}}', { phone: testPhone, messageId: result.messageId }),
        });
      } else {
        const errorData = await testResponse.json();
        let errorMessage = errorData.error || t('whatsapp_business.template_send_failed_fallback', 'Failed to send template message');


        if (errorMessage.includes('131030') || errorMessage.includes('not in allowed list')) {
          errorMessage = t('whatsapp_business.phone_not_allowed_error', 'Phone number not in allowed list. Please add this number to your Meta for Developers dashboard under "Phone numbers" section, or use a number that\'s already approved.');
        } else if (errorMessage.includes('131026') || errorMessage.includes('template')) {
          errorMessage = t('whatsapp_business.template_not_approved_error', 'Template message error. Make sure the "hello_world" template is approved in your WhatsApp Business Manager.');
        }

        throw new Error(errorMessage);
      }
    } catch (error: any) {
      toast({
        title: t('whatsapp_business.template_test_failed', 'Template Test Failed'),
        description: error.message || t('whatsapp_business.template_test_failed_desc', 'Failed to send template message.'),
        variant: "destructive"
      });
    } finally {
      setIsTestingTemplate(false);
    }
  };

  const testWebhookConnection = async () => {
    if (!formData.webhookUrl || !formData.verifyToken) {
      toast({
        title: t('whatsapp_business.test_error', 'Test Error'),
        description: t('whatsapp_business.webhook_required', 'Webhook URL and verify token are required for testing.'),
        variant: "destructive"
      });
      return;
    }

    setIsValidating(true);
    try {
      const response = await fetch('/api/whatsapp/test-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          webhookUrl: formData.webhookUrl,
          verifyToken: formData.verifyToken
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        toast({
          title: t('whatsapp_business.webhook_test_successful', 'Webhook Test Successful!'),
          description: t('settings.whatsapp_business_api.webhook_test_success_desc', 'Your webhook configuration is working correctly.'),
        });
      } else {
        toast({
          title: t('whatsapp_business.webhook_test_failed', 'Webhook Test Failed'),
          description: result.message || t('whatsapp_business.webhook_test_failed_desc', 'Please check your webhook configuration and try again.'),
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Webhook test error:', error);
      toast({
        title: t('whatsapp_business.test_failed', 'Test Failed'),
        description: t('whatsapp_business.network_error', 'Network error. Please check your connection and try again.'),
        variant: "destructive"
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {

      if (formData.accessToken) {
        const isValid = await validateCredentials();
        if (!isValid) {
          setIsSubmitting(false);
          return;
        }
      }

      const updateData: any = {
        accountName: formData.accountName,
        connectionData: {
          phoneNumberId: formData.phoneNumberId,
          businessAccountId: formData.businessAccountId,
          wabaId: formData.businessAccountId,
          appId: formData.appId,
          webhookUrl: formData.webhookUrl,
          verifyToken: formData.verifyToken
        }
      };


      if (formData.accessToken) {
        updateData.accessToken = formData.accessToken;
        updateData.connectionData.accessToken = formData.accessToken;
      }
      if (formData.appSecret) {
        updateData.connectionData.appSecret = formData.appSecret;
      }

      const response = await fetch(`/api/channel-connections/${connectionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(updateData)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || t('settings.whatsapp_business_api.update_failed', 'Failed to update WhatsApp Business API connection'));
      }
      
      toast({
        title: t('settings.whatsapp_business_api.updated_title', 'WhatsApp Business API Updated'),
        description: t('settings.whatsapp_business_api.updated_desc', 'Your WhatsApp Business API connection has been updated successfully!'),
      });
      
      onSuccess();
      handleClose();
      
    } catch (error: any) {
      console.error('Error updating WhatsApp Business API:', error);
      toast({
        title: t('settings.whatsapp_business_api.update_error_title', 'Update Error'),
        description: error.message || t('settings.whatsapp_business_api.update_failed', 'Failed to update WhatsApp Business API connection'),
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting && !isValidating) {
      onClose();
    }
  };

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[600px]">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">{t('settings.whatsapp_business_api.loading_configuration', 'Loading WhatsApp configuration...')}</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5 text-green-500" />
            {t('settings.whatsapp_business_api.edit_title', 'Edit WhatsApp Business API')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">{t('email.basic_configuration', 'Basic Configuration')}</h3>
            
            <div className="grid gap-2">
              <Label htmlFor="accountName">{t('whatsapp_business.account_name', 'Account Name')}</Label>
              <Input
                id="accountName"
                name="accountName"
                value={formData.accountName}
                onChange={handleInputChange}
                placeholder={t('whatsapp_business.account_name_placeholder', 'e.g. My Business')}
                required
              />
              <p className="text-sm text-gray-500">
                {t('whatsapp_business.account_name_help', 'A name to identify this connection')}
              </p>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="phoneNumberId">{t('whatsapp_business.phone_number_id', 'Phone Number ID')}</Label>
              <Input
                id="phoneNumberId"
                name="phoneNumberId"
                value={formData.phoneNumberId}
                onChange={handleInputChange}
                placeholder="1234567890"
                required
              />
              <p className="text-sm text-gray-500">
                {t('whatsapp_business.phone_number_id_help', 'From Meta for Developers dashboard')}
              </p>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="businessAccountId">{t('whatsapp_business.business_account_id', 'Business Account ID')}</Label>
              <Input
                id="businessAccountId"
                name="businessAccountId"
                value={formData.businessAccountId}
                onChange={handleInputChange}
                placeholder="1234567890"
                required
              />
            </div>
          </div>

          {/* Authentication */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">{t('whatsapp.connection_diagnostics.authentication', 'Authentication')}</h3>
            
            <div className="grid gap-2">
              <Label htmlFor="accessToken">{t('whatsapp_business.access_token', 'Access Token')}</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="accessToken"
                    name="accessToken"
                    type={showAccessToken ? "text" : "password"}
                    value={formData.accessToken}
                    onChange={handleInputChange}
                    placeholder={t('settings.whatsapp_business_api.access_token_placeholder', 'Leave empty to keep current token')}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowAccessToken(!showAccessToken)}
                  >
                    {showAccessToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={validateCredentials}
                  disabled={isValidating || !formData.accessToken || !formData.phoneNumberId}
                  className="whitespace-nowrap"
                >
                  {isValidating ? t('whatsapp_business.validating', 'Validating...') : t('whatsapp_business.test', 'Test')}
                </Button>
              </div>
              <p className="text-sm text-gray-500">
                {t('settings.whatsapp_business_api.access_token_help', 'Leave empty to keep the current access token unchanged')}
              </p>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="appId">{t('whatsapp_business.app_id', 'App ID')}</Label>
              <Input
                id="appId"
                name="appId"
                value={formData.appId}
                onChange={handleInputChange}
                placeholder="1234567890"
                required
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="appSecret">{t('whatsapp_business.app_secret', 'App Secret')}</Label>
              <div className="relative">
                <Input
                  id="appSecret"
                  name="appSecret"
                  type={showAppSecret ? "text" : "password"}
                  value={formData.appSecret}
                  onChange={handleInputChange}
                  placeholder={t('settings.whatsapp_business_api.app_secret_placeholder', 'Leave empty to keep current secret')}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowAppSecret(!showAppSecret)}
                >
                  {showAppSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-sm text-gray-500">
                {t('settings.whatsapp_business_api.app_secret_help', 'Leave empty to keep the current app secret unchanged')}
              </p>
            </div>
          </div>

          {/* Webhook Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">{t('settings.instagram_connection.webhook_configuration', 'Webhook Configuration')}</h3>
            
            <div className="grid gap-2">
              <Label htmlFor="webhookUrl">{t('whatsapp_business.webhook_url', 'Webhook URL')}</Label>
              <div className="flex gap-2">
                <Input
                  id="webhookUrl"
                  name="webhookUrl"
                  value={formData.webhookUrl}
                  onChange={handleInputChange}
                  placeholder={`${window.location.origin}/api/webhooks/whatsapp`}
                  required
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(formData.webhookUrl)}
                  className="whitespace-nowrap"
                >
                  {t('whatsapp_business.copy', 'Copy')}
                </Button>
              </div>
              <p className="text-sm text-gray-500">
                {t('whatsapp_business.webhook_url_help', 'Enter your webhook URL or use the auto-generated one. Copy this URL and paste it in your Meta for Developers dashboard under Webhooks configuration.')}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="verifyToken">{t('whatsapp_business.webhook_verify_token', 'Webhook Verify Token')}</Label>
              <div className="flex gap-2">
                <Input
                  id="verifyToken"
                  name="verifyToken"
                  value={formData.verifyToken}
                  onChange={handleInputChange}
                  placeholder={t('whatsapp_business.webhook_verify_token_placeholder', 'default_verify_token')}
                  required
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(formData.verifyToken)}
                  className="whitespace-nowrap"
                >
                  {t('whatsapp_business.copy', 'Copy')}
                </Button>
              </div>
              <p className="text-sm text-gray-500">
                {t('settings.whatsapp_business_api.verify_token_help', 'This token is stored with your WhatsApp Business API connection. Copy this token and paste it in the "Verify token" field in your Meta for Developers webhook configuration.')}
              </p>
              <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm text-green-800">
                  <strong>{t('settings.whatsapp_business_api.connection_token_label', '✅ Connection Token:')}</strong> {t('settings.whatsapp_business_api.connection_token_desc', 'This verify token is stored with your connection:')}
                  <code className="bg-green-100 px-1 rounded font-mono">{formData.verifyToken}</code>
                </p>
                <p className="text-sm text-green-800 mt-1">
                  {t('settings.whatsapp_business_api.token_instructions', 'Make sure this exact token is entered in your Meta Developer Console webhook configuration.')}
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>{t('whatsapp_business.test_webhook_config', 'Test Webhook Configuration')}</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={testWebhookConnection}
                  disabled={isValidating || !formData.webhookUrl || !formData.verifyToken}
                  className="whitespace-nowrap"
                >
                  {isValidating ? t('whatsapp_business.testing', 'Testing...') : t('whatsapp_business.test_webhook', 'Test Webhook')}
                </Button>
                <div className="flex-1 text-sm text-gray-600 flex items-center">
                  {t('settings.whatsapp_business_api.test_webhook_short_desc', 'Test your webhook configuration')}
                </div>
              </div>
              <p className="text-sm text-gray-500">
                {t('whatsapp_business.test_webhook_help', "This will verify that your webhook URL is accessible and responds correctly to Meta's verification requests.")}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="testPhone">{t('whatsapp_business.test_template_message', 'Test Template Message (Optional)')}</Label>
              <div className="flex gap-2">
                <Input
                  id="testPhone"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder={t('whatsapp_business.test_template_placeholder', '+1234567890')}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={testTemplate}
                  disabled={isTestingTemplate}
                  className="whitespace-nowrap"
                >
                  {isTestingTemplate ? t('whatsapp_business.testing', 'Testing...') : t('whatsapp_business.test', 'Test')}
                </Button>
              </div>
              <p className="text-sm text-gray-500">
                {t('whatsapp_business.test_template_help', 'Send a test "hello_world" template message to verify your connection is working. Enter a phone number with country code (e.g., +1234567890).')}
              </p>
              <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
                <p className="text-sm text-amber-800">
                  <strong>{t('settings.whatsapp_business_api.note_label', 'Note:')}</strong> {t('whatsapp_business.development_mode_note_desc', 'If your WhatsApp Business API is in development mode, you can only send messages to phone numbers that are added to the "allowed list" in your Meta for Developers dashboard.')}
                  <a
                    href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started#add-recipient-phone-numbers"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-amber-900"
                  >
                    {t('whatsapp_business.learn_more', 'Learn how to add phone numbers →')}
                  </a>
                </p>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={handleClose}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || isValidating}
              className="flex items-center gap-2"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Edit className="h-4 w-4" />
              )}
              {isSubmitting ? t('common.updating', 'Updating...') : t('settings.instagram_connection.update_connection', 'Update Connection')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
