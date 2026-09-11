/**
 * Legacy forwarder for backward compatibility during Modular Monolith migration.
 * @deprecated Import from 'modules/catalog/index.js' instead.
 */

export {
  reservationCleanupQueue,
  reservationCleanupQueue as default,
  scheduleReservationCleanup,
} from '../modules/catalog/index.js';
