import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { verifyStaff, verifyAdmin } from '../middleware/requireRole.js';
import upload from '../middleware/upload.js';
const router = Router();

// GET /api/products
router.get('/', async (req, res) => {
  const { q, categoryId } = req.query;
  const where = [];
  const params = [];
  where.push('p.is_active = true')
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
      c.name AS category_name,
      (SELECT COALESCE(SUM(quantity), 0) FROM order_items WHERE product_id = p.id) AS sold_count
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

// GET /api/products/:id - Get a single product by ID
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.execute('SELECT * FROM products WHERE id = ? AND is_active = true', [id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Product not found' });
        }

        res.json(rows[0]); 
    } 
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/products - Create a new product (admin only)
router.post('/', requireAuth, verifyAdmin, upload.single('image'), async (req, res) => {
    const { name, description, price, category_id, stock } = req.body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ message: 'Product name is required' });
    }
    
    const parsedPrice = Number(price);
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ message: 'Invalid price' });
    }

    const parsedStock = Number(stock);
    if (!Number.isInteger(parsedStock) || parsedStock < 0) {
      return res.status(400).json({ message: 'Invalid stock value' });
    }

    if (!category_id) {
      return res.status(400).json({ message: 'Category is required' });
    }

  try {
    // Check if Category Exists
    const [categoryRows] = await pool.execute('SELECT id FROM categories WHERE id = ?', [category_id]);
    if (categoryRows.length === 0) {
      return res.status(400).json({ message: 'Category does not exist' });
    }

    // Handle Image
    let imageUrl = null;
    if (req.file) {
        imageUrl = `/uploads/${req.file.filename}`; 
    }

    const [result] = await pool.execute(
      'INSERT INTO products (name, description, price, category_id, stock, image_url, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, description, parsedPrice, category_id, parsedStock, imageUrl, true]
    );

    res.status(201).json({ 
        id: result.insertId, 
        name, 
        price: parsedPrice, 
        stock: parsedStock, 
        image_url: imageUrl 
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

      res.json({ message: 'Stock updated', productId, stock: parsedStock });
  } catch (error) {
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
    
    res.status(200).json({ message: 'Product deleted successfully' }); 
  } 
  catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
