import { Router } from 'express';
import { pool } from '../db.js';
import axios from 'axios';
import { requireAuth } from '../middleware/requireAuth.js';
import { formatImageUrl } from '../utils/formatImageUrl.js';

const router = Router();
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:10000';

// Shared AI HTTP client with a 10-second timeout
const aiClient = axios.create({
  baseURL: AI_SERVICE_URL,
  timeout: 10000,
});

async function fetchProductsByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const [rows] = await pool.query('SELECT * FROM products WHERE id IN (?)', [ids]);

  return rows.map(p => ({
    ...p,
    image_url: formatImageUrl(p.image_url)
  }));
}

// GET /api/recommend/product/:id (For "Similar Products" section)
router.get('/product/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Ask Python: "What is similar to product X?"
    const aiResponse = await aiClient.get(`/recommend/${id}`);
    const similarIds = aiResponse.data?.recommendations;

    if (!Array.isArray(similarIds) || similarIds.length === 0) return res.json([]);

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
      const aiResponse = await aiClient.get(`/recommend/${lastProductId}`);
      const similarIds = aiResponse.data?.recommendations;
      if (Array.isArray(similarIds) && similarIds.length > 0) {
        recommendedProducts = await fetchProductsByIds(similarIds);
      }
    } 
    
    // Fallback: random products without ORDER BY RAND()
    if (recommendedProducts.length === 0) {
      const [maxRow] = await pool.query('SELECT MAX(id) AS maxId FROM products WHERE is_active = true');
      const maxId = maxRow[0]?.maxId || 0;

      if (maxId > 0) {
        const randomIds = new Set();
        const attempts = Math.min(maxId, 20); // avoid infinite loop on small tables
        for (let i = 0; i < attempts && randomIds.size < 4; i++) {
          randomIds.add(Math.floor(Math.random() * maxId) + 1);
        }

        if (randomIds.size > 0) {
          const [trending] = await pool.query(
            'SELECT * FROM products WHERE id IN (?) AND is_active = true LIMIT 4',
            [[...randomIds]]
          );
          recommendedProducts = trending.map(p => ({
            ...p,
            image_url: formatImageUrl(p.image_url)
          }));
        }
      }
    }

    res.json(recommendedProducts);

  } catch (error) {
    console.error('Recommendation error:', error.message);
    // Graceful degradation: return empty array instead of 500
    res.json([]);
  }
});

export default router;