/**
 * Abandoned inventory reservation cleanup worker.
 * Processes jobs from the 'reservation-cleanup' queue.
 *
 * Runs every 5 minutes to release expired reservations (holds older than 15 mins)
 * and decrement inventory.reserved_quantity to prevent inventory leakage.
 */

import { Worker } from 'bullmq';
import * as Sentry from '@sentry/node';
import { connection } from '../../../shared/queues/connection.js';
import { pool } from '../../../shared/db/pool.js';

const reservationCleanupWorker = new Worker(
  'reservation-cleanup',
  async (job) => {
    console.log(`⏱️ Processing reservation cleanup job ${job.id}`);

    let conn;
    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();

      // Find all active reservations that have expired
      const [expiredReservations] = await conn.execute(
        `SELECT id, variant_id, quantity
         FROM inventory_reservations
         WHERE status = 'active'
         AND expires_at < NOW()
         FOR UPDATE`
      );

      if (expiredReservations.length === 0) {
        await conn.rollback();
        return;
      }

      console.log(`⏱️ Found ${expiredReservations.length} expired reservations to release.`);

      for (const res of expiredReservations) {
        // Decrement reserved_quantity safely
        await conn.execute(
          `UPDATE inventory
           SET reserved_quantity = GREATEST(0, reserved_quantity - ?)
           WHERE variant_id = ?`,
          [res.quantity, res.variant_id]
        );

        // Mark reservation as expired
        await conn.execute(
          `UPDATE inventory_reservations
           SET status = 'expired'
           WHERE id = ?`,
          [res.id]
        );
      }

      await conn.commit();
      console.log(`✅ Successfully released ${expiredReservations.length} expired reservations.`);
    } catch (err) {
      if (conn) await conn.rollback();
      throw err;
    } finally {
      if (conn) conn.release();
    }
  },
  {
    connection,
    concurrency: 1,
  }
);

reservationCleanupWorker.on('failed', (job, err) => {
  console.error(`Reservation cleanup job ${job?.id} failed:`, err.message);
  Sentry.captureException(err, { tags: { queue: 'reservation-cleanup' } });
});

reservationCleanupWorker.on('error', (err) => {
  console.error('Reservation cleanup worker error:', err.message);
});

export default reservationCleanupWorker;
