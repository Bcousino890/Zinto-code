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

export function integrationCapabilities() {
  return {
    version: 'v2',
    scopes: INTEGRATION_SCOPES,
    webhookSignature: 'v1=hmac-sha256(timestamp.raw_body)',
  };
}
