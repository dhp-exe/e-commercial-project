import { Router } from 'express';
import { pool } from '../shared/db/pool.js';
import redis from '../shared/cache/redis.js';
import * as Sentry from '@sentry/node';
import { requireAuth } from '../shared/middleware/requireAuth.js';
import { verifyStaff, verifyAdmin } from '../shared/middleware/requireRole.js';
import upload from '../shared/middleware/upload.js';
import { formatImageUrl } from '../shared/utils/formatImageUrl.js';
import { generateSku } from '../shared/utils/generateSku.js';
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
    const { q, categoryId, _t } = req.query;

    const cacheKey = `products:q=${q || ''}:cat=${categoryId || ''}`;
    if (!_t) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.json(JSON.parse(cached));
      }
    } else {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
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

// GET /api/products/colors - Get all colors for variant configuration
router.get('/colors', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, hex_code FROM colors ORDER BY name ASC');
    res.json(rows);
  } catch (e) {
    console.error('Fetch colors error:', e);
    res.status(500).json({ message: 'Server error fetching colors' });
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

// PUT /api/products/variants/:variantId - Update variant price, color, and stock (staff and admin)
router.put('/variants/:variantId', requireAuth, verifyStaff, async (req, res) => {
  const variantId = Number(req.params.variantId);
  const { price_override, color_id, color_name, color_hex, stock } = req.body;

  if (Number.isNaN(variantId) || variantId <= 0) {
    return res.status(400).json({ message: 'Invalid variant ID' });
  }

  try {
    const [variants] = await pool.execute(
      `SELECT pv.id, pv.product_id, pv.sku, pv.color_id, pv.size_id, pv.price_override,
              p.name AS product_name, c.name AS category_name, s.name AS size_name
       FROM product_variants pv
       JOIN products p ON pv.product_id = p.id
       JOIN categories c ON p.category_id = c.id
       JOIN sizes s ON pv.size_id = s.id
       WHERE pv.id = ?`,
      [variantId]
    );

    if (variants.length === 0) {
      return res.status(404).json({ message: 'Variant not found' });
    }

    const currentVariant = variants[0];
    let finalColorId = currentVariant.color_id;
    let finalColorName = null;

    // 1. Resolve Color if provided
    if (color_name && typeof color_name === 'string' && color_name.trim()) {
      const cName = color_name.trim();
      const cHex = (color_hex || '#000000').trim();
      await pool.execute(
        'INSERT IGNORE INTO colors (name, hex_code) VALUES (?, ?)',
        [cName, cHex]
      );
      const [cRows] = await pool.execute('SELECT id, name FROM colors WHERE name = ?', [cName]);
      if (cRows.length > 0) {
        finalColorId = cRows[0].id;
        finalColorName = cRows[0].name;
      }
    } else if (color_id !== undefined && color_id !== null && color_id !== '') {
      const cId = Number(color_id);
      const [cRows] = await pool.execute('SELECT id, name FROM colors WHERE id = ?', [cId]);
      if (cRows.length === 0) {
        return res.status(400).json({ message: 'Selected color does not exist' });
      }
      finalColorId = cRows[0].id;
      finalColorName = cRows[0].name;
    }

    // Check duplicate color + size on this product if color changed
    if (finalColorId !== currentVariant.color_id) {
      const [dup] = await pool.execute(
        'SELECT id FROM product_variants WHERE product_id = ? AND color_id = ? AND size_id = ? AND id != ?',
        [currentVariant.product_id, finalColorId, currentVariant.size_id, variantId]
      );
      if (dup.length > 0) {
        return res.status(400).json({ message: 'A variant with this color and size already exists on this product.' });
      }
    }

    // Determine new SKU if color changed
    let updatedSku = currentVariant.sku;
    if (finalColorName && finalColorId !== currentVariant.color_id) {
      let skuCandidate = generateSku(
        currentVariant.category_name,
        currentVariant.product_name,
        finalColorName,
        currentVariant.size_name
      );
      const [skuCheck] = await pool.execute(
        'SELECT id FROM product_variants WHERE sku = ? AND id != ?',
        [skuCandidate, variantId]
      );
      if (skuCheck.length > 0) {
        skuCandidate = `${skuCandidate}-${variantId}`;
      }
      updatedSku = skuCandidate;
    }

    // 2. Resolve Price Override
    let finalPriceOverride = currentVariant.price_override;
    if (price_override === null || price_override === '' || price_override === undefined) {
      finalPriceOverride = null;
    } else {
      const parsedPrice = Number(price_override);
      if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ message: 'Invalid price override value' });
      }
      finalPriceOverride = parsedPrice;
    }

    // Update variant record
    await pool.execute(
      'UPDATE product_variants SET color_id = ?, price_override = ?, sku = ? WHERE id = ?',
      [finalColorId, finalPriceOverride, updatedSku, variantId]
    );

    // 3. Resolve Stock if provided
    let finalStock = null;
    if (stock !== undefined && stock !== null && stock !== '') {
      const parsedStock = Number(stock);
      if (!Number.isInteger(parsedStock) || parsedStock < 0) {
        return res.status(400).json({ message: 'Invalid stock quantity' });
      }
      finalStock = parsedStock;
      await pool.execute(
        `INSERT INTO inventory (variant_id, quantity, reserved_quantity)
         VALUES (?, ?, 0)
         ON DUPLICATE KEY UPDATE quantity = ?`,
        [variantId, parsedStock, parsedStock]
      );
    }

    // Invalidate Redis cache immediately
    try {
      await redis.del(`product:${currentVariant.product_id}`);
      await redis.del('products:q=:cat=');
      await cacheQueue.add('invalidate', {
        type: 'cache-invalidate',
        pattern: 'products:*',
        productId: currentVariant.product_id,
      });
    } catch (queueErr) {
      console.error('Failed to enqueue cache invalidation:', queueErr.message);
      Sentry.captureException(queueErr, { tags: { queue: 'cache-invalidate' } });
    }

    res.json({
      message: 'Variant updated successfully',
      variant: {
        id: variantId,
        product_id: currentVariant.product_id,
        sku: updatedSku,
        color_id: finalColorId,
        price_override: finalPriceOverride,
        stock: finalStock,
      },
    });
  } catch (error) {
    console.error('Update variant error:', error);
    res.status(500).json({ message: 'Server error updating variant' });
  }
});

