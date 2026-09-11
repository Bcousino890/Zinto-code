import { AlertCircle, CheckCircle2, Clock3, RefreshCw, ShieldAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from '@/hooks/use-translation';
import {
  getIntegrationOperationsStatus,
  type IntegrationHealth,
  type IntegrationOperationsTone,
} from './integration-operations-status';

export interface IntegrationOperationEvent {
  id: string;
  label: string;
  occurredAt: string;
  detail?: string;
}

export interface IntegrationConflict {
  id: string;
  label: string;
  detail: string;
  detailTranslationKey?: string;
}

export interface IntegrationOperationsViewProps {
  integrationName: string;
  health: IntegrationHealth;
  pendingEvents: IntegrationOperationEvent[];
  failedEvents: IntegrationOperationEvent[];
  conflicts: IntegrationConflict[];
  onRetryFailedEvent?: (eventId: string) => void;
  isRetryingEventId?: string | null;
  dataAvailabilityMessage?: string;
}

const statusClassNames: Record<IntegrationOperationsTone, string> = {
  success: 'border-green-200 bg-green-50 text-green-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  critical: 'border-red-200 bg-red-50 text-red-800',
};

const healthLabelKeys: Record<IntegrationHealth, { key: string; fallback: string }> = {
  healthy: { key: 'integrations.operations.healthy', fallback: 'Healthy' },
  degraded: { key: 'integrations.operations.degraded', fallback: 'Degraded' },
  down: { key: 'integrations.operations.unavailable', fallback: 'Unavailable' },
};

function EventList({ events, emptyMessage }: { events: IntegrationOperationEvent[]; emptyMessage: string }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ul className="space-y-3" aria-label="Integration events">
      {events.map((event) => (
        <li key={event.id} className="rounded-md border p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{event.label}</p>
              {event.detail && <p className="mt-1 text-sm text-muted-foreground">{event.detail}</p>}
            </div>
            <time className="shrink-0 text-xs text-muted-foreground">{event.occurredAt}</time>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function IntegrationOperationsView({
  integrationName,
  health,
  pendingEvents,
  failedEvents,
  conflicts,
  onRetryFailedEvent,
  isRetryingEventId = null,
  dataAvailabilityMessage,
}: IntegrationOperationsViewProps) {
  const { t } = useTranslation();
  const status = getIntegrationOperationsStatus({
    health,
    pendingEventCount: pendingEvents.length,
    failedEventCount: failedEvents.length,
    conflictCount: conflicts.length,
  });

  return (
    <section className="space-y-6" aria-labelledby="integration-operations-title">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="integration-operations-title" className="text-2xl font-semibold tracking-tight">
            {t('integrations.operations.title', '{{name}} operations', { name: integrationName })}
          </h2>
          <p className="text-sm text-muted-foreground">{t('integrations.operations.description', 'Monitor delivery issues and records requiring review.')}</p>
          {dataAvailabilityMessage && <p className="mt-1 text-xs text-muted-foreground">{dataAvailabilityMessage}</p>}
        </div>
        <Badge className={statusClassNames[status.tone]} variant="outline">
          {t(status.labelKey)}
        </Badge>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={CheckCircle2} label={t('integrations.operations.health', 'Integration health')} value={t(healthLabelKeys[health].key, healthLabelKeys[health].fallback)} />
        <MetricCard icon={Clock3} label={t('integrations.operations.pending_events', 'Pending events')} value={pendingEvents.length} />
        <MetricCard icon={AlertCircle} label={t('integrations.operations.failed_events', 'Failed events')} value={failedEvents.length} />
        <MetricCard icon={ShieldAlert} label={t('integrations.operations.conflicts', 'Conflicts')} value={conflicts.length} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('integrations.operations.pending_events', 'Pending events')}</CardTitle>
            <CardDescription>{t('integrations.operations.pending_description', 'Events waiting to be delivered to the connected system.')}</CardDescription>
          </CardHeader>
          <CardContent><EventList events={pendingEvents} emptyMessage={t('integrations.operations.no_pending_events', 'No pending events.')} /></CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('integrations.operations.failed_events', 'Failed events')}</CardTitle>
            <CardDescription>{t('integrations.operations.failed_description', 'Retry individual events after the underlying issue is resolved.')}</CardDescription>
          </CardHeader>
          <CardContent>
            {failedEvents.length === 0 ? <EventList events={failedEvents} emptyMessage={t('integrations.operations.no_failed_events', 'No failed events.')} /> : (
              <ul className="space-y-3" aria-label={t('integrations.operations.failed_events', 'Failed events')}>
                {failedEvents.map((event) => (
                  <li key={event.id} className="flex flex-col gap-3 rounded-md border border-red-200 p-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">{event.label}</p>
                      {event.detail && <p className="mt-1 text-sm text-muted-foreground">{event.detail}</p>}
                      <time className="mt-1 block text-xs text-muted-foreground">{event.occurredAt}</time>
                    </div>
                    {onRetryFailedEvent && (
                      <Button size="sm" variant="outline" onClick={() => onRetryFailedEvent(event.id)} disabled={isRetryingEventId === event.id}>
                        <RefreshCw className={isRetryingEventId === event.id ? 'animate-spin' : ''} />
                        {isRetryingEventId === event.id
                          ? t('integrations.operations.retrying', 'Retrying...')
                          : t('integrations.operations.retry', 'Retry')}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('integrations.operations.conflicts', 'Conflicts')}</CardTitle>
          <CardDescription>{t('integrations.operations.conflicts_description', 'Records that require a decision before synchronization can continue.')}</CardDescription>
        </CardHeader>
        <CardContent>
          {conflicts.length === 0 ? <p className="text-sm text-muted-foreground">{t('integrations.operations.no_conflicts', 'No conflicts to review.')}</p> : (
            <ul className="space-y-3" aria-label={t('integrations.operations.conflicts', 'Conflicts')}>
              {conflicts.map((conflict) => (
                <li key={conflict.id} className="rounded-md border border-amber-200 p-3">
                  <p className="text-sm font-medium">{conflict.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {conflict.detailTranslationKey ? t(conflict.detailTranslationKey, conflict.detail) : conflict.detail}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof CheckCircle2; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
