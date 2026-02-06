import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
const router = Router();

async function getOrCreateCart(userId) {
  const [rows] = await pool.execute('SELECT * FROM carts WHERE user_id=? AND status = ?', [userId, 'active']);
  if (rows[0]) return rows[0];
  const [r] = await pool.execute('INSERT INTO carts (user_id) VALUES (?)', [userId]);
  return { id: r.insertId, user_id: userId, status: 'active' };
}

// GET /cart - Retrieve the user's cart
router.get('/', requireAuth, async (req, res) => {
  try {
    const cart = await getOrCreateCart(req.user.id);
    const [items] = await pool.query(
      `SELECT ci.product_id, ci.qty, ci.size, p.name, p.price, p.image_url
       FROM cart_items ci JOIN products p ON p.id=ci.product_id
       WHERE ci.cart_id=?`,
      [cart.id]
    );
    res.json({ cartId: cart.id, items });
  } 
  catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /cart/add - Add an item to the user's cart
router.post('/add', requireAuth, async (req, res) => {
  const { productId, qty, size } = req.body;
  const userId = req.user.id;

  if(!productId || !qty || !size) {
    return res.status(400).json({ message: 'Invalid data' });
  }

  let connection;
  try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      // Get or create active cart
      const [carts] = await connection.execute('SELECT id FROM carts WHERE user_id = ? AND status = ?', [userId, 'active']);
      let cartId;
      if (carts.length > 0) {
          cartId = carts[0].id;
      } 
      else {
          const [result] = await connection.execute('INSERT INTO carts (user_id) VALUES (?)', [userId]);
          cartId = result.insertId;
      }

      // Check if product with SAME SIZE exists in cart
      const [existing] = await connection.execute(
          'SELECT id, qty FROM cart_items WHERE cart_id = ? AND product_id = ? AND size = ?',
          [cartId, productId, size]
      );

      if (existing.length > 0) {
          // Update quantity if same size exists
          const newQty = existing[0].qty + qty;
          await connection.execute('UPDATE cart_items SET qty = ? WHERE id = ?', [newQty, existing[0].id]);
      } 
      else {
          // Insert new item WITH SIZE
          await connection.execute(
              'INSERT INTO cart_items (cart_id, product_id, qty, size) VALUES (?, ?, ?, ?)',
              [cartId, productId, qty, size]
          );
      }
      await connection.commit();
      res.json({message: "Items added"});
  }
  catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
  finally {
    if (connection) {
        connection.release();
    }
  }
});

// POST /cart/update - Update quantity
router.post('/update', requireAuth, async (req, res) => {
  const { productId, qty, size } = req.body; // 1. Get size from request
  
  try {
    const cart = await getOrCreateCart(req.user.id);
    
    if (qty <= 0) {
      // Delete specific size
      await pool.execute(
          'DELETE FROM cart_items WHERE cart_id=? AND product_id=? AND size=?', 
          [cart.id, productId, size]
      );
    } else {
      // Update specific size
      await pool.execute(
          'UPDATE cart_items SET qty=? WHERE cart_id=? AND product_id=? AND size=?', 
          [qty, cart.id, productId, size]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;