import * as React from 'react';
import { Link } from 'wouter';
import { AlertTriangle, AlertCircle, Info, ExternalLink, ArrowRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  getErrorHelpOrFallback,
  type ErrorHelpEntry,
  type ErrorHelpSeverity,
} from '@/lib/error-help';

/**
 * ErrorWithHelp
 *
 * Renders a friendly, actionable explanation for an error code/message
 * instead of a raw "Error 403" / "Failed to fetch" string. Looks up the
 * error in `getErrorHelp()` (client/src/lib/error-help.ts) and falls back
 * to a generic "contact support" message when nothing matches.
 *
 * Generic and presentation-only — it does not know about any specific
 * onboarding flow. Import it wherever a raw error needs a human-friendly
 * explanation, e.g.:
 *
 *   <ErrorWithHelp error={error?.message} />
 *   <ErrorWithHelp error="missing_permissions" />
 */

const SEVERITY_ICON: Record<ErrorHelpSeverity, React.ComponentType<{ className?: string }>> = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

/** Maps our severity to the existing Alert component's variant prop. */
const SEVERITY_ALERT_VARIANT: Record<ErrorHelpSeverity, 'default' | 'destructive'> = {
  error: 'destructive',
  warning: 'default',
  info: 'default',
};

const SEVERITY_ICON_CLASS: Record<ErrorHelpSeverity, string> = {
  error: 'text-destructive',
  warning: 'text-amber-500 dark:text-amber-400',
  info: 'text-blue-500 dark:text-blue-400',
};

function isExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) || url.startsWith('//');
}

export interface ErrorWithHelpProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Raw error code or message (e.g. "403", "missing_permissions", err.message) */
  error: string | null | undefined;
  /** Hide the action button even if the matched entry has one. Default false. */
  hideAction?: boolean;
  /** Called when the action button/link is activated, in addition to navigating. */
  onAction?: (entry: ErrorHelpEntry) => void;
}

export function ErrorWithHelp({
  error,
  hideAction = false,
  onAction,
  className,
  ...props
}: ErrorWithHelpProps) {
  const entry = getErrorHelpOrFallback(error);
  const Icon = SEVERITY_ICON[entry.severity];

  return (
    <Alert
      variant={SEVERITY_ALERT_VARIANT[entry.severity]}
      className={cn('pr-4', className)}
      {...props}
    >
      <Icon className={cn('h-4 w-4', SEVERITY_ICON_CLASS[entry.severity])} />
      <AlertTitle>{entry.title}</AlertTitle>
      <AlertDescription>
        <p>{entry.explanation}</p>
        {!hideAction && entry.actionLabel && entry.actionUrl && (
          <div className="mt-3">
            {isExternalUrl(entry.actionUrl) ? (
              <Button
                asChild
                variant="outline"
                size="sm"
                onClick={() => onAction?.(entry)}
              >
                <a href={entry.actionUrl} target="_blank" rel="noopener noreferrer">
                  {entry.actionLabel}
                  <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </a>
              </Button>
            ) : (
              <Button
                asChild
                variant="outline"
                size="sm"
                onClick={() => onAction?.(entry)}
              >
                <Link href={entry.actionUrl}>
                  {entry.actionLabel}
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}

/**
 * useErrorHelp
 *
 * Convenience hook that memoizes the lookup and exposes the same data
 * `<ErrorWithHelp />` renders, for components that want to build their own
 * UI (e.g. a compact inline tooltip) around the same mapping.
 *
 *   const { title, explanation, actionLabel, actionUrl, severity } = useErrorHelp(error);
 */
export function useErrorHelp(error: string | null | undefined): ErrorHelpEntry {
  return React.useMemo(() => getErrorHelpOrFallback(error), [error]);
}

export default ErrorWithHelp;
