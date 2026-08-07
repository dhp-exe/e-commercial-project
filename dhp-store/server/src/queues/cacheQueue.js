/**
 * Cache invalidation job queue.
 *
 * Offloads Redis SCAN-based cache clearing from the request path.
 * Jobs are enqueued from product mutation routes and processed by cacheWorker.js.
 *
 * Job Schema:
 *   { type: 'cache-invalidate', pattern: string, productId?: number }
 */

import { Queue } from 'bullmq';
import { connection } from './connection.js';

export const cacheQueue = new Queue('cache-invalidate', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 2000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 200 },
  },
});
