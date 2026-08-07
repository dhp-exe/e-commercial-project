/**
 * Abandoned cart cleanup job queue (cron-scheduled).
 *
 * Registers a repeatable job that runs every Monday at 00:00 UTC.
 * Uses a static jobId ('cart-cleanup-weekly') to prevent BullMQ from
 * creating duplicate cron schedulers on server restarts.
 *
 * The worker (cartCleanupWorker.js) soft-deletes abandoned carts
 * older than 30 days by setting status = 'abandoned'.
 *
 * Job Schema:
 *   { type: 'cart-cleanup' }
 */

import { Queue } from 'bullmq';
import { connection } from './connection.js';

export const cartCleanupQueue = new Queue('cart-cleanup', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 60000 },
    removeOnComplete: { count: 52 },
    removeOnFail: { count: 52 },
  },
});

/**
 * Schedule the repeatable cron job.
 * Uses a static jobId to prevent duplicate schedulers on restart.
 * Safe to call multiple times — BullMQ deduplicates by jobId + pattern.
 */
export async function scheduleCartCleanup() {
  try {
    await cartCleanupQueue.add(
      'cart-cleanup-weekly',
      { type: 'cart-cleanup' },
      {
        repeat: { pattern: '0 0 * * 1' },
        jobId: 'cart-cleanup-weekly',
      }
    );
    console.log('🗓️  Cart cleanup cron scheduled (Monday 00:00 UTC)');
  } catch (err) {
    console.error('Failed to schedule cart cleanup cron:', err.message);
  }
}
