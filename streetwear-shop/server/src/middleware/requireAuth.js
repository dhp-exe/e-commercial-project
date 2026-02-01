import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

export function requireAuth(req, res, next) {
  const token = req.cookies?.access_token;

  if (!token) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } 
  catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}