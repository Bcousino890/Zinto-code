type CrmMessageInput = {
  companyId: number;
  integrationId: number;
  channelId: number;
  to: string;
  content: string;
  externalMessageId?: string;
  origin: 'crm';
  /** Zinto's own id of the message being replied to/quoted — WhatsApp official channels only. */
  replyToMessageId?: number;
};

type CrmMediaMessageInput = Omit<CrmMessageInput, 'content'> & {
  caption?: string;
  media: {
    url: string;
    type: 'image' | 'video' | 'audio' | 'document';
    filename?: string;
  };
};

type CrmTemplateMessageInput = Omit<CrmMessageInput, 'content'> & {
  template: {
    name: string;
    language: string;
    components?: Array<{
      type: 'header' | 'body' | 'button';
      parameters: Array<string | { type: 'text'; text: string }>;
    }>;
  };
};

type CrmReactionMessageInput = Omit<CrmMessageInput, 'content' | 'replyToMessageId'> & {
  targetMessageId: number;
  emoji: string;
};

type CrmLocationMessageInput = Omit<CrmMessageInput, 'content' | 'replyToMessageId'> & {
  location: { latitude: number; longitude: number; name?: string; address?: string };
};

type CrmInteractiveMessageInput = Omit<CrmMessageInput, 'content' | 'replyToMessageId'> & {
  interactiveType: 'button' | 'list';
  content: {
    header?: { type: 'text' | 'image' | 'video' | 'document'; text?: string; mediaUrl?: string };
    body: { text: string };
    footer?: { text: string };
  };
  options: { type: 'button'; buttons: Array<{ id: string; title: string }> }
    | { type: 'list'; button: string; sections: Array<{ title?: string; rows: Array<{ id: string; title: string; description?: string }> }> };
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
    replyToMessageId?: number;
  }): Promise<{ id: string | number }>;
  sendMedia(companyId: number, request: {
    channelId: number;
    to: string;
    mediaType: 'image' | 'video' | 'audio' | 'document';
    mediaUrl: string;
    caption?: string;
    filename?: string;
  }): Promise<{ id: string | number }>;
  // Optional: existing call sites constructed before template/reaction/
  // location support was added to this adapter don't provide them yet. Made
  // required-in-spirit by the runtime checks in `sendTemplate`/`sendReaction`/
  // `sendLocation` below, which throw a clear error if missing rather than
  // failing with a silent `undefined` call.
  sendTemplate?(companyId: number, request: {
    channelId: number;
    to: string;
    templateName: string;
    templateLanguage: string;
    components?: Array<{
      type: 'header' | 'body' | 'button';
      parameters: Array<string | { type: 'text'; text: string }>;
    }>;
  }): Promise<{ id: string | number }>;
  sendReaction?(companyId: number, request: {
    channelId: number;
    to: string;
    targetMessageId: number;
    emoji: string;
  }): Promise<{ id: string | number }>;
  sendLocation?(companyId: number, request: {
    channelId: number;
    to: string;
    location: { latitude: number; longitude: number; name?: string; address?: string };
  }): Promise<{ id: string | number }>;
  markMessageAsRead?(companyId: number, request: { messageId: number }): Promise<{ id: number }>;
  sendInteractiveMessage?(companyId: number, request: {
    channelId: number;
    to: string;
    interactiveType: 'button' | 'list';
    content: {
      header?: { type: 'text' | 'image' | 'video' | 'document'; text?: string; mediaUrl?: string };
      body: { text: string };
      footer?: { text: string };
    };
    options: { type: 'button'; buttons: Array<{ id: string; title: string }> }
      | { type: 'list'; button: string; sections: Array<{ title?: string; rows: Array<{ id: string; title: string; description?: string }> }> };
  }): Promise<{ id: string | number }>;
};

type MessageStorage = {
  crmIntegrationBelongsToCompany(companyId: number, integrationId: number): Promise<boolean>;
  getMessageById(id: number): Promise<StoredMessage | undefined>;
  updateMessage(id: number, updates: { metadata: JsonObject }): Promise<unknown>;
};

