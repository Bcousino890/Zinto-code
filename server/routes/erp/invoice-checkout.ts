import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAnyPermission } from '../../middleware';
import { storage } from '../../storage';
import { erpGatewayFromRouteSlug, type ErpOnlineGateway } from '@shared/erp-payment-gateway';
import {
  completeInvoiceCheckoutSession,
  createInvoiceCheckout,
} from '../../services/erp-invoice-checkout-service';
import {
  capturePayPalOrder,
  verifyMercadoPagoPayment,
  verifyMoyasarPayment,
  verifyPaystackPayment,
  verifyStripeCheckoutSession,
} from '../../services/payment-gateway-core';
import { getErpGatewaySettingsRaw } from '../../services/erp-payment-gateway-service';
import type { ErpMercadoPagoSettings, ErpMoyasarSettings, ErpPayPalSettings, ErpPaystackSettings, ErpStripeSettings } from '@shared/erp-payment-gateway';
import { sendValidationError } from '../../utils/erp-zod-validation';

const authRouter = Router();
const publicRouter = Router();

const ERP_INVOICE_CHECKOUT_PERMISSIONS = ['view_invoices', 'manage_invoices', 'record_payments'];

function getBaseUrl(req: Request): string {
  const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
  const host = req.get('host') || 'localhost:9000';
  return `${protocol}://${host}`;
}

function handleError(res: Response, error: unknown, label: string, status = 400) {
  if (error instanceof z.ZodError) return sendValidationError(res, error);
  console.error(label, error);
  const message = error instanceof Error ? error.message : 'Unexpected server error';
  return res.status(status).json({ success: false, error: message });
}

const checkoutBodySchema = z.object({
  phoneNumber: z.string().optional(),
  customerEmail: z.string().email().optional(),
  originUrl: z.string().optional(),
});

authRouter.post(
  '/invoices/:id/checkout/:gateway',
  requireAnyPermission(ERP_INVOICE_CHECKOUT_PERMISSIONS),
  async (req: any, res) => {
    try {
      const invoiceId = parseInt(req.params.id, 10);
      const gateway = erpGatewayFromRouteSlug(req.params.gateway) as ErpOnlineGateway | undefined;
      if (!gateway) return res.status(400).json({ error: 'Invalid gateway' });

      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice || invoice.companyId !== req.user.companyId) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      const body = checkoutBodySchema.parse(req.body ?? {});
      const result = await createInvoiceCheckout(invoice, gateway, {
        baseUrl: getBaseUrl(req),
        phoneNumber: body.phoneNumber,
        customerEmail: body.customerEmail || req.user.email,
        originUrl: body.originUrl,
      });

      res.json(result);
    } catch (error) {
      handleError(res, error, '[erp-invoice-checkout] POST checkout');
    }
  }
);

publicRouter.get(
  '/invoices/:paymentToken/checkout/:gateway',
  async (req, res) => {
    try {
      const gateway = erpGatewayFromRouteSlug(req.params.gateway) as ErpOnlineGateway | undefined;
      if (!gateway) return res.status(400).json({ error: 'Invalid gateway' });

      const invoice = await storage.getInvoiceByPaymentToken(req.params.paymentToken);
      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

      const phoneNumber = typeof req.query.phone === 'string' ? req.query.phone : undefined;
      const result = await createInvoiceCheckout(invoice, gateway, {
        baseUrl: getBaseUrl(req),
        phoneNumber,
        originUrl: typeof req.query.originUrl === 'string' ? req.query.originUrl : undefined,
      });

      if (gateway === 'bank_transfer' && result.bankDetails) {
        return res.json({
          message: 'Bank transfer instructions',
          bankDetails: result.bankDetails,
          checkoutSessionId: result.checkoutSessionId,
        });
      }

      if (gateway === 'mpesa' && result.mpesaStk) {
        return res.json({
          message: result.mpesaStk.customerMessage,
          checkoutSessionId: result.checkoutSessionId,
          mpesa: result.mpesaStk,
        });
      }

      if (!result.checkoutUrl) {
        return res.status(400).json({ error: 'Checkout URL not available' });
      }

      return res.redirect(302, result.checkoutUrl);
    } catch (error) {
      handleError(res, error, '[erp-invoice-checkout] GET public checkout', 400);
    }
  }
);

