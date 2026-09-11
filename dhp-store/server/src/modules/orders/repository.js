import { pool } from '../../shared/db/pool.js';

// ─────────────────────────────────────────────────────────────────────────────
// Cart Queries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find active cart for a user.
 */
export async function findActiveCartByUserId(userId, conn = pool) {
  const [rows] = await conn.execute(
    'SELECT * FROM carts WHERE user_id = ? AND status = ?',
    [userId, 'active']
  );
  return rows[0] || null;
}

/**
 * Create a new active cart for a user.
 */
export async function createCart(userId, conn = pool) {
  const [result] = await conn.execute(
    'INSERT INTO carts (user_id) VALUES (?)',
    [userId]
  );
  return { id: result.insertId, user_id: userId, status: 'active' };
}

/**
 * Fetch cart items with product, variant, and inventory details.
 */
export async function findCartItemsWithDetails(cartId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT 
       ci.id,
       ci.cart_id,
       ci.variant_id,
       ci.product_id,
       ci.qty,
       p.name AS product_name,
       p.name,
       p.base_price,
       pv.sku,
       pv.price_override,
       COALESCE(pv.price_override, p.base_price) AS price,
       c.name AS color_name,
       c.hex_code AS color_hex,
       s.name AS size_name,
       COALESCE(i.quantity, 0) AS stock,
       GREATEST(0, COALESCE(i.quantity, 0) - COALESCE(i.reserved_quantity, 0)) AS available_stock,
       pi.image_url AS primary_image,
       p.image_url AS fallback_image
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     JOIN product_variants pv ON ci.variant_id = pv.id
     JOIN colors c ON pv.color_id = c.id
     JOIN sizes s ON pv.size_id = s.id
     JOIN inventory i ON i.variant_id = pv.id
     LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = TRUE
     WHERE ci.cart_id = ?
     ORDER BY ci.id ASC`,
    [cartId]
  );
  return rows;
}

/**
 * Fetch variant, product, size, and available inventory for cart addition.
 */
export async function findVariantForCart(variantId, conn = pool) {
  const [rows] = await conn.execute(
    `SELECT pv.id AS variant_id,
            pv.product_id,
            s.name AS size_name,
            GREATEST(0, COALESCE(i.quantity, 0) - COALESCE(i.reserved_quantity, 0)) AS available_stock
     FROM product_variants pv
     JOIN sizes s ON pv.size_id = s.id
     JOIN inventory i ON i.variant_id = pv.id
     WHERE pv.id = ? AND pv.is_active = TRUE`,
    [variantId]
  );
  return rows[0] || null;
}

/**
 * Check if a specific variant already exists in a cart.
 */
export async function findCartItem(cartId, variantId, conn = pool) {
  const [rows] = await conn.execute(
    'SELECT id, qty FROM cart_items WHERE cart_id = ? AND variant_id = ?',
    [cartId, variantId]
  );
  return rows[0] || null;
}

/**
 * Update quantity and size of an existing cart item.
 */
export async function updateCartItemQtyAndSize(cartItemId, qty, size, conn = pool) {
  await conn.execute(
    'UPDATE cart_items SET qty = ?, size = ? WHERE id = ?',
    [qty, size, cartItemId]
  );
}

/**
 * Insert a new cart item.
 */
export async function insertCartItem({ cartId, productId, variantId, qty, size }, conn = pool) {
  await conn.execute(
    'INSERT INTO cart_items (cart_id, product_id, variant_id, qty, size) VALUES (?, ?, ?, ?, ?)',
    [cartId, productId, variantId, qty, size]
  );
}

/**
 * Delete a cart item by cart_id and variant_id.
 */
export async function deleteCartItem(cartId, variantId, conn = pool) {
  const [result] = await conn.execute(
    'DELETE FROM cart_items WHERE cart_id = ? AND variant_id = ?',
    [cartId, variantId]
  );
  return result.affectedRows;
}

/**
 * Update cart item quantity by cart_id and variant_id.
 */
export async function updateCartItemQty(cartId, variantId, qty, conn = pool) {
  const [result] = await conn.execute(
    'UPDATE cart_items SET qty = ? WHERE cart_id = ? AND variant_id = ?',
    [qty, cartId, variantId]
  );
  return result.affectedRows;
}

/**
 * Clear all items in a cart.
 */
export async function clearCartItems(cartId, conn = pool) {
  await conn.execute('DELETE FROM cart_items WHERE cart_id = ?', [cartId]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Order Queries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch items for a batch of order IDs in a single query.
 */
export async function findItemsForOrders(orderIds, conn = pool) {
  if (!orderIds || orderIds.length === 0) return [];
  const [items] = await conn.query(
    `SELECT oi.order_id, oi.id, oi.variant_id, oi.quantity, oi.size, oi.price, p.name,
            pi.image_url AS primary_image, p.image_url AS fallback_image,
            c.name AS color_name, pv.sku
     FROM order_items oi
     JOIN products p ON oi.product_id = p.id
     LEFT JOIN product_variants pv ON oi.variant_id = pv.id
     LEFT JOIN colors c ON pv.color_id = c.id
     LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = TRUE
     WHERE oi.order_id IN (?)`,
    [orderIds]
  );
  return items;
}

/**
 * Fetch cart items with price for order creation.
 */
export async function findCartItemsForOrder(cartId, conn = pool) {
  const [rows] = await conn.execute(
    `SELECT 
       ci.product_id,
       ci.variant_id,
       ci.qty,
       ci.size,
       COALESCE(pv.price_override, p.base_price) AS price
     FROM cart_items ci 
     JOIN products p ON ci.product_id = p.id 
     LEFT JOIN product_variants pv ON ci.variant_id = pv.id
     WHERE ci.cart_id = ?`,
    [cartId]
  );
  return rows;
}

/**
 * Find variant details (product_id, size, price) for guest orders.
 */
export async function findVariantForOrder(variantId, conn = pool) {
  const [rows] = await conn.execute(
    `SELECT pv.id AS variant_id, pv.product_id, s.name AS size,
            COALESCE(pv.price_override, p.base_price) AS price
     FROM product_variants pv
     JOIN products p ON pv.product_id = p.id
     JOIN sizes s ON pv.size_id = s.id
     WHERE pv.id = ? AND pv.is_active = true`,
    [variantId]
  );
  return rows[0] || null;
}

/**
 * Find active product base price for guest orders without variant.
 */
export async function findProductForOrder(productId, conn = pool) {
  const [rows] = await conn.execute(
    'SELECT id, base_price FROM products WHERE id = ? AND is_active = true',
    [productId]
  );
  return rows[0] || null;
}

/**
 * Insert an order record.
 */
export async function insertOrder(orderData, conn = pool) {
  const {
    userId,
    total,
    name,
    email,
    phone,
    address,
    city,
    district,
    paymentMethod,
    note,
  } = orderData;

  const [result] = await conn.execute(
    `INSERT INTO orders 
     (user_id, total, status, name, email, phone, address, city, district, payment_method, note) 
     VALUES (?, ?, "new", ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      total,
      name || '',
      email || '',
      phone || '',
      address || '',
      city || '',
      district || '',
      paymentMethod || 'cod',
      note || '',
    ]
  );
  return result.insertId;
}

