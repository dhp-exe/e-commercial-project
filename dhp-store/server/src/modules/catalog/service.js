import * as Sentry from '@sentry/node';
import { pool } from '../../shared/db/pool.js';
import redis from '../../shared/cache/redis.js';
import { AppError } from '../../shared/errors/AppError.js';
import { formatImageUrl } from '../../shared/utils/formatImageUrl.js';
import { generateSku } from '../../shared/utils/generateSku.js';
import { cacheQueue } from './queues/cacheQueue.js';
import * as catalogRepo from './repository.js';

/**
 * Enqueue background cache invalidation.
 */
async function enqueueCacheInvalidation(pattern = 'products:*', productId = null) {
  try {
    await cacheQueue.add('invalidate', {
      type: 'cache-invalidate',
      pattern,
      productId,
    });
  } catch (queueErr) {
    console.error('Failed to enqueue cache invalidation:', queueErr.message);
    Sentry.captureException(queueErr, { tags: { queue: 'cache-invalidate' } });
  }
}

/**
 * Hydrates an array of product rows with their variants, colors, sizes, inventory, and images.
 * Executes in 2 queries total regardless of batch size to eliminate N+1 overhead.
 */
export async function hydrateProducts(products, conn = pool) {
  if (!products || products.length === 0) return [];
  const productIds = products.map((p) => p.id);

  // 1. Fetch images for all products
  const imageRows = await catalogRepo.findImagesByProductIds(productIds, conn);

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
  const variantRows = await catalogRepo.findVariantsWithDetailsByProductIds(productIds, conn);

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

/**
 * Fetch products list with optional filtering and caching.
 */
export async function getProducts({ q, categoryId, bypassCache } = {}) {
  const cacheKey = `products:q=${q || ''}:cat=${categoryId || ''}`;
  if (!bypassCache) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  }

  const rows = await catalogRepo.findProducts({ q, categoryId }, pool);
  const products = await hydrateProducts(rows, pool);

  await redis.set(cacheKey, JSON.stringify(products), { EX: 3600 });
  return products;
}

/**
 * Batch fetch products by IDs.
 */
export async function getProductsByIds(ids, conn = pool) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return [];
  }
  const rows = await catalogRepo.findProductsByIds(ids, conn);
  return await hydrateProducts(rows, conn);
}

/**
 * Fetch all categories with 24h caching.
 */
export async function getCategories() {
  const cacheKey = 'categories';
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  const rows = await catalogRepo.findAllCategories(pool);
  await redis.set(cacheKey, JSON.stringify(rows), { EX: 86400 });
  return rows;
}

/**
 * Fetch all colors for variant configuration.
 */
export async function getColors() {
  return await catalogRepo.findAllColors(pool);
}

/**
 * Fetch single active product by ID.
 */
