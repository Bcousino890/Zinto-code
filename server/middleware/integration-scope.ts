import type { NextFunction, Request, Response } from 'express';
import { INTEGRATION_SCOPES, type IntegrationScope } from '../../shared/integrations/contracts';

export function requireIntegrationScope(scope: IntegrationScope) {
  return (req: Request, res: Response, next: NextFunction) => {
    const permissions = (req.apiKey?.permissions as string[] | undefined) ?? [];
    if (permissions.includes('*') || permissions.includes(scope)) {
      return next();
    }

    return res.status(403).json({
      error: 'INSUFFICIENT_PERMISSIONS',
      message: `Permission '${scope}' is required for this operation`,
    });
  };
}

/**
 * `activeScopes`, when given, restricts the reported list to scopes that
 * actually gate a live route on this router instance — see
 * createApiV2Router's own `activeScopes` set, built from exactly the same
 * `if (dependency)` conditionals that register each route, so this can
 * never drift from what the router really does. Omitted (or an empty set)
 * falls back to every scope this API v2 contract has ever declared, which
 * is what created the original bug this guards against: a partner asking
 * "what can I do?" being told about scopes with no route behind them at
 * all (contacts:read, webhooks:manage, audit:read, ...).
 */
export function integrationCapabilities(activeScopes?: ReadonlySet<IntegrationScope>) {
  return {
    version: 'v2',
    scopes: activeScopes && activeScopes.size > 0 ? INTEGRATION_SCOPES.filter((scope) => activeScopes.has(scope)) : INTEGRATION_SCOPES,
    webhookSignature: 'v1=hmac-sha256(timestamp.raw_body)',
  };
}
