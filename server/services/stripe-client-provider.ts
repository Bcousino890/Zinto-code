import Stripe from 'stripe';

import type { IStorage } from '../storage';

type StripeSettings = {
  enabled?: boolean;
  secretKey?: unknown;
};

export class StripeCatalogConfigurationError extends Error {
  constructor() {
    super('Stripe catalog synchronization is not configured');
    this.name = 'StripeCatalogConfigurationError';
  }
}

export class StripeClientProvider {
  constructor(
    private readonly settingsStorage: Pick<IStorage, 'getAppSetting'>,
    private readonly createClient: (secretKey: string) => Stripe = (secretKey) =>
      new Stripe(secretKey, { apiVersion: '2025-09-30.clover' as Stripe.LatestApiVersion }),
  ) {}

  async getClient(): Promise<Stripe> {
    const setting = await this.settingsStorage.getAppSetting('payment_stripe');
    const value = setting?.value as StripeSettings | undefined;
    const secretKey = typeof value?.secretKey === 'string' ? value.secretKey.trim() : '';

    if (!value?.enabled || !secretKey) {
      throw new StripeCatalogConfigurationError();
    }

    return this.createClient(secretKey);
  }
}

export function sanitizeStripeCatalogError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Stripe catalog operation failed';
  return message
    .replace(/(?:sk|pk|whsec)_(?:live|test)_[A-Za-z0-9_]+/g, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .slice(0, 300);
}
