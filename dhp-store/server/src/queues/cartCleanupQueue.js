/**
 * Legacy forwarder for backward compatibility during Modular Monolith migration.
 * @deprecated Import from 'modules/orders/index.js' instead.
 */

export {
  cartCleanupQueue,
  cartCleanupQueue as default,
  scheduleCartCleanup,
} from '../modules/orders/index.js';
