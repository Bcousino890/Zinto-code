/**
 * Pure shaping of the CRM API v2 `message.*` webhook `data` payload from a
 * stored message row — no `db` import, so lightweight unit tests can exercise
 * this without transitively pulling in server/db.ts's environment-integrity
 * check (see crm-media-url.ts's own docstring for the same reasoning).
 * storage.ts's createMessage() is the "glue code" that calls these with a
 * real row and publishes the result; keep any new decision logic here, not
 * back in storage.ts, so it stays testable.
 */
import mimeTypes from 'mime-types';
import { buildCrmMediaDownloadUrl } from './crm-media-url';

/** Media fields for the CRM v2 `message.*` webhook `data` payload — omitted entirely for plain-text messages. */
export function crmWebhookMediaPayload(message: { mediaUrl: string | null; type: string | null }): { media?: { url: string; type: string | null; mime_type: string | null } } {
  if (!message.mediaUrl) return {};
  const url = buildCrmMediaDownloadUrl(message.mediaUrl);
  if (!url) return {};
  return {
    media: {
      url,
      type: message.type,
      mime_type: mimeTypes.lookup(message.mediaUrl) || null,
    },
  };
}

/** `avatar_url` for the CRM v2 webhook `data.contact` object — omitted when Zinto has no photo on file (most contacts). */
export function crmWebhookContactAvatarField(avatarUrl: string | null | undefined): { avatar_url?: string } {
  if (!avatarUrl) return {};
  const url = buildCrmMediaDownloadUrl(avatarUrl);
  return url ? { avatar_url: url } : {};
}

export type CrmWebhookMessageMetadataFields = {
  button?: { payload: string; text: string };
  list?: { payload: string; text: string; description?: string };
  reaction?: { emoji: string | null; message_id?: number };
  contacts?: Array<{ name: string | null; phones: string[]; emails?: string[] }>;
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  reply_to?: { message_id: number };
};

/**
 * Surfaces the structured fields `handleIncomingWebhookMessage` (and the
 * outbound send helpers) already capture into `messages.metadata` — button/
 * list replies, reactions, shared contact cards, structured location, and
 * reply-to references — in the CRM v2 `message.*` webhook `data` payload.
 * Each field is entirely omitted when the message doesn't carry it (a plain
 * text message produces `{}` here), matching `crmWebhookMediaPayload`'s
 * convention above. `reaction.message_id`/`reply_to.message_id` are Zinto's
 * own internal message id (never the WhatsApp wamid) — resolved at receipt
 * time, so this field is itself omitted (not "null") when Zinto couldn't
 * resolve which of its own messages the reaction/reply pointed at.
 */
export function crmWebhookMessageMetadataPayload(message: { metadata: unknown }): CrmWebhookMessageMetadataFields {
  if (!message.metadata) return {};
  let metadata: Record<string, unknown>;
  try {
    metadata = (typeof message.metadata === 'string' ? JSON.parse(message.metadata) : message.metadata) as Record<string, unknown>;
  } catch {
    return {};
  }
  if (!metadata || typeof metadata !== 'object') return {};

  const fields: CrmWebhookMessageMetadataFields = {};

  const button = metadata.button as { payload?: unknown; text?: unknown } | undefined;
  if (button && typeof button.payload === 'string' && typeof button.text === 'string') {
    fields.button = { payload: button.payload, text: button.text };
  }

  const list = metadata.list as { payload?: unknown; text?: unknown; description?: unknown } | undefined;
  if (list && typeof list.payload === 'string' && typeof list.text === 'string') {
    fields.list = { payload: list.payload, text: list.text, ...(typeof list.description === 'string' ? { description: list.description } : {}) };
  }

  const reaction = metadata.reaction as { emoji?: unknown; messageId?: unknown } | undefined;
  if (reaction && (typeof reaction.emoji === 'string' || reaction.emoji === null)) {
    fields.reaction = {
      emoji: reaction.emoji ?? null,
      ...(Number.isSafeInteger(reaction.messageId) ? { message_id: reaction.messageId as number } : {}),
    };
  }

  const contacts = metadata.contacts as Array<{ name?: unknown; phones?: unknown; emails?: unknown }> | undefined;
  if (Array.isArray(contacts) && contacts.length > 0) {
    fields.contacts = contacts.map((c) => ({
      name: typeof c.name === 'string' ? c.name : null,
      phones: Array.isArray(c.phones) ? c.phones.filter((p): p is string => typeof p === 'string') : [],
      ...(Array.isArray(c.emails) && c.emails.length > 0 ? { emails: c.emails.filter((e): e is string => typeof e === 'string') } : {}),
    }));
  }

  const location = metadata.location as { latitude?: unknown; longitude?: unknown; name?: unknown; address?: unknown } | undefined;
  if (location && typeof location.latitude === 'number' && typeof location.longitude === 'number') {
    fields.location = {
      latitude: location.latitude,
      longitude: location.longitude,
      ...(typeof location.name === 'string' ? { name: location.name } : {}),
      ...(typeof location.address === 'string' ? { address: location.address } : {}),
    };
  }

  const replyTo = metadata.replyTo as { messageId?: unknown } | undefined;
  if (replyTo && Number.isSafeInteger(replyTo.messageId)) {
    fields.reply_to = { message_id: replyTo.messageId as number };
  }

  return fields;
}
