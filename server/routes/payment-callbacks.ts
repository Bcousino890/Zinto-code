import { Router } from 'express';
import Stripe from 'stripe';
import { storage } from '../storage';
import { logger } from '../utils/logger';
import { activateSubscriptionAfterPayment } from './enhanced-subscription';
import { handleAddonWebhookEvent } from '../services/addon-billing-webhooks';

const router = Router();

/**
 * Stripe payment success callback
 * This endpoint is called after successful payment to activate subscription
 */
router.get('/stripe/success', async (req, res) => {
  try {
    const { session_id } = req.query;
    
    if (!session_id) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('Stripe secret key not configured');
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-09-30.clover' as any,
    });
    

    const session = await stripe.checkout.sessions.retrieve(session_id as string);
    
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ 
        error: 'Payment not completed',
        message: 'Payment was not successful. Please try again.'
      });
    }


    const metadata = session.metadata || {};
    const companyId = metadata.companyId;
    const planId = metadata.planId;
    const renewalType = metadata.renewalType;
    
    if (!companyId || !planId || renewalType !== 'subscription_renewal') {
      return res.status(400).json({ error: 'Invalid payment metadata' });
    }


    await activateSubscriptionAfterPayment(
      parseInt(companyId),
      parseInt(planId),
      session.payment_intent as string || 'unknown',
      (session.amount_total || 0) / 100 // Convert from cents
    );


    res.redirect('/payment/success?renewed=true');

  } catch (error) {
    logger.error('payment-callbacks', 'Stripe payment callback error:', error);
    res.redirect('/payment/error?reason=verification_failed');
  }
});

/**
 * Stripe webhook handler for payment events
 * This provides additional security by verifying webhooks
 */
router.post('/stripe/webhook', async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    if (!endpointSecret) {
      logger.error('payment-callbacks', 'Stripe webhook secret not configured');
      return res.status(400).send('Webhook secret not configured');
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('Stripe secret key not configured');
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-09-30.clover' as any,
    });
    
    let event;
    try {
      if (!sig) {
        throw new Error('Missing stripe signature');
      }
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err: any) {
      logger.error('payment-callbacks', 'Webhook signature verification failed:', err);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }


    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;

        // Add-on purchases are detected by `metadata.purchaseId` (set by
        // AddonPurchaseService#createPurchaseCheckoutSession) and are mutually exclusive with the
        // plan-renewal metadata shape below. This is the ONLY code path that ever moves an
        // addon_purchases row from `pending` to `active`.
        if (session.metadata?.purchaseId) {
          try {
            const result = await handleAddonWebhookEvent(event);
            logger.info('payment-callbacks', `Add-on checkout.session.completed for session ${session.id}: ${JSON.stringify(result)}`);
          } catch (addonError: any) {
            logger.error('payment-callbacks', 'Failed to process add-on checkout.session.completed:', addonError);
          }
          break;
        }

        if (session.metadata?.renewalType === 'subscription_renewal') {

          if (session.payment_status === 'paid') {
            const metadata = session.metadata || {};
            const companyId = metadata.companyId;
            const planId = metadata.planId;

            if (companyId && planId) {
              try {
                await activateSubscriptionAfterPayment(
                  parseInt(companyId),
                  parseInt(planId),
                  session.payment_intent as string || 'unknown',
                  (session.amount_total || 0) / 100
                );

                logger.info('payment-callbacks', `Subscription renewed via webhook for company ${companyId}, plan ${planId}, session ${session.id}`);
              } catch (activationError: any) {
                logger.error('payment-callbacks', 'Failed to activate subscription via webhook:', activationError);
              }
            }
          }
        }
        break;
      }

      // The customer never completed payment (Stripe expires an unpaid Checkout Session ~24h
      // after creation). Must NEVER grant quota — only transitions a still-`pending` row to
      // `failed`; an already-`active` row (out-of-order delivery) is left untouched.
      case 'checkout.session.expired': {
        const session = event.data.object;
        if (session.metadata?.purchaseId) {
          try {
            const result = await handleAddonWebhookEvent(event);
            logger.info('payment-callbacks', `Add-on checkout.session.expired for session ${session.id}: ${JSON.stringify(result)}`);
          } catch (addonError: any) {
            logger.error('payment-callbacks', 'Failed to process add-on checkout.session.expired:', addonError);
          }
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object;
        logger.warn('payment-callbacks', `Payment failed for intent ${paymentIntent.id}, amount: ${paymentIntent.amount} ${paymentIntent.currency}`);
        try {
          const result = await handleAddonWebhookEvent(event);
          if (result.handled) {
            logger.info('payment-callbacks', `Add-on payment_intent.payment_failed processed: ${JSON.stringify(result)}`);
          }
        } catch (addonError: any) {
          logger.error('payment-callbacks', 'Failed to process add-on payment_intent.payment_failed:', addonError);
        }
        break;
      }

      // A refund on an already-`active` add-on purchase revokes it immediately (regardless of the
      // "no voluntary refunds" business policy — a manual refund from the Stripe dashboard must
      // never leave phantom quota behind).
      case 'charge.refunded': {
        try {
          const result = await handleAddonWebhookEvent(event);
          if (result.handled) {
            logger.info('payment-callbacks', `Add-on charge.refunded processed: ${JSON.stringify(result)}`);
          }
        } catch (addonError: any) {
          logger.error('payment-callbacks', 'Failed to process add-on charge.refunded:', addonError);
        }
        break;
      }

      // A chargeback revokes the matching active purchase immediately — does not wait for the
      // dispute to resolve, closing the "dispute the charge, keep the quota" angle.
      case 'charge.dispute.created': {
        try {
          const result = await handleAddonWebhookEvent(event);
          if (result.handled) {
            logger.info('payment-callbacks', `Add-on charge.dispute.created processed: ${JSON.stringify(result)}`);
          }
        } catch (addonError: any) {
          logger.error('payment-callbacks', 'Failed to process add-on charge.dispute.created:', addonError);
        }
        break;
      }

      default:
        logger.info('Unhandled Stripe webhook event type:', event.type);
    }

    res.json({ received: true });
  } catch (error: any) {
    logger.error('payment-callbacks', 'Stripe webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

/**
 * Payment cancelled callback
 */
router.get('/cancelled', async (req, res) => {
  res.redirect('/payment/cancelled');
});

/**
 * Payment error callback  
 */
router.get('/error', async (req, res) => {
  const reason = req.query.reason || 'unknown';
  res.redirect(`/payment/error?reason=${reason}`);
});

export default router;
