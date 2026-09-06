import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Loader2, Mail, TestTube, Eye, EyeOff, Edit } from 'lucide-react';

interface EditEmailChannelFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  connectionId: number;
}

interface EmailFormData {
  connectionName: string;
  emailAddress: string;
  displayName: string;
  signature: string;
  imapHost: string;
  imapPort: string;
  imapSecure: boolean;
  imapUsername: string;
  imapPassword: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUsername: string;
  smtpPassword: string;
  syncFolder: string;
  maxSyncMessages: string;
  useOAuth2: boolean;
  oauth2ClientId: string;
  oauth2ClientSecret: string;
  oauth2RefreshToken: string;
}

export function EditEmailChannelForm({ isOpen, onClose, onSuccess, connectionId }: EditEmailChannelFormProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showImapPassword, setShowImapPassword] = useState(false);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  
  const [formData, setFormData] = useState<EmailFormData>({
    connectionName: '',
    emailAddress: '',
    displayName: '',
    signature: '',
    imapHost: '',
    imapPort: '993',
    imapSecure: true,
    imapUsername: '',
    imapPassword: '',
    smtpHost: '',
    smtpPort: '465',
    smtpSecure: true,
    smtpUsername: '',
    smtpPassword: '',
    syncFolder: 'INBOX',
    maxSyncMessages: '100',
    useOAuth2: false,
    oauth2ClientId: '',
    oauth2ClientSecret: '',
    oauth2RefreshToken: ''
  });


  useEffect(() => {
    if (isOpen && connectionId) {
      loadEmailConfiguration();
    }
  }, [isOpen, connectionId]);

  const loadEmailConfiguration = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/email/config/${connectionId}`, {
        method: 'GET',
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 404) {
          throw new Error(errorData.message || t('settings.email_channel.error_not_found', 'Email configuration not found. Please check if the email channel is properly configured.'));
        } else if (response.status === 403) {
          throw new Error(errorData.message || t('settings.email_channel.error_access_denied', 'Access denied. You do not have permission to edit this email channel.'));
        } else if (response.status === 401) {
          throw new Error(errorData.message || t('settings.email_channel.error_authentication_required', 'Authentication required. Please log in again.'));
        } else {
          throw new Error(errorData.message || t('settings.email_channel.error_server', 'Server error: {{status}}. Please try again later.', { status: response.status }));
        }
      }

      const result = await response.json();
      if (result.success && result.data) {
        const config = result.data;
        setFormData({
          connectionName: config.connectionName || '',
          emailAddress: config.emailAddress || '',
          displayName: config.displayName || '',
          signature: config.signature || '',
          imapHost: config.imapHost || '',
          imapPort: config.imapPort?.toString() || '993',
          imapSecure: config.imapSecure !== false,
          imapUsername: config.imapUsername || '',
          imapPassword: '', // Don't populate password for security
          smtpHost: config.smtpHost || '',
          smtpPort: config.smtpPort?.toString() || '465',
          smtpSecure: config.smtpSecure !== false,
          smtpUsername: config.smtpUsername || '',
          smtpPassword: '', // Don't populate password for security
          syncFolder: config.syncFolder || 'INBOX',
          maxSyncMessages: config.maxSyncMessages?.toString() || '100',
          useOAuth2: config.useOAuth2 || false,
          oauth2ClientId: config.oauth2ClientId || '',
          oauth2ClientSecret: '',
          oauth2RefreshToken: ''
        });
      }
    } catch (error: any) {
      console.error('Error loading email configuration:', error);
      toast({
        title: t('common.error', 'Error'),
        description: error.message || t('settings.email_channel.load_failed_desc', 'Failed to load email configuration'),
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

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCheckboxChange = (name: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      [name]: checked
    }));
  };

  const validateCredentials = async () => {
    setIsValidating(true);
    try {
      const response = await fetch('/api/email/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          imapHost: formData.imapHost,
          imapPort: parseInt(formData.imapPort),
          imapSecure: formData.imapSecure,
          imapUsername: formData.imapUsername || formData.emailAddress,
          imapPassword: formData.imapPassword,
          smtpHost: formData.smtpHost,
          smtpPort: parseInt(formData.smtpPort),
          smtpSecure: formData.smtpSecure,
          smtpUsername: formData.smtpUsername || formData.emailAddress,
          smtpPassword: formData.smtpPassword,
          emailAddress: formData.emailAddress
        })
      });

      const result = await response.json();
      
      if (result.success) {
        toast({
          title: t('email.connection_test_successful', 'Connection Test Successful'),
          description: t('settings.email_channel.test_success_desc', 'Both IMAP and SMTP connections are working correctly'),
        });
      } else {
        toast({
          title: t('email.connection_test_failed', 'Connection Test Failed'),
          description: result.message || t('email.failed_connect_server', 'Failed to connect to email server'),
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Error testing connection:', error);
      toast({
        title: t('email.connection_test_failed', 'Connection Test Failed'),
        description: error.message || t('email.failed_test_connection', 'Failed to test email connection'),
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
      const response = await fetch('/api/email/configure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          connectionId: connectionId,
          isUpdate: true, // Flag to indicate this is an update
          imapHost: formData.imapHost,
          imapPort: parseInt(formData.imapPort),
          imapSecure: formData.imapSecure,
          imapUsername: formData.imapUsername || formData.emailAddress,
          imapPassword: formData.imapPassword || undefined, // Only send if provided
          smtpHost: formData.smtpHost,
          smtpPort: parseInt(formData.smtpPort),
          smtpSecure: formData.smtpSecure,
          smtpUsername: formData.smtpUsername || formData.emailAddress,
          smtpPassword: formData.smtpPassword || undefined, // Only send if provided
          emailAddress: formData.emailAddress,
          displayName: formData.displayName,
          signature: formData.signature,
          syncFolder: formData.syncFolder,
          maxSyncMessages: parseInt(formData.maxSyncMessages)
        })
      });

      const result = await response.json();
      
      if (result.success) {
        toast({
          title: t('settings.email_channel.updated_title', 'Email Channel Updated'),
          description: t('settings.email_channel.updated_desc', 'Your email channel has been updated successfully'),
        });
        onSuccess();
        handleClose();
      } else {
        toast({
          title: t('settings.instagram_connection.update_failed', 'Update Failed'),
          description: result.message || t('settings.email_channel.update_failed_desc', 'Failed to update email channel'),
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Error updating email channel:', error);
      toast({
        title: t('settings.instagram_connection.update_failed', 'Update Failed'),
        description: error.message || t('settings.email_channel.update_failed_desc', 'Failed to update email channel'),
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
            <span className="ml-2">{t('settings.email_channel.loading_configuration', 'Loading email configuration...')}</span>
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
            <Edit className="h-5 w-5 text-blue-500" />
            {t('settings.email_channel.edit_title', 'Edit Email Channel')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">{t('email.basic_configuration', 'Basic Configuration')}</h3>
            
            <div className="grid gap-2">
              <Label htmlFor="connectionName">{t('email.connection_name', 'Connection Name')}</Label>
              <Input
                id="connectionName"
                name="connectionName"
                value={formData.connectionName}
                onChange={handleInputChange}
                placeholder={t('email.connection_name_placeholder', 'My Email Support')}
                required
              />
              <p className="text-sm text-gray-500">
                {t('email.connection_name_help', 'A friendly name for this email connection')}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="emailAddress">{t('email.email_address', 'Email Address')}</Label>
              <Input
                id="emailAddress"
                name="emailAddress"
                type="email"
                value={formData.emailAddress}
                onChange={handleInputChange}
                placeholder={t('email.email_address_placeholder', 'support@company.com')}
                required
              />
              <p className="text-sm text-gray-500">
                {t('email.email_address_help', 'The email address for sending and receiving messages')}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="displayName">{t('admin.ai_credentials.display_name_optional', 'Display Name (Optional)')}</Label>
              <Input
                id="displayName"
                name="displayName"
                value={formData.displayName}
                onChange={handleInputChange}
                placeholder={t('settings.email_channel.display_name_placeholder', 'Support Team')}
              />
              <p className="text-sm text-gray-500">
                {t('settings.email_channel.display_name_help', 'The name that appears when sending emails')}
              </p>
            </div>
          </div>

          {/* IMAP Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">{t('email.imap_settings', 'IMAP Settings (Receiving)')}</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="imapHost">{t('email.imap_host', 'IMAP Host')}</Label>
                <Input
                  id="imapHost"
                  name="imapHost"
                  value={formData.imapHost}
                  onChange={handleInputChange}
                  placeholder={t('email.imap_host_placeholder', 'imap.gmail.com')}
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="imapPort">{t('email.imap_port', 'IMAP Port')}</Label>
                <Input
                  id="imapPort"
                  name="imapPort"
                  value={formData.imapPort}
                  onChange={handleInputChange}
                  placeholder="993"
                  required
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="imapSecure"
                checked={formData.imapSecure}
                onCheckedChange={(checked) => handleCheckboxChange('imapSecure', checked as boolean)}
              />
              <Label htmlFor="imapSecure" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                {t('email.use_ssl_tls_imap', 'Use SSL/TLS for IMAP')}
              </Label>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="imapUsername">{t('settings.email_channel.imap_username_label', 'IMAP Username')}</Label>
              <Input
                id="imapUsername"
                name="imapUsername"
                value={formData.imapUsername}
                onChange={handleInputChange}
                placeholder={t('email.imap_username_placeholder', 'Leave empty to use email address')}
              />
              <p className="text-sm text-gray-500">
                {t('settings.email_channel.username_help', 'Usually your email address. Leave empty to use the email address above.')}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="imapPassword">{t('email.imap_password', 'IMAP Password')}</Label>
              <div className="relative">
                <Input
                  id="imapPassword"
                  name="imapPassword"
                  type={showImapPassword ? "text" : "password"}
                  value={formData.imapPassword}
                  onChange={handleInputChange}
                  placeholder={t('settings.email_channel.password_placeholder', 'Leave empty to keep current password')}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowImapPassword(!showImapPassword)}
                >
                  {showImapPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-sm text-gray-500">
                {t('settings.email_channel.password_help', 'Leave empty to keep the current password unchanged')}
              </p>
            </div>
          </div>

          {/* SMTP Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">{t('email.smtp_settings', 'SMTP Settings (Sending)')}</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="smtpHost">{t('email.smtp_host', 'SMTP Host')}</Label>
                <Input
                  id="smtpHost"
                  name="smtpHost"
                  value={formData.smtpHost}
                  onChange={handleInputChange}
                  placeholder={t('email.smtp_host_placeholder', 'smtp.gmail.com')}
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="smtpPort">{t('email.smtp_port', 'SMTP Port')}</Label>
                <Input
                  id="smtpPort"
                  name="smtpPort"
                  value={formData.smtpPort}
                  onChange={handleInputChange}
                  placeholder="465"
                  required
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="smtpSecure"
                checked={formData.smtpSecure}
                onCheckedChange={(checked) => handleCheckboxChange('smtpSecure', checked as boolean)}
              />
              <Label htmlFor="smtpSecure" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                {t('email.use_ssl_tls_smtp', 'Use SSL/TLS for SMTP')}
              </Label>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="smtpUsername">{t('settings.email_channel.smtp_username_label', 'SMTP Username')}</Label>
              <Input
                id="smtpUsername"
                name="smtpUsername"
                value={formData.smtpUsername}
                onChange={handleInputChange}
                placeholder={t('email.smtp_username_placeholder', 'Leave empty to use email address')}
              />
              <p className="text-sm text-gray-500">
                {t('settings.email_channel.username_help', 'Usually your email address. Leave empty to use the email address above.')}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="smtpPassword">{t('email.smtp_password', 'SMTP Password')}</Label>
              <div className="relative">
                <Input
                  id="smtpPassword"
                  name="smtpPassword"
                  type={showSmtpPassword ? "text" : "password"}
                  value={formData.smtpPassword}
                  onChange={handleInputChange}
                  placeholder={t('settings.email_channel.password_placeholder', 'Leave empty to keep current password')}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                >
                  {showSmtpPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-sm text-gray-500">
                {t('settings.email_channel.password_help', 'Leave empty to keep the current password unchanged')}
              </p>
            </div>
          </div>

          {/* Email Settings */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">{t('admin.settings.email', 'Email Settings')}</h3>

            <div className="grid gap-2">
              <Label htmlFor="signature">{t('settings.email_channel.signature_label', 'Email Signature (Optional)')}</Label>
              <Input
                id="signature"
                name="signature"
                value={formData.signature}
                onChange={handleInputChange}
                placeholder={t('settings.email_channel.signature_placeholder', 'Best regards, Support Team')}
              />
              <p className="text-sm text-gray-500">
                {t('settings.email_channel.signature_help', 'Signature to append to outgoing emails')}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="syncFolder">{t('email.sync_folder', 'Sync Folder')}</Label>
                <Select value={formData.syncFolder} onValueChange={(value) => handleSelectChange('syncFolder', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('settings.email_channel.select_folder_placeholder', 'Select folder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INBOX">INBOX</SelectItem>
                    <SelectItem value="All">{t('settings.email_channel.folder_all_mail', 'All Mail')}</SelectItem>
                    <SelectItem value="Sent">{t('settings.email_channel.folder_sent', 'Sent')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="maxSyncMessages">{t('email.max_sync_messages', 'Max Messages to Sync')}</Label>
                <Input
                  id="maxSyncMessages"
                  name="maxSyncMessages"
                  type="number"
                  value={formData.maxSyncMessages}
                  onChange={handleInputChange}
                  placeholder="100"
                  min="1"
                  max="1000"
                />
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={handleClose}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={validateCredentials}
              disabled={isValidating || !formData.emailAddress || !formData.imapHost || !formData.smtpHost}
              className="flex items-center gap-2"
            >
              {isValidating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TestTube className="h-4 w-4" />
              )}
              {isValidating ? t('email.testing', 'Testing...') : t('email.test_connection', 'Test Connection')}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || isValidating}
              className="flex items-center gap-2"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              {isSubmitting ? t('common.updating', 'Updating...') : t('settings.email_channel.update_button', 'Update Channel')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
