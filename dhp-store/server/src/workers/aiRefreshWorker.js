/**
 * AI refresh worker — processes jobs from the 'ai-refresh' queue.
 *
 * Sends a POST request to the Python AI service's /refresh endpoint
 * to trigger a recommendation model retrain. The actual ML computation
 * is handled by FastAPI's BackgroundTasks on the Python side.
 *
 * Errors are reported to Sentry and automatically retried by BullMQ.
 */

import { Worker } from 'bullmq';
import * as Sentry from '@sentry/node';
import axios from 'axios';
import { connection } from '../queues/connection.js';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:10000';

const aiRefreshWorker = new Worker(
  'ai-refresh',
  async (job) => {
    console.log(`🤖 Processing AI refresh job ${job.id}`);

    const response = await axios.post(`${AI_SERVICE_URL}/refresh`, null, {
      timeout: 15000,
    });

    console.log(`🤖 AI refresh triggered (status: ${response.status}):`, response.data);
  },
  {
    connection,
    concurrency: 1,
  }
);

aiRefreshWorker.on('failed', (job, err) => {
  console.error(`AI refresh job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
  Sentry.captureException(err, { tags: { queue: 'ai-refresh' } });
});

aiRefreshWorker.on('error', (err) => {
  console.error('AI refresh worker error:', err.message);
});

export default aiRefreshWorker;
