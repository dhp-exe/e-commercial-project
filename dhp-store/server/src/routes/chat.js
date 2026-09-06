import { Router } from 'express';
import axios from 'axios';
import { apiLimiter } from '../middleware/rateLimit.js';

const router = Router();
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:10000';

// Shared AI HTTP client with timeout
const aiClient = axios.create({
  baseURL: AI_SERVICE_URL,
  timeout: 10000, // 10 second timeout
});

const MAX_MESSAGE_LENGTH = 2000;

// POST /chat — rate-limited and input-validated
router.post('/', apiLimiter, async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ reply: 'Please enter a message.' });
    }

    const trimmed = message.trim();
    if (trimmed.length === 0) {
      return res.status(400).json({ reply: 'Please enter a message.' });
    }
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        reply: `Message is too long. Maximum ${MAX_MESSAGE_LENGTH} characters.`
      });
    }

    // Forward validated input to Python AI service
    const aiResponse = await aiClient.post('/chat', { message: trimmed });
    
    res.json({ reply: aiResponse.data.reply });

  } catch (error) {
    if (error.response) {
        console.error("Chat Error Status:", error.response.status);
        console.error("Chat Error Data:", error.response.data);
    } 
    else {
        console.error("Chat Error:", error.message);
    }
    res.json({ reply: "I'm sorry, I can't connect to the server right now.", status: 'error' });
  }
});

export default router;