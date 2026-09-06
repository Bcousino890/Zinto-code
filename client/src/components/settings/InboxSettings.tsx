import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from '@/hooks/use-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useTranslation } from '@/hooks/use-translation';
import { useConversations } from '@/context/ConversationContext';
import {
  notificationManager,
  requestNotificationPermission,
  getNotificationPermission,
  canRequestNotificationPermission,
  testNotification
} from '@/utils/browser-notifications';
import { Loader2, MessageCircle, Users, Info, History, Download, RefreshCw, Bell, BellOff, Mic, Building, Shield, Key, CheckCircle, AlertTriangle, Copy, Code2, ImageIcon } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useChannelConnections } from '@/hooks/useChannelConnections';
import { Progress } from "@/components/ui/progress";
import useSocket from '@/hooks/useSocket';
import { InboxBackupRestore } from './InboxBackupRestore';
import { InboxRestore } from './InboxRestore';
import { InboxAvailabilityAdminSettings } from './InboxAvailabilityAdminSettings';
import { buildInboxEmbedCode, buildInboxEmbedUrl } from '@/utils/inbox-embed';
import { useAuth } from '@/hooks/use-auth';

type InboxSettingsResponse = {
  showGroupChats: boolean;
  browserNotifications: boolean;
  agentSignatureEnabled: boolean;
  botAutoPauseOnOwnerReplyEnabled?: boolean;
  botAutoPauseDurationMinutes?: number;
  inboxEmbeddingEnabled?: boolean;
  audioTranscriptionEnabled?: boolean;
  audioTranscriptionAutomatic?: boolean;
  audioTranscriptionProvider?: string;
  audioTranscriptionCredentialSource?: string;
  audioTranscriptionCredentialId?: number | null;
  audioTranscriptionManualApiKey?: string;
  imageAnalysisEnabled?: boolean;
  imageAnalysisProvider?: string;
  imageAnalysisCredentialSource?: string;
  imageAnalysisCredentialId?: number | null;
  imageAnalysisManualApiKey?: string;
};

async function fetchInboxSettings(): Promise<InboxSettingsResponse> {
  const response = await apiRequest('GET', '/api/settings/inbox');
  if (!response.ok) {
    throw new Error('Failed to fetch inbox settings');
  }

  return response.json();
}

function useInboxSettingsQuery() {
  return useQuery<InboxSettingsResponse>({
    queryKey: ['/api/settings/inbox'],
    queryFn: fetchInboxSettings,
  });
}