/**
 * Batch insert items for an order.
 */
export async function insertOrderItems(orderId, items, conn = pool) {
  if (!items || items.length === 0) return;
  const placeholders = items.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
  const values = items.flatMap((item) => [
    orderId,
    item.product_id,
    item.variant_id,
    item.qty,
    item.size,
    item.price,
  ]);
  await conn.execute(
    `INSERT INTO order_items (order_id, product_id, variant_id, quantity, size, price) VALUES ${placeholders}`,
    values
  );
}

/**
 * Increment sold_count on products for placed order items.
 */
export async function incrementProductsSoldCount(items, conn = pool) {
  for (const item of items) {
    if (item.product_id) {
      await conn.execute(
        'UPDATE products SET sold_count = sold_count + ? WHERE id = ?',
        [item.qty, item.product_id]
      );
    }
  }
}

/**
 * Query orders for a user with optional status filter and pagination.
 */
export async function findOrdersByUserId({ userId, status, limit, offset }, conn = pool) {
  let query = 'SELECT * FROM orders WHERE user_id = ?';
  const params = [userId];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  const [rows] = await conn.execute(query, params);
  return rows;
}

/**
 * Query all orders with pagination (Admin/Staff).
 */
export async function findAllOrders({ limit, offset }, conn = pool) {
  const [rows] = await conn.execute(
    `SELECT * FROM orders ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
  );
  return rows;
}

/**
 * Find order by ID for update.
 */
export async function findOrderForUpdate(orderId, userId = null, conn = pool) {
  let sql = 'SELECT id, status FROM orders WHERE id = ?';
  const params = [orderId];
  if (userId) {
    sql += ' AND user_id = ?';
    params.push(userId);
  }
  sql += ' FOR UPDATE';

  const [rows] = await conn.execute(sql, params);
  return rows[0] || null;
}

/**
 * Find all items of an order.
 */
export async function findOrderItemsByOrderId(orderId, conn = pool) {
  const [rows] = await conn.execute(
    'SELECT variant_id, product_id, quantity FROM order_items WHERE order_id = ?',
    [orderId]
  );
  return rows;
}

/**
 * Update status of an order.
 */
export async function updateOrderStatus(orderId, status, conn = pool) {
  await conn.execute('UPDATE orders SET status = ? WHERE id = ?', [status, orderId]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-Module Public Query Methods
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get order status counts for a given user.
 */
export async function findOrderStatusCountsByUserId(userId, conn = pool) {
  const [counts] = await conn.execute(
    'SELECT status, COUNT(*) as count FROM orders WHERE user_id = ? GROUP BY status',
    [userId]
  );
  return counts;
}

/**
 * Find the product_id of the last purchased item by a user.
 */
export async function findLastPurchasedProductId(userId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT oi.product_id 
     FROM orders o
     JOIN order_items oi ON o.id = oi.order_id
     WHERE o.user_id = ? 
     ORDER BY o.created_at DESC 
     LIMIT 1`,
    [userId]
  );
  return rows[0]?.product_id || null;
}
