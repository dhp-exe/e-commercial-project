import { Router } from 'express';
import { apiLimiter } from '../../../shared/middleware/rateLimit.js';
import { AppError } from '../../../shared/errors/AppError.js';
import * as aiService from '../service.js';

const router = Router();

// POST /api/chat — rate-limited and input-validated
router.post('/', apiLimiter, async (req, res) => {
  try {
    const { message } = req.body;
    const result = await aiService.chatWithAI(message);
    res.json(result);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ reply: error.message });
    }
    console.error('Chat Error:', error.message);
    res.json({ reply: "I'm sorry, I can't connect to the server right now.", status: 'error' });
  }
});

export default router;
