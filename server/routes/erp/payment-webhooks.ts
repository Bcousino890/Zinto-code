import { Router, type Express, type Request, type Response } from 'express';
import Stripe from 'stripe';
import {
  erpGatewayFromRouteSlug,
  type ErpOnlineGateway,
  ERP_GATEWAY_TO_PAYMENT_METHOD,
} from '@shared/erp-payment-gateway';
import { storage } from '../../storage';
import { completeInvoiceCheckoutSession } from '../../services/erp-invoice-checkout-service';
import { getErpGatewaySettingsRaw } from '../../services/erp-payment-gateway-service';
import type {
  ErpMercadoPagoSettings,
  ErpMpesaSettings,
  ErpMoyasarSettings,
  ErpPayPalSettings,
  ErpPaystackSettings,
  ErpStripeSettings,
} from '@shared/erp-payment-gateway';
import { verifyMercadoPagoPayment } from '../../services/payment-gateway-core';

function parseCompanyId(value: string): number | undefined {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

async function completeSessionByMetadata(
  checkoutSessionId: number,
  referenceNumber?: string
): Promise<void> {
  await completeInvoiceCheckoutSession(checkoutSessionId, { referenceNumber });
}

export function registerErpPaymentWebhooks(app: Express): void {
  const router = Router();

  router.post('/stripe/:companyId', async (req: Request, res: Response) => {
    try {
      const companyId = parseCompanyId(req.params.companyId);
      if (!companyId) return res.status(400).json({ error: 'Invalid company ID' });

      const settings = (await getErpGatewaySettingsRaw(companyId, 'stripe')) as ErpStripeSettings | undefined;
      if (!settings?.secretKey || !settings.webhookSecret) {
        return res.status(400).json({ error: 'Stripe is not configured' });
      }

      const stripe = new Stripe(settings.secretKey, { apiVersion: '2025-09-30.clover' as any });
      const signature = req.headers['stripe-signature'] as string;
      let event;
      try {
        event = stripe.webhooks.constructEvent(req.body, signature, settings.webhookSecret);
      } catch (err) {
        return res.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : 'Invalid signature'}`);
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const checkoutSessionId = parseInt(session.metadata?.checkoutSessionId || '', 10);
        if (checkoutSessionId && session.payment_status === 'paid') {
          await completeSessionByMetadata(checkoutSessionId, (session.payment_intent as string) || session.id);
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error('[erp-webhook] stripe', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  router.post('/paystack/:companyId', async (req: Request, res: Response) => {
    try {
      const companyId = parseCompanyId(req.params.companyId);
      if (!companyId) return res.status(400).json({ error: 'Invalid company ID' });

      const settings = (await getErpGatewaySettingsRaw(companyId, 'paystack')) as ErpPaystackSettings | undefined;
      if (!settings?.secretKey) return res.status(400).json({ error: 'Paystack not configured' });

      const body = req.body;
      if (body?.event === 'charge.success' && body?.data?.metadata?.checkoutSessionId) {
        const checkoutSessionId = parseInt(String(body.data.metadata.checkoutSessionId), 10);
        await completeSessionByMetadata(checkoutSessionId, body.data.reference);
      }

      res.json({ received: true });
    } catch (error) {
      console.error('[erp-webhook] paystack', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  router.post('/mercadopago/:companyId', async (req: Request, res: Response) => {
    try {
      const companyId = parseCompanyId(req.params.companyId);
      if (!companyId) return res.status(400).json({ error: 'Invalid company ID' });

      const settings = (await getErpGatewaySettingsRaw(companyId, 'mercadopago')) as ErpMercadoPagoSettings | undefined;
      if (!settings?.accessToken) return res.status(400).json({ error: 'Mercado Pago not configured' });

      const { type, data } = req.body || {};
      if (type === 'payment' && data?.id) {
        const verified = await verifyMercadoPagoPayment(settings, String(data.id));
        if (verified.paid && verified.externalReference) {
          const checkoutSessionId = parseInt(verified.externalReference, 10);
          if (checkoutSessionId) {
            await completeSessionByMetadata(checkoutSessionId, String(data.id));
          }
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error('[erp-webhook] mercadopago', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  router.post('/paypal/:companyId', async (req: Request, res: Response) => {
    try {
      const companyId = parseCompanyId(req.params.companyId);
      if (!companyId) return res.status(400).json({ error: 'Invalid company ID' });

      const settings = (await getErpGatewaySettingsRaw(companyId, 'paypal')) as ErpPayPalSettings | undefined;
      if (!settings?.clientId) return res.status(400).json({ error: 'PayPal not configured' });

      const body = req.body;
      const verificationUrl = settings.testMode
        ? 'https://ipnpb.sandbox.paypal.com/cgi-bin/webscr'
        : 'https://ipnpb.paypal.com/cgi-bin/webscr';
      const verificationBody =
        'cmd=_notify-validate&' +
        Object.keys(body)
          .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(body[key])}`)
          .join('&');
      const verificationResponse = await fetch(verificationUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: verificationBody,
      });
      const verificationText = await verificationResponse.text();

      if (verificationText === 'VERIFIED' && body.payment_status === 'Completed' && body.custom) {
        const checkoutSessionId = parseInt(String(body.custom), 10);
        if (checkoutSessionId) {
          await completeSessionByMetadata(checkoutSessionId, body.txn_id);
        }
      }

      res.status(200).end();
    } catch (error) {
      console.error('[erp-webhook] paypal', error);
      res.status(200).end();
    }
  });

  router.post('/moyasar/:companyId', async (req: Request, res: Response) => {
    try {
      const companyId = parseCompanyId(req.params.companyId);
      if (!companyId) return res.status(400).json({ error: 'Invalid company ID' });

      const body = req.body;
      const metadata = body?.data?.metadata || body?.metadata;
      if (body?.type === 'payment_paid' && metadata?.checkoutSessionId) {
        const checkoutSessionId = parseInt(String(metadata.checkoutSessionId), 10);
        await completeSessionByMetadata(checkoutSessionId, body.data?.id);
      }

      res.json({ received: true });
    } catch (error) {
      console.error('[erp-webhook] moyasar', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  router.post('/mpesa/:companyId', async (req: Request, res: Response) => {
    try {
      const companyId = parseCompanyId(req.params.companyId);
      if (!companyId) return res.status(400).json({ error: 'Invalid company ID' });

      const body = req.body?.Body?.stkCallback || req.body;
      if (body?.ResultCode === 0 && body?.CheckoutRequestID) {
        const session = await storage.getErpInvoiceCheckoutSessionByExternalId(
          companyId,
          body.CheckoutRequestID
        );
        if (session) {
          const mpesaReceipt = body.CallbackMetadata?.Item?.find(
            (i: { Name: string }) => i.Name === 'MpesaReceiptNumber'
          )?.Value;
          await completeSessionByMetadata(session.id, mpesaReceipt || body.CheckoutRequestID);
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error('[erp-webhook] mpesa', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  router.post('/bank-transfer/:companyId', async (_req, res) => {
    res.json({ received: true, message: 'Bank transfers are confirmed manually' });
  });

  app.use('/api/webhooks/erp', router);
}

export { erpGatewayFromRouteSlug, ERP_GATEWAY_TO_PAYMENT_METHOD };
