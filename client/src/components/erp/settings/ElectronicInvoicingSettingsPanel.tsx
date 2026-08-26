import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Settings = {
  enabled: boolean;
  country: string;
  credentials: Record<string, string>;
  healthEnabled: boolean;
  healthCredentials: Record<string, string>;
};

const EMPTY_SETTINGS: Settings = {
  enabled: false,
  country: 'CO',
  credentials: { apiUrl: '', apiKey: '', softwareId: '', technicalKey: '', environment: 'sandbox', certificatePem: '' },
  healthEnabled: false,
  healthCredentials: { apiUrl: '', apiKey: '' },
};

export default function ElectronicInvoicingSettingsPanel({ canManage, isDental }: { canManage: boolean; isDental: boolean }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Settings>(EMPTY_SETTINGS);
  const queryKey = ['/api/erp/invoices/electronic-invoicing-settings'];
  const settingsQuery = useQuery<Settings>({
    queryKey,
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/erp/invoices/electronic-invoicing-settings');
      if (!response.ok) throw new Error(t('erp.electronicInvoicing.errors.loadSettings', 'Failed to load electronic invoicing settings'));
      const body = await response.json();
      return { ...EMPTY_SETTINGS, ...body.data, credentials: { ...EMPTY_SETTINGS.credentials, ...body.data?.credentials }, healthCredentials: { ...EMPTY_SETTINGS.healthCredentials, ...body.data?.healthCredentials } };
    },
  });

  useEffect(() => {
    if (settingsQuery.data) setForm(settingsQuery.data);
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('PUT', '/api/erp/invoices/electronic-invoicing-settings', form);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || t('erp.electronicInvoicing.errors.saveSettings', 'Failed to save electronic invoicing settings'));
      }
      return response.json();
    },
    onSuccess: (body) => {
      queryClient.setQueryData(queryKey, body.data);
      toast({ title: t('erp.electronicInvoicing.saved', 'Electronic invoicing settings saved') });
    },
    onError: (error: Error) => toast({ title: error.message, variant: 'destructive' }),
  });

  const setCredential = (key: string, value: string) => setForm((current) => ({ ...current, credentials: { ...current.credentials, [key]: value } }));
  const setHealthCredential = (key: string, value: string) => setForm((current) => ({ ...current, healthCredentials: { ...current.healthCredentials, [key]: value } }));

  return (
    <Card>
      <CardContent className="pt-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold">{t('erp.electronicInvoicing.title', 'Electronic invoicing')}</h2>
          <p className="text-sm text-muted-foreground">{t('erp.electronicInvoicing.description', 'Configure country-specific tax clearance and healthcare validation.')}</p>
        </div>
        {settingsQuery.isLoading ? <p className="text-sm text-muted-foreground">{t('erp.common.loading', 'Loading...')}</p> : (
          <>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="electronic-invoicing-enabled">{t('erp.electronicInvoicing.enabled', 'Enable electronic invoicing')}</Label>
              <Switch id="electronic-invoicing-enabled" checked={form.enabled} onCheckedChange={(enabled) => setForm({ ...form, enabled })} disabled={!canManage} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>{t('erp.electronicInvoicing.country', 'Operating country')}</Label><Select value={form.country} onValueChange={(country) => setForm({ ...form, country })} disabled={!canManage}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CO">{t('erp.electronicInvoicing.countries.colombia', 'Colombia')}</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>{t('erp.electronicInvoicing.environment', 'Environment')}</Label><Select value={form.credentials.environment || 'sandbox'} onValueChange={(environment) => setCredential('environment', environment)} disabled={!canManage}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sandbox">{t('erp.electronicInvoicing.environment.sandbox', 'Sandbox')}</SelectItem><SelectItem value="production">{t('erp.electronicInvoicing.environment.production', 'Production')}</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>{t('erp.electronicInvoicing.apiUrl', 'Provider API URL')}</Label><Input value={form.credentials.apiUrl || ''} onChange={(event) => setCredential('apiUrl', event.target.value)} disabled={!canManage} /></div>
              <div className="space-y-2"><Label>{t('erp.electronicInvoicing.apiKey', 'Provider API key')}</Label><Input type="password" value={form.credentials.apiKey || ''} onChange={(event) => setCredential('apiKey', event.target.value)} disabled={!canManage} /></div>
              <div className="space-y-2"><Label>{t('erp.electronicInvoicing.softwareId', 'Software ID')}</Label><Input value={form.credentials.softwareId || ''} onChange={(event) => setCredential('softwareId', event.target.value)} disabled={!canManage} /></div>
              <div className="space-y-2"><Label>{t('erp.electronicInvoicing.technicalKey', 'DIAN technical key')}</Label><Input type="password" value={form.credentials.technicalKey || ''} onChange={(event) => setCredential('technicalKey', event.target.value)} disabled={!canManage} /></div>
            </div>
            <div className="space-y-2"><Label>{t('erp.electronicInvoicing.certificate', 'Digital certificate PEM')}</Label><Textarea value={form.credentials.certificatePem || ''} onChange={(event) => setCredential('certificatePem', event.target.value)} disabled={!canManage} rows={4} /></div>
            {isDental && <>
              <div className="flex items-center justify-between rounded-md border p-3"><Label htmlFor="health-integration-enabled">{t('erp.electronicInvoicing.healthIntegration', 'Healthcare integration (RIPS/MUV)')}</Label><Switch id="health-integration-enabled" checked={form.healthEnabled} onCheckedChange={(healthEnabled) => setForm({ ...form, healthEnabled })} disabled={!canManage} /></div>
              {form.healthEnabled && <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>{t('erp.electronicInvoicing.healthApiUrl', 'MUV API URL')}</Label><Input value={form.healthCredentials.apiUrl || ''} onChange={(event) => setHealthCredential('apiUrl', event.target.value)} disabled={!canManage} /></div><div className="space-y-2"><Label>{t('erp.electronicInvoicing.healthApiKey', 'MUV API key')}</Label><Input type="password" value={form.healthCredentials.apiKey || ''} onChange={(event) => setHealthCredential('apiKey', event.target.value)} disabled={!canManage} /></div></div>}
            </>}
            {canManage && <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>{saveMutation.isPending ? t('erp.common.saving', 'Saving...') : t('erp.common.save', 'Save')}</Button>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
