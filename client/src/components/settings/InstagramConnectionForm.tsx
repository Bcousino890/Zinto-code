import React, { useState } from 'react';
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
import { TestTube, ExternalLink, AlertCircle } from 'lucide-react';

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

export function InstagramConnectionForm({ isOpen, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [formData, setFormData] = useState<InstagramFormData>({
    accountName: '',
    instagramAccountId: '',
    accessToken: '',
    appId: '',
    appSecret: '',
    webhookUrl: `${window.location.origin}/api/webhooks/instagram`,
    verifyToken: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const validateWebhookUrl = (url: string): boolean => {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'https:' && urlObj.pathname.includes('/api/webhooks/instagram');
    } catch {
      return false;
    }
  };

  const testWebhookConnection = async () => {
    if (!formData.webhookUrl || !formData.verifyToken) {
      toast({
        title: t('settings.instagram_connection.validation_error', 'Validation Error'),
        description: t('settings.instagram_connection.webhook_required_error', 'Please fill in webhook URL and verify token first.'),
        variant: "destructive"
      });
      return;
    }

    if (!validateWebhookUrl(formData.webhookUrl)) {
      toast({
        title: t('settings.instagram_connection.invalid_webhook_url', 'Invalid Webhook URL'),
        description: t('settings.instagram_connection.invalid_webhook_url_description', 'Webhook URL must be HTTPS and point to /api/webhooks/instagram endpoint.'),
        variant: "destructive"
      });
      return;
    }

    setTestingWebhook(true);
    try {
      const response = await fetch('/api/instagram/test-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          webhookUrl: formData.webhookUrl,
          verifyToken: formData.verifyToken
        })
      });

      if (response.ok) {
        toast({
          title: t('settings.instagram_connection.webhook_test_successful', 'Webhook Test Successful'),
          description: t('settings.instagram_connection.webhook_test_successful_description', 'Your webhook configuration is valid and reachable.'),
        });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Webhook test failed');
      }
    } catch (error: any) {
      toast({
        title: t('settings.instagram_connection.webhook_test_failed', 'Webhook Test Failed'),
        description: error.message || t('settings.instagram_connection.webhook_test_failed_description', 'Could not validate webhook configuration.'),
        variant: "destructive"
      });
    } finally {
      setTestingWebhook(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!formData.accountName || !formData.instagramAccountId || !formData.accessToken || !formData.appId || !formData.appSecret || !formData.webhookUrl || !formData.verifyToken) {
      toast({
        title: t('settings.instagram_connection.validation_error', 'Validation Error'),
        description: t('settings.instagram_connection.required_fields_error', 'Please fill in all required fields.'),
        variant: "destructive"
      });
      setLoading(false);
      return;
    }
    
    try {
      const response = await fetch('/api/channel-connections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
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
            verifyToken: formData.verifyToken
          }
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create Instagram connection');
      }

      await response.json();
      
      toast({
        title: t('settings.instagram_connection.connected_title', 'Instagram Connected'),
        description: t('settings.instagram_connection.connected_description', 'Your Instagram account has been connected successfully.'),
      });

      setFormData({
        accountName: '',
        instagramAccountId: '',
        accessToken: '',
        appId: '',
        appSecret: '',
        webhookUrl: `${window.location.origin}/api/webhooks/instagram`,
        verifyToken: ''
      });

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error creating Instagram connection:', error);
      toast({
        title: t('settings.instagram_connection.connection_failed', 'Connection Failed'),
        description: error.message || t('settings.instagram_connection.connection_failed_description', 'Failed to connect Instagram account. Please check your credentials and try again.'),
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('settings.instagram_connection.connect_title', 'Connect Instagram Business Account')}</DialogTitle>
          <DialogDescription>
            {t('settings.instagram_connection.connect_description', "Connect your Instagram Business account to receive and send direct messages. You'll need your Meta for Developers credentials.")}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="accountName">{t('settings.instagram_connection.account_name_label', 'Account Name *')}</Label>
              <Input
                id="accountName"
                name="accountName"
                value={formData.accountName}
                onChange={handleInputChange}
                placeholder={t('settings.instagram_connection.account_name_placeholder', 'e.g. My Instagram Business')}
                required
              />
              <p className="text-sm text-gray-500">
                {t('settings.instagram_connection.account_name_help', 'A name to identify this connection')}
              </p>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="instagramAccountId">{t('settings.instagram_connection.instagram_account_id_label', 'Instagram Account ID *')}</Label>
              <Input
                id="instagramAccountId"
                name="instagramAccountId"
                value={formData.instagramAccountId}
                onChange={handleInputChange}
                placeholder="1234567890"
                required
              />
              <p className="text-sm text-gray-500">
                {t('settings.instagram_connection.instagram_account_id_help', 'Your Instagram Business Account ID from Meta for Developers')}
              </p>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="appSecret">{t('settings.instagram_connection.instagram_app_secret_label_required', 'Instagram app secret *')}</Label>
              <Input
                id="appSecret"
                name="appSecret"
                type="password"
                value={formData.appSecret}
                onChange={handleInputChange}
                placeholder={t('settings.instagram_connection.app_secret_placeholder', 'Your app secret')}
                required
              />
              <p className="text-sm text-gray-500">
                {t('settings.instagram_connection.app_secret_help', 'Required for receiving messages. Use the Instagram app secret for Instagram-Login apps, or the Facebook app secret for Facebook-Login apps.')}
              </p>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="accessToken">{t('settings.instagram_connection.access_token_label_required', 'Access Token *')}</Label>
              <Input
                id="accessToken"
                name="accessToken"
                type="password"
                value={formData.accessToken}
                onChange={handleInputChange}
                placeholder={t('settings.instagram_connection.access_token_placeholder', 'Your page access token')}
                required
              />
              <p className="text-sm text-gray-500">
                {t('settings.instagram_connection.access_token_help', 'Long-lived page access token from Meta for Developers')}
              </p>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="appId">{t('settings.instagram_connection.app_id_label', 'App ID *')}</Label>
              <Input
                id="appId"
                name="appId"
                value={formData.appId}
                onChange={handleInputChange}
                placeholder={t('settings.instagram_connection.app_id_placeholder', 'Your app ID')}
                required
              />
              <p className="text-sm text-gray-500">
                {t('settings.instagram_connection.app_id_help', 'Your Meta app ID')}
              </p>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">{t('settings.instagram_connection.webhook_configuration', 'Webhook Configuration')}</h4>

              <div className="grid gap-2">
                <Label htmlFor="webhookUrl">{t('settings.instagram_connection.webhook_url_label', 'Webhook URL *')}</Label>
                <Input
                  id="webhookUrl"
                  name="webhookUrl"
                  value={formData.webhookUrl}
                  onChange={handleInputChange}
                  placeholder="https://yourdomain.com/api/webhooks/instagram"
                  required
                />
                <p className="text-sm text-gray-500">
                  {t('settings.instagram_connection.webhook_url_help', 'This URL will receive webhook events from Meta. Configure this in your Meta Developer Console.')}
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="verifyToken">{t('settings.instagram_connection.verify_token_label', 'Webhook Verify Token *')}</Label>
                <Input
                  id="verifyToken"
                  name="verifyToken"
                  value={formData.verifyToken}
                  onChange={handleInputChange}
                  placeholder={t('settings.instagram_connection.verify_token_placeholder', 'Enter a secure verify token')}
                  required
                />
                <p className="text-sm text-gray-500">
                  {t('settings.instagram_connection.verify_token_help', 'A secure token for webhook verification. Use the same token in your Meta Developer Console.')}
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={testWebhookConnection}
                  disabled={testingWebhook || !formData.webhookUrl || !formData.verifyToken}
                  className="flex items-center gap-2"
                >
                  <TestTube className="h-4 w-4" />
                  {testingWebhook ? t('settings.instagram_connection.testing_webhook', 'Testing...') : t('settings.instagram_connection.test_webhook', 'Test Webhook')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => window.open('https://developers.facebook.com/docs/instagram-basic-display-api/webhooks', '_blank')}
                  className="flex items-center gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  {t('settings.instagram_connection.meta_docs', 'Meta Docs')}
                </Button>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">{t('settings.instagram_connection.setup_instructions', 'Setup Instructions:')}</p>
                    <ol className="list-decimal list-inside space-y-1 text-xs">
                      <li>{t('settings.instagram_connection.setup_step_configure_webhook', 'Configure the webhook URL and verify token in your Meta Developer Console')}</li>
                      <li>{t('settings.instagram_connection.setup_step_subscribe_fields', "Subscribe to 'messages' and 'message_reactions' webhook fields")}</li>
                      <li>{t('settings.instagram_connection.setup_step_test_webhook', 'Test the webhook connection using the button above')}</li>
                      <li>{t('settings.instagram_connection.setup_step_permissions', 'Ensure your Instagram Business account has the necessary permissions')}</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline"  onClick={onClose}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" variant="outline" className="btn-brand-primary" disabled={loading}>
              {loading ? t('settings.instagram_connection.connecting', 'Connecting...') : t('settings.instagram_connection.connect_instagram', 'Connect Instagram')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
