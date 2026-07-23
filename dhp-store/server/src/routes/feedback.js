import {Router} from 'express';
import {pool} from '../db.js';
import {apiLimiter} from '../middleware/rateLimit.js';
import validator from 'validator';

const router = Router();

// POST /api/feedback - Submit user feedback
router.post('/', apiLimiter, async (req, res) => {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
        return res.status(400).json({ message: 'All fields are required' });
    }
    if (name.length > 100 || email.length > 255 || message.length > 5000) {
        return res.status(400).json({ message: 'Input too long' });
    }
    if (!validator.isEmail(email)) {
        return res.status(400).json({ message: 'Invalid email format' });
    }

    try {
        await pool.execute(
            'INSERT INTO feedback (name, email, message) VALUES (?, ?, ?)',
            [name, email, message]
        );
        res.json({ message: 'Feedback submitted successfully' });
    } 
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;