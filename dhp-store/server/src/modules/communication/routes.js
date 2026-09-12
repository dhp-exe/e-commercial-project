import { Router } from 'express';
import { apiLimiter } from '../../shared/middleware/rateLimit.js';
import { handleFeedbackSubmit } from './controller.js';

const router = Router();

// POST /api/feedback - Submit user feedback
router.post('/', apiLimiter, handleFeedbackSubmit);

export default router;
