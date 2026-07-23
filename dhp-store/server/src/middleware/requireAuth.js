import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import redis from '../cache/redis.js';
import dotenv from 'dotenv';
dotenv.config();

export const requireAuth = async (req, res, next) => {
  const token = req.cookies?.access_token || req.cookies?.token;
  if (!token) return res.status(401).json({ message: 'No token, authorization denied' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const cacheKey = `user:${payload.id}`;
    let user = null;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        user = JSON.parse(cached);
      }
    } catch (err) {
      // Redis unavailable, fallback to DB
    }

    if (!user) {
      const [rows] = await pool.execute(
        'SELECT id, email, role FROM users WHERE id = ?',
        [payload.id]
      );
      if (rows.length === 0) return res.status(401).json({ message: 'User no longer exists' });
      
      user = rows[0];
      try {
        await redis.set(cacheKey, JSON.stringify(user), { EX: 60 });
      } catch (err) {
        // Ignore cache set error
      }
    }

    req.user = user;
    next();
  } catch (err) {
    res.clearCookie('access_token'); 
    res.status(401).json({ message: 'Token is not valid' });
  }
};