// POST /api/products/:id/variants - Add a new variant to an existing product (staff and admin)
router.post('/:id/variants', requireAuth, verifyStaff, async (req, res) => {
  const productId = Number(req.params.id);
  const { color_id, color_name, color_hex, size_name, size_id, price_override, stock } = req.body;

  if (Number.isNaN(productId) || productId <= 0) {
    return res.status(400).json({ message: 'Invalid product ID' });
  }

  try {
    const [products] = await pool.execute(
      `SELECT p.id, p.name, p.base_price, c.name AS category_name
       FROM products p
       JOIN categories c ON p.category_id = c.id
       WHERE p.id = ?`,
      [productId]
    );

    if (products.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const product = products[0];

    // 1. Resolve Color
    let finalColorId;
    let finalColorName;
    if (color_name && typeof color_name === 'string' && color_name.trim()) {
      const cName = color_name.trim();
      const cHex = (color_hex || '#000000').trim();
      await pool.execute(
        'INSERT IGNORE INTO colors (name, hex_code) VALUES (?, ?)',
        [cName, cHex]
      );
      const [cRows] = await pool.execute('SELECT id, name FROM colors WHERE name = ?', [cName]);
      finalColorId = cRows[0].id;
      finalColorName = cRows[0].name;
    } else if (color_id !== undefined && color_id !== null && color_id !== '') {
      const [cRows] = await pool.execute('SELECT id, name FROM colors WHERE id = ?', [Number(color_id)]);
      if (cRows.length === 0) {
        return res.status(400).json({ message: 'Selected color does not exist' });
      }
      finalColorId = cRows[0].id;
      finalColorName = cRows[0].name;
    } else {
      const [cRows] = await pool.execute('SELECT id, name FROM colors LIMIT 1');
      finalColorId = cRows[0].id;
      finalColorName = cRows[0].name;
    }

    // 2. Resolve Size
    let finalSizeId;
    let finalSizeName;
    if (size_name && typeof size_name === 'string' && size_name.trim()) {
      const sName = size_name.trim().toUpperCase();
      await pool.execute(
        'INSERT IGNORE INTO sizes (name, sort_order) VALUES (?, ?)',
        [sName, 99]
      );
      const [sRows] = await pool.execute('SELECT id, name FROM sizes WHERE name = ?', [sName]);
      finalSizeId = sRows[0].id;
      finalSizeName = sRows[0].name;
    } else if (size_id !== undefined && size_id !== null && size_id !== '') {
      const [sRows] = await pool.execute('SELECT id, name FROM sizes WHERE id = ?', [Number(size_id)]);
      if (sRows.length === 0) {
        return res.status(400).json({ message: 'Selected size does not exist' });
      }
      finalSizeId = sRows[0].id;
      finalSizeName = sRows[0].name;
    } else {
      finalSizeName = 'M';
      const [sRows] = await pool.execute('SELECT id, name FROM sizes WHERE name = ?', ['M']);
      if (sRows.length > 0) {
        finalSizeId = sRows[0].id;
      } else {
        const [anySize] = await pool.execute('SELECT id, name FROM sizes LIMIT 1');
        finalSizeId = anySize[0].id;
        finalSizeName = anySize[0].name;
      }
    }

    // 3. Check for existing variant with same product + color + size
    const [existing] = await pool.execute(
      'SELECT id FROM product_variants WHERE product_id = ? AND color_id = ? AND size_id = ?',
      [productId, finalColorId, finalSizeId]
    );
    if (existing.length > 0) {
      return res.status(400).json({ message: 'A variant with this color and size already exists on this product.' });
    }

    // 4. Generate SKU
    let sku = generateSku(product.category_name, product.name, finalColorName, finalSizeName);
    const [skuCheck] = await pool.execute('SELECT id FROM product_variants WHERE sku = ?', [sku]);
    if (skuCheck.length > 0) {
      sku = `${sku}-${Date.now().toString().slice(-4)}`;
    }

    // 5. Resolve Price Override & Stock
    const priceOverride = price_override !== undefined && price_override !== null && price_override !== ''
      ? Number(price_override)
      : null;
    const stockQty = Math.max(0, Number(stock) || 0);

    // 6. Insert Variant
    const [variantResult] = await pool.execute(
      `INSERT INTO product_variants (product_id, sku, color_id, size_id, price_override, is_active)
       VALUES (?, ?, ?, ?, ?, true)`,
      [productId, sku, finalColorId, finalSizeId, priceOverride]
    );
    const variantId = variantResult.insertId;

    // 7. Insert Inventory
    await pool.execute(
      'INSERT INTO inventory (variant_id, quantity, reserved_quantity) VALUES (?, ?, 0)',
      [variantId, stockQty]
    );

    // Invalidate Redis cache immediately
    try {
      await redis.del(`product:${productId}`);
      await redis.del('products:q=:cat=');
      await cacheQueue.add('invalidate', {
        type: 'cache-invalidate',
        pattern: 'products:*',
        productId,
      });
    } catch (queueErr) {
      console.error('Failed to enqueue cache invalidation:', queueErr.message);
      Sentry.captureException(queueErr, { tags: { queue: 'cache-invalidate' } });
    }

    res.status(201).json({
      message: 'Variant created successfully',
      variant: {
        id: variantId,
        product_id: productId,
        sku,
        color_id: finalColorId,
        size_id: finalSizeId,
        price_override: priceOverride,
        stock: stockQty,
      },
    });
  } catch (error) {
    console.error('Create variant error:', error);
    res.status(500).json({ message: 'Server error creating variant' });
  }
});

// DELETE /api/products/variants/:variantId - Delete a variant from an existing product (staff and admin)
router.delete('/variants/:variantId', requireAuth, verifyStaff, async (req, res) => {
  const variantId = Number(req.params.variantId);

  if (Number.isNaN(variantId) || variantId <= 0) {
    return res.status(400).json({ message: 'Invalid variant ID' });
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

    // Ensure we don't delete the last remaining variant of a product
    const [countRows] = await pool.execute(
      'SELECT COUNT(*) AS cnt FROM product_variants WHERE product_id = ?',
      [variant.product_id]
    );

    if (countRows[0].cnt <= 1) {
      return res.status(400).json({
        message: 'Cannot delete the only remaining variant of a product. Products must have at least one variant.',
      });
    }

    await pool.execute('DELETE FROM product_variants WHERE id = ?', [variantId]);

    // Invalidate Redis cache immediately
    try {
      await redis.del(`product:${variant.product_id}`);
      await redis.del('products:q=:cat=');
      await cacheQueue.add('invalidate', {
        type: 'cache-invalidate',
        pattern: 'products:*',
        productId: variant.product_id,
      });
    } catch (queueErr) {
      console.error('Failed to enqueue cache invalidation:', queueErr.message);
      Sentry.captureException(queueErr, { tags: { queue: 'cache-invalidate' } });
    }

    res.json({ message: 'Variant deleted successfully', variantId });
  } catch (error) {
    console.error('Delete variant error:', error);
    res.status(500).json({ message: 'Server error deleting variant' });
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
