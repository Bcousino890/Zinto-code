import type { Express, RequestHandler } from 'express';
import { assertIntegrationScopes, type IntegrationScope } from '../../shared/integrations/contracts';
import { encryptValue } from '../utils/crypto';
import { generateWebhookSecret } from '../utils/webhook-token-generator';

type CrmIntegrationRecord = {
  id: number;
  publicId?: string | null;
  companyId: number;
  name: string;
  provider: string;
  status: string;
  webhookUrl: string | null;
  webhookSecretEncrypted?: string | null;
  scopes: unknown;
  conflictRules: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type CrmIntegrationManagementStorage = {
  getCrmIntegrationsByCompanyId(companyId: number): Promise<CrmIntegrationRecord[]>;
  getCrmIntegrationByIdAndCompany(id: number, companyId: number): Promise<CrmIntegrationRecord | undefined>;
  getCrmIntegrationByPublicIdAndCompany?(publicId: string, companyId: number): Promise<CrmIntegrationRecord | undefined>;
  createCrmIntegration(data: Omit<CrmIntegrationRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<CrmIntegrationRecord>;
  updateCrmIntegration(id: number, companyId: number, data: Partial<Omit<CrmIntegrationRecord, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>>): Promise<CrmIntegrationRecord | undefined>;
  deleteCrmIntegration?(id: number, companyId: number): Promise<boolean>;
};

type SecretOptions = {
  createSecret?: () => string;
  encryptSecret?: (secret: string) => string;
};

const PROVIDER_PATTERN = /^[a-z][a-z0-9_-]{1,31}$/;
const CONFLICT_STRATEGIES = new Set(['newest', 'zinto_wins', 'crm_wins', 'manual']);

function isAdmin(req: any): boolean {
  return Boolean(req.user?.isSuperAdmin || req.user?.role === 'admin');
}

function requireCompanyAdmin(req: any, res: any, next: any): void {
  if (!isAdmin(req)) {
    res.status(403).json({ error: 'ADMIN_REQUIRED', message: 'Solo un administrador de la empresa puede gestionar integraciones CRM' });
    return;
  }
  if (!Number.isSafeInteger(req.user?.companyId) || req.user.companyId <= 0) {
    res.status(403).json({ error: 'COMPANY_REQUIRED', message: 'La cuenta no tiene una empresa válida' });
    return;
  }
  next();
}

function parseId(value: unknown): number | undefined {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

function isPublicId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseWebhookUrl(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > 2048) throw new Error('webhookUrl debe ser una URL HTTPS válida');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('webhookUrl debe ser una URL HTTPS válida'); }
  if (url.protocol !== 'https:') throw new Error('webhookUrl debe utilizar HTTPS');
  return url.toString();
}

function parseScopes(value: unknown, fallback: IntegrationScope[] = []): IntegrationScope[] {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || value.some((scope) => typeof scope !== 'string')) throw new Error('scopes debe ser un arreglo de permisos válidos');
  return assertIntegrationScopes(value);
}

function parseConflictRules(value: unknown, fallback: Record<string, unknown> = {}): Record<string, unknown> {
  if (value === undefined) return fallback;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('conflictRules debe ser un objeto');
  const rules = value as Record<string, unknown>;
  if (rules.strategy !== undefined && (typeof rules.strategy !== 'string' || !CONFLICT_STRATEGIES.has(rules.strategy))) {
    throw new Error(`conflictRules.strategy debe ser uno de: ${Array.from(CONFLICT_STRATEGIES).join(', ')}`);
  }
  return rules;
}

function secret(options: SecretOptions): string {
  return options.createSecret?.() ?? `zinto_whsec_${generateWebhookSecret(32)}`;
}

function publicIntegration(integration: CrmIntegrationRecord) {
  const { webhookSecretEncrypted: _secret, companyId: _company, ...safe } = integration;
  const externalId = integration.publicId ?? integration.id;
  return { ...safe, id: externalId, integrationId: externalId };
}

function publicCreatedIntegration(integration: CrmIntegrationRecord, webhookSecret: string) {
  return { ...publicIntegration(integration), webhookSecret };
}

function handleError(res: any, error: unknown) {
  if (error instanceof Error && /ENCRYPTION_KEY/i.test(error.message)) {
    return res.status(503).json({ error: 'ENCRYPTION_NOT_CONFIGURED', message: 'El servidor no tiene configurada ENCRYPTION_KEY; no se puede generar ni rotar el secreto del webhook.' });
  }
  if (error instanceof Error && (/(?:obligatorio|inválido|debe |Unknown integration scope)/i.test(error.message))) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.message });
  }
  console.error('Error managing CRM integration:', error);
  return res.status(500).json({ error: 'CRM_INTEGRATION_ERROR', message: 'No se pudo gestionar la integración CRM' });
}

