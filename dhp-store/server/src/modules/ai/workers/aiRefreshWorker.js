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
import { connection } from '../../../shared/queues/connection.js';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:10000';

const aiRefreshWorker = new Worker(
  'ai-refresh',
  async (job) => {
    const { action, productId } = job.data || {};
    console.log(`🤖 Processing AI refresh job ${job.id} (type: ${job.name || job.data?.type})`);

    if (job.name === 'sync-product' || action === 'upsert') {
      const response = await axios.post(`${AI_SERVICE_URL}/sync/product/${productId}`, null, {
        timeout: 15000,
      });
      console.log(`🤖 Single product vector synced for ID ${productId}:`, response.data);
    } else if (job.name === 'delete-product' || action === 'delete') {
      const response = await axios.delete(`${AI_SERVICE_URL}/sync/product/${productId}`, {
        timeout: 15000,
      });
      console.log(`🤖 Single product vector deleted for ID ${productId}:`, response.data);
    } else {
      const response = await axios.post(`${AI_SERVICE_URL}/refresh`, null, {
        timeout: 15000,
      });
      console.log(`🤖 AI refresh triggered (status: ${response.status}):`, response.data);
    }
  },
  {
    connection,
    concurrency: 2,
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
