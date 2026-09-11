const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_HEADER = 'x-csrf-protection';
const CSRF_HEADER_VALUE = '1';

export function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  if (req.path.startsWith('/api/webhooks')) return next();

  if (req.headers[CSRF_HEADER] !== CSRF_HEADER_VALUE) {
    return res.status(403).json({ message: 'CSRF token validation failed' });
  }

  next();
}
