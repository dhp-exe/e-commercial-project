import jwt from 'jsonwebtoken';
import { AppError } from '../../shared/errors/AppError.js';
import * as ordersService from './service.js';

// ─────────────────────────────────────────────────────────────────────────────
// Cart Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/cart
 */
export async function getCart(req, res) {
  try {
    const result = await ordersService.getCart(req.user.id);
    res.json(result);
  } catch (e) {
    console.error('Fetch cart error:', e);
    res.status(500).json({ message: 'Server error' });
  }
}

/**
 * POST /api/cart/add
 */
export async function addToCart(req, res) {
  const rawVariantId = req.body.variantId ?? req.body.variant_id;
  const variantId = Number(rawVariantId);

  if (!Number.isInteger(variantId) || variantId <= 0) {
    return res.status(400).json({ message: 'Valid variantId is required' });
  }

  const parsedQty = Number(req.body.qty);
  if (!Number.isInteger(parsedQty) || parsedQty <= 0) {
    return res.status(400).json({ message: 'Invalid quantity' });
  }

  try {
    const result = await ordersService.addToCart(req.user.id, variantId, parsedQty);
    res.json(result);
  } catch (error) {
    if (error instanceof AppError) {
      const response = { message: error.message };
      if (error.statusCode === 400 && error.message.includes('items available in stock')) {
        const match = error.message.match(/Only (\d+) items available/);
        if (match) {
          response.available_stock = Number(match[1]);
        }
      }
      return res.status(error.statusCode).json(response);
    }
    console.error('Add to cart error:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

/**
 * POST /api/cart/update
 */
export async function updateCart(req, res) {
  const rawVariantId = req.body.variantId ?? req.body.variant_id;
  const variantId = Number(rawVariantId);

  if (!Number.isInteger(variantId) || variantId <= 0) {
    return res.status(400).json({ message: 'Valid variantId is required' });
  }

  const parsedQty = Number(req.body.qty);
  if (!Number.isInteger(parsedQty)) {
    return res.status(400).json({ message: 'Invalid quantity' });
  }

  try {
    const result = await ordersService.updateCart(req.user.id, variantId, parsedQty);
    res.json(result);
  } catch (error) {
    if (error instanceof AppError) {
      const response = { message: error.message };
      if (error.statusCode === 400 && error.message.includes('items available in stock')) {
        const match = error.message.match(/Only (\d+) items available/);
        if (match) {
          response.available_stock = Number(match[1]);
        }
      }
      return res.status(error.statusCode).json(response);
    }
    console.error('Update cart error:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Order Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Helper to safely extract userId from cookies if present.
 */
function extractUserIdFromCookie(req) {
  const token = req.cookies?.access_token;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      return decoded.id;
    } catch {
      // Proceed as guest
    }
  }
  return null;
}

/**
 * POST /api/orders
 */
export async function createOrder(req, res) {
  const userId = extractUserIdFromCookie(req);
  const { items, deliveryInfo, paymentMethod, note } = req.body;

  try {
    const result = await ordersService.createOrder({
      userId,
      items,
      deliveryInfo,
      paymentMethod,
      note,
    });
    res.json(result);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Order creation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

/**
 * GET /api/orders
 */
export async function getUserOrders(req, res) {
  try {
    const orders = await ordersService.getUserOrders(req.user.id, req.query);
    res.json(orders);
  } catch (error) {
    console.error('Fetch user orders error:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

/**
 * POST /api/orders/create-payment
 */
export async function createPaymentIntent(req, res) {
  const userId = extractUserIdFromCookie(req);

  try {
    const result = await ordersService.createPaymentIntent({
      userId,
      items: req.body.items,
    });
    res.json(result);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Create payment error:', error);
    res.status(500).json({ message: 'Server error creating payment' });
  }
}

/**
 * PUT /api/orders/:id/cancel
 */
export async function cancelOrder(req, res) {
  const userId = req.user.id;
  const orderId = req.params.id;

  try {
    const result = await ordersService.cancelOrder(userId, orderId);
    res.json(result);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Cancel order error:', error);
    res.status(500).json({ message: 'Server error cancelling order' });
  }
}

/**
 * GET /api/orders/admin/all
 */
export async function getAllOrdersAdmin(req, res) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  try {
    const orders = await ordersService.getAllOrdersAdmin(req.query);
    res.json(orders);
  } catch (err) {
    console.error('Admin fetch orders error:', err);
    res.status(500).json({ message: 'Server error fetching orders' });
  }
}

/**
 * PUT /api/orders/:id/status
 */
export async function updateOrderStatus(req, res) {
  const { status: newStatus } = req.body;
  const orderId = req.params.id;

  try {
    const result = await ordersService.updateOrderStatus(orderId, newStatus);
    res.json(result);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Update order status error:', error);
    res.status(500).json({ message: 'Server error updating status' });
  }
}
