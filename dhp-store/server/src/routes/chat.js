import { Router } from 'express';
import axios from 'axios';

const router = Router();
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:10000';

// Shared AI HTTP client with timeout
const aiClient = axios.create({
  baseURL: AI_SERVICE_URL,
  timeout: 10000, // 10 second timeout
});

// POST /chat
router.post('/', async (req, res) => {
  try {
    const { message } = req.body;
    
    // Forward to Python
    const aiResponse = await aiClient.post('/chat', { message });
    
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