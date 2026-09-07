import { Router } from 'express';
import { pool } from '../db.js';
import redis from '../cache/redis.js';
import * as Sentry from '@sentry/node';
import { requireAuth } from '../middleware/requireAuth.js';
import { verifyStaff, verifyAdmin } from '../middleware/requireRole.js';
import upload from '../middleware/upload.js';
import { formatImageUrl } from '../utils/formatImageUrl.js';
import { generateSku } from '../utils/generateSku.js';
import { cacheQueue } from '../queues/cacheQueue.js';

const router = Router();

/**
 * Hydrates an array of product rows with their variants, colors, sizes, inventory, and images.
 * Executes in 3 queries total regardless of batch size to eliminate N+1 overhead.
 */
export async function hydrateProducts(products, conn = pool) {
  if (!products || products.length === 0) return [];
  const productIds = products.map((p) => p.id);

  // 1. Fetch images for all products
  const [imageRows] = await conn.query(
    `SELECT id, product_id, image_url, is_primary, sort_order
     FROM product_images
     WHERE product_id IN (?)
     ORDER BY sort_order ASC, id ASC`,
    [productIds]
  );

  const imageMap = new Map();
  for (const img of imageRows) {
    if (!imageMap.has(img.product_id)) {
      imageMap.set(img.product_id, []);
    }
    imageMap.get(img.product_id).push({
      id: img.id,
      image_url: formatImageUrl(img.image_url),
      is_primary: Boolean(img.is_primary),
      sort_order: img.sort_order,
    });
  }

  // 2. Fetch variants with color, size, and inventory
  const [variantRows] = await conn.query(
    `SELECT 
       pv.id,
       pv.product_id,
       pv.sku,
       pv.price_override,
       pv.is_active,
       c.id AS color_id,
       c.name AS color_name,
       c.hex_code AS color_hex,
       s.id AS size_id,
       s.name AS size_name,
       s.sort_order AS size_sort_order,
       COALESCE(i.quantity, 0) AS stock,
       COALESCE(i.reserved_quantity, 0) AS reserved_quantity,
       GREATEST(0, COALESCE(i.quantity, 0) - COALESCE(i.reserved_quantity, 0)) AS available_stock
     FROM product_variants pv
     JOIN colors c ON pv.color_id = c.id
     JOIN sizes s ON pv.size_id = s.id
     LEFT JOIN inventory i ON i.variant_id = pv.id
     WHERE pv.product_id IN (?)
     ORDER BY s.sort_order ASC, c.name ASC`,
    [productIds]
  );

  const variantMap = new Map();
  for (const v of variantRows) {
    if (!variantMap.has(v.product_id)) {
      variantMap.set(v.product_id, []);
    }
    variantMap.get(v.product_id).push({
      id: v.id,
      sku: v.sku,
      color: {
        id: v.color_id,
        name: v.color_name,
        hex_code: v.color_hex,
      },
      size: {
        id: v.size_id,
        name: v.size_name,
        sort_order: v.size_sort_order,
      },
      price_override: v.price_override !== null ? Number(v.price_override) : null,
      stock: v.stock,
      reserved_quantity: v.reserved_quantity,
      available_stock: v.available_stock,
      is_active: Boolean(v.is_active),
    });
  }

  return products.map((p) => {
    const images = imageMap.get(p.id) || [];
    const rawVariants = variantMap.get(p.id) || [];

    const basePrice = Number(p.base_price || 0);

    const variants = rawVariants.map((v) => ({
      ...v,
      price: v.price_override !== null ? v.price_override : basePrice,
    }));

    const primaryImgObj = images.find((img) => img.is_primary) || images[0];
    const primaryImage = primaryImgObj ? primaryImgObj.image_url : formatImageUrl(p.image_url);

    const variantPrices = variants.length > 0 ? variants.map((v) => v.price) : [basePrice];
    const minPrice = Math.min(...variantPrices);
    const maxPrice = Math.max(...variantPrices);

    const totalStock = variants.length > 0
      ? variants.reduce((sum, v) => sum + v.stock, 0)
      : (p.stock || 0);

    const totalAvailableStock = variants.length > 0
      ? variants.reduce((sum, v) => sum + v.available_stock, 0)
      : (p.stock || 0);

    return {
      id: p.id,
      name: p.name,
      description: p.description,
      category_id: p.category_id,
      category_name: p.category_name,
      base_price: basePrice,
      price: basePrice, // backward compatibility
      min_price: minPrice,
      max_price: maxPrice,
      is_active: Boolean(p.is_active),
      sold_count: p.sold_count || 0,
      stock: totalStock, // backward compatibility
      total_stock: totalStock,
      available_stock: totalAvailableStock,
      image_url: primaryImage, // backward compatibility
      primary_image: primaryImage,
      images,
      variants,
    };
  });
}

