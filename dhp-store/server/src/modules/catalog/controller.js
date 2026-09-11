import { AppError } from '../../shared/errors/AppError.js';
import * as catalogService from './service.js';

/**
 * GET /api/products
 */
export async function getProducts(req, res) {
  try {
    const { q, categoryId, _t } = req.query;

    if (_t) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
    }

    const products = await catalogService.getProducts({
      q,
      categoryId,
      bypassCache: Boolean(_t),
    });

    res.json(products);
  } catch (e) {
    console.error('Fetch products error:', e);
    res.status(500).json({ message: 'Server error' });
  }
}

/**
 * POST /api/products/batch
 */
export async function getBatchProducts(req, res) {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.json([]);
  }
  if (ids.length > 50) {
    return res.status(400).json({ message: 'Exceeded maximum batch size of 50' });
  }

  try {
    const products = await catalogService.getProductsByIds(ids);
    res.json(products);
  } catch (error) {
    console.error('Batch fetch error:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

/**
 * GET /api/products/categories
 */
export async function getCategories(_req, res) {
  try {
    const rows = await catalogService.getCategories();
    res.json(rows);
  } catch (e) {
    console.error('Fetch categories error:', e);
    res.status(500).json({ message: 'Server error' });
  }
}

/**
 * GET /api/products/colors
 */
export async function getColors(_req, res) {
  try {
    const rows = await catalogService.getColors();
    res.json(rows);
  } catch (e) {
    console.error('Fetch colors error:', e);
    res.status(500).json({ message: 'Server error fetching colors' });
  }
}

/**
 * GET /api/products/:id
 */
export async function getProductById(req, res) {
  const { id } = req.params;
  try {
    const product = await catalogService.getProductById(id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    console.error('Fetch product by id error:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

/**
 * POST /api/products
 */
export async function createProduct(req, res) {
  let data = req.body;
  if (typeof req.body.data === 'string') {
    try {
      data = JSON.parse(req.body.data);
    } catch {
      return res.status(400).json({ message: 'Invalid JSON in data field' });
    }
  }

  try {
    const product = await catalogService.createProduct(data, req.files || []);
    res.status(201).json(product);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Create product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

/**
 * PUT /api/products/variants/:variantId/inventory
 */
export async function updateVariantInventory(req, res) {
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
    const result = await catalogService.updateVariantInventory(variantId, parsedStock);
    if (!result) {
      return res.status(404).json({ message: 'Variant not found' });
    }
    res.json(result);
  } catch (error) {
    console.error('Update variant inventory error:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

/**
 * PUT /api/products/variants/:variantId
 */
export async function updateVariant(req, res) {
  const variantId = Number(req.params.variantId);

  if (Number.isNaN(variantId) || variantId <= 0) {
    return res.status(400).json({ message: 'Invalid variant ID' });
  }

  try {
    const result = await catalogService.updateVariant(variantId, req.body);
    if (!result) {
      return res.status(404).json({ message: 'Variant not found' });
    }
    res.json(result);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Update variant error:', error);
    res.status(500).json({ message: 'Server error updating variant' });
  }
}

/**
 * POST /api/products/:id/variants
 */
export async function createVariant(req, res) {
  const productId = Number(req.params.id);

  if (Number.isNaN(productId) || productId <= 0) {
    return res.status(400).json({ message: 'Invalid product ID' });
  }

  try {
    const result = await catalogService.createVariant(productId, req.body);
    if (!result) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Create variant error:', error);
    res.status(500).json({ message: 'Server error creating variant' });
  }
}

/**
 * DELETE /api/products/variants/:variantId
 */
export async function deleteVariant(req, res) {
  const variantId = Number(req.params.variantId);

  if (Number.isNaN(variantId) || variantId <= 0) {
    return res.status(400).json({ message: 'Invalid variant ID' });
  }

  try {
    const result = await catalogService.deleteVariant(variantId);
    if (!result) {
      return res.status(404).json({ message: 'Variant not found' });
    }
    res.json(result);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Delete variant error:', error);
    res.status(500).json({ message: 'Server error deleting variant' });
  }
}

/**
 * PUT /api/products/:id/stock
 */
export async function updateProductStockLegacy(req, res) {
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
    const result = await catalogService.updateProductStockLegacy(productId, parsedStock);
    if (!result) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json(result);
  } catch (error) {
    console.error('Legacy stock update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

/**
 * DELETE /api/products/:id
 */
export async function deleteProduct(req, res) {
  const productId = Number(req.params.id);

  if (Number.isNaN(productId) || productId <= 0) {
    return res.status(400).json({ message: 'Invalid product id' });
  }

  try {
    const result = await catalogService.deleteProduct(productId);
    if (!result) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.status(200).json(result);
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
}