export function InboxSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { showGroupChats, updateGroupChatSetting, browserNotifications, updateBrowserNotificationSetting, agentSignatureEnabled, updateAgentSignatureSetting } = useConversations();
  const [isUpdating, setIsUpdating] = useState(false);
  const [isUpdatingNotifications, setIsUpdatingNotifications] = useState(false);
  const [isUpdatingAgentSignature, setIsUpdatingAgentSignature] = useState(false);
  const [isUpdatingBotAutoPause, setIsUpdatingBotAutoPause] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(getNotificationPermission());
  const [botAutoPauseOnOwnerReplyEnabled, setBotAutoPauseOnOwnerReplyEnabled] = useState(true);
  const [botAutoPauseDurationMinutes, setBotAutoPauseDurationMinutes] = useState(3);
  const { data: channelConnections } = useChannelConnections();

  const { data: inboxSettings, isLoading } = useInboxSettingsQuery();

  useEffect(() => {
    if (!inboxSettings) {
      return;
    }

    setBotAutoPauseOnOwnerReplyEnabled(inboxSettings.botAutoPauseOnOwnerReplyEnabled ?? true);
    setBotAutoPauseDurationMinutes(inboxSettings.botAutoPauseDurationMinutes ?? 3);
  }, [inboxSettings]);

  const handleGroupChatToggle = async (enabled: boolean) => {
    setIsUpdating(true);
    try {
      await updateGroupChatSetting(enabled);
    } catch (error) {
      console.error('Error updating group chat setting:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleBrowserNotificationToggle = async (enabled: boolean) => {
    setIsUpdatingNotifications(true);
    try {
      if (enabled) {

        if (!notificationManager.isNotificationSupported()) {
          toast({
            title: t('settings.notifications_not_supported', 'Notifications Not Supported'),
            description: t('settings.notifications_not_supported_desc', 'Your browser does not support notifications.'),
            variant: 'destructive',
          });
          return;
        }


        if (notificationPermission !== 'granted') {
          const permission = await requestNotificationPermission();
          setNotificationPermission(permission);

          if (permission !== 'granted') {
            toast({
              title: t('settings.notification_permission_denied', 'Permission Denied'),
              description: t('settings.notification_permission_denied_desc', 'Please enable notifications in your browser settings to receive alerts.'),
              variant: 'destructive',
            });
            return;
          }
        }


        await testNotification();
      }

      await updateBrowserNotificationSetting(enabled);
    } catch (error) {
      console.error('Error updating browser notification setting:', error);
    } finally {
      setIsUpdatingNotifications(false);
    }
  };

  const handleAgentSignatureToggle = async (enabled: boolean) => {
    setIsUpdatingAgentSignature(true);
    try {
      await updateAgentSignatureSetting(enabled);
    } catch (error) {
      console.error('Error updating agent signature setting:', error);
    } finally {
      setIsUpdatingAgentSignature(false);
    }
  };

  const handleBotAutoPauseToggle = async (enabled: boolean) => {
    setIsUpdatingBotAutoPause(true);
    try {
      const response = await apiRequest('PATCH', '/api/settings/inbox', {
        botAutoPauseOnOwnerReplyEnabled: enabled
      });
      if (!response.ok) {
        throw new Error('Failed to update');
      }

      setBotAutoPauseOnOwnerReplyEnabled(enabled);
      queryClient.invalidateQueries({ queryKey: ['/api/settings/inbox'] });
      toast({
        title: t('settings.updated', 'Settings Updated'),
        description: enabled
          ? t('settings.inbox.bot_auto_pause_enabled', 'Bot auto-pause enabled')
          : t('settings.inbox.bot_auto_pause_disabled', 'Bot auto-pause disabled')
      });
    } catch (error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('settings.inbox.bot_auto_pause_update_failed', 'Failed to update bot auto-pause setting'),
        variant: 'destructive'
      });
    } finally {
      setIsUpdatingBotAutoPause(false);
    }
  };

  const handleBotAutoPauseDurationSave = async () => {
    const clampedDuration = Math.max(1, Math.min(1440, Math.floor(botAutoPauseDurationMinutes || 3)));
    setIsUpdatingBotAutoPause(true);
    try {
      const response = await apiRequest('PATCH', '/api/settings/inbox', {
        botAutoPauseDurationMinutes: clampedDuration
      });
      if (!response.ok) {
        throw new Error('Failed to update');
      }
      setBotAutoPauseDurationMinutes(clampedDuration);
      queryClient.invalidateQueries({ queryKey: ['/api/settings/inbox'] });
      toast({
        title: t('settings.updated', 'Settings Updated'),
        description: t('settings.inbox.bot_auto_pause_duration_saved', 'Bot auto-pause duration saved')
      });
    } catch (error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('settings.inbox.bot_auto_pause_duration_failed', 'Failed to save bot auto-pause duration'),
        variant: 'destructive'
      });
    } finally {
      setIsUpdatingBotAutoPause(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            {t('settings.inbox.title', 'Inbox')}
          </CardTitle>
          <CardDescription>
            {t('settings.inbox.description', 'Configure how your inbox displays conversations and messages')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            {t('settings.inbox.title', 'Inbox')}
          </CardTitle>
          <CardDescription>
            {t('settings.inbox.description', 'Configure how your inbox displays conversations and messages')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            

            {/* Browser Notifications Setting */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="browser-notifications" className="text-base font-medium flex items-center gap-2">
                  {browserNotifications ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                  {t('settings.inbox.browser_notifications', 'Browser Notifications')}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t('settings.inbox.browser_notifications_description', 'Receive desktop notifications when new messages arrive (only when the page is not in focus)')}
                </p>
                {notificationPermission === 'denied' && (
                  <p className="text-sm text-red-600">
                    {t('settings.inbox.notifications_blocked', 'Notifications are blocked. Please enable them in your browser settings.')}
                  </p>
                )}
                {notificationPermission === 'default' && browserNotifications && (
                  <p className="text-sm text-amber-600">
                    {t('settings.inbox.notifications_permission_needed', 'Permission will be requested when you enable notifications.')}
                  </p>
                )}
              </div>
              <Switch
                id="browser-notifications"
                checked={browserNotifications}
                onCheckedChange={handleBrowserNotificationToggle}
                disabled={isUpdatingNotifications || !notificationManager.isNotificationSupported()}
              />
            </div>

            {browserNotifications && notificationPermission === 'granted' && (
              <Alert>
                <Bell className="h-4 w-4" />
                <AlertDescription>
                  {t('settings.inbox.browser_notifications_enabled_info', 'You will receive desktop notifications for new messages when the page is not in focus. You can test notifications using the button below.')}
                </AlertDescription>
                <div className="mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {

                      try {
                        const result = await testNotification();

                        if (!result) {
                          toast({
                            title: t('whatsapp_business.test_failed', 'Test Failed'),
                            description: t('settings.inbox.test_notification_failed_desc', 'Could not show test notification. Check browser console for details.'),
                            variant: 'destructive',
                          });
                        }
                      } catch (error) {
                        console.error('Test notification error:', error);
                        toast({
                          title: t('whatsapp_business.test_failed', 'Test Failed'),
                          description: t('settings.inbox.test_notification_error_desc', 'Error showing test notification: {{message}}', { message: error instanceof Error ? error.message : String(error) }),
                          variant: 'destructive',
                        });
                      }
                    }}
                    className="flex items-center gap-2"
                  >
                    <Bell className="h-3 w-3" />
                    {t('settings.inbox.test_notification', 'Test Notification')}
                  </Button>
                </div>
              </Alert>
            )}

            {/* Agent Signature Setting */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="agent-signature" className="text-base font-medium flex items-center gap-2">
                  <i className="ri-user-line text-base"></i>
                  {t('settings.inbox.agent_signature', 'Agent Signature')}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t('settings.inbox.agent_signature_description', 'Automatically add agent name to outbound messages')}
                </p>
              </div>
              <Switch
                id="agent-signature"
                checked={agentSignatureEnabled}
                onCheckedChange={handleAgentSignatureToggle}
                disabled={isUpdatingAgentSignature}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="bot-auto-pause" className="text-base font-medium flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" />
                  {t('settings.inbox.bot_auto_pause', 'Pause bot replies after owner reply')}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t('settings.inbox.bot_auto_pause_description', 'When an owner/agent sends a message, bot replies for that contact are paused for the configured duration.')}
                </p>
              </div>
              <Switch
                id="bot-auto-pause"
                checked={botAutoPauseOnOwnerReplyEnabled}
                onCheckedChange={handleBotAutoPauseToggle}
                disabled={isUpdatingBotAutoPause}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bot-auto-pause-duration" className="text-sm font-medium">
                {t('settings.inbox.bot_auto_pause_duration', 'Pause duration (minutes)')}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="bot-auto-pause-duration"
                  type="number"
                  min={1}
                  max={1440}
                  value={botAutoPauseDurationMinutes}
                  onChange={(e) => setBotAutoPauseDurationMinutes(Number(e.target.value))}
                  className="max-w-[180px]"
                  disabled={isUpdatingBotAutoPause}
                />
                <Button
                  variant="outline"
                  onClick={handleBotAutoPauseDurationSave}
                  disabled={isUpdatingBotAutoPause}
                >
                  {isUpdatingBotAutoPause ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {t('common.save', 'Save')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('settings.inbox.bot_auto_pause_duration_hint', 'Allowed range: 1 to 1440 minutes. Default is 3 minutes.')}
              </p>
            </div>
          </div>

        </CardContent>
      </Card>

      <InboxAvailabilityAdminSettings />

      <AudioTranscriptionSettings />

      <ImageAnalysisSettings />

      <InboxEmbeddingSettings />

      <WhatsAppHistorySyncSettings />

      {/* Backup & Restore Section */}
      <InboxBackupRestore />
      <InboxRestore />
    </div>
  );
}

function AudioTranscriptionSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isUpdatingTranscription, setIsUpdatingTranscription] = useState(false);
  const [credentialSource, setCredentialSource] = useState<string>('auto');
  const [manualApiKey, setManualApiKey] = useState('');
  const [transcriptionMode, setTranscriptionMode] = useState<'manual' | 'automatic'>('manual');

  const { data: inboxSettings } = useInboxSettingsQuery();

  const { data: companyCredentials } = useQuery({
    queryKey: ['/api/company/ai-credentials'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/company/ai-credentials');
      if (!response.ok) return { data: [] };
      const result = await response.json();
      return result;
    },
  });

  useEffect(() => {
    if (inboxSettings) {
      setCredentialSource(inboxSettings.audioTranscriptionCredentialSource || 'auto');
      setManualApiKey(inboxSettings.audioTranscriptionManualApiKey === '[REDACTED]' ? '' : (inboxSettings.audioTranscriptionManualApiKey || ''));
      setTranscriptionMode(inboxSettings.audioTranscriptionAutomatic ? 'automatic' : 'manual');
    }
  }, [inboxSettings]);

  const handleTranscriptionToggle = async (enabled: boolean) => {
    setIsUpdatingTranscription(true);
    try {
      const response = await apiRequest('PATCH', '/api/settings/inbox', { audioTranscriptionEnabled: enabled });
      if (!response.ok) throw new Error('Failed to update');
      queryClient.invalidateQueries({ queryKey: ['/api/settings/inbox'] });
      toast({ title: t('settings.updated', 'Settings Updated'), description: enabled ? t('settings.inbox.audio_transcription_enabled', 'Audio transcription enabled') : t('settings.inbox.audio_transcription_disabled', 'Audio transcription disabled') });
    } catch (error) {
      toast({ title: t('common.error', 'Error'), description: t('settings.inbox.audio_transcription_update_failed', 'Failed to update transcription setting'), variant: 'destructive' });
    } finally {
      setIsUpdatingTranscription(false);
    }
  };

  const handleSaveTranscriptionSettings = async () => {
    setIsUpdatingTranscription(true);
    try {
      const payload: Record<string, unknown> = {
        audioTranscriptionAutomatic: transcriptionMode === 'automatic',
        audioTranscriptionProvider: 'openai',
        audioTranscriptionCredentialSource: credentialSource,
      };
      if (credentialSource === 'manual' && manualApiKey) {
        payload.audioTranscriptionManualApiKey = manualApiKey;
      }
      const response = await apiRequest('PATCH', '/api/settings/inbox', payload);
      if (!response.ok) throw new Error('Failed to update');
      queryClient.invalidateQueries({ queryKey: ['/api/settings/inbox'] });
      toast({ title: t('settings.updated', 'Settings Updated'), description: t('settings.inbox.audio_transcription_settings_saved', 'Transcription settings saved') });
    } catch (error) {
      toast({ title: t('common.error', 'Error'), description: t('settings.inbox.audio_transcription_settings_update_failed', 'Failed to update transcription settings'), variant: 'destructive' });
    } finally {
      setIsUpdatingTranscription(false);
    }
  };

  const audioTranscriptionEnabled = inboxSettings?.audioTranscriptionEnabled ?? false;
  const credentials = companyCredentials?.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mic className="h-5 w-5" />
          {t('settings.inbox.audio_transcription', 'Audio Transcription')}
        </CardTitle>
        <CardDescription>
          {t('settings.inbox.audio_transcription_description', 'Transcribe inbound audio messages in the inbox using OpenAI Whisper')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="audio-transcription" className="text-base font-medium flex items-center gap-2">
              <Mic className="h-4 w-4" />
              {t('settings.inbox.audio_transcription_enabled', 'Enable Audio Transcription')}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t('settings.inbox.audio_transcription_enabled_description', 'Allow transcription of inbound audio messages in chat')}
            </p>
          </div>
          <Switch
            id="audio-transcription"
            checked={audioTranscriptionEnabled}
            onCheckedChange={handleTranscriptionToggle}
            disabled={isUpdatingTranscription}
          />
        </div>

        {audioTranscriptionEnabled && (
          <div className="space-y-4 pl-4 border-l-2 border-muted">
            <div>
              <Label className="text-sm font-medium">{t('settings.inbox.audio_transcription_mode', 'Transcription Mode')}</Label>
              <Select value={transcriptionMode} onValueChange={(v: 'manual' | 'automatic') => setTranscriptionMode(v)}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">{t('settings.inbox.audio_transcription_manual', 'Manual')} - {t('settings.inbox.audio_transcription_manual_desc', 'User clicks button to transcribe')}</SelectItem>
                  <SelectItem value="automatic">{t('settings.inbox.audio_transcription_automatic', 'Automatic')} - {t('settings.inbox.audio_transcription_automatic_desc', 'Transcribe when audio loads')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-medium flex items-center gap-1">
                <Key className="w-3 h-3" />
                {t('flow_builder.ai_credential_source', 'Credential Source')}
              </Label>
              <Select value={credentialSource} onValueChange={setCredentialSource}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    <div className="flex items-center gap-2">
                      <Shield className="w-3 h-3" />
                      <span>{t('flow_builder.ai_credential_auto', 'Auto (Company -> System -> Environment)')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="company">
                    <div className="flex items-center gap-2">
                      <Building className="w-3 h-3" />
                      <span>{t('flow_builder.ai_credential_company', 'Company Credentials')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="system">
                    <div className="flex items-center gap-2">
                      <Shield className="w-3 h-3" />
                      <span>{t('flow_builder.ai_credential_system', 'System Credentials')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="manual">
                    <div className="flex items-center gap-2">
                      <Key className="w-3 h-3" />
                      <span>{t('flow_builder.ai_credential_manual', 'Manual API Key')}</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              {credentialSource !== 'manual' && (
                <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                  {credentialSource === 'auto' && (
                    credentials?.find((c: any) => c.provider === 'openai' && c.isActive) ? (
                      <><CheckCircle className="w-3 h-3 text-green-500" />{t('flow_builder.ai_credential_company_available', 'Company credential available')}</>
                    ) : (
                      <><AlertTriangle className="w-3 h-3 text-amber-500" />{t('flow_builder.ai_credential_fallback', 'Will use system/environment fallback')}</>
                    )
                  )}
                  {credentialSource === 'company' && (
                    credentials?.find((c: any) => c.provider === 'openai' && c.isActive) ? (
                      <><CheckCircle className="w-3 h-3 text-green-500" />{t('flow_builder.ai_credential_company_configured', 'Company credential configured')}</>
                    ) : (
                      <><AlertTriangle className="w-3 h-3 text-amber-500" />{t('flow_builder.ai_credential_company_missing', 'No company credential for this provider')}</>
                    )
                  )}
                  {credentialSource === 'system' && (
                    <><Shield className="w-3 h-3 text-blue-500" />{t('flow_builder.ai_credential_system_configured', 'Using system credentials')}</>
                  )}
                </p>
              )}
            </div>

            {credentialSource === 'manual' && (
              <div>
                <Label className="text-sm font-medium">{t('flow_builder.ai_api_key', 'API Key')}</Label>
                <Input
                  type="password"
                  placeholder={t('flow_builder.ai_api_key_placeholder', 'Enter your {{provider}} API key', { provider: 'OpenAI' })}
                  value={manualApiKey}
                  onChange={(e) => setManualApiKey(e.target.value)}
                  className="mt-2"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    {t('flow_builder.ai_get_api_key', 'Get your API key here')}
                  </a>
                </p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {t('settings.inbox.audio_transcription_provider_note', 'Transcription uses OpenAI Whisper. Configure OpenAI credentials in AI Credentials settings.')}
            </p>

            <Button onClick={handleSaveTranscriptionSettings} disabled={isUpdatingTranscription}>
              {isUpdatingTranscription ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t('settings.inbox.save_transcription_settings', 'Save Transcription Settings')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ImageAnalysisSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isUpdatingImageAnalysis, setIsUpdatingImageAnalysis] = useState(false);
  const [provider, setProvider] = useState<string>('openai');
  const [credentialSource, setCredentialSource] = useState<string>('auto');
  const [credentialId, setCredentialId] = useState<string>('any');
  const [manualApiKey, setManualApiKey] = useState('');

  const { data: inboxSettings } = useInboxSettingsQuery();

  const { data: companyCredentials } = useQuery({
    queryKey: ['/api/company/ai-credentials'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/company/ai-credentials');
      if (!response.ok) return { data: [] };
      return response.json();
    },
  });

  useEffect(() => {
    if (inboxSettings) {
      setProvider(inboxSettings.imageAnalysisProvider || 'openai');
      setCredentialSource(inboxSettings.imageAnalysisCredentialSource || 'auto');
      setCredentialId(inboxSettings.imageAnalysisCredentialId ? String(inboxSettings.imageAnalysisCredentialId) : 'any');
      setManualApiKey(inboxSettings.imageAnalysisManualApiKey === '[REDACTED]' ? '' : (inboxSettings.imageAnalysisManualApiKey || ''));
    }
  }, [inboxSettings]);

  const handleImageAnalysisToggle = async (enabled: boolean) => {
    setIsUpdatingImageAnalysis(true);
    try {
      const response = await apiRequest('PATCH', '/api/settings/inbox', { imageAnalysisEnabled: enabled });
      if (!response.ok) throw new Error('Failed to update');
      queryClient.invalidateQueries({ queryKey: ['/api/settings/inbox'] });
      toast({
        title: t('settings.updated', 'Settings Updated'),
        description: enabled
          ? t('settings.inbox.image_analysis_enabled_toast', 'Image analysis enabled')
          : t('settings.inbox.image_analysis_disabled_toast', 'Image analysis disabled')
      });
    } catch (error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('settings.inbox.image_analysis_update_failed', 'Failed to update image analysis setting'),
        variant: 'destructive'
      });
    } finally {
      setIsUpdatingImageAnalysis(false);
    }
  };

  const handleSaveImageAnalysisSettings = async () => {
    setIsUpdatingImageAnalysis(true);
    try {
      const payload: Record<string, unknown> = {
        imageAnalysisProvider: provider,
        imageAnalysisCredentialSource: credentialSource,
        imageAnalysisCredentialId: credentialId !== 'any' ? Number(credentialId) : null,
      };
      if (credentialSource === 'manual') {
        payload.imageAnalysisManualApiKey = manualApiKey;
      }
      const response = await apiRequest('PATCH', '/api/settings/inbox', payload);
      if (!response.ok) throw new Error('Failed to update');
      queryClient.invalidateQueries({ queryKey: ['/api/settings/inbox'] });
      toast({ title: t('settings.updated', 'Settings Updated'), description: t('settings.inbox.image_analysis_settings_saved', 'Image analysis settings saved') });
    } catch (error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('settings.inbox.image_analysis_settings_update_failed', 'Failed to update image analysis settings'),
        variant: 'destructive'
      });
    } finally {
      setIsUpdatingImageAnalysis(false);
    }
  };

  const imageAnalysisEnabled = inboxSettings?.imageAnalysisEnabled ?? false;
  const credentials = companyCredentials?.data ?? [];
  const providerCredentials = credentials.filter((credential: any) => credential.provider === provider && credential.isActive);
  const providerLabel = provider === 'openrouter' ? 'OpenRouter' : 'OpenAI';
  const apiKeyUrl = provider === 'openrouter'
    ? 'https://openrouter.ai/settings/keys'
    : 'https://platform.openai.com/api-keys';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5" />
          {t('settings.inbox.image_analysis', 'Image Analysis')}
        </CardTitle>
        <CardDescription>
          {t('settings.inbox.image_analysis_description', 'Analyze inbound image messages manually using a vision-capable AI provider')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="image-analysis" className="text-base font-medium flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              {t('settings.inbox.image_analysis_enabled', 'Enable Image Analysis')}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t('settings.inbox.image_analysis_enabled_description', 'Allow manual OCR and visual summaries for inbound image messages in chat')}
            </p>
          </div>
          <Switch
            id="image-analysis"
            checked={imageAnalysisEnabled}
            onCheckedChange={handleImageAnalysisToggle}
            disabled={isUpdatingImageAnalysis}
          />
        </div>

        {imageAnalysisEnabled && (
          <div className="space-y-4 pl-4 border-l-2 border-muted">
            <div>
              <Label className="text-sm font-medium">{t('settings.inbox.image_analysis_provider', 'Provider')}</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="openrouter">OpenRouter</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-medium flex items-center gap-1">
                <Key className="w-3 h-3" />
                {t('flow_builder.ai_credential_source', 'Credential Source')}
              </Label>
              <Select value={credentialSource} onValueChange={setCredentialSource}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    <div className="flex items-center gap-2">
                      <Shield className="w-3 h-3" />
                      <span>{t('flow_builder.ai_credential_auto', 'Auto (Company -> System -> Environment)')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="company">
                    <div className="flex items-center gap-2">
                      <Building className="w-3 h-3" />
                      <span>{t('flow_builder.ai_credential_company', 'Company Credentials')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="system">
                    <div className="flex items-center gap-2">
                      <Shield className="w-3 h-3" />
                      <span>{t('flow_builder.ai_credential_system', 'System Credentials')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="manual">
                    <div className="flex items-center gap-2">
                      <Key className="w-3 h-3" />
                      <span>{t('flow_builder.ai_credential_manual', 'Manual API Key')}</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              {credentialSource !== 'manual' && (
                <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                  {credentialSource === 'auto' && (
                    providerCredentials.length > 0 ? (
                      <><CheckCircle className="w-3 h-3 text-green-500" />{t('flow_builder.ai_credential_company_available', 'Company credential available')}</>
                    ) : (
                      <><AlertTriangle className="w-3 h-3 text-amber-500" />{t('flow_builder.ai_credential_fallback', 'Will use system/environment fallback')}</>
                    )
                  )}
                  {credentialSource === 'company' && (
                    providerCredentials.length > 0 ? (
                      <><CheckCircle className="w-3 h-3 text-green-500" />{t('flow_builder.ai_credential_company_configured', 'Company credential configured')}</>
                    ) : (
                      <><AlertTriangle className="w-3 h-3 text-amber-500" />{t('flow_builder.ai_credential_company_missing', 'No company credential for this provider')}</>
                    )
                  )}
                  {credentialSource === 'system' && (
                    <><Shield className="w-3 h-3 text-blue-500" />{t('flow_builder.ai_credential_system_configured', 'Using system credentials')}</>
                  )}
                </p>
              )}
            </div>

            {credentialSource === 'company' && providerCredentials.length > 0 && (
              <div>
                <Label className="text-sm font-medium">{t('settings.inbox.image_analysis_company_credential', 'Company Credential')}</Label>
                <Select value={credentialId} onValueChange={setCredentialId}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder={t('settings.inbox.image_analysis_any_credential', 'Use any active credential')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">{t('settings.inbox.image_analysis_any_credential', 'Use any active credential')}</SelectItem>
                    {providerCredentials.map((credential: any) => (
                      <SelectItem key={credential.id} value={String(credential.id)}>
                        {credential.name || `${providerLabel} #${credential.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {credentialSource === 'manual' && (
              <div>
                <Label className="text-sm font-medium">{t('flow_builder.ai_api_key', 'API Key')}</Label>
                <Input
                  type="password"
                  placeholder={t('flow_builder.ai_api_key_placeholder', 'Enter your {{provider}} API key', { provider: providerLabel })}
                  value={manualApiKey}
                  onChange={(e) => setManualApiKey(e.target.value)}
                  className="mt-2"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  <a href={apiKeyUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    {t('flow_builder.ai_get_api_key', 'Get your API key here')}
                  </a>
                </p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {t('settings.inbox.image_analysis_provider_note', 'Image analysis runs only when a user manually requests it. Model selection is managed server-side.')}
            </p>

            <Button onClick={handleSaveImageAnalysisSettings} disabled={isUpdatingImageAnalysis}>
              {isUpdatingImageAnalysis ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t('settings.inbox.save_image_analysis_settings', 'Save Image Analysis Settings')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InboxEmbeddingSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { company } = useAuth();
  const queryClient = useQueryClient();
  const [isUpdatingEmbedding, setIsUpdatingEmbedding] = useState(false);
  const [copied, setCopied] = useState(false);
  const { data: inboxSettings } = useInboxSettingsQuery();

  const inboxEmbeddingEnabled = inboxSettings?.inboxEmbeddingEnabled ?? true;
  const companySlug = company?.subdomain || company?.slug;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const embedUrl = buildInboxEmbedUrl(origin, companySlug);
  const embedCode = buildInboxEmbedCode(origin, companySlug);

  const handleEmbeddingToggle = async (enabled: boolean) => {
    setIsUpdatingEmbedding(true);
    try {
      const response = await apiRequest('PATCH', '/api/settings/inbox', { inboxEmbeddingEnabled: enabled });
      if (!response.ok) throw new Error('Failed to update');

      queryClient.invalidateQueries({ queryKey: ['/api/settings/inbox'] });
      toast({
        title: t('settings.updated', 'Settings Updated'),
        description: enabled
          ? t('settings.inbox.embedding_enabled_toast', 'Inbox embedding enabled')
          : t('settings.inbox.embedding_disabled_toast', 'Inbox embedding disabled')
      });
    } catch (error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('settings.inbox.embedding_update_failed', 'Failed to update Inbox embedding setting'),
        variant: 'destructive'
      });
    } finally {
      setIsUpdatingEmbedding(false);
    }
  };

  const handleCopyEmbedCode = async () => {
    if (!inboxEmbeddingEnabled) {
      return;
    }

    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: t('common.copied', 'Copied to clipboard'),
        description: t('settings.inbox.embedding_code_copied', 'Inbox embed code copied to clipboard')
      });
    } catch (error) {
      toast({
        title: t('common.copy_failed', 'Copy failed'),
        description: t('common.copy_failed_desc', 'Failed to copy to clipboard'),
        variant: 'destructive'
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Code2 className="h-5 w-5" />
          {t('settings.inbox.embedding', 'Inbox Embedding')}
        </CardTitle>
        <CardDescription>
          {t('settings.inbox.embedding_description', 'Enable the embedded Inbox view and copy an iframe snippet for your external website')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="inbox-embedding" className="text-base font-medium flex items-center gap-2">
              <Code2 className="h-4 w-4" />
              {t('settings.inbox.embedding_enabled', 'Enable Inbox Embedding')}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t('settings.inbox.embedding_enabled_description', 'Allow the Inbox to be opened in an iframe or similar embedded container using the dedicated embedded route')}
            </p>
          </div>
          <Switch
            id="inbox-embedding"
            checked={inboxEmbeddingEnabled}
            onCheckedChange={handleEmbeddingToggle}
            disabled={isUpdatingEmbedding}
          />
        </div>

        {inboxEmbeddingEnabled ? (
          <div className="space-y-4 pl-4 border-l-2 border-muted">
            <div>
              <Label className="text-sm font-medium">{t('settings.inbox.embedding_url', 'Embedded Inbox URL')}</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('settings.inbox.embedding_url_description', 'Use this route if you need the direct embedded Inbox URL without the full-page layout.')}
              </p>
              <Input value={embedUrl} readOnly className="mt-2 font-mono text-xs" />
            </div>

            <div>
              <Label className="text-sm font-medium">{t('settings.inbox.embedding_code', 'Embed Code')}</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('settings.inbox.embedding_code_description', 'Copy this iframe snippet into your website. Logged-in users will stay in the embedded Inbox experience, and unauthenticated users will be redirected through the normal login flow first.')}
              </p>
              <Textarea
                value={embedCode}
                readOnly
                className="mt-2 min-h-[140px] font-mono text-xs"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleCopyEmbedCode} disabled={isUpdatingEmbedding}>
                <Copy className="mr-2 h-4 w-4" />
                {copied
                  ? t('common.copied', 'Copied to clipboard')
                  : t('settings.inbox.copy_embed_code', 'Copy Embed Code')}
              </Button>
            </div>
          </div>
        ) : (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              {t('settings.inbox.embedding_disabled_message', 'Inbox embedding is currently disabled. Enable it to generate a shareable iframe snippet for your website.')}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function WhatsAppHistorySyncSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: channelConnections } = useChannelConnections();
  const [syncingConnections, setSyncingConnections] = useState<Set<number>>(new Set());
  const { onMessage } = useSocket('/ws');

  useEffect(() => {
    const unsubscribe = onMessage('whatsappHistorySyncProgress', (data) => {
      const { connectionId, progress, total, status } = data.data;

      queryClient.setQueryData(['channel-connections'], (oldData: any) => {
        if (!oldData) return oldData;

        return oldData.map((conn: any) =>
          conn.id === connectionId
            ? {
                ...conn,
                historySyncStatus: status,
                historySyncProgress: progress,
                historySyncTotal: total
              }
            : conn
        );
      });
    });

    return unsubscribe;
  }, [onMessage, queryClient]);

  useEffect(() => {
    const unsubscribe = onMessage('whatsappHistorySyncComplete', (data) => {
      const { connectionId } = data.data;

      queryClient.setQueryData(['channel-connections'], (oldData: any) => {
        if (!oldData) return oldData;

        return oldData.map((conn: any) =>
          conn.id === connectionId
            ? {
                ...conn,
                historySyncStatus: 'completed',
                lastHistorySyncAt: new Date().toISOString()
              }
            : conn
        );
      });

      setSyncingConnections(prev => {
        const newSet = new Set(prev);
        newSet.delete(connectionId);
        return newSet;
      });
    });

    return unsubscribe;
  }, [onMessage, queryClient]);

  const whatsappConnections = channelConnections?.filter(conn =>
    conn.channelType === 'whatsapp_unofficial' || conn.channelType === 'whatsapp'
  ) || [];

  const handleToggleHistorySync = async (connectionId: number, enabled: boolean) => {
    try {
      const response = await apiRequest('PUT', `/api/channel-connections/${connectionId}/history-sync`, {
        enabled
      });

      if (!response.ok) {
        throw new Error(t('settings.inbox.update_history_sync_failed', 'Failed to update history sync setting'));
      }

      toast({
        title: enabled ? t('settings.inbox.history_sync_enabled', 'History Sync Enabled') : t('settings.inbox.history_sync_disabled', 'History Sync Disabled'),
        description: enabled
          ? t('settings.inbox.history_sync_enabled_desc', 'WhatsApp message history will be synced on next connection')
          : t('settings.inbox.history_sync_disabled_desc', 'History sync has been disabled for this connection')
      });

      queryClient.invalidateQueries({ queryKey: ['/api/channel-connections'] });
    } catch (error) {
      console.error('Error updating history sync:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('settings.inbox.update_history_sync_failed', 'Failed to update history sync setting'),
        variant: "destructive"
      });
    }
  };

  const handleManualSync = async (connectionId: number) => {
    setSyncingConnections(prev => new Set(prev).add(connectionId));

    try {
      const response = await apiRequest('POST', `/api/channel-connections/${connectionId}/sync-history`);

      if (!response.ok) {
        throw new Error(t('settings.inbox.start_history_sync_failed', 'Failed to start history sync'));
      }

      toast({
        title: t('settings.inbox.history_sync_started', 'History Sync Started'),
        description: t('settings.inbox.history_sync_started_desc', 'WhatsApp will reconnect to sync message history from the last 7 days. You may need to scan the QR code again.')
      });
    } catch (error) {
      console.error('Error starting history sync:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('settings.inbox.start_history_sync_failed', 'Failed to start history sync'),
        variant: "destructive"
      });
    } finally {
      setSyncingConnections(prev => {
        const newSet = new Set(prev);
        newSet.delete(connectionId);
        return newSet;
      });
    }
  };

  if (whatsappConnections.length === 0) {
    return null;
  }
































































































}
