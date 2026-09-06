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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Info, TestTube, ExternalLink } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormData {
  accountName: string;
  accountSid: string;
  authToken: string;
  fromNumber: string;
  webhookUrl: string; // Inbound SMS/MMS
  statusCallbackUrl: string; // Delivery callbacks
}

export function TwilioSmsConnectionForm({ isOpen, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [form, setForm] = useState<FormData>({
    accountName: '',
    accountSid: '',
    authToken: '',
    fromNumber: '',
    webhookUrl: `${window.location.origin}/api/webhooks/twilio/sms`,
    statusCallbackUrl: `${window.location.origin}/api/webhooks/twilio/sms-status`
  });

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const validate = (): string | null => {
    if (!form.accountName || !form.accountSid || !form.authToken || !form.fromNumber) return t('settings.twilio_sms.validation_required_fields', 'Please fill all required fields.');
    if (!/^\+\d{6,15}$/.test(form.fromNumber.trim())) return t('settings.twilio_sms.validation_from_number_format', 'From Number must be in E.164 format (e.g., +15551234567).');
    try {
      const w = new URL(form.webhookUrl);
      const s = new URL(form.statusCallbackUrl);
      if (w.protocol !== 'https:' || s.protocol !== 'https:') return t('settings.twilio_sms.validation_https_required', 'Webhook URLs must be HTTPS.');
    } catch {
      return t('settings.twilio_sms.validation_invalid_urls', 'Webhook URLs are invalid.');
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast({ title: t('common.validation_error', 'Validation Error'), description: err, variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/channel-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelType: 'twilio_sms',
          accountId: form.fromNumber,
          accountName: form.accountName,
          connectionData: {
            accountSid: form.accountSid,
            authToken: form.authToken,
            fromNumber: form.fromNumber,
            statusCallbackUrl: form.statusCallbackUrl
          },
          status: 'active'
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || t('settings.twilio_sms.create_failed', 'Failed to create Twilio SMS connection'));
      }
      toast({ title: t('settings.twilio_sms.connected_title', 'Twilio SMS Connected'), description: t('settings.twilio_sms.connected_desc', 'Your Twilio SMS channel has been added.') });
      onSuccess();
      onClose();
    } catch (error: any) {
      toast({ title: t('settings.channel.connection_failed_title', 'Connection Failed'), description: error.message || t('settings.twilio_sms.connect_failed_desc', 'Failed to connect Twilio SMS.'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const testWebhookHint = () => {
    toast({
      title: t('settings.twilio_sms.webhook_test_tip_title', 'Webhook Test Tip'),
      description: t('settings.twilio_sms.webhook_test_tip_desc', 'Use Twilio Console “Try It Out” or send a real SMS to your From Number to test inbound webhooks.'),
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t('settings.twilio_sms.dialog_title', 'Connect Twilio SMS')}</DialogTitle>
          <DialogDescription>
            {t('settings.twilio_sms.dialog_description', 'Configure Twilio Programmable Messaging to enable two-way SMS and MMS.')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="accountName">{t('settings.twilio_sms.account_name', 'Account Name *')}</Label>
            <Input id="accountName" name="accountName" value={form.accountName} onChange={onChange} placeholder={t('settings.twilio_sms.account_name_placeholder', 'e.g. Main Support Number')} required />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="accountSid">{t('settings.twilio_sms.account_sid', 'Twilio Account SID *')}</Label>
            <Input id="accountSid" name="accountSid" value={form.accountSid} onChange={onChange} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" required />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="authToken">{t('settings.twilio_sms.auth_token', 'Twilio Auth Token *')}</Label>
            <Input id="authToken" name="authToken" type="password" value={form.authToken} onChange={onChange} placeholder={t('settings.twilio_sms.auth_token_placeholder', 'Your Twilio Auth Token')} required />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="fromNumber">{t('settings.twilio_sms.from_number', 'From Number (E.164) *')}</Label>
            <Input id="fromNumber" name="fromNumber" value={form.fromNumber} onChange={onChange} placeholder="+15551234567" required />
          </div>

          <div className="border-t pt-4 grid gap-3">
            <div className="flex items-center justify-between">
              <Label>{t('settings.metaPartnerConfiguration.webhook_urls', 'Webhook URLs')}</Label>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowDocs(true)} className="flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  {t('admin.backup.oauth.setup_instructions', 'Setup Instructions')}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={testWebhookHint} className="flex items-center gap-2">
                  <TestTube className="h-4 w-4" />
                  {t('whatsapp_business.test_webhook', 'Test Webhook')}
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="webhookUrl">{t('settings.twilio_sms.inbound_webhook_url', 'Inbound Webhook URL')}</Label>
              <Input id="webhookUrl" name="webhookUrl" value={form.webhookUrl} onChange={onChange} placeholder={`${window.location.origin}/api/webhooks/twilio/sms`} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="statusCallbackUrl">{t('settings.twilio_sms.status_callback_url', 'Status Callback URL')}</Label>
              <Input id="statusCallbackUrl" name="statusCallbackUrl" value={form.statusCallbackUrl} onChange={onChange} placeholder={`${window.location.origin}/api/webhooks/twilio/sms-status`} />
            </div>

            <Alert>
              <AlertDescription>
                {t('settings.twilio_sms.https_notice', 'Ensure both URLs are publicly accessible via HTTPS. We verify Twilio requests with X-Twilio-Signature.')}
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel', 'Cancel')}</Button>
            <Button type="submit" className="btn-brand-primary" variant="outline" disabled={loading}>
              {loading ? t('whatsapp_business.connecting', 'Connecting...') : t('settings.twilio_sms.connect_button', 'Connect Twilio SMS')}
            </Button>
          </DialogFooter>
        </form>

        {/* In-app setup instructions popup */}
        <Dialog open={showDocs} onOpenChange={setShowDocs}>
          <DialogContent className="sm:max-w-[720px]">
            <DialogHeader>
              <DialogTitle>{t('settings.twilio_sms.setup_dialog_title', 'Twilio SMS Setup Instructions')}</DialogTitle>
              <DialogDescription>
                {t('settings.twilio_sms.setup_dialog_description', 'Follow these steps to complete the integration.')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <ol className="list-decimal list-inside space-y-2">
                <li>{t('settings.twilio_sms.setup_step_buy_number', 'Buy or select a Twilio phone number enabled for SMS.')}</li>
                <li>{t('settings.twilio_sms.setup_step_messaging_webhook', 'In Twilio Console, set the Messaging webhook to:')}
                  <div className="mt-1 p-2 bg-muted rounded text-xs select-all break-all">{form.webhookUrl}</div>
                </li>
                <li>{t('settings.twilio_sms.setup_step_status_callback', 'Set the Status Callback URL to:')}
                  <div className="mt-1 p-2 bg-muted rounded text-xs select-all break-all">{form.statusCallbackUrl}</div>
                </li>
                <li>{t('settings.twilio_sms.setup_step_paste_credentials', 'Paste your Account SID and Auth Token here, and the From Number in E.164 format (e.g., +15551234567).')}</li>
                <li>{t('settings.twilio_sms.setup_step_save', 'Save. Inbound SMS will appear in Inbox under the Twilio SMS channel. Delivery updates will set message status to delivered/failed.')}</li>
                <li>{t('settings.twilio_sms.setup_step_stop_start_help', 'STOP/START/HELP: When customers send STOP, we opt them out automatically and block outbound sends until START/UNSTOP.')}</li>
              </ol>
              <div className="pt-2">
                <a
                  href="https://www.twilio.com/docs/sms"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-primary hover:underline"
                >
                  <ExternalLink className="h-4 w-4" /> {t('settings.twilio_sms.docs_link', 'Twilio SMS Docs (external)')}
                </a>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
