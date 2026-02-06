import rateLimit from 'express-rate-limit';

// Global (very loose)
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 1000,               // per IP
  standardHeaders: true,
  legacyHeaders: false
});
// API routes (medium)
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false
});
// Auth routes (strict)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // login/register attempts
  message: {
    message: 'Too many auth attempts. Try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

