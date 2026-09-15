import { db } from '../db';
import { eq } from 'drizzle-orm';
import { messages, conversations, contacts } from '@shared/schema';
import { normalizeServedMediaUrlForTracking } from './media-ownership';

/**
 * Scoped to exactly what CRM v2 exposes through `GET /media`: WhatsApp
 * message attachments and contact profile photos. (The broader
 * `/uploads/...` media used elsewhere in the app — campaign templates,
 * knowledge base docs, etc. — is intentionally out of scope.)
 */
export async function findMediaOwnerCompanyId(mediaPath: string): Promise<number | null> {
  const pathOnly = normalizeServedMediaUrlForTracking(mediaPath) ?? mediaPath;
  if (!pathOnly.startsWith('/media/')) {
    return null;
  }

  const [messageOwner] = await db
    .select({ companyId: conversations.companyId })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(eq(messages.mediaUrl, pathOnly))
    .limit(1);

  if (messageOwner?.companyId) {
    return messageOwner.companyId;
  }

  const [contactOwner] = await db
    .select({ companyId: contacts.companyId })
    .from(contacts)
    .where(eq(contacts.avatarUrl, pathOnly))
    .limit(1);

  return contactOwner?.companyId ?? null;
}
