import type { Express, RequestHandler } from 'express';

type WebhookEvent = {
  id: string;
  type: string;
  status: string;
  attemptCount: number;
  createdAt: Date;
  lastError: string | null;
  payload: unknown;
};

type IntegrationOperationsStorage = {
  getCrmIntegrationOperations(companyId: number): Promise<Array<{
    id: number;
    name: string;
    status: string;
    scopes: unknown;
    pendingEvents: WebhookEvent[];
    failedEvents: WebhookEvent[];
    conflicts: unknown[];
  }>>;
};

function publicEvent({ payload: _payload, ...event }: WebhookEvent) {
  return event;
}

/** Admin settings view; payloads are intentionally never exposed to browsers. */
export function registerCrmIntegrationOperationsRoutes(
  app: Express,
  storage: IntegrationOperationsStorage,
  ensureAuthenticated: RequestHandler,
) {
  app.get('/api/settings/crm-integration-operations', ensureAuthenticated, async (req: any, res) => {
    try {
      const operations = await storage.getCrmIntegrationOperations(req.user.companyId);
      return res.json(operations.map((integration) => ({
        ...integration,
        pendingEvents: integration.pendingEvents.map(publicEvent),
        failedEvents: integration.failedEvents.map(publicEvent),
      })));
    } catch (error) {
      console.error('Error loading CRM integration operations:', error);
      return res.status(500).json({ error: 'Failed to load CRM integration operations' });
    }
  });
}
