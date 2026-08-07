/**
 * Cache invalidation worker — processes jobs from the 'cache-invalidate' queue.
 *
 * Offloads the Redis SCAN loop (previously inline in products.js) to a
 * background worker so product mutation routes respond instantly.
 *
 * Job data:
 *   { type: 'cache-invalidate', pattern: string, productId?: number }
 *
 * Uses the existing node-redis client from cache/redis.js.
 */

import { Worker } from 'bullmq';
import * as Sentry from '@sentry/node';
import { connection } from '../queues/connection.js';
import redis from '../cache/redis.js';

const cacheWorker = new Worker(
  'cache-invalidate',
  async (job) => {
    const { pattern, productId } = job.data;

    console.log(`🧹 Processing cache invalidation job ${job.id}: pattern="${pattern}", productId=${productId || 'none'}`);

    // Delete specific product key first if provided
    if (productId) {
      await redis.del(`product:${productId}`);
    }

    // SCAN loop to find and delete matching keys (avoids KEYS blocking)
    let cursor = 0;
    let totalDeleted = 0;
    do {
      const result = await redis.scan(cursor, {
        MATCH: pattern,
        COUNT: 100,
      });
      cursor = result.cursor;
      if (result.keys.length > 0) {
        await redis.del(result.keys);
        totalDeleted += result.keys.length;
      }
    } while (cursor !== 0);

    console.log(`🧹 Cache invalidation complete: ${totalDeleted} keys deleted`);
  },
  {
    connection,
    concurrency: 2,
  }
);

cacheWorker.on('failed', (job, err) => {
  console.error(`Cache invalidation job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
  Sentry.captureException(err, { tags: { queue: 'cache-invalidate' } });
});

cacheWorker.on('error', (err) => {
  console.error('Cache worker error:', err.message);
});

export default cacheWorker;
