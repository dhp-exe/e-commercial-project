import { Router } from 'express';
import axios from 'axios';

const router = Router();
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:10000';

// POST /chat
router.post('/', async (req, res) => {
  try {
    const { message } = req.body;
    
    // Forward to Python
    const aiResponse = await axios.post(`${AI_SERVICE_URL}/chat`, { message });
    
    res.json({ reply: aiResponse.data.reply });

  } catch (error) {
    console.error("Chat Error:", error.message);
    res.json({ reply: "I'm sorry, I can't connect to the server right now." });
  }
});

export default router;