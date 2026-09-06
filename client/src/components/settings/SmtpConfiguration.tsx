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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, AlertCircle, Check, Mail, Key, Eye, EyeOff } from "lucide-react";

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  senderEmail: string;
  senderName: string;
}

export function SmtpConfiguration() {
  const [smtpConfig, setSmtpConfig] = useState<SmtpConfig>({
    host: '',
    port: 465,
    secure: false,
    auth: {
      user: '',
      pass: ''
    },
    senderEmail: '',
    senderName: ''
  });
  
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [storedPassword, setStoredPassword] = useState('');
  const { toast } = useToast();
  const { t } = useTranslation();
  
  const { data: smtpData, isLoading } = useQuery<SmtpConfig>({
    queryKey: ['/api/smtp-config'],
    refetchOnWindowFocus: false
  });
  
  useEffect(() => {
    if (smtpData) {
      setStoredPassword(smtpData.auth.pass || '');
      setSmtpConfig({
        ...smtpData,
        auth: {
          ...smtpData.auth,
          pass: '' // Clear password field for security
        }
      });
    }
  }, [smtpData]);
  
  const updateSmtpConfig = useMutation({
    mutationFn: async (config: SmtpConfig) => {
      const res = await apiRequest('POST', '/api/smtp-config', config);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: t('settings.smtp.saved_title', 'SMTP Configuration Saved'),
        description: t('settings.smtp.saved_desc', 'Your email settings have been updated successfully'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/smtp-config'] });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('settings.smtp.update_failed_desc', 'Failed to update SMTP configuration: {{message}}', { message: error.message }),
        variant: 'destructive',
      });
    },
  });
  
  const testSmtpConfig = useMutation({
    mutationFn: async ({ config, testEmail }: { config: SmtpConfig; testEmail: string }) => {
      const res = await apiRequest('POST', '/api/smtp-config/test', { config, testEmail });
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
    
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setSmtpConfig({
        ...smtpConfig,
        [parent]: {
          ...smtpConfig[parent as keyof SmtpConfig] as any,
          [child]: value
        }
      });
    } else if (name === 'port') {
      setSmtpConfig({
        ...smtpConfig,
        [name]: parseInt(value) || 0
      });
    } else {
      setSmtpConfig({
        ...smtpConfig,
        [name]: value
      });
    }
  };
  
  const handleToggleSecure = (checked: boolean) => {
    setSmtpConfig({
      ...smtpConfig,
      secure: checked,
      port: checked ? 465 : 465
    });
  };
  
  const handleSaveConfig = () => {
    if (!smtpConfig.host) {
      toast({
        title: t('common.validation_error', 'Validation Error'),
        description: t('settings.smtp.validation_host_required', 'SMTP host is required'),
        variant: 'destructive',
      });
      return;
    }
    
    if (!smtpConfig.auth.user || (!smtpConfig.auth.pass && !storedPassword)) {
      toast({
        title: t('common.validation_error', 'Validation Error'),
        description: t('settings.smtp.validation_credentials_required', 'SMTP username and password are required'),
        variant: 'destructive',
      });
      return;
    }
    
    if (!smtpConfig.senderEmail) {
      toast({
        title: t('common.validation_error', 'Validation Error'),
        description: t('settings.smtp.validation_sender_email_required', 'Sender email address is required'),
        variant: 'destructive',
      });
      return;
    }
    

    const configToSave = {
      ...smtpConfig,
      auth: {
        ...smtpConfig.auth,
        pass: smtpConfig.auth.pass || storedPassword
      }
    };
    
    updateSmtpConfig.mutate(configToSave);
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
    
    if (!smtpConfig.host || !smtpConfig.auth.user || (!smtpConfig.auth.pass && !storedPassword) || !smtpConfig.senderEmail) {
      toast({
        title: t('common.validation_error', 'Validation Error'),
        description: t('settings.smtp.validation_complete_config', 'Please complete all required SMTP configuration fields first'),
        variant: 'destructive',
      });
      return;
    }
    

    const configToTest = {
      ...smtpConfig,
      auth: {
        ...smtpConfig.auth,
        pass: smtpConfig.auth.pass || storedPassword
      }
    };
    
    testSmtpConfig.mutate({ config: configToTest, testEmail: testEmailAddress });
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
        <h3 className="text-lg font-medium mb-2">{t('settings.smtp.section_title', 'SMTP Server Configuration')}</h3>
        <p className="text-sm text-gray-500 mb-4">
          {t('settings.smtp.section_description', 'Configure your email server settings to enable sending verification emails, notifications, and other communications.')}
        </p>
      </div>
      
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>{t('campaigns.builder.launch.warning_title', 'Important')}</AlertTitle>
        <AlertDescription>
          {t('settings.smtp.important_notice', 'Email functionality is required for team member invitations and password reset features.')}
        </AlertDescription>
      </Alert>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="host">{t('email.smtp_host', 'SMTP Host')}</Label>
            <Input
              id="host"
              name="host"
              value={smtpConfig.host}
              onChange={handleInputChange}
              placeholder="smtp.example.com"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="port">{t('email.smtp_port', 'SMTP Port')}</Label>
            <Input
              id="port"
              name="port"
              type="number"
              value={smtpConfig.port.toString()}
              onChange={handleInputChange}
              placeholder="465"
            />
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="secure">{t('settings.smtp.secure_label', 'Use Secure Connection (SSL/TLS)')}</Label>
              <Switch 
                id="secure"
                checked={smtpConfig.secure}
                onCheckedChange={handleToggleSecure}
              />
            </div>
            <p className="text-xs text-gray-500">
              {t('settings.smtp.secure_help', 'Enable for SSL/TLS connections. Usually port 465 for SSL and port 465 for TLS.')}
            </p>
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="auth.user">{t('settings.smtp.username_label', 'SMTP Username')}</Label>
            <Input
              id="auth.user"
              name="auth.user"
              value={smtpConfig.auth.user}
              onChange={handleInputChange}
              placeholder="username@example.com"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="auth.pass">{t('email.smtp_password', 'SMTP Password')}</Label>
            <Input
              id="auth.pass"
              name="auth.pass"
              type="password"
              value={smtpConfig.auth.pass}
              onChange={handleInputChange}
              placeholder={storedPassword ? t('settings.smtp.password_stored_placeholder', 'Leave empty to keep current password') : t('settings.smtp.password_placeholder', 'Enter password')}
            />
            <p className="text-xs text-gray-500">
              {storedPassword ? t('settings.smtp.password_stored_help', 'Password is set. Leave empty to keep it unchanged, or enter new password.') : t('settings.smtp.password_help', 'For Gmail, use an App Password instead of your regular password')}
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="senderEmail">{t('settings.smtp.sender_email_label', 'Sender Email Address')}</Label>
            <Input
              id="senderEmail"
              name="senderEmail"
              value={smtpConfig.senderEmail}
              onChange={handleInputChange}
              placeholder="no-reply@yourcompany.com"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="senderName">{t('settings.smtp.sender_name_label', 'Sender Name')}</Label>
            <Input
              id="senderName"
              name="senderName"
              value={smtpConfig.senderName}
              onChange={handleInputChange}
              placeholder={t('meta.partner.config.company_name_placeholder', 'Your Company Name')}
            />
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
          <Button onClick={handleTestEmail} disabled={testSmtpConfig.isPending} className="w-full btn-brand-primary">
            {testSmtpConfig.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t('settings.ses.send_test_email', 'Send Test Email')}
          </Button>
        </div>
      </div>
      
      <div className="flex justify-end space-x-2">
        <Button variant="brand">{t('common.cancel', 'Cancel')}</Button>
        <Button className='btn-brand-primary' onClick={handleSaveConfig} disabled={updateSmtpConfig.isPending}>
          {updateSmtpConfig.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          {t('settings.twilio_voice.save_configuration', 'Save Configuration')}
        </Button>
      </div>
    </div>
  );
}