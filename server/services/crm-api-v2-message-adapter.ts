type CrmMessageInput = {
  companyId: number;
  integrationId: number;
  channelId: number;
  to: string;
  content: string;
  externalMessageId?: string;
  origin: 'crm';
};

type StoredMessage = {
  metadata?: unknown;
};

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

type MessageSender = {
  sendMessage(companyId: number, request: {
    channelId: number;
    to: string;
    message: string;
    messageType: 'text';
  }): Promise<{ id: string | number }>;
};

type MessageStorage = {
  crmIntegrationBelongsToCompany(companyId: number, integrationId: number): Promise<boolean>;
  getMessageById(id: number): Promise<StoredMessage | undefined>;
  updateMessage(id: number, updates: { metadata: JsonObject }): Promise<unknown>;
};

export type CrmApiV2MessageAdapter = {
  send(input: CrmMessageInput): Promise<{ id: string | number }>;
};

function jsonValue(value: unknown): JsonValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    const values = value.map(jsonValue);
    return values.every((item) => item !== undefined) ? values as JsonValue[] : undefined;
  }
  if (value && typeof value === 'object') {
    const result: JsonObject = {};
    for (const [key, item] of Object.entries(value)) {
      const normalized = jsonValue(item);
      if (normalized !== undefined) result[key] = normalized;
    }
    return result;
  }
  return undefined;
}

function jsonObject(value: unknown): JsonObject {
  const normalized = jsonValue(value);
  return normalized && !Array.isArray(normalized) && typeof normalized === 'object' ? normalized : {};
}

function crmMetadata(existingMetadata: unknown, input: CrmMessageInput): JsonObject {
  const existing = jsonObject(existingMetadata);
  const existingCrm = jsonObject(existing.crm);
  const legacyMetadata = jsonValue(existingMetadata);
  const hasObjectMetadata = Boolean(existingMetadata) && typeof existingMetadata === 'object' && !Array.isArray(existingMetadata);

  return {
    ...existing,
    ...(existingMetadata !== undefined && !hasObjectMetadata && legacyMetadata !== undefined ? { legacyMetadata } : {}),
    crm: {
      ...existingCrm,
      origin: input.origin,
      integrationId: input.integrationId,
      ...(input.externalMessageId ? { externalMessageId: input.externalMessageId } : {}),
    },
  };
}

/**
 * Bridges the v2 CRM contract to the established API message sender while
 * retaining CRM origin data on the persisted Zinto message.
 */
export function createCrmApiV2MessageAdapter(
  dependencies: MessageStorage & MessageSender,
): CrmApiV2MessageAdapter {
  return {
    async send(input) {
      if (!await dependencies.crmIntegrationBelongsToCompany(input.companyId, input.integrationId)) {
        throw new Error('Integration does not belong to this company');
      }

      const result = await dependencies.sendMessage(input.companyId, {
        channelId: input.channelId,
        to: input.to,
        message: input.content,
        messageType: 'text',
      });

      if (typeof result.id === 'number') {
        const message = await dependencies.getMessageById(result.id);
        if (message) {
          await dependencies.updateMessage(result.id, {
            metadata: crmMetadata(message.metadata, input),
          });
        }
      }

      return { id: result.id };
    },
  };
}
