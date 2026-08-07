/**
 * Stripe webhook processing job queue.
 *
 * Receives verified Stripe event payloads and processes them asynchronously.
 * The webhook route immediately returns 200 OK to Stripe and enqueues the
 * payload for background reconciliation by stripeWorker.js.
 *
 * Job Schema:
 *   { type: 'stripe-webhook', eventType: string, payload: object }
 */

import { Queue } from 'bullmq';
import { connection } from './connection.js';

export const stripeQueue = new Queue('stripe-webhook', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 2000 },
  },
});
