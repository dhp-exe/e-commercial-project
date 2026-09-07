/**
 * Abandoned inventory reservation cleanup queue (cron-scheduled).
 *
 * Registers a repeatable job that runs every 5 minutes.
 * Uses a static jobId ('reservation-cleanup-cron') to prevent duplicate schedulers.
 *
 * The worker (reservationCleanupWorker.js) finds active reservations
 * where expires_at < NOW(), restores inventory.reserved_quantity,
 * and marks them as 'expired'.
 *
 * Job Schema:
 *   { type: 'reservation-cleanup' }
 */

import { Queue } from 'bullmq';
import { connection } from './connection.js';

export const reservationCleanupQueue = new Queue('reservation-cleanup', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 15000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});

/**
 * Schedule the repeatable cron job.
 * Runs every 5 minutes.
 */
export async function scheduleReservationCleanup() {
  try {
    await reservationCleanupQueue.add(
      'reservation-cleanup-job',
      { type: 'reservation-cleanup' },
      {
        repeat: { pattern: '*/5 * * * *' },
        jobId: 'reservation-cleanup-cron',
      }
    );
    console.log('🗓️  Reservation cleanup cron scheduled (every 5 minutes)');
  } catch (err) {
    console.error('Failed to schedule reservation cleanup cron:', err.message);
  }
}
