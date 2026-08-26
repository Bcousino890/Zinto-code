
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