export async function getProductById(id) {
  const cacheKey = `product:${id}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  const row = await catalogRepo.findProductById(id, true, pool);
  if (!row) {
    return null;
  }

  const hydrated = await hydrateProducts([row], pool);
  const product = hydrated[0];

  await redis.set(cacheKey, JSON.stringify(product), { EX: 3600 });
  return product;
}

/**
 * Create a new product with variants and images in a transaction.
 */
export async function createProduct(data, uploadedFiles = []) {
  const { name, description, category_id, base_price, price, variants } = data;

  const productName = name ? String(name).trim() : '';
  if (!productName) {
    throw new AppError('Product name is required', 400);
  }

  const effectivePrice = Number(base_price !== undefined ? base_price : price);
  if (Number.isNaN(effectivePrice) || effectivePrice < 0) {
    throw new AppError('Invalid base price', 400);
  }

  if (!category_id) {
    throw new AppError('Category is required', 400);
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const category = await catalogRepo.findCategoryById(category_id, conn);
    if (!category) {
      await conn.rollback();
      throw new AppError('Category does not exist', 400);
    }
    const categoryName = category.name;

    // 1. Insert product
    const productId = await catalogRepo.insertProduct(
      { name: productName, description: description || '', basePrice: effectivePrice, categoryId: category_id },
      conn
    );

    // 2. Insert uploaded files or image URLs
    if (uploadedFiles && uploadedFiles.length > 0) {
      for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i];
        const imgUrl = `/uploads/${file.filename}`;
        const isPrimary = i === 0;
        await catalogRepo.insertProductImage(
          { productId, imageUrl: imgUrl, isPrimary, sortOrder: i },
          conn
        );
      }
    } else if (Array.isArray(data.image_urls) && data.image_urls.length > 0) {
      for (let i = 0; i < data.image_urls.length; i++) {
        const imgUrl = data.image_urls[i];
        const isPrimary = i === 0;
        await catalogRepo.insertProductImage(
          { productId, imageUrl: imgUrl, isPrimary, sortOrder: i },
          conn
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
      const color = await catalogRepo.upsertColor(colorName, colorHex, conn);
      const colorId = color.id;

      // Upsert size
      const size = await catalogRepo.upsertSize(sizeName, 99, conn);
      const sizeId = size.id;

      // Deterministic SKU
      const sku = generateSku(categoryName, productName, colorName, sizeName);

      // Insert variant
      const variantId = await catalogRepo.insertProductVariant(
        { productId, sku, colorId, sizeId, priceOverride },
        conn
      );

      // Insert inventory
      await catalogRepo.insertInventory({ variantId, quantity: stockQty }, conn);
    }

    await conn.commit();

    // Enqueue cache invalidation
    await enqueueCacheInvalidation('products:*', productId);

    // Fetch and hydrate newly created product
    const newProduct = await catalogRepo.findProductById(productId, false, pool);
    const hydrated = await hydrateProducts([newProduct], pool);
    return hydrated[0];
  } catch (error) {
    if (conn) await conn.rollback();
    throw error;
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Update stock for a single variant.
 */
export async function updateVariantInventory(variantId, quantity) {
  const variant = await catalogRepo.findVariantById(variantId, pool);
  if (!variant) {
    return null;
  }

  await catalogRepo.upsertVariantInventory(variantId, quantity, pool);
  await enqueueCacheInvalidation('products:*', variant.product_id);

  return {
    message: 'Inventory updated',
    variantId,
    sku: variant.sku,
    quantity,
  };
}

/**
 * Update variant price, color, and stock.
 */
export async function updateVariant(variantId, { price_override, color_id, color_name, color_hex, stock }) {
  const currentVariant = await catalogRepo.findVariantWithDetailsById(variantId, pool);
  if (!currentVariant) {
    return null;
  }

  let finalColorId = currentVariant.color_id;
  let finalColorName = null;

  // 1. Resolve Color if provided
  if (color_name && typeof color_name === 'string' && color_name.trim()) {
    const cName = color_name.trim();
    const cHex = (color_hex || '#000000').trim();
    const color = await catalogRepo.upsertColor(cName, cHex, pool);
    if (color) {
      finalColorId = color.id;
      finalColorName = color.name;
    }
  } else if (color_id !== undefined && color_id !== null && color_id !== '') {
    const color = await catalogRepo.findColorById(Number(color_id), pool);
    if (!color) {
      throw new AppError('Selected color does not exist', 400);
    }
    finalColorId = color.id;
    finalColorName = color.name;
  }

  // Check duplicate color + size on this product if color changed
  if (finalColorId !== currentVariant.color_id) {
    const dup = await catalogRepo.findDuplicateVariant(
      currentVariant.product_id,
      finalColorId,
      currentVariant.size_id,
      variantId,
      pool
    );
    if (dup) {
      throw new AppError('A variant with this color and size already exists on this product.', 400);
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
    const skuCheck = await catalogRepo.findVariantBySku(skuCandidate, variantId, pool);
    if (skuCheck) {
      skuCandidate = `${skuCandidate}-${variantId}`;
    }
    updatedSku = skuCandidate;
  }

  // 2. Resolve Price Override
  let finalPriceOverride = currentVariant.price_override;
  if (price_override === null || price_override === '') {
    finalPriceOverride = null;
  } else if (price_override !== undefined) {
    const parsedPrice = Number(price_override);
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      throw new AppError('Invalid price override value', 400);
    }
    finalPriceOverride = parsedPrice;
  }

  // Update variant record
  await catalogRepo.updateVariant(
    { variantId, colorId: finalColorId, priceOverride: finalPriceOverride, sku: updatedSku },
    pool
  );

  // 3. Resolve Stock if provided
  let finalStock = null;
  if (stock !== undefined && stock !== null && stock !== '') {
    const parsedStock = Number(stock);
    if (!Number.isInteger(parsedStock) || parsedStock < 0) {
      throw new AppError('Invalid stock quantity', 400);
    }
    finalStock = parsedStock;
    await catalogRepo.upsertVariantInventory(variantId, parsedStock, pool);
  }

  // Invalidate Redis cache immediately
  try {
    await redis.del(`product:${currentVariant.product_id}`);
    await redis.del('products:q=:cat=');
  } catch (err) {
    console.error('Redis delete error in updateVariant:', err.message);
  }
  await enqueueCacheInvalidation('products:*', currentVariant.product_id);

  return {
    message: 'Variant updated successfully',
    variant: {
      id: variantId,
      product_id: currentVariant.product_id,
      sku: updatedSku,
      color_id: finalColorId,
      price_override: finalPriceOverride,
      stock: finalStock,
    },
  };
}

/**
 * Add a new variant to an existing product.
 */
export async function createVariant(productId, { color_id, color_name, color_hex, size_name, size_id, price_override, stock }) {
  const product = await catalogRepo.findProductById(productId, false, pool);
  if (!product) {
    return null;
  }

  // 1. Resolve Color
  let finalColorId;
  let finalColorName;
  if (color_name && typeof color_name === 'string' && color_name.trim()) {
    const cName = color_name.trim();
    const cHex = (color_hex || '#000000').trim();
    const color = await catalogRepo.upsertColor(cName, cHex, pool);
    finalColorId = color.id;
    finalColorName = color.name;
  } else if (color_id !== undefined && color_id !== null && color_id !== '') {
    const color = await catalogRepo.findColorById(Number(color_id), pool);
    if (!color) {
      throw new AppError('Selected color does not exist', 400);
    }
    finalColorId = color.id;
    finalColorName = color.name;
  } else {
    const colors = await catalogRepo.findAllColors(pool);
    if (colors.length > 0) {
      finalColorId = colors[0].id;
      finalColorName = colors[0].name;
    }
  }

  // 2. Resolve Size
  let finalSizeId;
  let finalSizeName;
  if (size_name && typeof size_name === 'string' && size_name.trim()) {
    const sName = size_name.trim().toUpperCase();
    const size = await catalogRepo.upsertSize(sName, 99, pool);
    finalSizeId = size.id;
    finalSizeName = size.name;
  } else if (size_id !== undefined && size_id !== null && size_id !== '') {
    const size = await catalogRepo.findSizeById(Number(size_id), pool);
    if (!size) {
      throw new AppError('Selected size does not exist', 400);
    }
    finalSizeId = size.id;
    finalSizeName = size.name;
  } else {
    const sizeM = await catalogRepo.findSizeByName('M', pool);
    if (sizeM) {
      finalSizeId = sizeM.id;
      finalSizeName = sizeM.name;
    } else {
      const anySize = await catalogRepo.findAnySize(pool);
      if (anySize) {
        finalSizeId = anySize.id;
        finalSizeName = anySize.name;
      }
    }
  }

  // 3. Check for existing variant with same product + color + size
  const existing = await catalogRepo.findDuplicateVariant(productId, finalColorId, finalSizeId, null, pool);
  if (existing) {
    throw new AppError('A variant with this color and size already exists on this product.', 400);
  }

  // 4. Generate SKU
  let sku = generateSku(product.category_name, product.name, finalColorName, finalSizeName);
  const skuCheck = await catalogRepo.findVariantBySku(sku, null, pool);
  if (skuCheck) {
    sku = `${sku}-${Date.now().toString().slice(-4)}`;
  }

  // 5. Resolve Price Override & Stock
  const priceOverride = price_override !== undefined && price_override !== null && price_override !== ''
    ? Number(price_override)
    : null;
  const stockQty = Math.max(0, Number(stock) || 0);

  // 6. Insert Variant
  const variantId = await catalogRepo.insertProductVariant(
    { productId, sku, colorId: finalColorId, sizeId: finalSizeId, priceOverride },
    pool
  );

  // 7. Insert Inventory
  await catalogRepo.insertInventory({ variantId, quantity: stockQty }, pool);

  // Invalidate Redis cache immediately
  try {
    await redis.del(`product:${productId}`);
    await redis.del('products:q=:cat=');
  } catch (err) {
    console.error('Redis delete error in createVariant:', err.message);
  }
  await enqueueCacheInvalidation('products:*', productId);

  return {
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
  };
}

/**
 * Delete a variant from an existing product.
 */
export async function deleteVariant(variantId) {
  const variant = await catalogRepo.findVariantById(variantId, pool);
  if (!variant) {
    return null;
  }

  const variantCount = await catalogRepo.countVariantsByProductId(variant.product_id, pool);
  if (variantCount <= 1) {
    throw new AppError('Cannot delete the only remaining variant of a product. Products must have at least one variant.', 400);
  }

  await catalogRepo.deleteVariantById(variantId, pool);

  try {
    await redis.del(`product:${variant.product_id}`);
    await redis.del('products:q=:cat=');
  } catch (err) {
    console.error('Redis delete error in deleteVariant:', err.message);
  }
  await enqueueCacheInvalidation('products:*', variant.product_id);

  return { message: 'Variant deleted successfully', variantId };
}

/**
 * Legacy update: update stock across all variants of a product.
 */
export async function updateProductStockLegacy(productId, stock) {
  const product = await catalogRepo.findProductById(productId, false, pool);
  if (!product) {
    return null;
  }

  await catalogRepo.updateStockByProductId(productId, stock, pool);
  await enqueueCacheInvalidation('products:*', productId);

  return { message: 'Stock updated', productId, stock };
}

/**
 * Soft delete product.
 */
export async function deleteProduct(productId) {
  const product = await catalogRepo.findProductById(productId, false, pool);
  if (!product) {
    return null;
  }

  await catalogRepo.softDeleteProductById(productId, pool);
  await enqueueCacheInvalidation('products:*', productId);

  return { message: 'Product deleted successfully' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Facade Cross-Module Domain Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get effective price of a variant.
 */
export async function getVariantPrice(variantId, conn = pool) {
  return await catalogRepo.findVariantPrice(variantId, conn);
}

/**
 * Get base price of a product.
 */
export async function getProductBasePrice(productId, conn = pool) {
  return await catalogRepo.findProductBasePrice(productId, conn);
}

/**
 * Deduct inventory for variant (with SELECT ... FOR UPDATE).
 */
export async function deductInventory(variantId, quantity, conn = pool) {
  const inv = await catalogRepo.findInventoryForUpdate(variantId, conn);
  if (!inv || (inv.quantity - inv.reserved_quantity) < quantity) {
    throw new Error('Insufficient stock');
  }
  await catalogRepo.decrementInventory(variantId, quantity, conn);
}

/**
 * Restore inventory for variant.
 */
export async function restoreInventory(variantId, quantity, conn = pool) {
  await catalogRepo.incrementInventory(variantId, quantity, conn);
}

/**
 * Get available stock for a variant.
 */
export async function getAvailableStock(variantId, conn = pool) {
  return await catalogRepo.findAvailableStock(variantId, conn);
}

/**
 * Fetch all active product summaries for sitemap generation.
 */
export async function getActiveProductSummaries(conn = pool) {
  return await catalogRepo.findActiveProductSummaries(conn);
}
