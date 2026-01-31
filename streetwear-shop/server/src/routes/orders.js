import { Router } from 'express';
import { pool } from '../db.js';
import Stripe from 'stripe';
import jwt from 'jsonwebtoken';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// POST /api/orders - Create a new order (Guest & User)
router.post('/', async (req, res) => {
    let connection;
    try {
        // Auth Check 
        let userId = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                userId = decoded.id;
            } 
            catch (err) {
                console.log("Invalid token, proceeding as guest");
            }
        }

        const { items, total, deliveryInfo } = req.body;
        
        // Basic Validation
        if (!items || items.length === 0) {
            return res.status(400).json({ message: 'Cart is empty' });
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        let finalItemsToOrder = [];
        let finalTotal = 0;

        if (userId) {
            const [carts] = await connection.execute('SELECT * FROM carts WHERE user_id=? AND status="active"', [userId]);
            
            if (carts.length > 0) {
                const cartId = carts[0].id;
                const [cartItems] = await connection.execute(
                    `SELECT ci.product_id, ci.qty, ci.size, p.price 
                    FROM cart_items ci 
                    JOIN products p ON ci.product_id = p.id 
                    WHERE ci.cart_id = ?`,
                    [cartId]
                );
                
                if (cartItems.length > 0) {
                    finalItemsToOrder = cartItems;
                    for (const item of finalItemsToOrder) {
                        finalTotal += item.price * item.qty;
                    }
                    
                    await connection.execute('DELETE FROM cart_items WHERE cart_id = ?', [cartId]);
                }
            }
        }

        // --- GUEST OR FALLBACK ---
        if (finalItemsToOrder.length === 0) {
            for (const item of items) {
                const [rows] = await connection.execute('SELECT price FROM products WHERE id = ?', [item.product_id]);
                if (rows.length > 0) {
                    finalItemsToOrder.push({
                        product_id: item.product_id,
                        qty: item.qty,
                        size: item.size,
                        price: rows[0].price
                    });
                    finalTotal += rows[0].price * item.qty;
                }
            }
        }

        if (finalItemsToOrder.length === 0) {
             await connection.rollback();
             return res.status(400).json({message: "No valid items found"});
        }

        // (With Delivery Info)
        const [orderResult] = await connection.execute(
            `INSERT INTO orders 
            (user_id, total, status, name, email, phone, address, city, district) 
            VALUES (?, ?, "new", ?, ?, ?, ?, ?, ?)`,
            [
                userId, // Can be NULL
                finalTotal, 
                deliveryInfo?.name || '', 
                deliveryInfo?.email || '', 
                deliveryInfo?.phone || '', 
                deliveryInfo?.address || '', 
                deliveryInfo?.city || '', 
                deliveryInfo?.district || ''
            ]
        );
        
        const orderId = orderResult.insertId;

        for (const item of finalItemsToOrder) {
            await connection.execute(
                'INSERT INTO order_items (order_id, product_id, quantity, size, price) VALUES (?, ?, ?, ?, ?)',
                [orderId, item.product_id, item.qty, item.size, item.price]
            );
        }

        await connection.commit();
        res.json({ message: 'Order placed successfully', orderId });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    } finally {
        if (connection) connection.release();
    }
});

// GET /api/orders?status=new - Get user's orders
router.get('/', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const { status } = req.query; 

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

// POST /api/orders/create-payment - Create Stripe Payment Intent
router.post('/create-payment', async (req, res) => {
    // auth check
    let userId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            userId = decoded.id;
        } catch (err) {
            // Guest mode
        }
    }

    try{
        let totalAmount = 0;

        // If User -> Try to get total from DB Cart
        if (userId) {
            const [carts] = await pool.execute(
                'SELECT * FROM carts WHERE user_id=? AND status="active"',
                [userId]
            );
            if (carts.length > 0) {
                const cartId = carts[0].id;
                const [cartItems] = await pool.execute(
                    `SELECT ci.qty, p.price FROM cart_items ci 
                    JOIN products p ON ci.product_id = p.id 
                    WHERE ci.cart_id = ?`,
                    [cartId]
                );
                
                for (const item of cartItems){
                    totalAmount += item.price * item.qty;
                }
            }
        }

        // If guest -> calculate from req.body items
        if (totalAmount === 0 && req.body.items) {
             for (const item of req.body.items) {
                const [rows] = await pool.execute('SELECT price FROM products WHERE id = ?', [item.product_id]);
                if (rows.length > 0) {
                    totalAmount += rows[0].price * item.qty;
                }
            }
        }

        if (totalAmount === 0) return res.status(400).json({message: 'Cart is empty'});

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

// PUT /api/orders/:id - Cancel an order
router.put('/:id/cancel', requireAuth, async (req,res) =>{
    const userId = req.user.id;
    const orderId = req.params.id;
    try{
        const [orders] = await pool.execute(
            'SELECT id, status FROM orders WHERE id = ? AND user_id = ? ',
            [orderId, userId]
        );
        if (orders.length === 0){
            return res.status(404).json({message: 'Order not found'});
        }
        if (orders[0].status !== 'new') {
            return res.status(400).json({ message: 'Only "New" orders can be cancelled' });
        }

        await pool.execute('UPDATE orders SET status = "cancelled" WHERE id = ?',[orderId]);
        res.json({message: 'Order cancelled successfully'});
    }
    catch (error) {
        console.error('Cancel order error:', error);
        res.status(500).json({ message: 'Server error cancelling order' });
    } 
})

export default router;