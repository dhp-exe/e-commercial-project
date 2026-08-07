/**
 * Abandoned cart cleanup worker — processes jobs from the 'cart-cleanup' queue.
 *
 * Runs as a weekly cron job (Monday 00:00 UTC). Finds active carts older
 * than 30 days, deletes their cart_items, and soft-deletes the carts by
 * setting status = 'abandoned'.
 *
 * Uses mysql2/promise pool from db.js with a transaction for data integrity.
 */

import { Worker } from 'bullmq';
import * as Sentry from '@sentry/node';
import { connection } from '../queues/connection.js';
import { pool } from '../db.js';

const cartCleanupWorker = new Worker(
  'cart-cleanup',
  async (job) => {
    console.log(`🛒 Processing cart cleanup job ${job.id}`);

    let conn;
    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();

      // Find abandoned active carts older than 30 days
      const [staleCarts] = await conn.execute(
        `SELECT id FROM carts
         WHERE status = 'active'
         AND created_at < NOW() - INTERVAL 30 DAY`
      );

      if (staleCarts.length === 0) {
        console.log('🛒 No abandoned carts found');
        await conn.rollback();
        return;
      }

      const cartIds = staleCarts.map((c) => c.id);

      // Delete associated cart_items first (foreign key constraint)
      const itemPlaceholders = cartIds.map(() => '?').join(', ');
      const [itemResult] = await conn.execute(
        `DELETE FROM cart_items WHERE cart_id IN (${itemPlaceholders})`,
        cartIds
      );

      // Soft-delete: Update cart status to 'abandoned'
      const [cartResult] = await conn.execute(
        `UPDATE carts SET status = 'abandoned' WHERE id IN (${itemPlaceholders})`,
        cartIds
      );

      await conn.commit();

      console.log(
        `🛒 Cart cleanup complete: ${cartResult.affectedRows} carts marked abandoned, ${itemResult.affectedRows} items deleted`
      );
    } catch (err) {
      if (conn) await conn.rollback();
      throw err; // Let BullMQ handle the retry
    } finally {
      if (conn) conn.release();
    }
  },
  {
    connection,
    concurrency: 1,
  }
);

cartCleanupWorker.on('failed', (job, err) => {
  console.error(`Cart cleanup job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
  Sentry.captureException(err, { tags: { queue: 'cart-cleanup' } });
});

cartCleanupWorker.on('error', (err) => {
  console.error('Cart cleanup worker error:', err.message);
});

export default cartCleanupWorker;
