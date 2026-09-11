import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/requireAuth.js';
import { verifyStaff, verifyAdmin } from '../../shared/middleware/requireRole.js';
import upload from '../../shared/middleware/upload.js';
import * as catalogController from './controller.js';

const router = Router();

// GET /api/products
router.get('/', catalogController.getProducts);

// POST /api/products/batch - Fetch multiple products by ID
router.post('/batch', catalogController.getBatchProducts);

// GET /api/products/categories
router.get('/categories', catalogController.getCategories);

// GET /api/products/colors - Get all colors for variant configuration
router.get('/colors', catalogController.getColors);

// GET /api/products/:id - Get a single product by ID
router.get('/:id', catalogController.getProductById);

// POST /api/products - Create a new product with variants and images (admin only)
router.post(
  '/',
  requireAuth,
  verifyAdmin,
  upload.array('images', 10),
  catalogController.createProduct
);

// PUT /api/products/variants/:variantId/inventory - Update variant stock (staff and admin)
router.put(
  '/variants/:variantId/inventory',
  requireAuth,
  verifyStaff,
  catalogController.updateVariantInventory
);

// PUT /api/products/variants/:variantId - Update variant price, color, and stock (staff and admin)
router.put(
  '/variants/:variantId',
  requireAuth,
  verifyStaff,
  catalogController.updateVariant
);

// POST /api/products/:id/variants - Add a new variant to an existing product (staff and admin)
router.post(
  '/:id/variants',
  requireAuth,
  verifyStaff,
  catalogController.createVariant
);

// DELETE /api/products/variants/:variantId - Delete a variant from an existing product (staff and admin)
router.delete(
  '/variants/:variantId',
  requireAuth,
  verifyStaff,
  catalogController.deleteVariant
);

// PUT /api/products/:id/stock - Legacy endpoint updating stock across all variants (staff/admin)
router.put(
  '/:id/stock',
  requireAuth,
  verifyStaff,
  catalogController.updateProductStockLegacy
);

// DELETE /api/products/:id - Delete a product (admin only)
router.delete(
  '/:id',
  requireAuth,
  verifyAdmin,
  catalogController.deleteProduct
);

export default router;
