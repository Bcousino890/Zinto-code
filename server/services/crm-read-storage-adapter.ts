import type {
  CrmChannelSummary,
  CrmChannelsReadPort,
  CrmConversationSummary,
  CrmConversationsReadPort,
  CrmMessageStatus,
  CrmMessageStatusReadPort,
} from './crm-read-service';

// ---------------------------------------------------------------------------
// Channels — wraps apiMessageService.getChannels, which already scopes
// storage.getChannelConnectionsByCompany to the caller's company and filters
// to connections that are actually usable (isChannelAvailable).
// ---------------------------------------------------------------------------

type ChannelsSource = {
  getChannels(companyId: number): Promise<Array<{
    id: number;
    name: string;
    type: string;
    status: string;
    phoneNumber?: string;
    displayName?: string;
  }>>;
};

export function createCrmChannelsReadAdapter(source: ChannelsSource): CrmChannelsReadPort {
  return {
    listChannels: async (companyId) => {
      const channels = await source.getChannels(companyId);
      return channels.map((channel): CrmChannelSummary => ({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        status: channel.status,
        phoneNumber: channel.phoneNumber,
        displayName: channel.displayName,
      }));
    },
  };
}

// ---------------------------------------------------------------------------
// Conversations — wraps apiMessageService.getConversations, which already
// scopes storage.getConversations / getConversationsCountByCompany to the
// caller's company before applying the channelId/status/isGroup filters.
// ---------------------------------------------------------------------------

type ConversationsSource = {
  getConversations(companyId: number, options: {
    page: number;
    limit: number;
    channelId?: number;
    status?: string;
    isGroup?: boolean;
  }): Promise<{
    conversations: Array<{
      id: number;
      contactId: number | null;
      channelId: number;
      channelType: string;
      status: string | null;
      isGroup: boolean | null;
      lastMessageAt: Date | null;
      createdAt: Date | null;
    }>;
    total: number;
  }>;
};

export function createCrmConversationsReadAdapter(source: ConversationsSource): CrmConversationsReadPort {
  return {
    listConversations: async ({ companyId, page, limit, channelId, status, isGroup }) => {
      const result = await source.getConversations(companyId, { page, limit, channelId, status, isGroup });
      return {
        conversations: result.conversations.map((conv): CrmConversationSummary => ({
          id: conv.id,
          contactId: conv.contactId,
          channelId: conv.channelId,
          channelType: conv.channelType,
          status: conv.status,
          isGroup: conv.isGroup,
          lastMessageAt: conv.lastMessageAt,
          createdAt: conv.createdAt,
        })),
        total: result.total,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Message status — wraps apiMessageService.getMessageStatus, which throws
// when the requested message exists but its conversation belongs to a
// different company (or the conversation is missing/deleted). That's the
// exact company-scoping check v1's GET /messages/:id/status route relies on
// — we preserve it unchanged and simply fold it into this port's `null`
// contract ("not visible to this company") instead of letting a generic
// error escape. Any other failure (e.g. a genuine storage error) is not
// this specific case and is re-thrown as-is rather than silently hidden.
// ---------------------------------------------------------------------------

const ACCESS_DENIED_MESSAGE = 'Message not found or access denied';

type MessageStatusSource = {
  getMessageStatus(companyId: number, messageId: number): Promise<CrmMessageStatus | null>;
};

export function createCrmMessageStatusReadAdapter(source: MessageStatusSource): CrmMessageStatusReadPort {
  return {
    getMessageStatus: async ({ companyId, messageId }) => {
      try {
        return await source.getMessageStatus(companyId, messageId);
      } catch (error) {
        if (error instanceof Error && error.message === ACCESS_DENIED_MESSAGE) {
          return null;
        }
        throw error;
      }
    },
  };
}
