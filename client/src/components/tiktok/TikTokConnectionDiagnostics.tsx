import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import type { TikTokConnectionHealth } from '@shared/types/tiktok';
import {
  RefreshCw,
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Shield,
  Globe,
  MessageSquare,
  Image as ImageIcon,
  Video
} from 'lucide-react';

interface TikTokConnectionDiagnosticsProps {
  connectionId: number;
  onReconnect?: () => void;
}

export default function TikTokConnectionDiagnostics({ connectionId, onReconnect }: TikTokConnectionDiagnosticsProps) {
  const { t } = useTranslation();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: health, refetch, isLoading } = useQuery({
    queryKey: ['tiktok-diagnostics', connectionId],
    queryFn: async () => {
      const response = await fetch(`/api/tiktok/connections/${connectionId}/diagnostics`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch diagnostics');
      const json = await response.json();
      return json.health as TikTokConnectionHealth;
    },
    refetchInterval: 30000,
    enabled: !!connectionId
  });

  type TikTokCapabilitiesPayload = {
    capabilities: {
      supportsRichMedia?: boolean;
      supportedMediaTypes?: string[];
      supportsTypingIndicator?: boolean;
      supportsReadReceipts?: boolean;
      supportsReactions?: boolean;
    };
  };

  const { data: capsPayload } = useQuery({
    queryKey: ['tiktok-connection-capabilities', connectionId],
    queryFn: async () => {
      const response = await fetch(`/api/tiktok/connections/${connectionId}/capabilities`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch capabilities');
      return response.json() as Promise<TikTokCapabilitiesPayload>;
    },
    enabled: !!connectionId,
    staleTime: 60_000
  });

  const { data: regionPayload } = useQuery({
    queryKey: ['tiktok-region-info', connectionId],
    queryFn: async () => {
      const response = await fetch(`/api/tiktok/connections/${connectionId}/region-info`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch region info');
      return response.json() as Promise<{
        regionCode: string | null;
        isRestricted: boolean;
        unavailableFeatures: string[];
      }>;
    },
    enabled: !!connectionId,
    staleTime: 60_000
  });

  const refreshTokenMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/tiktok/connections/${connectionId}/refresh-token`, {
        method: 'POST',
        credentials: 'include'
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Refresh failed');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tiktok-diagnostics', connectionId] });
      toast({ title: t('tiktok.connection_diagnostics.token_refreshed_title', 'Token refreshed'), description: t('tiktok.connection_diagnostics.token_refreshed_description', 'Connection token has been refreshed.') });
    },
    onError: (e: Error) => {
      toast({ title: t('tiktok.connection_diagnostics.refresh_failed_title', 'Refresh failed'), description: e.message, variant: 'destructive' });
    }
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      await queryClient.invalidateQueries({ queryKey: ['tiktok-connection-capabilities', connectionId] });
      await queryClient.invalidateQueries({ queryKey: ['tiktok-region-info', connectionId] });
      toast({ title: t('whatsapp.connection_diagnostics.refreshed_title', 'Diagnostics refreshed'), description: t('whatsapp.connection_diagnostics.refreshed_description', 'Connection diagnostics have been updated.') });
    } catch {
      toast({ title: t('tiktok.connection_diagnostics.refresh_failed_title', 'Refresh failed'), description: t('whatsapp.connection_diagnostics.refresh_failed_description', 'Failed to refresh diagnostics.'), variant: 'destructive' });
    } finally {
      setIsRefreshing(false);
    }
  };

  const getHealthScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    if (score >= 40) return 'text-orange-600';
    return 'text-red-600';
  };

  const formatDate = (d: Date | string | null) => {
    if (!d) return t('whatsapp.connection_diagnostics.never', 'Never');
    const date = typeof d === 'string' ? new Date(d) : d;
    return date.toLocaleString();
  };

  const formatTimeAgo = (d: Date | string | null) => {
    if (!d) return t('whatsapp.connection_diagnostics.never', 'Never');
    const date = typeof d === 'string' ? new Date(d) : d;
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return t('whatsapp.connection_diagnostics.days_ago', '{{count}}d ago', { count: days });
    if (hours > 0) return t('whatsapp.connection_diagnostics.hours_ago', '{{count}}h ago', { count: hours });
    if (minutes > 0) return t('whatsapp.connection_diagnostics.minutes_ago', '{{count}}m ago', { count: minutes });
    return t('whatsapp.connection_diagnostics.just_now', 'Just now');
  };

  const formatTokenExpiry = (d: Date | string) => {
    const date = typeof d === 'string' ? new Date(d) : d;
    const diff = date.getTime() - Date.now();
    if (diff <= 0) return t('tiktok.connection_diagnostics.expired', 'Expired');
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    if (days > 0) return days !== 1
      ? t('tiktok.connection_diagnostics.expires_in_days', 'In {{count}} days', { count: days })
      : t('tiktok.connection_diagnostics.expires_in_day', 'In {{count}} day', { count: days });
    return hours !== 1
      ? t('tiktok.connection_diagnostics.expires_in_hours', 'In {{count}} hours', { count: hours })
      : t('tiktok.connection_diagnostics.expires_in_hour', 'In {{count}} hour', { count: hours });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            {t('tiktok.connection_diagnostics.title', 'TikTok Connection Diagnostics')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!health) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            {t('tiktok.connection_diagnostics.title', 'TikTok Connection Diagnostics')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
            <p>{t('whatsapp.connection_diagnostics.unable_to_load', 'Unable to load diagnostics')}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            {t('tiktok.connection_diagnostics.title', 'TikTok Connection Diagnostics')}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            {t('common.refresh', 'Refresh')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{t('whatsapp.connection_diagnostics.health_score', 'Health Score')}</span>
            <Badge variant={health.healthScore >= 80 ? 'default' : health.healthScore >= 60 ? 'secondary' : 'destructive'}>
              {health.healthScore}/100
            </Badge>
          </div>
          <Progress value={health.healthScore} className="h-2" />
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t('whatsapp.connection_diagnostics.status', 'Status')}</span>
            </div>
            <Badge variant={health.status === 'connected' ? 'default' : 'secondary'}>
              {health.status === 'connected' && t('tiktok.connection_diagnostics.status_connected', '✓ Connected')}
              {health.status === 'token_expiring' && t('tiktok.connection_status.token_expiring', 'Token Expiring')}
              {health.status === 'disconnected' && t('header.disconnected', 'Disconnected')}
              {health.status === 'error' && t('common.error', 'Error')}
            </Badge>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t('tiktok.connection_diagnostics.token_expires', 'Token Expires')}</span>
            </div>
            <span className={`text-sm ${getHealthScoreColor(health.healthScore)}`}>
              {formatTokenExpiry(health.tokenExpiresAt)}
            </span>
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          <span>{t('tiktok.connection_diagnostics.last_successful_call', 'Last successful call: {{time}}', { time: formatTimeAgo(health.lastSuccessfulCall) })}</span>
        </div>
        {health.errorCount > 0 && (
          <div className="text-sm">
            <span className="text-muted-foreground">{t('tiktok.connection_diagnostics.error_count_label', 'Error count: ')}</span>
            <Badge variant="destructive">{health.errorCount}</Badge>
            {health.lastError && (
              <p className="mt-1 text-destructive text-xs">{health.lastError}</p>
            )}
          </div>
        )}

        <Separator />

        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            {t('tiktok.connection_diagnostics.granted_scopes', 'Granted Scopes')}
          </h4>
          <div className="flex flex-wrap gap-1">
            {health.grantedScopes.map((scope) => (
              <Badge key={scope} variant="default" className="text-xs">
                ✓ {scope}
              </Badge>
            ))}
            {health.missingScopes.length > 0 && (
              <div className="mt-2">
                <span className="text-xs text-amber-600 dark:text-amber-500">
                  {t('tiktok.connection_diagnostics.required_permissions_missing', 'Required permissions missing: {{scopes}}', { scopes: health.missingScopes.join(', ') })}
                </span>
              </div>
            )}
            {(health.advisoryMissingScopes?.length ?? 0) > 0 && (
              <div className="mt-2">
                <span className="text-xs text-muted-foreground">
                  {t('tiktok.connection_diagnostics.portal_requested_permissions', 'Portal-requested permissions not granted (informational): {{scopes}}', { scopes: (health.advisoryMissingScopes ?? []).join(', ') })}
                </span>
              </div>
            )}
          </div>
        </div>

        <Separator />

        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Globe className="h-4 w-4" />
            {t('tiktok.connection_diagnostics.region', 'Region')}
          </h4>
          <p className="text-sm">
            {health.regionRestrictions.region}
            {health.regionRestrictions.isRestricted && (
              <Badge variant="destructive" className="ml-2">{t('tiktok.connection_diagnostics.restricted', 'Restricted')}</Badge>
            )}
          </p>
          {health.regionRestrictions.unavailableFeatures.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {t('tiktok.connection_diagnostics.unavailable_features', 'Unavailable: {{features}}', { features: health.regionRestrictions.unavailableFeatures.join(', ') })}
            </p>
          )}
          {regionPayload?.isRestricted &&
            regionPayload.unavailableFeatures.some((f) => /image|video|media|sticker|rich/i.test(f)) && (
              <p className="text-xs text-amber-700 dark:text-amber-500 mt-2">
                {t('tiktok.connection_diagnostics.media_region_limits', 'Media-related limits from TikTok may apply in this region. Check unavailable features on the connection.')}
              </p>
            )}
        </div>

        <Separator />

        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            {t('tiktok.connection_diagnostics.media_messaging_api', 'Media and messaging API')}
          </h4>
          {capsPayload?.capabilities ? (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">{t('tiktok.connection_diagnostics.rich_media', 'Rich media')}</span>
                <Badge variant={capsPayload.capabilities.supportsRichMedia ? 'default' : 'secondary'}>
                  {capsPayload.capabilities.supportsRichMedia ? t('tiktok.connection_diagnostics.supported', 'Supported') : t('tiktok.connection_diagnostics.not_indicated', 'Not indicated')}
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(['image', 'video'] as const).map((type) => {
                  const supported = capsPayload.capabilities.supportedMediaTypes?.includes(type) ?? false;
                  return (
                    <div
                      key={type}
                      className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                    >
                      {type === 'image' ? (
                        <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <Video className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="capitalize">{type === 'image' ? t('flow_builder.media_types.image', 'image') : t('flow_builder.media_types.video', 'video')}</span>
                      <Badge variant={supported ? 'default' : 'outline'} className="ml-auto text-xs">
                        {supported ? t('tiktok.connection_diagnostics.enabled', 'Enabled') : t('tiktok.connection_diagnostics.not_listed', 'Not listed')}
                      </Badge>
                    </div>
                  );
                })}
              </div>
              {capsPayload.capabilities.supportedMediaTypes &&
                capsPayload.capabilities.supportedMediaTypes.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t('tiktok.connection_diagnostics.reported_types', 'Reported types: {{types}}', { types: capsPayload.capabilities.supportedMediaTypes.join(', ') })}
                  </p>
                )}
              <p className="text-xs text-muted-foreground">
                {t('tiktok.connection_diagnostics.messaging_features_note', 'Typing indicators, read receipts, and reactions are not driven by TikTok for this channel in application.')}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('tiktok.connection_diagnostics.capabilities_unavailable', 'Capabilities unavailable. Try refresh.')}</p>
          )}
        </div>

        <Separator />

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshTokenMutation.mutate()}
            disabled={refreshTokenMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshTokenMutation.isPending ? 'animate-spin' : ''}`} />
            {t('tiktok.connection_diagnostics.refresh_token', 'Refresh Token')}
          </Button>
          {onReconnect && (
            <Button variant="outline" size="sm" onClick={onReconnect}>
              {t('whatsapp.connection_control.reconnect', 'Reconnect')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