export type CrmApiV2MessageAdapter = {
  send(input: CrmMessageInput): Promise<{ id: string | number }>;
  sendMedia(input: CrmMediaMessageInput): Promise<{ id: string | number }>;
  sendTemplate(input: CrmTemplateMessageInput): Promise<{ id: string | number }>;
  sendReaction(input: CrmReactionMessageInput): Promise<{ id: string | number }>;
  sendLocation(input: CrmLocationMessageInput): Promise<{ id: string | number }>;
  markAsRead(input: { companyId: number; integrationId: number; messageId: number }): Promise<{ id: number }>;
  sendInteractive(input: CrmInteractiveMessageInput): Promise<{ id: string | number }>;
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

function crmMetadata(existingMetadata: unknown, input: CrmMessageInput | CrmMediaMessageInput | CrmTemplateMessageInput | CrmReactionMessageInput | CrmLocationMessageInput | CrmInteractiveMessageInput): JsonObject {
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
        ...(input.replyToMessageId !== undefined ? { replyToMessageId: input.replyToMessageId } : {}),
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

    async sendMedia(input) {
      if (!await dependencies.crmIntegrationBelongsToCompany(input.companyId, input.integrationId)) {
        throw new Error('Integration does not belong to this company');
      }

      const result = await dependencies.sendMedia(input.companyId, {
        channelId: input.channelId,
        to: input.to,
        mediaType: input.media.type,
        mediaUrl: input.media.url,
        ...(input.caption ? { caption: input.caption } : {}),
        ...(input.media.filename ? { filename: input.media.filename } : {}),
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

    async sendTemplate(input) {
      if (!await dependencies.crmIntegrationBelongsToCompany(input.companyId, input.integrationId)) {
        throw new Error('Integration does not belong to this company');
      }

      if (!dependencies.sendTemplate) {
        throw new Error('Template sending is not configured for this integration');
      }

      const result = await dependencies.sendTemplate(input.companyId, {
        channelId: input.channelId,
        to: input.to,
        templateName: input.template.name,
        templateLanguage: input.template.language,
        ...(input.template.components ? { components: input.template.components } : {}),
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

    async sendReaction(input) {
      if (!await dependencies.crmIntegrationBelongsToCompany(input.companyId, input.integrationId)) {
        throw new Error('Integration does not belong to this company');
      }

      if (!dependencies.sendReaction) {
        throw new Error('Reactions are not configured for this integration');
      }

      const result = await dependencies.sendReaction(input.companyId, {
        channelId: input.channelId,
        to: input.to,
        targetMessageId: input.targetMessageId,
        emoji: input.emoji,
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

    async sendLocation(input) {
      if (!await dependencies.crmIntegrationBelongsToCompany(input.companyId, input.integrationId)) {
        throw new Error('Integration does not belong to this company');
      }

      if (!dependencies.sendLocation) {
        throw new Error('Sending a location is not configured for this integration');
      }

      const result = await dependencies.sendLocation(input.companyId, {
        channelId: input.channelId,
        to: input.to,
        location: input.location,
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

    async markAsRead(input) {
      if (!await dependencies.crmIntegrationBelongsToCompany(input.companyId, input.integrationId)) {
        throw new Error('Integration does not belong to this company');
      }

      if (!dependencies.markMessageAsRead) {
        throw new Error('Marking a message as read is not configured for this integration');
      }

      return dependencies.markMessageAsRead(input.companyId, { messageId: input.messageId });
    },

    async sendInteractive(input) {
      if (!await dependencies.crmIntegrationBelongsToCompany(input.companyId, input.integrationId)) {
        throw new Error('Integration does not belong to this company');
      }

      if (!dependencies.sendInteractiveMessage) {
        throw new Error('Interactive messages are not configured for this integration');
      }

      const result = await dependencies.sendInteractiveMessage(input.companyId, {
        channelId: input.channelId,
        to: input.to,
        interactiveType: input.interactiveType,
        content: input.content,
        options: input.options,
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
