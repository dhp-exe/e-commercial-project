/**
 * AI model refresh job queue.
 *
 * Triggers the Python AI service to retrain its recommendation model.
 * Jobs are enqueued from the /api/recommend/refresh endpoint and
 * processed by aiRefreshWorker.js.
 *
 * Job Schema:
 *   { type: 'ai-refresh' }
 */

import { Queue } from 'bullmq';
import { connection } from './connection.js';

export const aiRefreshQueue = new Queue('ai-refresh', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 10000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
  },
});
