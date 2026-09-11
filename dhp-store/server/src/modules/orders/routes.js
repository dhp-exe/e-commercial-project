import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/requireAuth.js';
import { verifyStaff } from '../../shared/middleware/requireRole.js';
import { apiLimiter } from '../../shared/middleware/rateLimit.js';
import * as ordersController from './controller.js';

// ─────────────────────────────────────────────────────────────────────────────
// Cart Router (/api/cart)
// ─────────────────────────────────────────────────────────────────────────────
export const cartRouter = Router();

// GET /api/cart
cartRouter.get('/', requireAuth, ordersController.getCart);

// POST /api/cart/add
cartRouter.post('/add', requireAuth, ordersController.addToCart);

// POST /api/cart/update
cartRouter.post('/update', requireAuth, ordersController.updateCart);

// ─────────────────────────────────────────────────────────────────────────────
// Orders Router (/api/orders)
// ─────────────────────────────────────────────────────────────────────────────
export const ordersRouter = Router();

// POST /api/orders - Create a new order (Guest & User)
ordersRouter.post('/', apiLimiter, ordersController.createOrder);

// GET /api/orders - Get user's orders (paginated)
ordersRouter.get('/', requireAuth, ordersController.getUserOrders);

// POST /api/orders/create-payment - Create Stripe Payment Intent
ordersRouter.post('/create-payment', apiLimiter, ordersController.createPaymentIntent);

// PUT /api/orders/:id/cancel - Cancel an order
ordersRouter.put('/:id/cancel', apiLimiter, requireAuth, ordersController.cancelOrder);

// GET /api/orders/admin/all (Admin/Staff) — paginated
ordersRouter.get('/admin/all', requireAuth, verifyStaff, ordersController.getAllOrdersAdmin);

// PUT /api/orders/:id/status (Admin/Staff)
ordersRouter.put('/:id/status', requireAuth, verifyStaff, ordersController.updateOrderStatus);

export default ordersRouter;
