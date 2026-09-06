/**
 * Pure helpers for the "preview a chat without marking it as read" flow.
 * Kept side-effect free and separate from ConversationContext so the read/no-read
 * decision itself is easy to test without mounting the whole provider.
 */

/** A previewed conversation must never trigger the mark-as-read call. */
export function shouldMarkConversationRead(isPreview: boolean): boolean {
  return !isPreview;
}

export type ConversationSelectionMode = 'preview' | 'normal';

/** Labels the current selection so callers can branch on intent instead of a bare boolean. */
export function conversationSelectionMode(isPreview: boolean): ConversationSelectionMode {
  return isPreview ? 'preview' : 'normal';
}
