import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { useQuery } from '@tanstack/react-query';
import { toast } from "@/hooks/use-toast";
import { useTranslation } from '@/hooks/use-translation';
import {
  RefreshCw,
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Wifi,
  MessageSquare,
  TrendingUp,
  Info
} from "lucide-react";

interface ConnectionDiagnosticsProps {
  connectionId: number;
  onReconnect?: () => void;
}

interface DiagnosticsData {
  connectionId: number;
  status: string;
  healthScore: number;
  reconnectAttempts: number;
  lastConnected: string | null;
  lastReconnectAttempt: string | null;
  errorCount: number;
  lastError: string | null;
  rateLimitInfo: {
    messagesSent: number;
    lastReset: string;
    isLimited: boolean;
  };
  socketConnected: boolean;
  hasUser: boolean;
  hasAuthState: boolean;
  hasKeys: boolean;
  sessionExists: boolean;
}

const ConnectionDiagnostics: React.FC<ConnectionDiagnosticsProps> = ({
  connectionId,
  onReconnect
}) => {
  const { t } = useTranslation();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: diagnostics, refetch, isLoading } = useQuery({
    queryKey: ['whatsapp-diagnostics', connectionId],
    queryFn: async () => {
      const response = await fetch(`/api/whatsapp/diagnostics/${connectionId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch diagnostics');
      }
      const data = await response.json();
      return data.diagnostics as DiagnosticsData;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
    enabled: !!connectionId
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      toast({
        title: t('whatsapp.connection_diagnostics.refreshed_title', 'Diagnostics refreshed'),
        description: t('whatsapp.connection_diagnostics.refreshed_description', 'Connection diagnostics have been updated.'),
      });
    } catch (error) {
      toast({
        title: t('whatsapp.connection_diagnostics.refresh_failed_title', 'Refresh failed'),
        description: t('whatsapp.connection_diagnostics.refresh_failed_description', 'Failed to refresh diagnostics.'),
        variant: "destructive"
      });
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

  const getHealthScoreVariant = (score: number) => {
    if (score >= 80) return 'default';
    if (score >= 60) return 'secondary';
    return 'destructive';
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return t('whatsapp.connection_diagnostics.never', 'Never');
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatTimeAgo = (dateString: string | null) => {
    if (!dateString) return t('whatsapp.connection_diagnostics.never', 'Never');
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return t('whatsapp.connection_diagnostics.days_ago', '{{count}}d ago', { count: days });
    if (hours > 0) return t('whatsapp.connection_diagnostics.hours_ago', '{{count}}h ago', { count: hours });
    if (minutes > 0) return t('whatsapp.connection_diagnostics.minutes_ago', '{{count}}m ago', { count: minutes });
    return t('whatsapp.connection_diagnostics.just_now', 'Just now');
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            {t('whatsapp.connection_diagnostics.title', 'Connection Diagnostics')}
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

  if (!diagnostics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            {t('whatsapp.connection_diagnostics.title', 'Connection Diagnostics')}
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
            {t('whatsapp.connection_diagnostics.title', 'Connection Diagnostics')}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            {t('common.refresh', 'Refresh')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Health Score */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{t('whatsapp.connection_diagnostics.health_score', 'Health Score')}</span>
            <Badge variant={getHealthScoreVariant(diagnostics.healthScore)}>
              {diagnostics.healthScore}/100
            </Badge>
          </div>
          <Progress value={diagnostics.healthScore} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1">
            {t('whatsapp.connection_diagnostics.health_score_hint', 'Connection stability and performance indicator')}
          </p>
        </div>

        <Separator />

        {/* Connection Status */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Wifi className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t('whatsapp.connection_diagnostics.status', 'Status')}</span>
            </div>
            <Badge variant={diagnostics.status === 'connected' ? 'default' : 'secondary'}>
              {diagnostics.status}
            </Badge>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t('whatsapp.connection_diagnostics.socket', 'Socket')}</span>
            </div>
            <Badge variant={diagnostics.socketConnected ? 'default' : 'destructive'}>
              {diagnostics.socketConnected ? t('header.connected', 'Connected') : t('header.disconnected', 'Disconnected')}
            </Badge>
          </div>
        </div>

        <Separator />

        {/* Authentication Status */}
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            {t('whatsapp.connection_diagnostics.authentication', 'Authentication')}
          </h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center justify-between">
              <span>{t('whatsapp.connection_diagnostics.user_id', 'User ID:')}</span>
              <Badge variant={diagnostics.hasUser ? 'default' : 'destructive'} className="text-xs">
                {diagnostics.hasUser ? t('whatsapp.connection_diagnostics.valid', 'Valid') : t('whatsapp.connection_diagnostics.missing', 'Missing')}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>{t('whatsapp.connection_diagnostics.auth_state', 'Auth State:')}</span>
              <Badge variant={diagnostics.hasAuthState ? 'default' : 'destructive'} className="text-xs">
                {diagnostics.hasAuthState ? t('whatsapp.connection_diagnostics.valid', 'Valid') : t('whatsapp.connection_diagnostics.missing', 'Missing')}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>{t('whatsapp.connection_diagnostics.keys', 'Keys:')}</span>
              <Badge variant={diagnostics.hasKeys ? 'default' : 'destructive'} className="text-xs">
                {diagnostics.hasKeys ? t('whatsapp.connection_diagnostics.valid', 'Valid') : t('whatsapp.connection_diagnostics.missing', 'Missing')}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>{t('whatsapp.connection_diagnostics.session', 'Session:')}</span>
              <Badge variant={diagnostics.sessionExists ? 'default' : 'destructive'} className="text-xs">
                {diagnostics.sessionExists ? t('whatsapp.connection_diagnostics.exists', 'Exists') : t('whatsapp.connection_diagnostics.missing', 'Missing')}
              </Badge>
            </div>
          </div>
        </div>

        <Separator />

        {/* Rate Limiting */}
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            {t('whatsapp.connection_diagnostics.rate_limiting', 'Rate Limiting')}
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span>{t('whatsapp.connection_diagnostics.messages_sent', 'Messages Sent:')}</span>
              <Badge variant={diagnostics.rateLimitInfo.isLimited ? 'destructive' : 'default'}>
                {diagnostics.rateLimitInfo.messagesSent}/20
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>{t('whatsapp.connection_diagnostics.status', 'Status:')}</span>
              <Badge variant={diagnostics.rateLimitInfo.isLimited ? 'destructive' : 'default'}>
                {diagnostics.rateLimitInfo.isLimited ? t('whatsapp.connection_diagnostics.limited', 'Limited') : t('whatsapp.connection_diagnostics.normal', 'Normal')}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>{t('whatsapp.connection_diagnostics.window_reset', 'Window Reset:')}</span>
              <span className="text-xs text-muted-foreground">
                {formatTimeAgo(diagnostics.rateLimitInfo.lastReset)}
              </span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Connection History */}
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            {t('whatsapp.connection_diagnostics.connection_history', 'Connection History')}
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span>{t('whatsapp.connection_diagnostics.last_connected', 'Last Connected:')}</span>
              <span className="text-xs text-muted-foreground">
                {formatTimeAgo(diagnostics.lastConnected)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>{t('whatsapp.connection_diagnostics.reconnect_attempts', 'Reconnect Attempts:')}</span>
              <Badge variant={diagnostics.reconnectAttempts > 5 ? 'destructive' : 'secondary'}>
                {diagnostics.reconnectAttempts}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>{t('whatsapp.connection_diagnostics.error_count', 'Error Count:')}</span>
              <Badge variant={diagnostics.errorCount > 10 ? 'destructive' : 'secondary'}>
                {diagnostics.errorCount}
              </Badge>
            </div>
            {diagnostics.lastError && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs">
                <span className="font-medium text-red-800">{t('whatsapp.connection_diagnostics.last_error', 'Last Error:')}</span>
                <p className="text-red-700 mt-1">{diagnostics.lastError}</p>
              </div>
            )}
          </div>
        </div>

        {/* Manual Reconnect */}
        {onReconnect && (
          <>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium">{t('whatsapp.connection_diagnostics.manual_reconnection', 'Manual Reconnection')}</h4>
                <p className="text-xs text-muted-foreground">
                  {t('whatsapp.connection_diagnostics.manual_reconnection_hint', 'Force a reconnection attempt if experiencing issues')}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onReconnect}
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                {t('whatsapp.connection_control.reconnect', 'Reconnect')}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ConnectionDiagnostics;
