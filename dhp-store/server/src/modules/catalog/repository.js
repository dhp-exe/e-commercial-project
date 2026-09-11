import { pool } from '../../shared/db/pool.js';

/**
 * Fetch product images for a list of product IDs.
 */
export async function findImagesByProductIds(productIds, conn = pool) {
  if (!productIds || productIds.length === 0) return [];
  const [rows] = await conn.query(
    `SELECT id, product_id, image_url, is_primary, sort_order
     FROM product_images
     WHERE product_id IN (?)
     ORDER BY sort_order ASC, id ASC`,
    [productIds]
  );
  return rows;
}

/**
 * Fetch variants with color, size, and inventory for a list of product IDs.
 */
export async function findVariantsWithDetailsByProductIds(productIds, conn = pool) {
  if (!productIds || productIds.length === 0) return [];
  const [rows] = await conn.query(
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
  return rows;
}

/**
 * Query active products with optional text search and category filter.
 */
export async function findProducts({ q, categoryId } = {}, conn = pool) {
  const where = ['p.is_active = true'];
  const params = [];

  if (q) {
    where.push('p.name LIKE ?');
    params.push(`%${q}%`);
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

  const [rows] = await conn.query(sql, params);
  return rows;
}

/**
 * Batch fetch products by IDs.
 */
export async function findProductsByIds(ids, conn = pool) {
  if (!ids || ids.length === 0) return [];
  const [rows] = await conn.query(
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
  return rows;
}

/**
 * Fetch all categories ordered by name.
 */
export async function findAllCategories(conn = pool) {
  const [rows] = await conn.query('SELECT * FROM categories ORDER BY name');
  return rows;
}

/**
 * Fetch category by ID.
 */
export async function findCategoryById(categoryId, conn = pool) {
  const [rows] = await conn.execute(
    'SELECT id, name FROM categories WHERE id = ?',
    [categoryId]
  );
  return rows[0] || null;
}

/**
 * Fetch all colors ordered by name.
 */
export async function findAllColors(conn = pool) {
  const [rows] = await conn.query('SELECT id, name, hex_code FROM colors ORDER BY name ASC');
  return rows;
}

/**
 * Find color by name.
 */
export async function findColorByName(name, conn = pool) {
  const [rows] = await conn.execute('SELECT id, name, hex_code FROM colors WHERE name = ?', [name]);
  return rows[0] || null;
}

/**
 * Find color by ID.
 */
export async function findColorById(id, conn = pool) {
  const [rows] = await conn.execute('SELECT id, name, hex_code FROM colors WHERE id = ?', [id]);
  return rows[0] || null;
}

/**
 * Upsert color by name and hex code.
 */
export async function upsertColor(name, hexCode, conn = pool) {
  await conn.execute(
    'INSERT IGNORE INTO colors (name, hex_code) VALUES (?, ?)',
    [name, hexCode]
  );
  return findColorByName(name, conn);
}

/**
 * Find size by name.
 */
export async function findSizeByName(name, conn = pool) {
  const [rows] = await conn.execute('SELECT id, name, sort_order FROM sizes WHERE name = ?', [name]);
  return rows[0] || null;
}

/**
 * Find size by ID.
 */
export async function findSizeById(id, conn = pool) {
  const [rows] = await conn.execute('SELECT id, name, sort_order FROM sizes WHERE id = ?', [id]);
  return rows[0] || null;
}

/**
 * Upsert size by name and sort order.
 */
export async function upsertSize(name, sortOrder = 99, conn = pool) {
  await conn.execute(
    'INSERT IGNORE INTO sizes (name, sort_order) VALUES (?, ?)',
    [name, sortOrder]
  );
  return findSizeByName(name, conn);
}

/**
 * Get first size in the database.
 */
export async function findAnySize(conn = pool) {
  const [rows] = await conn.execute('SELECT id, name, sort_order FROM sizes LIMIT 1');
  return rows[0] || null;
}

/**
 * Fetch single product by ID (must be active if activeOnly is true).
 */
export async function findProductById(id, activeOnly = true, conn = pool) {
  let sql = `
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
    WHERE p.id = ?
  `;
  if (activeOnly) {
    sql += ' AND p.is_active = true';
  }

  const [rows] = await conn.execute(sql, [id]);
  return rows[0] || null;
}

/**
 * Insert a new product.
 */
export async function insertProduct({ name, description, basePrice, categoryId }, conn = pool) {
  const [result] = await conn.execute(
    'INSERT INTO products (name, description, base_price, category_id, is_active) VALUES (?, ?, ?, ?, true)',
    [name, description || '', basePrice, categoryId]
  );
  return result.insertId;
}

/**
 * Insert a product image.
 */
export async function insertProductImage({ productId, imageUrl, isPrimary, sortOrder }, conn = pool) {
  await conn.execute(
    'INSERT INTO product_images (product_id, image_url, is_primary, sort_order) VALUES (?, ?, ?, ?)',
    [productId, imageUrl, isPrimary, sortOrder]
  );
}

/**
 * Insert a product variant.
 */
export async function insertProductVariant({ productId, sku, colorId, sizeId, priceOverride }, conn = pool) {
  const [result] = await conn.execute(
    `INSERT INTO product_variants (product_id, sku, color_id, size_id, price_override, is_active)
     VALUES (?, ?, ?, ?, ?, true)`,
    [productId, sku, colorId, sizeId, priceOverride]
  );
  return result.insertId;
}

/**
 * Insert inventory record for variant.
 */
export async function insertInventory({ variantId, quantity }, conn = pool) {
  await conn.execute(
    'INSERT INTO inventory (variant_id, quantity, reserved_quantity) VALUES (?, ?, 0)',
    [variantId, quantity]
  );
}

/**
 * Find variant by ID.
 */
export async function findVariantById(variantId, conn = pool) {
  const [rows] = await conn.execute(
    'SELECT id, product_id, sku FROM product_variants WHERE id = ?',
    [variantId]
  );
  return rows[0] || null;
}

/**
 * Find variant with joined product, category, and size details by variant ID.
 */
export async function findVariantWithDetailsById(variantId, conn = pool) {
  const [rows] = await conn.execute(
    `SELECT pv.id, pv.product_id, pv.sku, pv.color_id, pv.size_id, pv.price_override,
            p.name AS product_name, c.name AS category_name, s.name AS size_name
     FROM product_variants pv
     JOIN products p ON pv.product_id = p.id
     JOIN categories c ON p.category_id = c.id
     JOIN sizes s ON pv.size_id = s.id
     WHERE pv.id = ?`,
    [variantId]
  );
  return rows[0] || null;
}

/**
 * Upsert variant inventory quantity.
 */
export async function upsertVariantInventory(variantId, quantity, conn = pool) {
  await conn.execute(
    `INSERT INTO inventory (variant_id, quantity, reserved_quantity)
     VALUES (?, ?, 0)
     ON DUPLICATE KEY UPDATE quantity = ?`,
    [variantId, quantity, quantity]
  );
}

/**
 * Check if a duplicate variant exists for (product_id, color_id, size_id).
 */
export async function findDuplicateVariant(productId, colorId, sizeId, excludeVariantId = null, conn = pool) {
  let sql = 'SELECT id FROM product_variants WHERE product_id = ? AND color_id = ? AND size_id = ?';
  const params = [productId, colorId, sizeId];
  if (excludeVariantId) {
    sql += ' AND id != ?';
    params.push(excludeVariantId);
  }
  const [rows] = await conn.execute(sql, params);
  return rows[0] || null;
}

/**
 * Check if SKU is in use by another variant.
 */
export async function findVariantBySku(sku, excludeVariantId = null, conn = pool) {
  let sql = 'SELECT id FROM product_variants WHERE sku = ?';
  const params = [sku];
  if (excludeVariantId) {
    sql += ' AND id != ?';
    params.push(excludeVariantId);
  }
  const [rows] = await conn.execute(sql, params);
  return rows[0] || null;
}

/**
 * Update variant record.
 */
export async function updateVariant({ variantId, colorId, priceOverride, sku }, conn = pool) {
  await conn.execute(
    'UPDATE product_variants SET color_id = ?, price_override = ?, sku = ? WHERE id = ?',
    [colorId, priceOverride, sku, variantId]
  );
}

/**
 * Count variants for a product.
 */
export async function countVariantsByProductId(productId, conn = pool) {
  const [rows] = await conn.execute(
    'SELECT COUNT(*) AS cnt FROM product_variants WHERE product_id = ?',
    [productId]
  );
  return rows[0]?.cnt || 0;
}

/**
 * Delete a variant by ID.
 */
export async function deleteVariantById(variantId, conn = pool) {
  await conn.execute('DELETE FROM product_variants WHERE id = ?', [variantId]);
}

/**
 * Legacy update: update inventory for all variants belonging to a product.
 */
export async function updateStockByProductId(productId, stock, conn = pool) {
  await conn.execute(
    `UPDATE inventory i
     JOIN product_variants pv ON i.variant_id = pv.id
     SET i.quantity = ?
     WHERE pv.product_id = ?`,
    [stock, productId]
  );
}

/**
 * Soft delete product by setting is_active = false.
 */
export async function softDeleteProductById(productId, conn = pool) {
  await conn.execute('UPDATE products SET is_active = false WHERE id = ?', [productId]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Facade & Cross-Module Queries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get effective price of a variant (price_override or product base_price).
 */
export async function findVariantPrice(variantId, conn = pool) {
  const [rows] = await conn.execute(
    `SELECT COALESCE(pv.price_override, p.base_price) AS price
     FROM product_variants pv
     JOIN products p ON pv.product_id = p.id
     WHERE pv.id = ?`,
    [variantId]
  );
  return rows.length > 0 ? Number(rows[0].price) : null;
}

/**
 * Get base price of a product.
 */
export async function findProductBasePrice(productId, conn = pool) {
  const [rows] = await conn.execute(
    'SELECT base_price FROM products WHERE id = ?',
    [productId]
  );
  return rows.length > 0 ? Number(rows[0].base_price) : null;
}

/**
 * Select inventory row FOR UPDATE.
 */
export async function findInventoryForUpdate(variantId, conn = pool) {
  const [rows] = await conn.execute(
    'SELECT quantity, reserved_quantity FROM inventory WHERE variant_id = ? FOR UPDATE',
    [variantId]
  );
  return rows[0] || null;
}

/**
 * Deduct inventory for variant.
 */
export async function decrementInventory(variantId, quantity, conn = pool) {
  await conn.execute(
    'UPDATE inventory SET quantity = quantity - ? WHERE variant_id = ?',
    [quantity, variantId]
  );
}

/**
 * Restore inventory for variant.
 */
export async function incrementInventory(variantId, quantity, conn = pool) {
  await conn.execute(
    'UPDATE inventory SET quantity = quantity + ? WHERE variant_id = ?',
    [quantity, variantId]
  );
}

/**
 * Get available stock (quantity - reserved_quantity) for a variant.
 */
export async function findAvailableStock(variantId, conn = pool) {
  const [rows] = await conn.execute(
    'SELECT GREATEST(0, quantity - reserved_quantity) AS available FROM inventory WHERE variant_id = ?',
    [variantId]
  );
  return rows.length > 0 ? Number(rows[0].available) : 0;
}

/**
 * Fetch all active product IDs and updated_at for sitemap generation.
 */
export async function findActiveProductSummaries(conn = pool) {
  const [rows] = await conn.execute(
    'SELECT id, updated_at FROM products WHERE is_active = true ORDER BY id'
  );
  return rows;
}
