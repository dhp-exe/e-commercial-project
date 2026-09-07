import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { formatImageUrl } from '../utils/formatImageUrl.js';

const router = Router();

async function getOrCreateCart(userId) {
  const [rows] = await pool.execute('SELECT * FROM carts WHERE user_id=? AND status = ?', [userId, 'active']);
  if (rows[0]) return rows[0];
  const [r] = await pool.execute('INSERT INTO carts (user_id) VALUES (?)', [userId]);
  return { id: r.insertId, user_id: userId, status: 'active' };
}

// GET /api/cart - Retrieve the user's cart
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
         ci.size,
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
       LEFT JOIN product_variants pv ON ci.variant_id = pv.id
       LEFT JOIN colors c ON pv.color_id = c.id
       LEFT JOIN sizes s ON pv.size_id = s.id
       LEFT JOIN inventory i ON i.variant_id = pv.id
       LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = TRUE
       WHERE ci.cart_id = ?
       ORDER BY ci.id ASC`,
      [cart.id]
    );

    const items = rows.map((item) => {
      const imageUrl = formatImageUrl(item.primary_image || item.fallback_image);
      const effectiveSize = item.size_name || item.size;
      return {
        id: item.id,
        variant_id: item.variant_id,
        variantId: item.variant_id, // alias
        product_id: item.product_id,
        productId: item.product_id, // alias
        product_name: item.product_name,
        name: item.name,
        sku: item.sku,
        color_name: item.color_name || 'Default',
        color_hex: item.color_hex || '#000000',
        size_name: effectiveSize,
        size: effectiveSize,
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

// POST /api/cart/add - Add an item to the user's cart
router.post('/add', requireAuth, async (req, res) => {
  const { variantId, productId, qty, size } = req.body;
  const userId = req.user.id;

  const parsedQty = Number(qty);
  if (!Number.isInteger(parsedQty) || parsedQty <= 0) {
    return res.status(400).json({ message: 'Invalid quantity' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // 1. Resolve variant and product
    let resolvedVariantId = variantId ? Number(variantId) : null;
    let resolvedProductId = productId ? Number(productId) : null;
    let resolvedSizeName = size ? String(size).trim() : null;

    if (resolvedVariantId) {
      const [vRows] = await conn.execute(
        `SELECT pv.id, pv.product_id, s.name AS size_name,
                GREATEST(0, COALESCE(i.quantity, 0) - COALESCE(i.reserved_quantity, 0)) AS available_stock
         FROM product_variants pv
         JOIN sizes s ON pv.size_id = s.id
         LEFT JOIN inventory i ON i.variant_id = pv.id
         WHERE pv.id = ? AND pv.is_active = TRUE`,
        [resolvedVariantId]
      );

      if (vRows.length === 0) {
        await conn.rollback();
        return res.status(404).json({ message: 'Product variant not found or inactive' });
      }

      resolvedProductId = vRows[0].product_id;
      resolvedSizeName = vRows[0].size_name;
      const availableStock = vRows[0].available_stock;

      if (parsedQty > availableStock) {
        await conn.rollback();
        return res.status(400).json({
          message: `Only ${availableStock} items available in stock`,
          available_stock: availableStock,
        });
      }
    } else if (resolvedProductId && resolvedSizeName) {
      // Legacy fallback: find variant by productId + size
      const [vRows] = await conn.execute(
        `SELECT pv.id,
                GREATEST(0, COALESCE(i.quantity, 0) - COALESCE(i.reserved_quantity, 0)) AS available_stock
         FROM product_variants pv
         JOIN sizes s ON pv.size_id = s.id
         LEFT JOIN inventory i ON i.variant_id = pv.id
         WHERE pv.product_id = ? AND s.name = ? AND pv.is_active = TRUE
         LIMIT 1`,
        [resolvedProductId, resolvedSizeName]
      );

      if (vRows.length > 0) {
        resolvedVariantId = vRows[0].id;
        const availableStock = vRows[0].available_stock;
        if (parsedQty > availableStock) {
          await conn.rollback();
          return res.status(400).json({
            message: `Only ${availableStock} items available in stock`,
            available_stock: availableStock,
          });
        }
      }
    } else {
      await conn.rollback();
      return res.status(400).json({ message: 'variantId or (productId and size) is required' });
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

    // 3. Find existing item in cart
    let existingQuery = 'SELECT id, qty FROM cart_items WHERE cart_id = ? AND ';
    let existingParams = [cartId];

    if (resolvedVariantId) {
      existingQuery += 'variant_id = ?';
      existingParams.push(resolvedVariantId);
    } else {
      existingQuery += 'product_id = ? AND size = ?';
      existingParams.push(resolvedProductId, resolvedSizeName);
    }

    const [existing] = await conn.execute(existingQuery, existingParams);

    if (existing.length > 0) {
      const newQty = existing[0].qty + parsedQty;

      // Validate new total against stock
      if (resolvedVariantId) {
        const [inv] = await conn.execute(
          'SELECT GREATEST(0, quantity - reserved_quantity) AS available FROM inventory WHERE variant_id = ?',
          [resolvedVariantId]
        );
        if (inv.length > 0 && newQty > inv[0].available) {
          await conn.rollback();
          return res.status(400).json({
            message: `Cannot add more. Only ${inv[0].available} items available in stock`,
            available_stock: inv[0].available,
          });
        }
      }

      await conn.execute(
        'UPDATE cart_items SET qty = ?, variant_id = COALESCE(?, variant_id), size = ? WHERE id = ?',
        [newQty, resolvedVariantId, resolvedSizeName, existing[0].id]
      );
    } else {
      await conn.execute(
        'INSERT INTO cart_items (cart_id, product_id, variant_id, qty, size) VALUES (?, ?, ?, ?, ?)',
        [cartId, resolvedProductId, resolvedVariantId, parsedQty, resolvedSizeName]
      );
    }

    await conn.commit();
    res.json({ message: 'Item added to cart', cartId, variantId: resolvedVariantId });
  } catch (error) {
    if (conn) await conn.rollback();
    console.error('Add to cart error:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/cart/update - Update quantity
router.post('/update', requireAuth, async (req, res) => {
  const { variantId, productId, size, qty } = req.body;
  const userId = req.user.id;

  const parsedQty = Number(qty);
  if (Number.isNaN(parsedQty)) {
    return res.status(400).json({ message: 'Invalid quantity' });
  }

  try {
    const cart = await getOrCreateCart(userId);

    if (parsedQty <= 0) {
      if (variantId) {
        await pool.execute('DELETE FROM cart_items WHERE cart_id = ? AND variant_id = ?', [cart.id, variantId]);
      } else {
        await pool.execute(
          'DELETE FROM cart_items WHERE cart_id = ? AND product_id = ? AND size = ?',
          [cart.id, productId, size]
        );
      }
      return res.json({ ok: true, message: 'Item removed' });
    }

    // Check available stock if variantId is provided
    if (variantId) {
      const [inv] = await pool.execute(
        'SELECT GREATEST(0, quantity - reserved_quantity) AS available FROM inventory WHERE variant_id = ?',
        [variantId]
      );
      if (inv.length > 0 && parsedQty > inv[0].available) {
        return res.status(400).json({
          message: `Cannot update. Only ${inv[0].available} items available in stock`,
          available_stock: inv[0].available,
        });
      }

      await pool.execute(
        'UPDATE cart_items SET qty = ? WHERE cart_id = ? AND variant_id = ?',
        [parsedQty, cart.id, variantId]
      );
    } else {
      await pool.execute(
        'UPDATE cart_items SET qty = ? WHERE cart_id = ? AND product_id = ? AND size = ?',
        [parsedQty, cart.id, productId, size]
      );
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('Update cart error:', e);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;