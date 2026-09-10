import type { Express, RequestHandler } from 'express';

import { generateApiKey } from '../middleware/api-auth';
import {
  ApiKeyConfigurationError,
  validateApiKeyConfigurationUpdate,
} from '../services/integration-api-key-policy';
import {
  SandboxApiKeyConfigurationError,
  validateSandboxApiKeyConfiguration,
} from '../services/sandbox-api-key-policy';

type ApiKeyRecord = {
  id: number;
  companyId: number;
  metadata: unknown;
  webhookUrl: string | null;
};

type ApiKeyStorage = {
  createApiKey(data: any): Promise<any>;
  getApiKeysByCompanyId(companyId: number): Promise<ApiKeyRecord[]>;
  updateApiKey(id: number, data: any): Promise<any>;
};

function apiKeyMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isConfigurationError(error: unknown): error is ApiKeyConfigurationError | SandboxApiKeyConfigurationError {
  return error instanceof ApiKeyConfigurationError || error instanceof SandboxApiKeyConfigurationError;
}

export function registerApiKeySettingsRoutes(
  app: Express,
  storage: ApiKeyStorage,
  ensureAuthenticated: RequestHandler,
) {
  app.post('/api/settings/api-keys', ensureAuthenticated, async (req: any, res) => {
    try {
      const { name, environment, webhookUrl, ...configuration } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'API key name is required' });
      }

      const { key, hash, prefix } = generateApiKey();
      const sandboxConfiguration = validateSandboxApiKeyConfiguration({ environment, webhookUrl });
      const validatedConfiguration = validateApiKeyConfigurationUpdate({
        ...configuration,
        ...(sandboxConfiguration.environment === 'production'
          ? { webhookUrl: sandboxConfiguration.webhookUrl }
          : {}),
      });
      const createdKey = await storage.createApiKey({
        companyId: req.user.companyId,
        userId: req.user.id,
        name: name.trim(),
        keyHash: hash,
        keyPrefix: prefix,
        permissions: validatedConfiguration.permissions ?? ['messages:send', 'channels:read', 'messages:read', 'media:upload'],
        isActive: true,
        rateLimitPerMinute: validatedConfiguration.rateLimitPerMinute ?? 60,
        rateLimitPerHour: validatedConfiguration.rateLimitPerHour ?? 1000,
        rateLimitPerDay: validatedConfiguration.rateLimitPerDay ?? 10000,
        allowedIps: validatedConfiguration.allowedIps ?? [],
        webhookUrl: sandboxConfiguration.webhookUrl,
        metadata: { environment: sandboxConfiguration.environment },
      });

      return res.status(201).json({
        id: createdKey.id,
        key,
        name: createdKey.name,
        keyPrefix: createdKey.keyPrefix,
        permissions: createdKey.permissions,
        isActive: createdKey.isActive,
        createdAt: createdKey.createdAt,
      });
    } catch (error) {
      console.error('Error creating API key:', error);
      if (isConfigurationError(error)) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.message });
      }
      return res.status(500).json({ error: 'Failed to create API key' });
    }
  });

  app.patch('/api/settings/api-keys/:id', ensureAuthenticated, async (req: any, res) => {
    try {
      const keyId = parseInt(req.params.id);
      const { isActive, name, environment, webhookUrl, ...configuration } = req.body;

      if (isNaN(keyId)) {
        return res.status(400).json({ error: 'Invalid API key ID' });
      }

      const existingKey = await storage.getApiKeysByCompanyId(req.user.companyId);
      const keyToUpdate = existingKey.find((apiKey) => apiKey.id === keyId);
      if (!keyToUpdate) {
        return res.status(404).json({ error: 'API key not found' });
      }

      const updateData: Record<string, unknown> = {};
      if (typeof isActive === 'boolean') updateData.isActive = isActive;
      if (typeof name === 'string' && name.trim().length > 0) updateData.name = name.trim();

      const hasEnvironment = Object.prototype.hasOwnProperty.call(req.body, 'environment');
      const hasWebhookUrl = Object.prototype.hasOwnProperty.call(req.body, 'webhookUrl');
      if (hasEnvironment || hasWebhookUrl) {
        const existingMetadata = apiKeyMetadata(keyToUpdate.metadata);
        const sandboxConfiguration = validateSandboxApiKeyConfiguration({
          environment: hasEnvironment ? environment : existingMetadata.environment ?? 'production',
          webhookUrl: hasWebhookUrl ? webhookUrl : keyToUpdate.webhookUrl,
        });
        Object.assign(updateData, validateApiKeyConfigurationUpdate({
          ...configuration,
          ...(hasWebhookUrl && sandboxConfiguration.environment === 'production'
            ? { webhookUrl: sandboxConfiguration.webhookUrl }
            : {}),
        }));
        if (hasWebhookUrl) updateData.webhookUrl = sandboxConfiguration.webhookUrl;
        updateData.metadata = { ...existingMetadata, environment: sandboxConfiguration.environment };
      } else {
        Object.assign(updateData, validateApiKeyConfigurationUpdate(configuration));
      }

      const updatedKey = await storage.updateApiKey(keyId, updateData);
      return res.json({
        id: updatedKey.id,
        name: updatedKey.name,
        keyPrefix: updatedKey.keyPrefix,
        permissions: updatedKey.permissions,
        isActive: updatedKey.isActive,
        lastUsedAt: updatedKey.lastUsedAt,
        createdAt: updatedKey.createdAt,
        updatedAt: updatedKey.updatedAt,
      });
    } catch (error) {
      console.error('Error updating API key:', error);
      if (isConfigurationError(error)) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.message });
      }
      return res.status(500).json({ error: 'Failed to update API key' });
    }
  });
}
