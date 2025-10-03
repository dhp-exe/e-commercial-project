import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
const router = Router();

async function getOrCreateCart(userId) {
  const [rows] = await pool.execute('SELECT * FROM carts WHERE user_id=? AND status="active"', [userId]);
  if (rows[0]) return rows[0];
  const [r] = await pool.execute('INSERT INTO carts (user_id) VALUES (?)', [userId]);
  return { id: r.insertId, user_id: userId, status: 'active' };
}

// GET /cart - Retrieve the user's cart
router.get('/', requireAuth, async (req, res) => {
  try {
    const cart = await getOrCreateCart(req.user.id);
    const [items] = await pool.query(
      `SELECT ci.product_id, ci.qty, p.name, p.price, p.image_url
       FROM cart_items ci JOIN products p ON p.id=ci.product_id
       WHERE ci.cart_id=?`,
      [cart.id]
    );
    res.json({ cartId: cart.id, items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /cart/add - Add an item to the user's cart
router.post('/add', requireAuth, async (req, res) => {
  const { productId, qty } = req.body;
  try {
    const cart = await getOrCreateCart(req.user.id);
    await pool.execute(
      'INSERT INTO cart_items (cart_id, product_id, qty) VALUES (?,?,?) ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty)',
      [cart.id, productId, qty || 1]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /cart/update - Update the quantity of an item in the cart
router.post('/update', requireAuth, async (req, res) => {
  const { productId, qty } = req.body;
  try {
    const cart = await getOrCreateCart(req.user.id);
    if (qty <= 0) {
      await pool.execute('DELETE FROM cart_items WHERE cart_id=? AND product_id=?', [cart.id, productId]);
    } else {
      await pool.execute('UPDATE cart_items SET qty=? WHERE cart_id=? AND product_id=?', [qty, cart.id, productId]);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;