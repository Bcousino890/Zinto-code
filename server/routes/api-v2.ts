import { Router, type NextFunction, type Request, type Response } from 'express';
import { integrationCapabilities, requireIntegrationScope } from '../middleware/integration-scope';

type AuthenticationMiddleware = (req: Request, res: Response, next: NextFunction) => void;

export function createApiV2Router({ authenticate }: { authenticate: AuthenticationMiddleware }) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: 'v2' });
  });

  router.use(authenticate);

  router.get('/capabilities', requireIntegrationScope('integrations:manage'), (_req, res) => {
    res.json(integrationCapabilities());
  });

  return router;
}
