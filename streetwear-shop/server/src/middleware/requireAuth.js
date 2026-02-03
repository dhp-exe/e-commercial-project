import jwt from 'jsonwebtoken';
import { pool } from '../db.js'; 
import dotenv from 'dotenv';
dotenv.config();

export async function requireAuth(req, res, next) {
  const token = req.cookies?.access_token || req.cookies?.token;

  if (!token) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const [rows] = await pool.execute(
      'SELECT id, email, role FROM users WHERE id = ?',
      [payload.id]
    );

    const user = rows[0];

    if (!user) {
      return res.status(401).json({ message: 'User no longer exists' });
    }

    req.user = user; 
    next();
  } 
  catch (error) {
    res.clearCookie('access_token'); 
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}