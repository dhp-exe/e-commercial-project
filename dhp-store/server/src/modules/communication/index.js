/**
 * Communication Module — Public Facade
 *
 * Exposes public contracts for other modules and application bootstrap:
 * - emailQueue: BullMQ Queue for transactional emails (used by auth_user, orders, and index.js)
 * - feedbackRouter: Express router mounted at /api/feedback
 */

export { emailQueue } from './queues/emailQueue.js';
export { default as feedbackRouter } from './routes.js';
export { default } from './routes.js';
