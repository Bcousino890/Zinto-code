
/**
 * Baileys WhatsApp channel types that require a real-time connection status.
 */
export const BAILEYS_CHANNEL_TYPES = ['whatsapp', 'whatsapp_unofficial'] as const;

/**
 * Checks if a channel type is a Baileys WhatsApp channel.
 */
export function isBaileysChannel(channelType: string): boolean {
  return (BAILEYS_CHANNEL_TYPES as readonly string[]).includes(channelType);
}

/**
 * Normalizes a raw channel connection status to a standard set of values.
 * Baileys channels use this to map various internal states to normalized ones.
 */
export function normalizeChannelStatus(status: string | null): 'active' | 'inactive' | 'reconnecting' | 'error' {
  // Truly usable states
  if (status === 'connected' || status === 'active') {
    return 'active';
  }

  // Transitional states
  if (status === 'connecting' || status === 'reconnecting') {
    return 'reconnecting';
  }

  // Explicit error state
  if (status === 'error') {
    return 'error';
  }

  // All other states are considered inactive/unavailable.
  // This includes setup states (qr_code, pending, null) and 
  // terminal disconnected states (disconnected, loggedout, not_connected, inactive).
  return 'inactive';
}

/**
 * Resolves the effective status of a channel connection based on its type and raw status.
 * Non-Baileys channels are always considered 'active'.
 */
export function getEffectiveChannelStatus(channel: { channelType: string; status: string | null }): 'active' | 'inactive' | 'reconnecting' | 'error' {
  if (!isBaileysChannel(channel.channelType)) {
    return 'active';
  }
  return normalizeChannelStatus(channel.status);
}

/**
 * Determines if a channel is available for selection or interaction.
 */
export function isChannelAvailable(channel: { channelType: string; status: string | null }): boolean {
  return getEffectiveChannelStatus(channel) === 'active';
}

/**
 * Minimal shape needed to check whether an email address is monitored by an
 * active inbox connection. `emailAddress` must be the connection's *actual*
 * mailbox address (e.g. resolved from the `email_configs` table) — callers
 * should not assume `accountName` (a display label) is the mailbox address.
 */
export interface EmailMonitoringConnection {
  channelType: string;
  status: string | null;
  emailAddress?: string | null;
}

/**
 * Determines whether a given email address matches an actively-monitored
 * (connected + polled) email channel connection.
 *
 * Used to warn when an outbound sender address (e.g. an Amazon SES "From"
 * address) is not connected as an inbox Zinto polls for replies — meaning
 * customer replies sent to that address would never be picked up and would
 * be invisible in the CRM.
 */
export function isEmailAddressMonitored(
  email: string | null | undefined,
  channelConnections: EmailMonitoringConnection[]
): boolean {
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    return false;
  }

  return channelConnections.some((connection) => {
    if (connection.channelType !== 'email') {
      return false;
    }
    if (!isChannelAvailable(connection)) {
      return false;
    }
    const candidate = (connection.emailAddress || '').trim().toLowerCase();
    return candidate.length > 0 && candidate === normalizedEmail;
  });
}
