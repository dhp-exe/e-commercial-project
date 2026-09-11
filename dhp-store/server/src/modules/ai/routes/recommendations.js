import { Router } from 'express';
import * as Sentry from '@sentry/node';
import { requireAuth } from '../../../shared/middleware/requireAuth.js';
import { verifyAdmin } from '../../../shared/middleware/requireRole.js';
import { apiLimiter } from '../../../shared/middleware/rateLimit.js';
import * as aiService from '../service.js';

const router = Router();

// GET /api/recommend/product/:id (For "Similar Products" section)
router.get('/product/:id', async (req, res) => {
  try {
    const products = await aiService.getSimilarProducts(req.params.id);
    res.json(products);
  } catch (error) {
    console.error('AI Service Error:', error.message);
    res.json([]);
  }
});

// GET /api/recommend/user (For "Recommended for You" section)
router.get('/user', requireAuth, async (req, res) => {
  try {
    const products = await aiService.getUserRecommendations(req.user.id);
    res.json(products);
  } catch (error) {
    console.error('Recommendation error:', error.message);
    // Graceful degradation: return empty array instead of 500
    res.json([]);
  }
});

// POST /api/recommend/refresh — Trigger AI model refresh (admin only)
router.post('/refresh', requireAuth, verifyAdmin, apiLimiter, async (_req, res) => {
  try {
    const result = await aiService.triggerModelRefresh();
    res.json(result);
  } catch (err) {
    console.error('Failed to enqueue AI refresh:', err.message);
    Sentry.captureException(err, { tags: { queue: 'ai-refresh' } });
    res.status(500).json({ message: 'Failed to queue AI refresh' });
  }
});

export default router;
