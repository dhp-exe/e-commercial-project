/**
 * Email job queue.
 *
 * Handles order confirmation and password reset emails.
 * Jobs are enqueued from route handlers and processed by emailWorker.js.
 *
 * Job Schema:
 *   { type: 'email', to: string, template: 'order-confirmation' | 'password-reset', data: object }
 */

import { Queue } from 'bullmq';
import { connection } from './connection.js';

export const emailQueue = new Queue('email', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
});
