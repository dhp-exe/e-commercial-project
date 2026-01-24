import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// GET /api/products
router.get('/', async (req, res) => {
  const { q, categoryId } = req.query;
  const where = [];
  const params = [];

  if (q) {
    where.push('p.name LIKE ?');
    params.push('%' + q + '%');
  }

  if (categoryId) {
    where.push('p.category_id = ?');
    params.push(categoryId);
  }

  const sql = `
    SELECT p.*, c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY p.id DESC
  `;

  try {
    const [rows] = await pool.query(sql, params);

    // Build BASE_URL from the incoming request (works for localhost, DevTunnel, prod)
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const BASE_URL = `${protocol}://${host}`;

    const products = rows.map(p => {
      let imageUrl = p.image_url;

      if (imageUrl) {
        // If DB contains localhost URLs, normalize them
        if (imageUrl.includes('localhost')) {
          imageUrl = imageUrl.replace(
            /^http:\/\/localhost:\d+/,
            BASE_URL
          );
        }
        // If DB contains relative paths, prepend base URL
        else if (!imageUrl.startsWith('http')) {
          imageUrl = `${BASE_URL}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
        }
      }

      return {
        ...p,
        image_url: imageUrl
      };
    });

    res.json(products);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/products/categories
router.get('/categories', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM categories ORDER BY name'
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
