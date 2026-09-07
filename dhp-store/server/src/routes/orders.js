import { Router } from 'express';
import { pool } from '../db.js';
import Stripe from 'stripe';
import jwt from 'jsonwebtoken';
import * as Sentry from '@sentry/node';
import { requireAuth } from '../middleware/requireAuth.js';
import { apiLimiter } from '../middleware/rateLimit.js';
import { verifyStaff } from '../middleware/requireRole.js';
import { emailQueue } from '../queues/emailQueue.js';
import { formatImageUrl } from '../utils/formatImageUrl.js';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Helper: Fetch order items for a batch of order IDs in a single query.
 * Eliminates N+1 query pattern.
 */
async function fetchItemsForOrders(orderIds, conn = pool) {
  if (orderIds.length === 0) return new Map();

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

// POST /api/orders - Create a new order (Guest & User)
router.post('/', apiLimiter, async (req, res) => {
  let connection;
  try {
    let userId = null;
    const token = req.cookies?.access_token;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id;
      } catch {
        // Proceed as guest
      }
    }

    const { items, deliveryInfo, paymentMethod, note } = req.body;

    connection = await pool.getConnection();
    await connection.beginTransaction();

    let finalItemsToOrder = [];
    let finalTotal = 0;

    // 1. Fetch from active cart if user is authenticated
    if (userId) {
      const [carts] = await connection.execute('SELECT * FROM carts WHERE user_id=? AND status="active"', [userId]);

      if (carts.length > 0) {
        const cartId = carts[0].id;
        const [cartItems] = await connection.execute(
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

          await connection.execute('DELETE FROM cart_items WHERE cart_id = ?', [cartId]);
        }
      }
    }

    // 2. Guest fallback
    if (finalItemsToOrder.length === 0 && Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        if (item.variant_id || item.variantId) {
          const vId = item.variant_id || item.variantId;
          const [vRows] = await connection.execute(
            `SELECT pv.id AS variant_id, pv.product_id, s.name AS size,
                    COALESCE(pv.price_override, p.base_price) AS price
             FROM product_variants pv
             JOIN products p ON pv.product_id = p.id
             JOIN sizes s ON pv.size_id = s.id
             WHERE pv.id = ? AND pv.is_active = true`,
            [vId]
          );
          if (vRows.length > 0) {
            const row = vRows[0];
            const p = Number(row.price);
            finalItemsToOrder.push({
              product_id: row.product_id,
              variant_id: row.variant_id,
              qty: item.qty,
              size: row.size,
              price: p,
            });
            finalTotal += p * item.qty;
          }
        } else {
          const [rows] = await connection.execute(
            'SELECT id, base_price FROM products WHERE id = ? AND is_active = true',
            [item.product_id || item.productId]
          );
          if (rows.length > 0) {
            const p = Number(rows[0].base_price);
            finalItemsToOrder.push({
              product_id: rows[0].id,
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
      await connection.rollback();
      return res.status(400).json({ message: 'No valid items found' });
    }

    // 3. Stock verification & deduction
    for (const item of finalItemsToOrder) {
      if (item.variant_id) {
        const [inv] = await connection.execute(
          'SELECT quantity, reserved_quantity FROM inventory WHERE variant_id = ? FOR UPDATE',
          [item.variant_id]
        );
        if (inv.length === 0 || (inv[0].quantity - inv[0].reserved_quantity) < item.qty) {
          await connection.rollback();
          return res.status(400).json({ message: 'Insufficient stock for one or more items' });
        }
        await connection.execute(
          'UPDATE inventory SET quantity = quantity - ? WHERE variant_id = ?',
          [item.qty, item.variant_id]
        );
      }
    }

    // 4. Create Order
    const [orderResult] = await connection.execute(
      `INSERT INTO orders 
       (user_id, total, status, name, email, phone, address, city, district, payment_method, note) 
       VALUES (?, ?, "new", ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        finalTotal,
        deliveryInfo?.name || '',
        deliveryInfo?.email || '',
        deliveryInfo?.phone || '',
        deliveryInfo?.address || '',
        deliveryInfo?.city || '',
        deliveryInfo?.district || '',
        paymentMethod || 'cod',
        note || '',
      ]
    );

    const orderId = orderResult.insertId;

    // 5. Batch insert order items
    const placeholders = finalItemsToOrder.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    const values = finalItemsToOrder.flatMap((item) => [
      orderId,
      item.product_id,
      item.variant_id,
      item.qty,
      item.size,
      item.price,
    ]);
    await connection.execute(
      `INSERT INTO order_items (order_id, product_id, variant_id, quantity, size, price) VALUES ${placeholders}`,
      values
    );

    // 6. Increment sold_count on products
    for (const item of finalItemsToOrder) {
      await connection.execute(
        'UPDATE products SET sold_count = sold_count + ? WHERE id = ?',
        [item.qty, item.product_id]
      );
    }

    await connection.commit();

    // 7. Enqueue order confirmation email
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

    res.json({ message: 'Order placed successfully', orderId });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Order creation error:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    if (connection) connection.release();
  }
});

// GET /api/orders - Get user's orders (paginated)
router.get('/', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const { status } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  try {
    let query = 'SELECT * FROM orders WHERE user_id = ?';
    const params = [userId];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [orders] = await pool.execute(query, params);

    const orderIds = orders.map((o) => o.id);
    const itemMap = await fetchItemsForOrders(orderIds);

    const ordersWithItems = orders.map((order) => ({
      ...order,
      items: itemMap.get(order.id) || [],
    }));

    res.json(ordersWithItems);
  } catch (error) {
    console.error('Fetch user orders error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/orders/create-payment - Create Stripe Payment Intent
router.post('/create-payment', apiLimiter, async (req, res) => {
  let userId = null;
  const token = req.cookies?.access_token;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userId = decoded.id;
    } catch {
      // Guest mode
    }
  }

  try {
    let totalAmount = 0;

    if (userId) {
      const [carts] = await pool.execute(
        'SELECT * FROM carts WHERE user_id=? AND status="active"',
        [userId]
      );
      if (carts.length > 0) {
        const cartId = carts[0].id;
        const [cartItems] = await pool.execute(
          `SELECT ci.qty, COALESCE(pv.price_override, p.base_price) AS price 
           FROM cart_items ci 
           JOIN products p ON ci.product_id = p.id 
           LEFT JOIN product_variants pv ON ci.variant_id = pv.id
           WHERE ci.cart_id = ?`,
          [cartId]
        );

        for (const item of cartItems) {
          totalAmount += Number(item.price) * item.qty;
        }
      }
    }

    if (totalAmount === 0 && Array.isArray(req.body.items)) {
      for (const item of req.body.items) {
        if (item.variant_id || item.variantId) {
          const vId = item.variant_id || item.variantId;
          const [vRows] = await pool.execute(
            `SELECT COALESCE(pv.price_override, p.base_price) AS price
             FROM product_variants pv
             JOIN products p ON pv.product_id = p.id
             WHERE pv.id = ?`,
            [vId]
          );
          if (vRows.length > 0) {
            totalAmount += Number(vRows[0].price) * item.qty;
          }
        } else {
          const [rows] = await pool.execute(
            'SELECT base_price FROM products WHERE id = ?',
            [item.product_id || item.productId]
          );
          if (rows.length > 0) {
            totalAmount += Number(rows[0].base_price) * item.qty;
          }
        }
      }
    }

    if (totalAmount === 0) return res.status(400).json({ message: 'Cart is empty' });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100),
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({ message: 'Server error creating payment' });
  }
});

// PUT /api/orders/:id/cancel - Cancel an order
router.put('/:id/cancel', apiLimiter, requireAuth, async (req, res) => {
  const userId = req.user.id;
  const orderId = req.params.id;
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [orders] = await connection.execute(
      'SELECT id, status FROM orders WHERE id = ? AND user_id = ? FOR UPDATE',
      [orderId, userId]
    );
    if (orders.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Order not found' });
    }
    if (orders[0].status !== 'new') {
      await connection.rollback();
      return res.status(400).json({ message: 'Only "New" orders can be cancelled' });
    }

    // Restock variant inventory
    const [items] = await connection.execute(
      'SELECT variant_id, quantity FROM order_items WHERE order_id = ?',
      [orderId]
    );
    for (const item of items) {
      if (item.variant_id) {
        await connection.execute(
          'UPDATE inventory SET quantity = quantity + ? WHERE variant_id = ?',
          [item.quantity, item.variant_id]
        );
      }
    }

    await connection.execute('UPDATE orders SET status = "cancelled" WHERE id = ?', [orderId]);
    await connection.commit();

    res.json({ message: 'Order cancelled successfully' });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Cancel order error:', error);
    res.status(500).json({ message: 'Server error cancelling order' });
  } finally {
    if (connection) connection.release();
  }
});

// GET /api/orders/admin/all (Admin/Staff) — paginated
router.get('/admin/all', requireAuth, verifyStaff, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  try {
    const [orders] = await pool.execute(
      'SELECT * FROM orders ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );

    const orderIds = orders.map((o) => o.id);
    const itemMap = await fetchItemsForOrders(orderIds);

    const ordersWithItems = orders.map((order) => ({
      ...order,
      items: itemMap.get(order.id) || [],
    }));

    res.json(ordersWithItems);
  } catch (err) {
    console.error('Admin fetch orders error:', err);
    res.status(500).json({ message: 'Server error fetching orders' });
  }
});

// PUT /api/orders/:id/status (Admin/Staff)
router.put('/:id/status', requireAuth, verifyStaff, async (req, res) => {
  const { status: newStatus } = req.body;
  const orderId = req.params.id;

  if (!['new', 'confirmed', 'shipping', 'received', 'cancelled'].includes(newStatus)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [orders] = await connection.execute(
      'SELECT id, status FROM orders WHERE id = ? FOR UPDATE',
      [orderId]
    );

    if (orders.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Order not found' });
    }

    const currentStatus = orders[0].status;

    if (currentStatus === newStatus) {
      await connection.rollback();
      return res.json({ message: 'Status unchanged' });
    }

    const [items] = await connection.execute(
      'SELECT variant_id, product_id, quantity FROM order_items WHERE order_id = ?',
      [orderId]
    );

    // If cancelling an active order, restock inventory
    if (newStatus === 'cancelled' && currentStatus !== 'cancelled') {
      for (const item of items) {
        if (item.variant_id) {
          await connection.execute(
            'UPDATE inventory SET quantity = quantity + ? WHERE variant_id = ?',
            [item.quantity, item.variant_id]
          );
        }
      }
    }

    await connection.execute('UPDATE orders SET status = ? WHERE id = ?', [newStatus, orderId]);
    await connection.commit();
    res.json({ message: `Order status updated to ${newStatus}` });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Update order status error:', error);
    res.status(500).json({ message: 'Server error updating status' });
  } finally {
    if (connection) connection.release();
  }
});

export default router;