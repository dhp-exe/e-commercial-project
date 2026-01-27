import {Router} from 'express';
import {pool} from '../db.js';
import {requireAuth} from '../middleware/auth.js';
import Stripe from 'stripe';


const router = Router();

// POST /api/orders - Create a new order from user's cart
router.post('/', requireAuth, async (req, res) => {
    const userId = req.user.id;
    let connection;
    
    try {
        // Start transaction
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Get active cart
        const [carts] = await connection.execute(
            'SELECT * FROM carts WHERE user_id=? AND status="active"',
            [userId]
        );
        if (carts.length === 0) {
            await connection.rollback();
            return res.status(400).json({message: 'No active cart found'});
        }
        const cartId = carts[0].id;

        // Get cart items
        const [cartItems] = await connection.execute(
            `SELECT ci.product_id, ci.qty, ci.size, p.price 
            FROM cart_items ci 
            JOIN products p ON ci.product_id = p.id 
            WHERE ci.cart_id = ?`,
            [cartId]
        );
        if (cartItems.length === 0) {
            await connection.rollback();
            return res.status(400).json({message: 'Cart is empty'});
        }

        // Calculate total amount
        let totalAmount = 0;
        for (const item of cartItems) {
            totalAmount += item.price * item.qty;
        }

        // Create order
        const [orderResult] = await connection.execute(
            'INSERT INTO orders (user_id, total, status) VALUES (?, ?, "new")',
            [userId, totalAmount] 
        );
        const orderId = orderResult.insertId;

        // Insert order to order_items table
        for (const item of cartItems) {
            await connection.execute(
                'INSERT INTO order_items (order_id, product_id, quantity, size, price) VALUES (?, ?, ?, ?, ?)',
                [orderId, item.product_id, item.qty, item.size, item.price]
            );
        }
        // Clear the Cart & Commit
        await connection.execute('DELETE FROM cart_items WHERE cart_id = ?', [cartId]);

        await connection.commit();

        res.json({ message: 'Order placed successfully', orderId });

    }
    catch (error){
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

// GET /api/orders?status=new - Get user's orders (filtered by status)
router.get('/', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const { status } = req.query; // status filter

  try {
    let query = 'SELECT * FROM orders WHERE user_id = ?';
    const params = [userId];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY created_at DESC'; 

    const [orders] = await pool.execute(query, params);
    const ordersWithItems = await Promise.all(orders.map(async (order) => {
      const [items] = await pool.execute(
        `SELECT oi.id, oi.quantity, oi.size, oi.price, p.name, p.image_url 
         FROM order_items oi 
         JOIN products p ON oi.product_id = p.id 
         WHERE oi.order_id = ?`,
        [order.id]
      );
      return { ...order, items };
    }));

    res.json(ordersWithItems);
  } 
  catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// POST /api/orders/create-payment - Create Stripe Payment Intent
router.post('/create-payment', requireAuth, async (req, res) => {
    const userId = req.user.id;
    try{
        const [carts] = await pool.execute(
            'SELECT * FROM carts WHERE user_id=? AND status="active"',
            [userId]
        );
        if (carts.length === 0) return res.status(400).json({message: 'No active cart found'});

        const cartId = carts[0].id;
        const [cartItems] = await pool.execute(
            `SELECT ci.qty, p.price FROM cart_items ci 
            JOIN products p ON ci.product_id = p.id 
            WHERE ci.cart_id = ?`,
            [cartId]
        );
        if (cartItems.length === 0) return res.status(400).json({message: 'Cart is empty'});
        
        let totalAmount = 0;
        for (const item of cartItems){
            totalAmount += item.price * item.qty;
        }

        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(totalAmount * 100), // in CENTS
            currency: 'usd',
            automatic_payment_methods: { enabled: true },
        });

        res.json({ clientSecret: paymentIntent.client_secret });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error creating payment' });
    }
});

export default router;


