import crypto from 'crypto';

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit cookie CSRF protection.
 *
 * 1. On every response, set a non-HttpOnly CSRF cookie with a random token.
 * 2. On state-changing requests (POST/PUT/DELETE), verify that the
 *    X-CSRF-Token header matches the cookie value.
 *
 * This works because:
 * - An attacker can cause the browser to SEND cookies, but cannot READ them
 *   (due to SameSite/CORS) to set the matching header.
 */
export function csrfProtection(req, res, next) {
  // Always ensure a CSRF cookie exists
  if (!req.cookies[CSRF_COOKIE]) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false, // Must be readable by JavaScript
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      path: '/',
      maxAge: 60 * 60 * 1000, // 1 hour, matches access_token
    });
    // Also set it on the request object for immediate use within this request
    req.cookies[CSRF_COOKIE] = token;
  }

  // Skip validation for safe (read-only) methods
  if (SAFE_METHODS.has(req.method)) return next();

  // Skip for Stripe webhooks (they use signature verification instead)
  if (req.path.startsWith('/api/webhooks')) return next();

  const cookieToken = req.cookies[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ message: 'CSRF token validation failed' });
  }

  next();
}
