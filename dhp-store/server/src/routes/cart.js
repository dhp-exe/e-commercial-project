import { Router } from 'express';
import { pool } from '../shared/db/pool.js';
import { requireAuth } from '../shared/middleware/requireAuth.js';
import { formatImageUrl } from '../shared/utils/formatImageUrl.js';

const router = Router();

async function getOrCreateCart(userId) {
  const [rows] = await pool.execute('SELECT * FROM carts WHERE user_id=? AND status = ?', [userId, 'active']);
  if (rows[0]) return rows[0];
  const [r] = await pool.execute('INSERT INTO carts (user_id) VALUES (?)', [userId]);
  return { id: r.insertId, user_id: userId, status: 'active' };
}

// GET /api/cart
router.get('/', requireAuth, async (req, res) => {
  try {
    const cart = await getOrCreateCart(req.user.id);
    const [rows] = await pool.query(
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
      [cart.id]
    );

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

    res.json({ cartId: cart.id, items });
  } catch (e) {
    console.error('Fetch cart error:', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/cart/add 
router.post('/add', requireAuth, async (req, res) => {
  const rawVariantId = req.body.variantId ?? req.body.variant_id;
  const variantId = Number(rawVariantId);

  if (!Number.isInteger(variantId) || variantId <= 0) {
    return res.status(400).json({ message: 'Valid variantId is required' });
  }

  const parsedQty = Number(req.body.qty);
  if (!Number.isInteger(parsedQty) || parsedQty <= 0) {
    return res.status(400).json({ message: 'Invalid quantity' });
  }

  const userId = req.user.id;
  let conn;

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // 1. Fetch variant, product, size, and available inventory atomically
    const [vRows] = await conn.execute(
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

    if (vRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Product variant not found or inactive' });
    }

    const { product_id, size_name, available_stock } = vRows[0];

    if (parsedQty > available_stock) {
      await conn.rollback();
      return res.status(400).json({
        message: `Only ${available_stock} items available in stock`,
        available_stock,
      });
    }

    // 2. Get or create active cart
    const [carts] = await conn.execute(
      'SELECT id FROM carts WHERE user_id = ? AND status = "active"',
      [userId]
    );

    let cartId;
    if (carts.length > 0) {
      cartId = carts[0].id;
    } else {
      const [newCart] = await conn.execute('INSERT INTO carts (user_id) VALUES (?)', [userId]);
      cartId = newCart.insertId;
    }

    // 3. Check existing item in cart strictly by variant_id
    const [existing] = await conn.execute(
      'SELECT id, qty FROM cart_items WHERE cart_id = ? AND variant_id = ?',
      [cartId, variantId]
    );

    if (existing.length > 0) {
      const newQty = existing[0].qty + parsedQty;

      // Validate cumulative quantity against available stock
      if (newQty > available_stock) {
        await conn.rollback();
        return res.status(400).json({
          message: `Cannot add more. Only ${available_stock} items available in stock`,
          available_stock,
        });
      }

      await conn.execute(
        'UPDATE cart_items SET qty = ?, size = ? WHERE id = ?',
        [newQty, size_name, existing[0].id]
      );
    } else {
      await conn.execute(
        'INSERT INTO cart_items (cart_id, product_id, variant_id, qty, size) VALUES (?, ?, ?, ?, ?)',
        [cartId, product_id, variantId, parsedQty, size_name]
      );
    }

    await conn.commit();
    res.json({ message: 'Item added to cart', cartId, variantId });
  } catch (error) {
    if (conn) await conn.rollback();
    console.error('Add to cart error:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/cart/update 
router.post('/update', requireAuth, async (req, res) => {
  const rawVariantId = req.body.variantId ?? req.body.variant_id;
  const variantId = Number(rawVariantId);

  if (!Number.isInteger(variantId) || variantId <= 0) {
    return res.status(400).json({ message: 'Valid variantId is required' });
  }

  const parsedQty = Number(req.body.qty);
  if (!Number.isInteger(parsedQty)) {
    return res.status(400).json({ message: 'Invalid quantity' });
  }

  try {
    const cart = await getOrCreateCart(req.user.id);

    if (parsedQty <= 0) {
      await pool.execute(
        'DELETE FROM cart_items WHERE cart_id = ? AND variant_id = ?',
        [cart.id, variantId]
      );
      return res.json({ ok: true, message: 'Item removed' });
    }

    // Check available stock in inventory
    const [inv] = await pool.execute(
      'SELECT GREATEST(0, quantity - reserved_quantity) AS available FROM inventory WHERE variant_id = ?',
      [variantId]
    );

    if (inv.length === 0) {
      return res.status(404).json({ message: 'Variant inventory not found' });
    }

    if (parsedQty > inv[0].available) {
      return res.status(400).json({
        message: `Cannot update. Only ${inv[0].available} items available in stock`,
        available_stock: inv[0].available,
      });
    }

    const [result] = await pool.execute(
      'UPDATE cart_items SET qty = ? WHERE cart_id = ? AND variant_id = ?',
      [parsedQty, cart.id, variantId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Item not found in cart' });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('Update cart error:', e);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;