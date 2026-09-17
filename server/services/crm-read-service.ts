/**
 * Read-only ports for CRM API v2 — company-scoped access to channel
 * connections, conversations, and message delivery status.
 *
 * These wrap the same query logic already used (and tested) by API v1's
 * `GET /channels`, `GET /conversations`, and `GET /messages/:id/status`
 * routes, so v2 partners finally have a way to read back what they wrote.
 *
 * Kept import-free, like crm-contact-sync-service.ts, so api-v2.ts (and its
 * router unit tests) never transitively pull in server/db.ts through this
 * file. The concrete storage/apiMessageService-backed implementations live
 * in crm-read-storage-adapter.ts.
 */

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

export interface CrmChannelSummary {
  id: number;
  name: string;
  type: string;
  status: string;
  phoneNumber?: string;
  displayName?: string;
}

export interface CrmChannelsReadPort {
  listChannels(companyId: number): Promise<CrmChannelSummary[]>;
}

export class CrmChannelsReadService {
  constructor(private readonly port: CrmChannelsReadPort) {}

  listChannels(companyId: number): Promise<CrmChannelSummary[]> {
    return this.port.listChannels(companyId);
  }
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export interface CrmConversationSummary {
  id: number;
  contactId: number | null;
  channelId: number;
  channelType: string;
  status: string | null;
  isGroup: boolean | null;
  lastMessageAt: Date | null;
  createdAt: Date | null;
}

export interface CrmConversationFilters {
  channelId?: number;
  status?: string;
  isGroup?: boolean;
}

export interface CrmConversationPagination {
  page?: number;
  limit?: number;
}

export interface CrmConversationsReadPort {
  listConversations(input: {
    companyId: number;
    page: number;
    limit: number;
    channelId?: number;
    status?: string;
    isGroup?: boolean;
  }): Promise<{ conversations: CrmConversationSummary[]; total: number }>;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function resolvePage(page: number | undefined): number {
  return Number.isFinite(page) && (page as number) > 0 ? Math.floor(page as number) : DEFAULT_PAGE;
}

function resolveLimit(limit: number | undefined): number {
  const resolved = Number.isFinite(limit) && (limit as number) > 0 ? Math.floor(limit as number) : DEFAULT_LIMIT;
  return Math.min(resolved, MAX_LIMIT);
}

export class CrmConversationsReadService {
  constructor(private readonly port: CrmConversationsReadPort) {}

  listConversations(input: {
    companyId: number;
    filters?: CrmConversationFilters;
    pagination?: CrmConversationPagination;
  }): Promise<{ conversations: CrmConversationSummary[]; total: number }> {
    return this.port.listConversations({
      companyId: input.companyId,
      page: resolvePage(input.pagination?.page),
      limit: resolveLimit(input.pagination?.limit),
      channelId: input.filters?.channelId,
      status: input.filters?.status,
      isGroup: input.filters?.isGroup,
    });
  }
}

// ---------------------------------------------------------------------------
// Message status
// ---------------------------------------------------------------------------

export interface CrmMessageStatus {
  status: string;
  timestamp: Date;
}

export interface CrmMessageStatusReadPort {
  /** Resolves to `null` when the message doesn't exist, *or* when it belongs to a different company. */
  getMessageStatus(input: { companyId: number; messageId: number }): Promise<CrmMessageStatus | null>;
}

export class CrmMessageStatusReadService {
  constructor(private readonly port: CrmMessageStatusReadPort) {}

  getMessageStatus(input: { companyId: number; messageId: number }): Promise<CrmMessageStatus | null> {
    return this.port.getMessageStatus(input);
  }
}
