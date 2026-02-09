import { Router } from 'express';
import { pool } from '../db.js';
import axios from 'axios';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:10000';

async function fetchProductsByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const [rows] = await pool.query('SELECT * FROM products WHERE id IN (?)', [ids]);
  return rows;
}

// GET /api/recommend/product/:id (For "Similar Products" section)
router.get('/product/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Ask Python: "What is similar to product X?"
    const aiResponse = await axios.get(`${AI_SERVICE_URL}/recommend/${id}`);
    const similarIds = aiResponse.data.recommendations; // e.g., [12, 4, 9]

    if (similarIds.length === 0) return res.json([]);

    // Get full DB details for these IDs
    const products = await fetchProductsByIds(similarIds);
    res.json(products);

  } catch (error) {
    console.error("AI Service Error:", error.message);
    res.json([]); 
  }
});

// GET /api/recommend/user (For "Recommended for You" section)
router.get('/user', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Step A: Find the LAST item this user bought
    const [history] = await pool.query(`
      SELECT oi.product_id 
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      WHERE o.user_id = ? 
      ORDER BY o.created_at DESC 
      LIMIT 1
    `, [userId]);

    let recommendedProducts = [];

    if (history.length > 0) {
      const lastProductId = history[0].product_id;
      const aiResponse = await axios.get(`${AI_SERVICE_URL}/recommend/${lastProductId}`);
      const similarIds = aiResponse.data.recommendations;
      recommendedProducts = await fetchProductsByIds(similarIds);
    } 
    
    if (recommendedProducts.length === 0) {
      const [trending] = await pool.query('SELECT * FROM products ORDER BY RAND() LIMIT 4');
      recommendedProducts = trending;
    }

    res.json(recommendedProducts);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

export default router;