publicRouter.get('/checkout-sessions/:id/moyasar-config', async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const session = await storage.getErpInvoiceCheckoutSession(sessionId);
    if (!session || session.gateway !== 'moyasar') {
      return res.status(404).json({ error: 'Checkout session not found' });
    }
    const invoice = await storage.getInvoice(session.invoiceId);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const settings = await getErpGatewaySettingsRaw(session.companyId, 'moyasar');
    if (!settings?.publishableKey) {
      return res.status(400).json({ error: 'Moyasar is not configured' });
    }

    const base = getBaseUrl(req);
    res.json({
      publishableKey: settings.publishableKey,
      amount: Math.round(Number(session.amount) * 100),
      currency: session.currency,
      description: `Invoice ${invoice.invoiceNumber}`,
      callbackUrl: `${base}/payment/success?source=erp_invoice&checkout_session_id=${session.id}&gateway=moyasar`,
      checkoutSessionId: session.id,
    });
  } catch (error) {
    handleError(res, error, '[erp-invoice-checkout] moyasar config');
  }
});

authRouter.post('/payment/verify', async (req: any, res) => {
  try {
    const schema = z.object({
      checkoutSessionId: z.coerce.number(),
      gateway: z.string().optional(),
      session_id: z.string().optional(),
      reference: z.string().optional(),
      payment_id: z.string().optional(),
      order_id: z.string().optional(),
    });
    const body = schema.parse(req.body);
    const session = await storage.getErpInvoiceCheckoutSession(body.checkoutSessionId);
    if (!session) return res.status(404).json({ error: 'Checkout session not found' });

    const gateway = (body.gateway || session.gateway) as ErpOnlineGateway;
    const settings = await getErpGatewaySettingsRaw(session.companyId, gateway);
    if (!settings) return res.status(400).json({ error: 'Gateway not configured' });

    let paid = false;
    let referenceNumber: string | undefined;

    switch (gateway) {
      case 'stripe': {
        if (!body.session_id) return res.status(400).json({ error: 'session_id required' });
        const verified = await verifyStripeCheckoutSession(settings as ErpStripeSettings, body.session_id);
        paid = verified.paid;
        referenceNumber = verified.paymentIntentId;
        break;
      }
      case 'paystack': {
        const ref = body.reference || session.externalSessionId;
        if (!ref) return res.status(400).json({ error: 'reference required' });
        const verified = await verifyPaystackPayment(settings as ErpPaystackSettings, ref);
        paid = verified.paid;
        referenceNumber = ref;
        break;
      }
      case 'paypal': {
        const orderId = body.order_id || session.externalSessionId;
        if (!orderId) return res.status(400).json({ error: 'order_id required' });
        const verified = await capturePayPalOrder(settings as ErpPayPalSettings, orderId);
        paid = verified.paid;
        referenceNumber = verified.captureId || orderId;
        break;
      }
      case 'moyasar': {
        const paymentId = body.payment_id;
        if (!paymentId) return res.status(400).json({ error: 'payment_id required' });
        const verified = await verifyMoyasarPayment(settings as ErpMoyasarSettings, paymentId);
        paid = verified.paid;
        referenceNumber = paymentId;
        break;
      }
      case 'mercadopago': {
        const paymentId = body.payment_id;
        if (!paymentId) return res.status(400).json({ error: 'payment_id required' });
        const verified = await verifyMercadoPagoPayment(settings as ErpMercadoPagoSettings, paymentId);
        paid = verified.paid;
        referenceNumber = paymentId;
        break;
      }
      default:
        return res.status(400).json({ error: `Verification not supported for ${gateway}` });
    }

    if (!paid) {
      return res.status(400).json({ error: 'Payment not completed' });
    }

    const result = await completeInvoiceCheckoutSession(session.id, {
      referenceNumber,
      externalSessionId: referenceNumber,
      recordedBy: req.user?.id ?? null,
    });

    res.json({
      success: true,
      invoice: result.invoice,
      alreadyCompleted: result.alreadyCompleted,
    });
  } catch (error) {
    handleError(res, error, '[erp-invoice-checkout] verify');
  }
});

export { authRouter as erpInvoiceCheckoutRoutes, publicRouter as erpPublicCheckoutRoutes };