// GET /api/products
router.get('/', async (req, res) => {
  try {
    const { q, categoryId } = req.query;

    const cacheKey = `products:q=${q || ''}:cat=${categoryId || ''}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const where = ['p.is_active = true'];
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
      SELECT 
        p.id,
        p.name,
        p.description,
        p.base_price,
        p.category_id,
        p.is_active,
        p.image_url,
        COALESCE(p.stock, 0) AS stock,
        c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE ${where.join(' AND ')}
      ORDER BY p.id DESC
    `;

    const [rows] = await pool.query(sql, params);
    const products = await hydrateProducts(rows, pool);

    await redis.set(cacheKey, JSON.stringify(products), { EX: 3600 });
    res.json(products);
  } catch (e) {
    console.error('Fetch products error:', e);
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
      `SELECT 
         p.id,
         p.name,
         p.description,
         p.base_price,
         p.category_id,
         p.is_active,
         p.image_url,
         COALESCE(p.stock, 0) AS stock,
         c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id IN (?) AND p.is_active = true`,
      [ids]
    );

    const products = await hydrateProducts(rows, pool);
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
      return res.json(JSON.parse(cached));
    }
    const [rows] = await pool.query('SELECT * FROM categories ORDER BY name');

    await redis.set(cacheKey, JSON.stringify(rows), { EX: 86400 });
    res.json(rows);
  } catch (e) {
    console.error('Fetch categories error:', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/products/:id - Get a single product by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const cacheKey = `product:${id}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const [rows] = await pool.execute(
      `SELECT 
         p.id,
         p.name,
         p.description,
         p.base_price,
         p.category_id,
         p.is_active,
         p.image_url,
         COALESCE(p.stock, 0) AS stock,
         c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = ? AND p.is_active = true`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const hydrated = await hydrateProducts(rows, pool);
    const product = hydrated[0];

    await redis.set(cacheKey, JSON.stringify(product), { EX: 3600 });
    res.json(product);
  } catch (error) {
    console.error('Fetch product by id error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/products - Create a new product with variants and images (admin only)
router.post('/', requireAuth, verifyAdmin, upload.array('images', 10), async (req, res) => {
  let data = req.body;
  if (typeof req.body.data === 'string') {
    try {
      data = JSON.parse(req.body.data);
    } catch {
      return res.status(400).json({ message: 'Invalid JSON in data field' });
    }
  }

  const { name, description, category_id, base_price, price, variants } = data;

  const productName = name ? String(name).trim() : '';
  if (!productName) {
    return res.status(400).json({ message: 'Product name is required' });
  }

  const effectivePrice = Number(base_price !== undefined ? base_price : price);
  if (Number.isNaN(effectivePrice) || effectivePrice < 0) {
    return res.status(400).json({ message: 'Invalid base price' });
  }

  if (!category_id) {
    return res.status(400).json({ message: 'Category is required' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [categories] = await conn.execute(
      'SELECT id, name FROM categories WHERE id = ?',
      [category_id]
    );
    if (categories.length === 0) {
      await conn.rollback();
      return res.status(400).json({ message: 'Category does not exist' });
    }
    const categoryName = categories[0].name;

    // 1. Insert product
    const [productResult] = await conn.execute(
      'INSERT INTO products (name, description, base_price, category_id, is_active) VALUES (?, ?, ?, ?, true)',
      [productName, description || '', effectivePrice, category_id]
    );
    const productId = productResult.insertId;

    // 2. Insert uploaded files into product_images
    const uploadedFiles = req.files || [];
    if (uploadedFiles.length > 0) {
      for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i];
        const imgUrl = `/uploads/${file.filename}`;
        const isPrimary = i === 0;
        await conn.execute(
          'INSERT INTO product_images (product_id, image_url, is_primary, sort_order) VALUES (?, ?, ?, ?)',
          [productId, imgUrl, isPrimary, i]
        );
      }
    } else if (Array.isArray(data.image_urls) && data.image_urls.length > 0) {
      for (let i = 0; i < data.image_urls.length; i++) {
        const imgUrl = data.image_urls[i];
        const isPrimary = i === 0;
        await conn.execute(
          'INSERT INTO product_images (product_id, image_url, is_primary, sort_order) VALUES (?, ?, ?, ?)',
          [productId, imgUrl, isPrimary, i]
        );
      }
    }

    // 3. Process variants
    const variantList = Array.isArray(variants) && variants.length > 0
      ? variants
      : [
          {
            color_name: 'Default',
            color_hex: '#000000',
            size_name: 'OS',
            price_override: null,
            stock: Number(data.stock) || 50,
          },
        ];

    for (const v of variantList) {
      const colorName = (v.color_name || 'Default').trim();
      const colorHex = v.color_hex || '#000000';
      const sizeName = (v.size_name || 'OS').trim().toUpperCase();
      const stockQty = Math.max(0, Number(v.stock) || 0);
      const priceOverride = v.price_override !== undefined && v.price_override !== null
        ? Number(v.price_override)
        : null;

      // Upsert color
      await conn.execute(
        'INSERT IGNORE INTO colors (name, hex_code) VALUES (?, ?)',
        [colorName, colorHex]
      );
      const [colors] = await conn.execute('SELECT id FROM colors WHERE name = ?', [colorName]);
      const colorId = colors[0].id;

      // Upsert size
      await conn.execute(
        'INSERT IGNORE INTO sizes (name, sort_order) VALUES (?, ?)',
        [sizeName, 99]
      );
      const [sizes] = await conn.execute('SELECT id FROM sizes WHERE name = ?', [sizeName]);
      const sizeId = sizes[0].id;

      // Deterministic SKU
      const sku = generateSku(categoryName, productName, colorName, sizeName);

      // Insert variant
      const [variantResult] = await conn.execute(
        `INSERT INTO product_variants (product_id, sku, color_id, size_id, price_override, is_active)
         VALUES (?, ?, ?, ?, ?, true)`,
        [productId, sku, colorId, sizeId, priceOverride]
      );
      const variantId = variantResult.insertId;

      // Insert inventory
      await conn.execute(
        'INSERT INTO inventory (variant_id, quantity, reserved_quantity) VALUES (?, ?, 0)',
        [variantId, stockQty]
      );
    }

    await conn.commit();

    // Invalidate Redis cache
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

    // Return created product in standard format
    const [newProductRows] = await pool.query(
      `SELECT 
         p.id,
         p.name,
         p.description,
         p.base_price,
         p.category_id,
         p.is_active,
         p.image_url,
         c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = ?`,
      [productId]
    );

    const hydrated = await hydrateProducts(newProductRows, pool);
    res.status(201).json(hydrated[0]);
  } catch (error) {
    if (conn) await conn.rollback();
    console.error('Create product error:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/products/variants/:variantId/inventory - Update variant stock (staff and admin)
router.put('/variants/:variantId/inventory', requireAuth, verifyStaff, async (req, res) => {
  const variantId = Number(req.params.variantId);
  const { quantity } = req.body;

  if (Number.isNaN(variantId) || variantId <= 0) {
    return res.status(400).json({ message: 'Invalid variant ID' });
  }

  const parsedStock = Number(quantity);
  if (!Number.isInteger(parsedStock) || parsedStock < 0) {
    return res.status(400).json({ message: 'Invalid stock value' });
  }

  try {
    const [variants] = await pool.execute(
      'SELECT id, product_id, sku FROM product_variants WHERE id = ?',
      [variantId]
    );
    if (variants.length === 0) {
      return res.status(404).json({ message: 'Variant not found' });
    }

    const variant = variants[0];

    await pool.execute(
      `INSERT INTO inventory (variant_id, quantity, reserved_quantity)
       VALUES (?, ?, 0)
       ON DUPLICATE KEY UPDATE quantity = ?`,
      [variantId, parsedStock, parsedStock]
    );

    // Enqueue cache invalidation
    try {
      await cacheQueue.add('invalidate', {
        type: 'cache-invalidate',
        pattern: 'products:*',
        productId: variant.product_id,
      });
    } catch (queueErr) {
      console.error('Failed to enqueue cache invalidation:', queueErr.message);
      Sentry.captureException(queueErr, { tags: { queue: 'cache-invalidate' } });
    }

    res.json({
      message: 'Inventory updated',
      variantId,
      sku: variant.sku,
      quantity: parsedStock,
    });
  } catch (error) {
    console.error('Update variant inventory error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/products/:id/stock - Legacy endpoint updating stock across all variants (staff/admin)
router.put('/:id/stock', requireAuth, verifyStaff, async (req, res) => {
  const productId = Number(req.params.id);
  const { stock } = req.body;

  if (Number.isNaN(productId) || productId <= 0) {
    return res.status(400).json({ message: 'Invalid product ID' });
  }

  const parsedStock = Number(stock);
  if (!Number.isInteger(parsedStock) || parsedStock < 0) {
    return res.status(400).json({ message: 'Invalid stock value' });
  }

  try {
    const [rows] = await pool.execute('SELECT id FROM products WHERE id = ?', [productId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Update inventory for all variants belonging to this product
    await pool.execute(
      `UPDATE inventory i
       JOIN product_variants pv ON i.variant_id = pv.id
       SET i.quantity = ?
       WHERE pv.product_id = ?`,
      [parsedStock, productId]
    );

    // Invalidate cache
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
  } catch (error) {
    console.error('Legacy stock update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/products/:id - Delete a product (admin only)
router.delete('/:id', requireAuth, verifyAdmin, async (req, res) => {
  const productId = Number(req.params.id);

  if (Number.isNaN(productId) || productId <= 0) {
    return res.status(400).json({ message: 'Invalid product id' });
  }

  try {
    const [rows] = await pool.execute('SELECT id FROM products WHERE id = ?', [productId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Soft Delete
    await pool.execute('UPDATE products SET is_active = false WHERE id = ?', [productId]);

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
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