/** Company-admin API for provisioning the integration context used by API v2. */
export function registerCrmIntegrationManagementRoutes(
  app: Express,
  storage: CrmIntegrationManagementStorage,
  ensureAuthenticated: RequestHandler,
  options: SecretOptions = {},
) {
  app.use('/api/settings/crm-integrations', ensureAuthenticated, requireCompanyAdmin);

  const resolveId = async (value: unknown, companyId: number): Promise<number | undefined> => {
    const legacyId = parseId(value);
    if (legacyId) return legacyId;
    if (!isPublicId(value) || !storage.getCrmIntegrationByPublicIdAndCompany) return undefined;
    const integration = await storage.getCrmIntegrationByPublicIdAndCompany(value, companyId);
    return integration?.id;
  };

  app.get('/api/settings/crm-integrations', async (req: any, res) => {
    try {
      const integrations = await storage.getCrmIntegrationsByCompanyId(req.user.companyId);
      return res.json(integrations.map(publicIntegration));
    } catch (error) { return handleError(res, error); }
  });

  app.get('/api/settings/crm-integrations/:id', async (req: any, res) => {
    try {
      const id = await resolveId(req.params.id, req.user.companyId);
      if (!id) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'ID de integración inválido' });
      const integration = await storage.getCrmIntegrationByIdAndCompany(id, req.user.companyId);
      if (!integration) return res.status(404).json({ error: 'CRM_INTEGRATION_NOT_FOUND', message: 'Integración CRM no encontrada' });
      return res.json(publicIntegration(integration));
    } catch (error) { return handleError(res, error); }
  });

  app.post('/api/settings/crm-integrations', async (req: any, res) => {
    try {
      const body = req.body ?? {};
      if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 120) throw new Error('name es obligatorio y debe tener entre 1 y 120 caracteres');
      const provider = body.provider === undefined ? 'custom' : body.provider;
      if (typeof provider !== 'string' || !PROVIDER_PATTERN.test(provider)) throw new Error('provider debe ser un identificador válido');
      const webhookUrl = parseWebhookUrl(body.webhookUrl);
      const scopes = parseScopes(body.scopes);
      const conflictRules = parseConflictRules(body.conflictRules);
      const webhookSecret = secret(options);
      const created = await storage.createCrmIntegration({
        companyId: req.user.companyId, name: body.name.trim(), provider, status: body.status === 'active' ? 'active' : 'draft',
        webhookUrl: webhookUrl ?? null, webhookSecretEncrypted: (options.encryptSecret ?? encryptValue)(webhookSecret),
        scopes, conflictRules,
      });
      return res.status(201).json(publicCreatedIntegration(created, webhookSecret));
    } catch (error) { return handleError(res, error); }
  });

  app.patch('/api/settings/crm-integrations/:id', async (req: any, res) => {
    try {
      const id = await resolveId(req.params.id, req.user.companyId);
      if (!id) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'ID de integración inválido' });
      const existing = await storage.getCrmIntegrationByIdAndCompany(id, req.user.companyId);
      if (!existing) return res.status(404).json({ error: 'CRM_INTEGRATION_NOT_FOUND', message: 'Integración CRM no encontrada' });
      const body = req.body ?? {};
      const data: Record<string, unknown> = {};
      if (body.name !== undefined) { if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 120) throw new Error('name debe tener entre 1 y 120 caracteres'); data.name = body.name.trim(); }
      if (body.provider !== undefined) { if (typeof body.provider !== 'string' || !PROVIDER_PATTERN.test(body.provider)) throw new Error('provider debe ser un identificador válido'); data.provider = body.provider; }
      if (body.status !== undefined) { if (!['draft', 'active', 'inactive'].includes(body.status)) throw new Error('status inválido'); data.status = body.status; }
      if (body.webhookUrl !== undefined) { const url = parseWebhookUrl(body.webhookUrl); data.webhookUrl = url; if (url && !existing.webhookSecretEncrypted) { const webhookSecret = secret(options); data.webhookSecretEncrypted = (options.encryptSecret ?? encryptValue)(webhookSecret); } }
      if (body.scopes !== undefined) data.scopes = parseScopes(body.scopes, []);
      if (body.conflictRules !== undefined) data.conflictRules = parseConflictRules(body.conflictRules);
      const updated = await storage.updateCrmIntegration(id, req.user.companyId, data);
      return res.json(publicIntegration(updated ?? { ...existing, ...data } as CrmIntegrationRecord));
    } catch (error) { return handleError(res, error); }
  });

  for (const [path, status] of [['activate', 'active'], ['deactivate', 'inactive']] as const) {
    app.post(`/api/settings/crm-integrations/:id/${path}`, async (req: any, res) => {
      try {
        const id = await resolveId(req.params.id, req.user.companyId);
        if (!id) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'ID de integración inválido' });
        const existing = await storage.getCrmIntegrationByIdAndCompany(id, req.user.companyId);
        if (!existing) return res.status(404).json({ error: 'CRM_INTEGRATION_NOT_FOUND', message: 'Integración CRM no encontrada' });
        const updated = await storage.updateCrmIntegration(id, req.user.companyId, { status });
        return res.json(publicIntegration(updated ?? { ...existing, status }));
      } catch (error) { return handleError(res, error); }
    });
  }

  app.post('/api/settings/crm-integrations/:id/rotate-secret', async (req: any, res) => {
    try {
      const id = await resolveId(req.params.id, req.user.companyId);
      if (!id) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'ID de integración inválido' });
      const existing = await storage.getCrmIntegrationByIdAndCompany(id, req.user.companyId);
      if (!existing) return res.status(404).json({ error: 'CRM_INTEGRATION_NOT_FOUND', message: 'Integración CRM no encontrada' });
      const webhookSecret = secret(options);
      const updated = await storage.updateCrmIntegration(id, req.user.companyId, { webhookSecretEncrypted: (options.encryptSecret ?? encryptValue)(webhookSecret) });
      return res.json({ ...publicIntegration(updated ?? existing), webhookSecret });
    } catch (error) { return handleError(res, error); }
  });

  if (storage.deleteCrmIntegration) {
    app.delete('/api/settings/crm-integrations/:id', async (req: any, res) => {
      try {
        const id = await resolveId(req.params.id, req.user.companyId);
        if (!id) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'ID de integración inválido' });
        const deleted = await storage.deleteCrmIntegration!(id, req.user.companyId);
        return deleted ? res.status(204).send() : res.status(404).json({ error: 'CRM_INTEGRATION_NOT_FOUND', message: 'Integración CRM no encontrada' });
      } catch (error) { return handleError(res, error); }
    });
  }
}
