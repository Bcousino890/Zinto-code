import { useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { enUS, es } from 'date-fns/locale';
import { Check, Copy, Edit3, Eye, Link2, Loader2, Plus, RefreshCw, RotateCcw, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { API_KEY_SCOPES, toggleApiKeyScope } from './api-key-permissions';
import {
  buildCrmIntegrationPayload,
  normalizeCreatedCrmIntegration,
  normalizeCrmIntegrations,
  buildCrmIntegrationAction,
  type CrmIntegration,
  type CrmIntegrationFormValues,
} from './crm-integrations';

const INTEGRATIONS_URL = '/api/settings/crm-integrations';
const PROVIDERS = ['generic', 'hubspot', 'salesforce', 'zoho', 'pipedrive'] as const;
const DEFAULT_SCOPES = ['contacts:read', 'contacts:write', 'conversations:read', 'messages:send', 'appointments:read', 'appointments:write', 'deals:read', 'deals:write', 'campaigns:read', 'campaigns:write', 'webhooks:manage'];

const FALLBACKS = {
  title: 'Integraciones CRM', description: 'Conecta el CRM de tu empresa con Zinto en ambas direcciones.',
  create: 'Crear integración', edit: 'Editar integración', name: 'Nombre', provider: 'CRM', webhook: 'URL del webhook del CRM',
  active: 'Activa', inactive: 'Inactiva', draft: 'Borrador', activate: 'Activar', deactivate: 'Desactivar', id: 'Integration ID', permissions: 'Permisos',
  noIntegrations: 'Todavía no hay integraciones CRM configuradas.', createFirst: 'Crea una integración para generar su Integration ID.',
  created: 'Integración creada', secretDialogTitle: 'Credencial del webhook', secretDialogDescription: 'Copia este secreto y configúralo en tu CRM. Por seguridad, no volverá a mostrarse.', secret: 'Secreto del webhook', secretHelp: 'Guárdalo ahora. Por seguridad, no volverá a mostrarse.',
  revealSecret: 'Ver secreto', revealSecretTitle: 'Secreto del webhook', revealSecretDescription: 'Este secreto está protegido y solo se muestra a administradores autenticados.', revealFailed: 'No se pudo mostrar el secreto.', rotateSecret: 'Regenerar secreto', rotateSecretTitle: 'Regenerar secreto del webhook', rotateSecretDescription: 'El secreto actual dejará de funcionar inmediatamente. Copia el nuevo secreto y actualiza tu CRM.',
  rotateFailed: 'No se pudo regenerar el secreto.', deleted: 'Integración eliminada', delete: 'Eliminar', deleteTitle: '¿Eliminar esta integración?', deleteDescription: 'Se desactivará el acceso y se eliminará la configuración de esta integración. Esta acción no se puede deshacer.', deleteConfirm: 'Eliminar integración', deleteFailed: 'No se pudo eliminar la integración.',
  copy: 'Copiar', copied: 'Copiado', save: 'Guardar cambios', cancel: 'Cancelar', close: 'Cerrar', loading: 'Cargando integraciones…',
  loadFailed: 'No se pudieron cargar las integraciones CRM.', saveFailed: 'No se pudo guardar la integración.', saved: 'Integración actualizada.',
  createdDescription: 'Usa el Integration ID junto con tu API Key en cada solicitud a la API v2.', invalidName: 'Escribe un nombre para la integración.',
  invalidWebhook: 'La URL del webhook debe comenzar con https://.', scopes: 'Permisos de sincronización', createdAt: 'Creada', lastSync: 'Última sincronización', never: 'Nunca',
  providerGeneric: 'Conector genérico (API/Webhooks)', providerHubspot: 'HubSpot', providerSalesforce: 'Salesforce', providerZoho: 'Zoho', providerPipedrive: 'Pipedrive',
};

function emptyForm(): CrmIntegrationFormValues {
  return { name: '', provider: 'generic', webhookUrl: '', scopes: DEFAULT_SCOPES };
}

export function CrmIntegrationsPanel() {
  const { t, currentLanguage } = useTranslation();
  const { toast } = useToast();
  const dateLocale = currentLanguage?.code?.toLowerCase().startsWith('es') ? es : enUS;
  const [integrations, setIntegrations] = useState<CrmIntegration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CrmIntegration | null>(null);
  const [form, setForm] = useState<CrmIntegrationFormValues>(emptyForm);
  const [createdSecret, setCreatedSecret] = useState<{ integration: CrmIntegration; secret: string } | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const [integrationToDelete, setIntegrationToDelete] = useState<CrmIntegration | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);

  const copy = async (value: string, message = FALLBACKS.copied) => {
    await navigator.clipboard.writeText(value);
    setSecretCopied(true);
    toast({ title: t('settings.api_access.integrations.copied', message) });
  };

  const loadIntegrations = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(INTEGRATIONS_URL);
      if (!response.ok) throw new Error();
      setIntegrations(normalizeCrmIntegrations(await response.json()));
    } catch {
      toast({ title: t('settings.api_access.integrations.load_failed', FALLBACKS.loadFailed), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void loadIntegrations(); }, []);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (integration: CrmIntegration) => {
    setEditing(integration);
    setForm({ name: integration.name, provider: integration.provider, webhookUrl: integration.webhookUrl ?? '', scopes: integration.scopes });
    setDialogOpen(true);
  };

  const submit = async () => {
    const payload = buildCrmIntegrationPayload(form);
    if (!payload.name) {
      toast({ title: t('settings.api_access.integrations.invalid_name', FALLBACKS.invalidName), variant: 'destructive' });
      return;
    }
    if (payload.webhookUrl && !/^https:\/\//i.test(payload.webhookUrl)) {
      toast({ title: t('settings.api_access.integrations.invalid_webhook', FALLBACKS.invalidWebhook), variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch(editing ? `${INTEGRATIONS_URL}/${editing.id}` : INTEGRATIONS_URL, {
        method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || data.error || FALLBACKS.saveFailed);
      const normalized = normalizeCreatedCrmIntegration(data);
      setDialogOpen(false);
      await loadIntegrations();
      if (!editing && normalized?.webhookSecret) {
        setSecretCopied(false);
        setCreatedSecret({ integration: normalized, secret: normalized.webhookSecret });
      }
      toast({ title: editing ? t('settings.api_access.integrations.saved', FALLBACKS.saved) : t('settings.api_access.integrations.created', FALLBACKS.created) });
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : t('settings.api_access.integrations.save_failed', FALLBACKS.saveFailed), variant: 'destructive' });
    } finally { setIsSaving(false); }
  };

  const rotateSecret = async (integration: CrmIntegration) => {
    setIsRotating(true);
    try {
      const action = buildCrmIntegrationAction(integration.id, 'rotate-secret');
      const response = await fetch(action.url, { method: action.method });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || data.error || FALLBACKS.rotateFailed);
      const normalized = normalizeCreatedCrmIntegration(data);
      if (!normalized?.webhookSecret) throw new Error(FALLBACKS.rotateFailed);
      setSecretCopied(false);
      setCreatedSecret({ integration: normalized, secret: normalized.webhookSecret });
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : FALLBACKS.rotateFailed, variant: 'destructive' });
    } finally { setIsRotating(false); }
  };

  const revealSecret = async (integration: CrmIntegration) => {
    setIsRevealing(true);
    try {
      const action = buildCrmIntegrationAction(integration.id, 'reveal-secret');
      const response = await fetch(action.url, { method: action.method });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || data.error || FALLBACKS.revealFailed);
      const normalized = normalizeCreatedCrmIntegration(data);
      if (!normalized?.webhookSecret) throw new Error(FALLBACKS.revealFailed);
      setSecretCopied(false);
      setCreatedSecret({ integration: normalized, secret: normalized.webhookSecret });
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : FALLBACKS.revealFailed, variant: 'destructive' });
    } finally { setIsRevealing(false); }
  };

  const deleteIntegration = async () => {
    if (!integrationToDelete) return;
    setIsDeleting(true);
    try {
      const action = buildCrmIntegrationAction(integrationToDelete.id, 'delete');
      const response = await fetch(action.url, { method: action.method });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || data.error || FALLBACKS.deleteFailed);
      setIntegrations((current) => current.filter(({ id }) => id !== integrationToDelete.id));
      setIntegrationToDelete(null);
      toast({ title: FALLBACKS.deleted });
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : FALLBACKS.deleteFailed, variant: 'destructive' });
    } finally { setIsDeleting(false); }
  };

  const toggleStatus = async (integration: CrmIntegration) => {
    try {
      const response = await fetch(`${INTEGRATIONS_URL}/${integration.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: integration.status === 'active' ? 'inactive' : 'active' }) });
      if (!response.ok) throw new Error();
      await loadIntegrations();
    } catch { toast({ title: t('settings.api_access.integrations.save_failed', FALLBACKS.saveFailed), variant: 'destructive' }); }
  };

  const providerLabel = (provider: string) => t(`settings.api_access.integrations.providers.${provider}`, provider === 'generic' ? FALLBACKS.providerGeneric : provider);
  const selectedCount = useMemo(() => form.scopes.length, [form.scopes]);

  return <section className="space-y-4" aria-labelledby="crm-integrations-title">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><h2 id="crm-integrations-title" className="text-2xl font-semibold">{t('settings.api_access.integrations.title', FALLBACKS.title)}</h2><p className="text-sm text-muted-foreground">{t('settings.api_access.integrations.description', FALLBACKS.description)}</p></div>
      <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />{t('settings.api_access.integrations.create', FALLBACKS.create)}</Button>
    </div>
    <Alert><ShieldCheck className="h-4 w-4" /><AlertTitle>{t('settings.api_access.integrations.flow_title', 'Cómo funciona')}</AlertTitle><AlertDescription>{t('settings.api_access.integrations.flow_description', 'Crea una integración para obtener un ID único. Las solicitudes del cliente usan Authorization: Bearer API_KEY y X-Zinto-Integration-Id: ID.')}</AlertDescription></Alert>

    {isLoading ? <div className="flex items-center justify-center py-10 text-muted-foreground"><RefreshCw className="mr-2 h-5 w-5 animate-spin" />{t('settings.api_access.integrations.loading', FALLBACKS.loading)}</div> : integrations.length === 0 ? <Card><CardContent className="flex flex-col items-center gap-3 py-10 text-center"><Link2 className="h-10 w-10 text-muted-foreground" /><p className="font-medium">{t('settings.api_access.integrations.no_integrations', FALLBACKS.noIntegrations)}</p><p className="text-sm text-muted-foreground">{t('settings.api_access.integrations.create_first', FALLBACKS.createFirst)}</p><Button variant="outline" onClick={openCreate}>{t('settings.api_access.integrations.create', FALLBACKS.create)}</Button></CardContent></Card> : <div className="grid gap-4">{integrations.map((integration) => <Card key={integration.id}><CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="flex items-center gap-2">{integration.name}<Badge variant={integration.status === 'active' ? 'default' : 'secondary'}>{integration.status === 'active' ? <><Check className="mr-1 h-3 w-3" />{t('settings.api_access.integrations.active', FALLBACKS.active)}</> : integration.status === 'draft' ? t('settings.api_access.integrations.draft', FALLBACKS.draft) : <><XCircle className="mr-1 h-3 w-3" />{t('settings.api_access.integrations.inactive', FALLBACKS.inactive)}</>}</Badge></CardTitle><CardDescription>{providerLabel(integration.provider)}</CardDescription></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => openEdit(integration)}><Edit3 className="mr-1 h-3.5 w-3.5" />{t('settings.api_access.integrations.edit', FALLBACKS.edit)}</Button><Button size="sm" variant="outline" onClick={() => void toggleStatus(integration)}>{integration.status === 'active' ? t('settings.api_access.integrations.deactivate', FALLBACKS.deactivate) : t('settings.api_access.integrations.activate', FALLBACKS.activate)}</Button><Button size="sm" variant="outline" onClick={() => void revealSecret(integration)} disabled={isRevealing}><Eye className="mr-1 h-3.5 w-3.5" />{t('settings.api_access.integrations.reveal_secret', FALLBACKS.revealSecret)}</Button><Button size="sm" variant="outline" onClick={() => void rotateSecret(integration)} disabled={isRotating}><RotateCcw className="mr-1 h-3.5 w-3.5" />{t('settings.api_access.integrations.rotate_secret', FALLBACKS.rotateSecret)}</Button><Button size="sm" variant="destructive" onClick={() => setIntegrationToDelete(integration)}><Trash2 className="mr-1 h-3.5 w-3.5" />{t('settings.api_access.integrations.delete', FALLBACKS.delete)}</Button></div></div></CardHeader><CardContent><div className="grid gap-4 text-sm md:grid-cols-4"><div><Label className="text-muted-foreground">{t('settings.api_access.integrations.id', FALLBACKS.id)}</Label><div className="mt-1 flex items-center gap-2"><code className="rounded bg-muted px-2 py-1 font-semibold">{integration.id}</code><Button size="icon" variant="ghost" className="h-7 w-7" aria-label={t('settings.api_access.integrations.copy', FALLBACKS.copy)} onClick={() => void copy(String(integration.id))}><Copy className="h-3.5 w-3.5" /></Button></div></div><div><Label className="text-muted-foreground">{t('settings.api_access.integrations.permissions', FALLBACKS.permissions)}</Label><p className="mt-1 break-words">{integration.scopes.length || 0}</p></div><div><Label className="text-muted-foreground">{t('settings.api_access.integrations.created_at', FALLBACKS.createdAt)}</Label><p className="mt-1">{integration.createdAt ? formatDistanceToNow(new Date(integration.createdAt), { addSuffix: true, locale: dateLocale }) : '—'}</p></div><div><Label className="text-muted-foreground">{t('settings.api_access.integrations.last_sync', FALLBACKS.lastSync)}</Label><p className="mt-1">{integration.lastSyncAt ? formatDistanceToNow(new Date(integration.lastSyncAt), { addSuffix: true, locale: dateLocale }) : t('settings.api_access.integrations.never', FALLBACKS.never)}</p></div></div><div className="mt-4 rounded-md border bg-muted/30 p-3"><p className="mb-1 text-xs font-medium text-muted-foreground">{t('settings.api_access.integrations.request_header', 'Encabezado para el cliente')}</p><code className="break-all text-xs">X-Zinto-Integration-Id: {integration.id}</code></div></CardContent></Card>)}</div>}

    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{t(editing ? 'settings.api_access.integrations.edit' : 'settings.api_access.integrations.create', editing ? FALLBACKS.edit : FALLBACKS.create)}</DialogTitle><DialogDescription>{t('settings.api_access.integrations.form_description', 'Configura el sistema externo que se sincronizará con Zinto.')}</DialogDescription></DialogHeader><div className="space-y-4 py-2"><div className="space-y-2"><Label htmlFor="crm-integration-name">{t('settings.api_access.integrations.name', FALLBACKS.name)}</Label><Input id="crm-integration-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Mi CRM" /></div><div className="space-y-2"><Label>{t('settings.api_access.integrations.provider', FALLBACKS.provider)}</Label><Select value={form.provider} onValueChange={(provider) => setForm((current) => ({ ...current, provider }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PROVIDERS.map((provider) => <SelectItem key={provider} value={provider}>{providerLabel(provider)}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="crm-integration-webhook">{t('settings.api_access.integrations.webhook', FALLBACKS.webhook)}</Label><Input id="crm-integration-webhook" type="url" value={form.webhookUrl} onChange={(event) => setForm((current) => ({ ...current, webhookUrl: event.target.value }))} placeholder="https://tu-crm.com/webhooks/zinto" /><p className="text-xs text-muted-foreground">{t('settings.api_access.integrations.webhook_help', 'Opcional en sandbox; en producción usa siempre HTTPS.')}</p></div><div className="space-y-2"><div className="flex items-center justify-between"><Label>{t('settings.api_access.integrations.scopes', FALLBACKS.scopes)}</Label><span className="text-xs text-muted-foreground">{selectedCount}</span></div><div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">{API_KEY_SCOPES.map((scope) => <label key={scope} className="flex items-center gap-2 text-sm"><Switch checked={form.scopes.includes(scope)} onCheckedChange={() => setForm((current) => ({ ...current, scopes: toggleApiKeyScope(current.scopes, scope) }))} aria-label={scope} /><span>{scope}</span></label>)}</div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>{t('settings.api_access.integrations.cancel', FALLBACKS.cancel)}</Button><Button onClick={() => void submit()} disabled={isSaving}>{isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('settings.api_access.integrations.save', FALLBACKS.save)}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(createdSecret)} onOpenChange={(open) => { if (!open) setCreatedSecret(null); }}><DialogContent><DialogHeader><DialogTitle>{t('settings.api_access.integrations.secret_dialog_title', FALLBACKS.secretDialogTitle)}</DialogTitle><DialogDescription>{t('settings.api_access.integrations.secret_dialog_description', FALLBACKS.secretDialogDescription)}</DialogDescription></DialogHeader>{createdSecret && <div className="space-y-4"><div><Label>{t('settings.api_access.integrations.id', FALLBACKS.id)}</Label><code className="mt-1 block rounded bg-muted p-3">{createdSecret.integration.id}</code></div><div><Label>{t('settings.api_access.integrations.secret', FALLBACKS.secret)}</Label><div className="mt-1 flex gap-2"><Input readOnly value={createdSecret.secret} type={secretCopied ? 'text' : 'password'} /><Button variant="outline" onClick={() => void copy(createdSecret.secret)}><Copy className="mr-2 h-4 w-4" />{t('settings.api_access.integrations.copy', FALLBACKS.copy)}</Button></div><p className="mt-2 text-xs text-amber-700">{t('settings.api_access.integrations.secret_help', FALLBACKS.secretHelp)}</p></div></div>}<DialogFooter><Button onClick={() => setCreatedSecret(null)}>{t('settings.api_access.integrations.close', FALLBACKS.close)}</Button></DialogFooter></DialogContent></Dialog>
    <AlertDialog open={Boolean(integrationToDelete)} onOpenChange={(open) => { if (!open && !isDeleting) setIntegrationToDelete(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('settings.api_access.integrations.delete_title', FALLBACKS.deleteTitle)}</AlertDialogTitle><AlertDialogDescription>{integrationToDelete ? `${t('settings.api_access.integrations.delete_description', FALLBACKS.deleteDescription)} (${integrationToDelete.name})` : FALLBACKS.deleteDescription}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={isDeleting}>{t('settings.api_access.integrations.cancel', FALLBACKS.cancel)}</AlertDialogCancel><AlertDialogAction onClick={(event) => { event.preventDefault(); void deleteIntegration(); }} disabled={isDeleting}>{isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('settings.api_access.integrations.delete_confirm', FALLBACKS.deleteConfirm)}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}
