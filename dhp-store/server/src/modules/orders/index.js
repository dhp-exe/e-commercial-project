/**
 * Orders Module Public Facade.
 *
 * All external modules must interact with the orders module exclusively
 * through this entry point. Direct imports from internal files (repository,
 * service, controller, internal routes) are prohibited.
 */

export { default as ordersRouter, cartRouter } from './routes.js';
export { default as webhooksRouter } from './webhooks.js';

export { stripeQueue } from './queues/stripeQueue.js';
export { cartCleanupQueue, scheduleCartCleanup } from './queues/cartCleanupQueue.js';

export {
  getOrderStatsByUserId,
  getLastPurchasedProductId,
} from './service.js';
