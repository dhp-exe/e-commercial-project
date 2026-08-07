import { Router } from 'express';
import { pool } from '../db.js';
import redis from '../cache/redis.js';
import * as Sentry from '@sentry/node';
import { requireAuth } from '../middleware/requireAuth.js';
import { verifyStaff, verifyAdmin } from '../middleware/requireRole.js';
import upload from '../middleware/upload.js';
import { formatImageUrl } from '../utils/formatImageUrl.js';
import { cacheQueue } from '../queues/cacheQueue.js';
const router = Router();



// GET /api/products
router.get('/', async (req, res) => {
  try{
    const { q, categoryId } = req.query;
    
    const cacheKey = `products:q=${q || ''}:cat=${categoryId || ''}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log(`CACHE HIT: ${cacheKey}`);
      return res.json(JSON.parse(cached));
    }

    const where = [];
    const params = [];
    where.push('p.is_active = true');

    if (q) {
      where.push('p.name LIKE ?');
      params.push('%' + q + '%');
    }

    if (categoryId) {
      where.push('p.category_id = ?');
      params.push(categoryId);
    }

    const sql = `
      SELECT 
        p.*, 
        c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY p.id DESC
    `;

    const [rows] = await pool.query(sql, params);

    const products = rows.map(p => ({
      ...p,
      image_url: formatImageUrl(p.image_url)
    }));

    await redis.set(cacheKey, JSON.stringify(products), { EX: 3600 });
    res.json(products);
  } 
  catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/products/batch - Fetch multiple products by ID
router.post('/batch', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.json([]);
  }
  if (ids.length > 50) {
    return res.status(400).json({ message: 'Exceeded maximum batch size of 50' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT * FROM products WHERE id IN (?) AND is_active = true',
      [ids]
    );

    const products = rows.map(p => ({
      ...p,
      image_url: formatImageUrl(p.image_url)
    }));

    res.json(products);
  } catch (error) {
    console.error('Batch fetch error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/products/categories
router.get('/categories', async (_req, res) => {
  try {
    const cacheKey = 'categories';
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log(`CACHE HIT: ${cacheKey}`);
      return res.json(JSON.parse(cached));
    }
    const [rows] = await pool.query('SELECT * FROM categories ORDER BY name');

    await redis.set(cacheKey, JSON.stringify(rows), { EX: 86400});
    res.json(rows);
  } 
  catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/products/:id - Get a single product by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
      const cacheKey = `product:${id}`;
      const cached = await redis.get(cacheKey);
      if(cached){
        return res.json(JSON.parse(cached));
      }
      const [rows] = await pool.execute('SELECT * FROM products WHERE id = ? AND is_active = true', [id]);
      
      if (rows.length === 0) {
          return res.status(404).json({ message: 'Product not found' });
      }

      const product = rows[0];
      product.image_url = formatImageUrl(product.image_url);
      
      await redis.set(cacheKey, JSON.stringify(product), { EX: 3600});
      res.json(product); 
  } 
  catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/products - Create a new product (admin only)
router.post('/', requireAuth, verifyAdmin, upload.single('image'), async (req, res) => {
    const { name, description, price, category_id, stock } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') return res.status(400).json({ message: 'Product name is required' });
    
    const parsedPrice = Number(price);
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) return res.status(400).json({ message: 'Invalid price' });

    const parsedStock = Number(stock);
    if (!Number.isInteger(parsedStock) || parsedStock < 0) return res.status(400).json({ message: 'Invalid stock value' });

    if (!category_id) return res.status(400).json({ message: 'Category is required' });

  try {
    const [categoryRows] = await pool.execute('SELECT id FROM categories WHERE id = ?', [category_id]);
    if (categoryRows.length === 0) return res.status(400).json({ message: 'Category does not exist' });

    let imageUrl = null;
    if (req.file) {
        imageUrl = `/uploads/${req.file.filename}`; 
    }

    const [result] = await pool.execute(
      'INSERT INTO products (name, description, price, category_id, stock, image_url, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, description, parsedPrice, category_id, parsedStock, imageUrl, true]
    );

    // Enqueue cache invalidation (background worker handles SCAN loop)
    try {
      await cacheQueue.add('invalidate', {
        type: 'cache-invalidate',
        pattern: 'products:*',
      });
    } catch (queueErr) {
      console.error('Failed to enqueue cache invalidation:', queueErr.message);
      Sentry.captureException(queueErr, { tags: { queue: 'cache-invalidate' } });
    }

    res.status(201).json({ 
        id: result.insertId, 
        name, 
        price: parsedPrice, 
        stock: parsedStock, 
        image_url: formatImageUrl(imageUrl) 
    });
  } 
  catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/products/:id/stock - Update product stock (staff and admin)
router.put('/:id/stock', requireAuth, verifyStaff, async (req, res) => {
  const productId = Number(req.params.id);
  const { stock } = req.body;

  if (Number.isNaN(productId) || productId < 0) {
    return res.status(400).json({ message: 'Invalid product ID' });
  }

  const parsedStock = Number(stock);
  if (!Number.isInteger(parsedStock) || parsedStock < 0) {
    return res.status(400).json({ message: 'Invalid stock value' });
  }

  try {
      const [rows] = await pool.execute('SELECT id FROM products WHERE id = ?', [productId]);
      if(rows.length === 0){
        return res.status(404).json({ message: 'Product not found'});
      }

      await pool.execute('UPDATE products SET stock = ? WHERE id = ?', [parsedStock, productId]);

      // Enqueue cache invalidation (background worker handles SCAN loop)
      try {
        await cacheQueue.add('invalidate', {
          type: 'cache-invalidate',
          pattern: 'products:*',
          productId,
        });
      } catch (queueErr) {
        console.error('Failed to enqueue cache invalidation:', queueErr.message);
        Sentry.captureException(queueErr, { tags: { queue: 'cache-invalidate' } });
      }

      res.json({ message: 'Stock updated', productId, stock: parsedStock });
  } 
  catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/products/:id - Delete a product (admin only)
router.delete('/:id', requireAuth, verifyAdmin, async (req, res) => {
  const productId = Number(req.params.id); 

  if(Number.isNaN(productId) || productId < 0){
    return res.status(400).json({ message: 'Invalid product id' });
  }

  try{
    const [rows] = await pool.execute('SELECT id FROM products WHERE id = ?', [productId]);
    if(rows.length === 0){
      return res.status(404).json({ message: 'Product not found'});
    }

    // Soft Delete
    await pool.execute('UPDATE products SET is_active = false WHERE id = ?', [productId]);

    // Enqueue cache invalidation (background worker handles SCAN loop)
    try {
      await cacheQueue.add('invalidate', {
        type: 'cache-invalidate',
        pattern: 'products:*',
        productId,
      });
    } catch (queueErr) {
      console.error('Failed to enqueue cache invalidation:', queueErr.message);
      Sentry.captureException(queueErr, { tags: { queue: 'cache-invalidate' } });
    }

    res.status(200).json({ message: 'Product deleted successfully' }); 
  } 
  catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
