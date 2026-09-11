/**
 * Catalog Module Public Facade.
 *
 * All external modules must interact with the catalog module exclusively
 * through this entry point. Direct imports from internal files (repository,
 * service, controller, internal routes) are prohibited.
 */

export { default as catalogRouter } from './routes.js';
export { default as sitemapRouter } from './sitemap.js';

export { cacheQueue } from './queues/cacheQueue.js';
export {
  reservationCleanupQueue,
  scheduleReservationCleanup,
} from './queues/reservationCleanupQueue.js';

export {
  hydrateProducts,
  getProductsByIds,
  getVariantPrice,
  getProductBasePrice,
  deductInventory,
  restoreInventory,
  getAvailableStock,
  getActiveProductSummaries,
} from './service.js';
