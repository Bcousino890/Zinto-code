import { planWebhookDelivery } from './integration-webhook-worker';

type PendingDelivery = { id: string; attemptCount: number };
type DeliveryResult = { statusCode?: number; networkError?: boolean; retryAfterSeconds?: number };

export class WebhookDeliveryWorker {
  constructor(private readonly port: {
    getNext(): Promise<PendingDelivery | undefined>;
    deliver(delivery: PendingDelivery): Promise<DeliveryResult>;
    update(value: { id: string; status: 'delivered' | 'failed' | 'pending' | 'dead_letter'; nextAttemptAt: Date | null }): Promise<void>;
  }) {}

  async processNext(now: Date): Promise<boolean> {
    const delivery = await this.port.getNext();
    if (!delivery) return false;
    const result = await this.port.deliver(delivery);
    const plan = planWebhookDelivery({
      attemptCount: delivery.attemptCount,
      responseStatus: result.statusCode,
      networkError: result.networkError,
      retryAfterSeconds: result.retryAfterSeconds,
      now,
    });
    await this.port.update({ id: delivery.id, ...plan });
    return true;
  }
}
