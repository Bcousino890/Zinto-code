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
  updateMessage(id: number, updates: { metadata: unknown }): Promise<unknown>;
};

export type CrmApiV2MessageAdapter = {
  send(input: CrmMessageInput): Promise<{ id: string | number }>;
};

function crmMetadata(existingMetadata: unknown, input: CrmMessageInput): Record<string, unknown> {
  const existing = existingMetadata && typeof existingMetadata === 'object' && !Array.isArray(existingMetadata)
    ? existingMetadata as Record<string, unknown>
    : {};
  const existingCrm = existing.crm && typeof existing.crm === 'object' && !Array.isArray(existing.crm)
    ? existing.crm as Record<string, unknown>
    : {};

  return {
    ...existing,
    ...(existingMetadata !== undefined && existing !== existingMetadata ? { legacyMetadata: existingMetadata } : {}),
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
