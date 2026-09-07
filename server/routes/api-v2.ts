import { Router, type NextFunction, type Request, type Response } from 'express';
import { integrationCapabilities, requireIntegrationScope } from '../middleware/integration-scope';
import { getApiV2OpenApiDocument } from './api-v2-openapi';
import type { CrmContactSyncService } from '../services/crm-contact-sync-service';

type AuthenticationMiddleware = (req: Request, res: Response, next: NextFunction) => void;

export function createApiV2Router({
  authenticate,
  contactSync,
}: {
  authenticate: AuthenticationMiddleware;
  contactSync?: Pick<CrmContactSyncService, 'upsert'>;
}) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: 'v2' });
  });

  router.get('/openapi.json', (_req, res) => {
    res.json(getApiV2OpenApiDocument());
  });

  router.use(authenticate);

  router.get('/capabilities', requireIntegrationScope('integrations:manage'), (_req, res) => {
    res.json(integrationCapabilities());
  });

  if (contactSync) {
    router.put('/contacts/:externalId', requireIntegrationScope('contacts:write'), async (req, res) => {
      const companyId = req.companyId;
      const integrationId = Number(req.header('X-Zinto-Integration-Id'));
      const externalId = req.params.externalId?.trim();
      const contact = req.body;

      if (!companyId || !Number.isInteger(integrationId) || integrationId <= 0 || !externalId || typeof contact?.name !== 'string' || !contact.name.trim()) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'A company, integration ID, external ID and contact name are required' });
      }

      try {
        const result = await contactSync.upsert({
          companyId,
          integrationId,
          externalId,
          contact: {
            name: contact.name.trim(),
            ...(typeof contact.phone === 'string' ? { phone: contact.phone } : {}),
            ...(typeof contact.email === 'string' ? { email: contact.email } : {}),
            ...(typeof contact.company === 'string' ? { company: contact.company } : {}),
            ...(Array.isArray(contact.tags) ? { tags: contact.tags } : {}),
            ...(contact.customFields && typeof contact.customFields === 'object' ? { customFields: contact.customFields } : {}),
          },
        });
        return res.status(result.created ? 201 : 200).json({ data: result.contact, created: result.created });
      } catch (error) {
        return res.status(500).json({ error: 'CONTACT_SYNC_FAILED', message: error instanceof Error ? error.message : 'Contact synchronization failed' });
      }
    });
  }

  return router;
}
