import Stripe from 'stripe';
import * as Sentry from '@sentry/node';
import { pool } from '../../shared/db/pool.js';
import { AppError } from '../../shared/errors/AppError.js';
import { formatImageUrl } from '../../shared/utils/formatImageUrl.js';
import { emailQueue } from '../communication/index.js';
import { deductInventory, restoreInventory, getAvailableStock } from '../catalog/index.js';
import * as ordersRepo from './repository.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Helper: Fetch and group order items for a list of order IDs.
 */
async function fetchItemsForOrders(orderIds, conn = pool) {
  if (!orderIds || orderIds.length === 0) return new Map();

  const items = await ordersRepo.findItemsForOrders(orderIds, conn);
  const itemMap = new Map();

  for (const item of items) {
    if (!itemMap.has(item.order_id)) {
      itemMap.set(item.order_id, []);
    }
    itemMap.get(item.order_id).push({
      id: item.id,
      variant_id: item.variant_id,
      quantity: item.quantity,
      size: item.size,
      price: Number(item.price),
      name: item.name,
      sku: item.sku,
      color_name: item.color_name,
      image_url: formatImageUrl(item.primary_image || item.fallback_image),
    });
  }

  return itemMap;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cart Service Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get or create an active cart for a user.
 */
export async function getOrCreateCart(userId, conn = pool) {
  const existing = await ordersRepo.findActiveCartByUserId(userId, conn);
  if (existing) return existing;
  return await ordersRepo.createCart(userId, conn);
}

/**
 * Fetch cart and hydrated items for a user.
 */
export async function getCart(userId) {
  const cart = await getOrCreateCart(userId);
  const rows = await ordersRepo.findCartItemsWithDetails(cart.id);

  const items = rows.map((item) => {
    const imageUrl = formatImageUrl(item.primary_image || item.fallback_image);
    return {
      id: item.id,
      variant_id: item.variant_id,
      variantId: item.variant_id, // alias
      product_id: item.product_id,
      productId: item.product_id, // alias
      product_name: item.product_name,
      name: item.name,
      sku: item.sku,
      color_name: item.color_name,
      color_hex: item.color_hex,
      size_name: item.size_name,
      size: item.size_name,
      qty: item.qty,
      price: Number(item.price),
      stock: item.stock,
      available_stock: item.available_stock,
      image_url: imageUrl,
    };
  });

  return { cartId: cart.id, items };
}

/**
 * Add an item to user's active cart.
 */
export async function addToCart(userId, variantId, qty) {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // 1. Fetch variant, product, size, and available inventory atomically
    const variantRow = await ordersRepo.findVariantForCart(variantId, conn);
    if (!variantRow) {
      await conn.rollback();
      throw new AppError('Product variant not found or inactive', 404);
    }

    const { product_id, size_name, available_stock } = variantRow;

    if (qty > available_stock) {
      await conn.rollback();
      throw new AppError(`Only ${available_stock} items available in stock`, 400);
    }

    // 2. Get or create active cart
    const cart = await getOrCreateCart(userId, conn);

    // 3. Check existing item in cart strictly by variant_id
    const existing = await ordersRepo.findCartItem(cart.id, variantId, conn);

    if (existing) {
      const newQty = existing.qty + qty;

      // Validate cumulative quantity against available stock
      if (newQty > available_stock) {
        await conn.rollback();
        throw new AppError(`Cannot add more. Only ${available_stock} items available in stock`, 400);
      }

      await ordersRepo.updateCartItemQtyAndSize(existing.id, newQty, size_name, conn);
    } else {
      await ordersRepo.insertCartItem(
        { cartId: cart.id, productId: product_id, variantId, qty, size: size_name },
        conn
      );
    }

    await conn.commit();
    return { message: 'Item added to cart', cartId: cart.id, variantId };
  } catch (error) {
    if (conn) await conn.rollback();
    throw error;
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Update cart item quantity or remove if qty <= 0.
 */
export async function updateCart(userId, variantId, qty) {
  const cart = await getOrCreateCart(userId);

  if (qty <= 0) {
    await ordersRepo.deleteCartItem(cart.id, variantId);
    return { ok: true, message: 'Item removed' };
  }

  // Check available stock in inventory
  const available = await getAvailableStock(variantId);
  if (qty > available) {
    throw new AppError(`Cannot update. Only ${available} items available in stock`, 400);
  }

  const affectedRows = await ordersRepo.updateCartItemQty(cart.id, variantId, qty);
  if (affectedRows === 0) {
    throw new AppError('Item not found in cart', 404);
  }

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Order Service Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new order (for both authenticated users and guests).
 */
export async function createOrder({ userId, items, deliveryInfo, paymentMethod, note }) {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    let finalItemsToOrder = [];
    let finalTotal = 0;

    // 1. Fetch from active cart if user is authenticated
    if (userId) {
      const cart = await ordersRepo.findActiveCartByUserId(userId, conn);
      if (cart) {
        const cartItems = await ordersRepo.findCartItemsForOrder(cart.id, conn);
        if (cartItems.length > 0) {
          finalItemsToOrder = cartItems.map((ci) => ({
            product_id: ci.product_id,
            variant_id: ci.variant_id,
            qty: ci.qty,
            size: ci.size,
            price: Number(ci.price),
          }));

          for (const item of finalItemsToOrder) {
            finalTotal += item.price * item.qty;
          }

          await ordersRepo.clearCartItems(cart.id, conn);
        }
      }
    }

    // 2. Guest fallback or manual items provided
    if (finalItemsToOrder.length === 0 && Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        const vId = item.variant_id || item.variantId;
        if (vId) {
          const vRow = await ordersRepo.findVariantForOrder(vId, conn);
          if (vRow) {
            const p = Number(vRow.price);
            finalItemsToOrder.push({
              product_id: vRow.product_id,
              variant_id: vRow.variant_id,
              qty: item.qty,
              size: vRow.size,
              price: p,
            });
            finalTotal += p * item.qty;
          }
        } else {
          const pId = item.product_id || item.productId;
          const pRow = await ordersRepo.findProductForOrder(pId, conn);
          if (pRow) {
            const p = Number(pRow.base_price);
            finalItemsToOrder.push({
              product_id: pRow.id,
              variant_id: null,
              qty: item.qty,
              size: item.size || null,
              price: p,
            });
            finalTotal += p * item.qty;
          }
        }
      }
    }

    if (finalItemsToOrder.length === 0) {
      await conn.rollback();
      throw new AppError('No valid items found', 400);
    }

    // 3. Stock verification & deduction via catalog module
    for (const item of finalItemsToOrder) {
      if (item.variant_id) {
        try {
          await deductInventory(item.variant_id, item.qty, conn);
        } catch {
          await conn.rollback();
          throw new AppError('Insufficient stock for one or more items', 400);
        }
      }
    }

    // 4. Create Order
    const orderId = await ordersRepo.insertOrder(
      {
        userId,
        total: finalTotal,
        name: deliveryInfo?.name,
        email: deliveryInfo?.email,
        phone: deliveryInfo?.phone,
        address: deliveryInfo?.address,
        city: deliveryInfo?.city,
        district: deliveryInfo?.district,
        paymentMethod: paymentMethod || 'cod',
        note: note || '',
      },
      conn
    );

    // 5. Batch insert order items
    await ordersRepo.insertOrderItems(orderId, finalItemsToOrder, conn);

    // 6. Increment sold_count on products
    await ordersRepo.incrementProductsSoldCount(finalItemsToOrder, conn);

    await conn.commit();

    // 7. Enqueue order confirmation email via communication module
    if (deliveryInfo?.email) {
      try {
        await emailQueue.add('order-confirmation', {
          type: 'email',
          to: deliveryInfo.email,
          template: 'order-confirmation',
          data: { orderId, customerName: deliveryInfo?.name, total: finalTotal },
        });
      } catch (queueErr) {
        console.error('Failed to enqueue order email:', queueErr.message);
        Sentry.captureException(queueErr, { tags: { queue: 'email' } });
      }
    }

    return { message: 'Order placed successfully', orderId };
  } catch (error) {
    if (conn) await conn.rollback();
    throw error;
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Fetch orders for a user with pagination.
 */
export async function getUserOrders(userId, { status, page = 1, limit = 20 } = {}) {
  const parsedPage = Math.max(1, Number(page) || 1);
  const parsedLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (parsedPage - 1) * parsedLimit;

  const orders = await ordersRepo.findOrdersByUserId(
    { userId, status, limit: parsedLimit, offset },
    pool
  );

  const orderIds = orders.map((o) => o.id);
  const itemMap = await fetchItemsForOrders(orderIds, pool);

  return orders.map((order) => ({
    ...order,
    items: itemMap.get(order.id) || [],
  }));
}

/**
 * Create Stripe Payment Intent for cart or guest items.
 */
export async function createPaymentIntent({ userId, items }) {
  let totalAmount = 0;

  if (userId) {
    const cart = await ordersRepo.findActiveCartByUserId(userId, pool);
    if (cart) {
      const cartItems = await ordersRepo.findCartItemsForOrder(cart.id, pool);
      for (const item of cartItems) {
        totalAmount += Number(item.price) * item.qty;
      }
    }
  }

  if (totalAmount === 0 && Array.isArray(items)) {
    for (const item of items) {
      const vId = item.variant_id || item.variantId;
      if (vId) {
        const vRow = await ordersRepo.findVariantForOrder(vId, pool);
        if (vRow) {
          totalAmount += Number(vRow.price) * item.qty;
        }
      } else {
        const pId = item.product_id || item.productId;
        const pRow = await ordersRepo.findProductForOrder(pId, pool);
        if (pRow) {
          totalAmount += Number(pRow.base_price) * item.qty;
        }
      }
    }
  }

  if (totalAmount === 0) {
    throw new AppError('Cart is empty', 400);
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(totalAmount * 100),
    currency: 'usd',
    automatic_payment_methods: { enabled: true },
  });

  return { clientSecret: paymentIntent.client_secret };
}

/**
 * Cancel an order and restore inventory.
 */
export async function cancelOrder(userId, orderId) {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const order = await ordersRepo.findOrderForUpdate(orderId, userId, conn);
    if (!order) {
      await conn.rollback();
      throw new AppError('Order not found', 404);
    }
    if (order.status !== 'new') {
      await conn.rollback();
      throw new AppError('Only "New" orders can be cancelled', 400);
    }

    // Restock variant inventory via catalog module
    const items = await ordersRepo.findOrderItemsByOrderId(orderId, conn);
    for (const item of items) {
      if (item.variant_id) {
        await restoreInventory(item.variant_id, item.quantity, conn);
      }
    }

    await ordersRepo.updateOrderStatus(orderId, 'cancelled', conn);
    await conn.commit();

    return { message: 'Order cancelled successfully' };
  } catch (error) {
    if (conn) await conn.rollback();
    throw error;
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Get all orders (Admin/Staff) with pagination.
 */
export async function getAllOrdersAdmin({ page = 1, limit = 20 } = {}) {
  const parsedPage = Math.max(1, Number(page) || 1);
  const parsedLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (parsedPage - 1) * parsedLimit;

  const orders = await ordersRepo.findAllOrders({ limit: parsedLimit, offset }, pool);
  const orderIds = orders.map((o) => o.id);
  const itemMap = await fetchItemsForOrders(orderIds, pool);

  return orders.map((order) => ({
    ...order,
    items: itemMap.get(order.id) || [],
  }));
}

/**
 * Update order status (Admin/Staff).
 */
export async function updateOrderStatus(orderId, newStatus) {
  if (!['new', 'confirmed', 'shipping', 'received', 'cancelled'].includes(newStatus)) {
    throw new AppError('Invalid status', 400);
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const order = await ordersRepo.findOrderForUpdate(orderId, null, conn);
    if (!order) {
      await conn.rollback();
      throw new AppError('Order not found', 404);
    }

    const currentStatus = order.status;
    if (currentStatus === newStatus) {
      await conn.rollback();
      return { message: 'Status unchanged' };
    }

    const items = await ordersRepo.findOrderItemsByOrderId(orderId, conn);

    // If cancelling an active order, restock inventory via catalog module
    if (newStatus === 'cancelled' && currentStatus !== 'cancelled') {
      for (const item of items) {
        if (item.variant_id) {
          await restoreInventory(item.variant_id, item.quantity, conn);
        }
      }
    }

    await ordersRepo.updateOrderStatus(orderId, newStatus, conn);
    await conn.commit();

    return { message: `Order status updated to ${newStatus}` };
  } catch (error) {
    if (conn) await conn.rollback();
    throw error;
  } finally {
    if (conn) conn.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-Module Public Facade Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get order status counts for a given user.
 * Exposed for cross-module calls (auth_user profile stats).
 */
export async function getOrderStatsByUserId(userId, conn = pool) {
  const counts = await ordersRepo.findOrderStatusCountsByUserId(userId, conn);
  const orderStats = { new: 0, confirmed: 0, shipping: 0, received: 0, cancelled: 0 };
  counts.forEach((row) => {
    if (orderStats[row.status] !== undefined) {
      orderStats[row.status] = row.count;
    }
  });
  return orderStats;
}

/**
 * Find the product_id of the last purchased item by a user.
 * Exposed for cross-module calls (ai recommendations).
 */
export async function getLastPurchasedProductId(userId, conn = pool) {
  return await ordersRepo.findLastPurchasedProductId(userId, conn);
}
