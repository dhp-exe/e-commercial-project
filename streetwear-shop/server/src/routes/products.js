import { Router } from 'express';
import { pool } from '../db.js';
const router = Router();
const isLocal = process.env.NODE_ENV !== 'production';
const LOCAL_BASE_URL = 'http://localhost:5001';
const REMOTE_BASE_URL = 'https://ckgkbm1c-5001.asse.devtunnels.ms';
const BASE_URL = isLocal ? LOCAL_BASE_URL : REMOTE_BASE_URL;


// GET /products - Retrieve a list of products
router.get('/', async (req, res) => {
  const { q, categoryId } = req.query;
  const where = [];
  const params = [];
  if (q) { where.push('p.name LIKE ?'); params.push('%' + q + '%'); }
  if (categoryId) { where.push('p.category_id = ?'); params.push(categoryId); }
  const sql = `SELECT p.*, c.name as category_name
    FROM products p LEFT JOIN categories c ON p.category_id=c.id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY p.id DESC`;
  try {
    const [rows] = await pool.query(sql, params);

// prepend full URL to image paths
const products = rows.map(p => {
  let imageUrl = p.image_url;

  // Normalize image URLs
  if (imageUrl) {
    if (imageUrl.includes('http://localhost:5001')) {
      imageUrl = imageUrl.replace('http://localhost:5001', BASE_URL);
    } 
    else if (imageUrl.includes('https://ckgkbm1c-5001.asse.devtunnels.ms')) {
      imageUrl = imageUrl.replace('https://ckgkbm1c-5001.asse.devtunnels.ms', BASE_URL);
    } 
    else if (!imageUrl.startsWith('http')) {
      imageUrl = `${BASE_URL}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
    }
  }

  return { ...p, image_url: imageUrl };
});
  res.json(products);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/categories', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM categories ORDER BY name');
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;