/**
 * Legacy forwarder for backward compatibility during Modular Monolith migration.
 * @deprecated Import from 'modules/orders/index.js' instead.
 */

export {
  ordersRouter as default,
  getOrderStatsByUserId,
  getLastPurchasedProductId,
} from '../modules/orders/index.js';