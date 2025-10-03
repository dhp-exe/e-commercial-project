import { Router } from 'express';
import { pool } from '../db.js';
const router = Router();

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
    res.json(rows);
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