/**
 * Stripe webhook worker — processes jobs from the 'stripe-webhook' queue.
 *
 * Handles verified Stripe event payloads that were enqueued by the
 * webhook route after immediate 200 OK acknowledgment.
 *
 * Supported events:
 *   - payment_intent.succeeded → Updates order status to 'confirmed'
 *   - payment_intent.payment_failed → Logs the failure
 *
 * Idempotency: Checks current order status before updating to avoid
 * double-processing on webhook retries.
 */

import { Worker } from 'bullmq';
import * as Sentry from '@sentry/node';
import { connection } from '../queues/connection.js';
import { pool } from '../db.js';

const stripeWorker = new Worker(
  'stripe-webhook',
  async (job) => {
    const { eventType, payload } = job.data;

    console.log(`💳 Processing Stripe webhook job ${job.id}: ${eventType}`);

    switch (eventType) {
      case 'payment_intent.succeeded': {
        const paymentIntent = payload.data?.object;
        if (!paymentIntent) {
          console.warn(`Stripe job ${job.id}: No payment intent object found`);
          return;
        }

        // The order ID should be in the payment intent metadata
        // or we can match by the payment intent amount + user
        const orderId = paymentIntent.metadata?.order_id;
        if (!orderId) {
          console.warn(`Stripe job ${job.id}: No order_id in payment intent metadata`);
          return;
        }

        // Idempotency check: only update if order is still in 'new' status
        const [orders] = await pool.execute(
          'SELECT id, status FROM orders WHERE id = ?',
          [orderId]
        );

        if (orders.length === 0) {
          console.warn(`Stripe job ${job.id}: Order ${orderId} not found`);
          return;
        }

        if (orders[0].status !== 'new') {
          console.log(`Stripe job ${job.id}: Order ${orderId} already ${orders[0].status}, skipping`);
          return;
        }

        await pool.execute(
          'UPDATE orders SET status = ?, payment_method = ? WHERE id = ?',
          ['confirmed', 'stripe', orderId]
        );

        console.log(`💳 Order ${orderId} status updated to 'confirmed'`);
        break;
      }

      case 'payment_intent.payment_failed': {
        const failedIntent = payload.data?.object;
        const failedOrderId = failedIntent?.metadata?.order_id;
        console.error(
          `💳 Payment failed for order ${failedOrderId || 'unknown'}:`,
          failedIntent?.last_payment_error?.message || 'No error message'
        );
        break;
      }

      default:
        console.log(`💳 Unhandled Stripe event type: ${eventType} — skipping`);
    }
  },
  {
    connection,
    concurrency: 5,
  }
);

stripeWorker.on('failed', (job, err) => {
  console.error(`Stripe webhook job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
  Sentry.captureException(err, {
    tags: { queue: 'stripe-webhook', eventType: job?.data?.eventType },
  });
});

stripeWorker.on('error', (err) => {
  console.error('Stripe worker error:', err.message);
});

export default stripeWorker;
