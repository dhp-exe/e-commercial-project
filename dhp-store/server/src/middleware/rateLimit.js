import rateLimit from 'express-rate-limit';

// Global (very loose)
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 1000, 
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests from this IP' }
});

// API routes (medium)
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many API requests' }
});

// Auth routes (strict)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: {
    message: 'Too many auth attempts. Try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});