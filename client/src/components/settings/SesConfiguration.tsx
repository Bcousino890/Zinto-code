import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { 
  Alert,
  AlertDescription,
  AlertTitle
} from "@/components/ui/alert";
import { Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";

interface SesConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  fromEmail: string;
  fromName: string;
  enabled: boolean;
  port?: number;
}

export function SesConfiguration() {
  const [sesConfig, setSesConfig] = useState<SesConfig>({
    region: '',
    accessKeyId: '',
    secretAccessKey: '',
    fromEmail: '',
    fromName: '',
    enabled: false,
    port: undefined
  });
  
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [storedSecretKey, setStoredSecretKey] = useState('');
  const [showSecretKey, setShowSecretKey] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();
  
  const { data: sesData, isLoading } = useQuery<SesConfig>({
    queryKey: ['/api/ses-config'],
    refetchOnWindowFocus: false
  });
  
  useEffect(() => {
    if (sesData) {
      setStoredSecretKey(sesData.secretAccessKey || '');
      setSesConfig({
        ...sesData,
        secretAccessKey: '' // Clear secret key field for security
      });
    }
  }, [sesData]);
  
  const updateSesConfig = useMutation({
    mutationFn: async (config: SesConfig) => {
      const res = await apiRequest('POST', '/api/ses-config', config);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: t('settings.ses.saved_title', 'Amazon SES Configuration Saved'),
        description: t('settings.ses.saved_desc', 'Your SES settings have been updated successfully'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/ses-config'] });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('settings.ses.update_failed_desc', 'Failed to update SES configuration: {{message}}', { message: error.message }),
        variant: 'destructive',
      });
    },
  });
  
  const testSesConfig = useMutation({
    mutationFn: async ({ config, testEmail }: { config: SesConfig; testEmail: string }) => {
      const res = await apiRequest('POST', '/api/ses-config/test', { config, testEmail });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: t('settings.ses.test_email_sent_title', 'Test Email Sent'),
        description: t('settings.ses.test_email_sent_desc', 'A test email has been sent successfully'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('settings.ses.test_email_failed_desc', 'Failed to send test email: {{message}}', { message: error.message }),
        variant: 'destructive',
      });
    },
  });
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'port') {
      setSesConfig({
        ...sesConfig,
        port: value === '' ? undefined : Number(value)
      });
      return;
    }
    setSesConfig({
      ...sesConfig,
      [name]: value
    });
  };
  
  const handleToggleEnabled = (checked: boolean) => {
    setSesConfig({
      ...sesConfig,
      enabled: checked
    });
  };
  
  const handleSaveConfig = () => {
    if (!sesConfig.region) {
      toast({
        title: t('common.validation_error', 'Validation Error'),
        description: t('settings.ses.validation_region_required', 'AWS Region is required'),
        variant: 'destructive',
      });
      return;
    }
    
    if (!sesConfig.accessKeyId) {
      toast({
        title: t('common.validation_error', 'Validation Error'),
        description: t('settings.ses.validation_access_key_required', 'Access Key ID is required'),
        variant: 'destructive',
      });
      return;
    }
    
    if (!sesConfig.secretAccessKey && !storedSecretKey) {
      toast({
        title: t('common.validation_error', 'Validation Error'),
        description: t('settings.ses.validation_secret_key_required', 'Secret Access Key is required'),
        variant: 'destructive',
      });
      return;
    }
    
    if (!sesConfig.fromEmail) {
      toast({
        title: t('common.validation_error', 'Validation Error'),
        description: t('settings.ses.validation_from_email_required', 'From Email address is required'),
        variant: 'destructive',
      });
      return;
    }

    const configToSave = {
      ...sesConfig,
      secretAccessKey: sesConfig.secretAccessKey || storedSecretKey
    };
    
    updateSesConfig.mutate(configToSave);
  };
  
  const handleTestEmail = () => {
    if (!testEmailAddress) {
      toast({
        title: t('common.validation_error', 'Validation Error'),
        description: t('settings.ses.validation_test_email_required', 'Please enter an email address to send the test email to'),
        variant: 'destructive',
      });
      return;
    }
    
    if (!sesConfig.region || !sesConfig.accessKeyId || (!sesConfig.secretAccessKey && !storedSecretKey) || !sesConfig.fromEmail) {
      toast({
        title: t('common.validation_error', 'Validation Error'),
        description: t('settings.ses.validation_complete_config', 'Please complete all required SES configuration fields first'),
        variant: 'destructive',
      });
      return;
    }

    const configToTest = {
      ...sesConfig,
      secretAccessKey: sesConfig.secretAccessKey || storedSecretKey
    };
    
    testSesConfig.mutate({ config: configToTest, testEmail: testEmailAddress });
  };
  
  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-2">{t('settings.ses.section_title', 'Amazon SES Configuration')}</h3>
        <p className="text-sm text-gray-500 mb-4">
          {t('settings.ses.section_description', 'Configure Amazon Simple Email Service (SES) to send emails for notifications, invitations, and campaigns.')}
        </p>
      </div>
      
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>{t('campaigns.builder.launch.warning_title', 'Important')}</AlertTitle>
        <AlertDescription>
          {t('settings.ses.sandbox_notice', 'Ensure your SES account is out of sandbox mode and your sender email address is verified in AWS SES.')}
        </AlertDescription>
      </Alert>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="region">{t('settings.ses.region_label', 'AWS Region')}</Label>
            <Input
              id="region"
              name="region"
              value={sesConfig.region}
              onChange={handleInputChange}
              placeholder="us-east-1"
            />
            <p className="text-xs text-gray-500">
              {t('settings.ses.region_help', 'AWS region where your SES service is configured (e.g., us-east-1, eu-west-1)')}
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="port">{t('settings.ses.port_label', 'Port')}</Label>
            <Input
              id="port"
              name="port"
              type="number"
              value={sesConfig.port ?? ''}
              onChange={handleInputChange}
              placeholder="443"
            />
            <p className="text-xs text-gray-500">
              {t('settings.ses.port_help', 'Optional. SES SMTP port (e.g. 587, 465). Leave blank to use the default HTTPS endpoint.')}
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="accessKeyId">{t('settings.ses.access_key_id_label', 'Access Key ID')}</Label>
            <Input
              id="accessKeyId"
              name="accessKeyId"
              value={sesConfig.accessKeyId}
              onChange={handleInputChange}
              placeholder="AKIAIOSFODNN7EXAMPLE"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="secretAccessKey">{t('settings.ses.secret_access_key_label', 'Secret Access Key')}</Label>
            <div className="relative">
              <Input
                id="secretAccessKey"
                name="secretAccessKey"
                type={showSecretKey ? "text" : "password"}
                value={sesConfig.secretAccessKey}
                onChange={handleInputChange}
                placeholder={storedSecretKey ? t('settings.ses.secret_access_key_stored_placeholder', 'Leave empty to keep current key') : t('settings.ses.secret_access_key_placeholder', 'Enter secret access key')}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowSecretKey(!showSecretKey)}
              >
                {showSecretKey ? (
                  <EyeOff className="h-4 w-4 text-gray-500" />
                ) : (
                  <Eye className="h-4 w-4 text-gray-500" />
                )}
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              {storedSecretKey ? t('settings.ses.secret_access_key_stored_help', 'Secret key is set. Leave empty to keep it unchanged, or enter new key.') : t('settings.ses.secret_access_key_help', 'Your AWS secret access key')}
            </p>
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fromEmail">{t('settings.ses.from_email_label', 'From Email')}</Label>
            <Input
              id="fromEmail"
              name="fromEmail"
              value={sesConfig.fromEmail}
              onChange={handleInputChange}
              placeholder="noreply@yourcompany.com"
            />
            <p className="text-xs text-gray-500">
              {t('settings.ses.from_email_help', 'Verified sender email address in AWS SES')}
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="fromName">{t('settings.ses.from_name_label', 'From Name')}</Label>
            <Input
              id="fromName"
              name="fromName"
              value={sesConfig.fromName}
              onChange={handleInputChange}
              placeholder={t('meta.partner.config.company_name_placeholder', 'Your Company Name')}
            />
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="enabled">{t('settings.ses.enable_label', 'Enable Amazon SES')}</Label>
              <Switch 
                id="enabled"
                checked={sesConfig.enabled}
                onCheckedChange={handleToggleEnabled}
              />
            </div>
            <p className="text-xs text-gray-500">
              {t('settings.ses.enable_help', 'Enable or disable Amazon SES for sending emails')}
            </p>
          </div>
        </div>
      </div>
      
      <div className="border-t pt-6 space-y-4">
        <h4 className="font-medium">{t('settings.ses.test_section_title', 'Test Email Configuration')}</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <Input
              value={testEmailAddress}
              onChange={(e) => setTestEmailAddress(e.target.value)}
              placeholder={t('settings.ses.test_email_placeholder', 'Enter an email address to receive a test message')}
            />
          </div>
          <Button onClick={handleTestEmail} disabled={testSesConfig.isPending} className="w-full btn-brand-primary">
            {testSesConfig.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t('settings.ses.send_test_email', 'Send Test Email')}
          </Button>
        </div>
      </div>
      
      <div className="flex justify-end space-x-2">
        <Button variant="brand">{t('common.cancel', 'Cancel')}</Button>
        <Button className='btn-brand-primary' onClick={handleSaveConfig} disabled={updateSesConfig.isPending}>
          {updateSesConfig.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          {t('settings.twilio_voice.save_configuration', 'Save Configuration')}
        </Button>
      </div>
    </div>
  );
}
