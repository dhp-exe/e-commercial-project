/**
 * Stripe webhook route.
 *
 * Receives Stripe events, verifies the webhook signature, immediately
 * returns 200 OK, and enqueues the payload for async processing by
 * stripeWorker.js.
 *
 * IMPORTANT: This route uses express.raw() for body parsing because
 * Stripe signature verification requires the raw request body.
 * It must be registered BEFORE the global express.json() middleware
 * in index.js.
 */

import { Router } from 'express';
import Stripe from 'stripe';
import express from 'express';
import * as Sentry from '@sentry/node';
import { stripeQueue } from '../queues/stripeQueue.js';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Use raw body parser for Stripe signature verification
router.use(express.raw({ type: 'application/json' }));

router.post('/', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).json({ message: 'Webhook not configured' });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ message: 'Webhook signature verification failed' });
  }

  // Immediately acknowledge the webhook to Stripe (< 3s timeout)
  res.status(200).json({ received: true });

  // Enqueue the verified event for async processing
  try {
    await stripeQueue.add(`stripe-${event.type}`, {
      type: 'stripe-webhook',
      eventType: event.type,
      payload: event,
    });
    console.log(`💳 Stripe event ${event.type} enqueued (ID: ${event.id})`);
  } catch (queueErr) {
    console.error('Failed to enqueue Stripe webhook:', queueErr.message);
    Sentry.captureException(queueErr, {
      tags: { queue: 'stripe-webhook', eventType: event.type },
    });
  }
});

export default router;
