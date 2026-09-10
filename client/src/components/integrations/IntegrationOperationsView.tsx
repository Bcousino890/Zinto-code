import { AlertCircle, CheckCircle2, Clock3, RefreshCw, ShieldAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

const healthLabels: Record<IntegrationHealth, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  down: 'Unavailable',
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
            {integrationName} operations
          </h2>
          <p className="text-sm text-muted-foreground">Monitor delivery issues and records requiring review.</p>
          {dataAvailabilityMessage && <p className="mt-1 text-xs text-muted-foreground">{dataAvailabilityMessage}</p>}
        </div>
        <Badge className={statusClassNames[status.tone]} variant="outline">
          {status.label}
        </Badge>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={CheckCircle2} label="Integration health" value={healthLabels[health]} />
        <MetricCard icon={Clock3} label="Pending events" value={pendingEvents.length} />
        <MetricCard icon={AlertCircle} label="Failed events" value={failedEvents.length} />
        <MetricCard icon={ShieldAlert} label="Conflicts" value={conflicts.length} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pending events</CardTitle>
            <CardDescription>Events waiting to be delivered to the connected system.</CardDescription>
          </CardHeader>
          <CardContent><EventList events={pendingEvents} emptyMessage="No pending events." /></CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Failed events</CardTitle>
            <CardDescription>Retry individual events after the underlying issue is resolved.</CardDescription>
          </CardHeader>
          <CardContent>
            {failedEvents.length === 0 ? <EventList events={failedEvents} emptyMessage="No failed events." /> : (
              <ul className="space-y-3" aria-label="Failed integration events">
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
                        {isRetryingEventId === event.id ? 'Retrying' : 'Retry'}
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
          <CardTitle>Conflicts</CardTitle>
          <CardDescription>Records that require a decision before synchronization can continue.</CardDescription>
        </CardHeader>
        <CardContent>
          {conflicts.length === 0 ? <p className="text-sm text-muted-foreground">No conflicts to review.</p> : (
            <ul className="space-y-3" aria-label="Integration conflicts">
              {conflicts.map((conflict) => (
                <li key={conflict.id} className="rounded-md border border-amber-200 p-3">
                  <p className="text-sm font-medium">{conflict.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{conflict.detail}</p>
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
