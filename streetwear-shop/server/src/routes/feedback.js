import {Router} from 'express';
import {pool} from '../db.js';

const router = Router();

// POST /api/feedback - Submit user feedback
router.post('/', async (req, res) => {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
        return res.status(400).json({ message: 'All fields are required' });
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