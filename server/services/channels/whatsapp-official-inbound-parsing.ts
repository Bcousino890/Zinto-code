/**
 * Pure parsing helpers for the new WhatsApp inbound message types
 * `handleIncomingWebhookMessage` (whatsapp-official.ts) understands —
 * structured location, shared contact cards, and reactions. Kept separate
 * and `db`-free (same convention as whatsapp-official-status.ts) so this
 * logic is unit-testable without a live database; resolving a reaction's or
 * a reply's target wamid to Zinto's own internal message id still happens
 * in whatsapp-official.ts itself, since that lookup needs `storage`.
 */

export type ParsedWhatsAppLocation = {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
};

/** `undefined` when `location` doesn't have both coordinates (nothing worth storing). */
export function parseWhatsAppLocationMetadata(location: unknown): ParsedWhatsAppLocation | undefined {
  const candidate = location as { latitude?: unknown; longitude?: unknown; name?: unknown; address?: unknown } | null | undefined;
  if (!candidate || typeof candidate.latitude !== 'number' || typeof candidate.longitude !== 'number') return undefined;
  return {
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    ...(typeof candidate.name === 'string' && candidate.name ? { name: candidate.name } : {}),
    ...(typeof candidate.address === 'string' && candidate.address ? { address: candidate.address } : {}),
  };
}

export type ParsedWhatsAppSharedContact = {
  name: string | null;
  phones: string[];
  emails?: string[];
};

/** Meta's `message.contacts` array shape → Zinto's stored shape. Empty array in, empty array out. */
export function parseWhatsAppSharedContacts(contacts: unknown): ParsedWhatsAppSharedContact[] {
  if (!Array.isArray(contacts)) return [];
  return contacts.map((sharedContact: any) => ({
    name: sharedContact?.name?.formatted_name || null,
    phones: Array.isArray(sharedContact?.phones)
      ? sharedContact.phones.map((p: any) => p?.phone).filter((phone: unknown): phone is string => typeof phone === 'string')
      : [],
    ...(Array.isArray(sharedContact?.emails) && sharedContact.emails.length > 0
      ? { emails: sharedContact.emails.map((e: any) => e?.email).filter((email: unknown): email is string => typeof email === 'string') }
      : {}),
  }));
}

/** A human-readable fallback for `messages.content` when contact cards are shared. */
export function summarizeWhatsAppSharedContacts(contacts: ParsedWhatsAppSharedContact[]): string {
  return contacts.map((c) => c.name).filter(Boolean).join(', ') || 'Shared contact card';
}

export type ParsedWhatsAppReaction = {
  emoji: string | null;
  externalMessageId: string | null;
};

/** Meta's `message.reaction` → the raw (unresolved) fields; `emoji: null` means the reaction was removed. */
export function parseWhatsAppReaction(reaction: unknown): ParsedWhatsAppReaction {
  const candidate = reaction as { emoji?: unknown; message_id?: unknown } | null | undefined;
  return {
    emoji: typeof candidate?.emoji === 'string' && candidate.emoji ? candidate.emoji : null,
    externalMessageId: typeof candidate?.message_id === 'string' && candidate.message_id ? candidate.message_id : null,
  };
}
