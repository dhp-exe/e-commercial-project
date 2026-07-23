import './config.js'; // env validation — must be first
import express from 'express';
import cors from 'cors';
import auth from './routes/auth.js';
import products from './routes/products.js';
import cart from './routes/cart.js';
import orders from './routes/orders.js';
import feedback from './routes/feedback.js';
import recommendations from './routes/recommendations.js';
import chat from './routes/chat.js';
import path from 'path';
import cookieParser from 'cookie-parser';
import { globalLimiter } from './middleware/rateLimit.js';
import helmet from 'helmet';
import morgan from 'morgan';

const app = express();
app.set('trust proxy', 1);

// ── Security Headers (Helmet) ───────────────────────────────────────
const cspConnectSrc = [
  "'self'",
  ...(process.env.CSP_CONNECT_SRC || '').split(',').filter(Boolean),
];
const cspScriptSrc = ["'self'", 'https://js.stripe.com'];
const cspFrameSrc = [
  "'self'",
  'https://js.stripe.com',
  'https://www.google.com',
  'https://maps.google.com',
];

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: cspScriptSrc,
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:', 'http:', 'blob:'],
        connectSrc: cspConnectSrc,
        frameSrc: cspFrameSrc,
      },
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// ── Logging & Global Rate Limiting ──────────────────────────────────
app.use(morgan('common'));
app.use(globalLimiter);
app.use(cookieParser());

// ── CORS (environment-driven) ───────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim());

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests with no origin (mobile apps, server-to-server, curl)
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json());

// ── Static Files (user uploads only) ────────────────────────────────
app.use('/uploads', express.static(path.join(process.cwd(), 'src', 'uploads')));

// ── API Routes ──────────────────────────────────────────────────────
app.use('/api/auth', auth);
app.use('/api/products', products);
app.use('/api/cart', cart);
app.use('/api/orders', orders);
app.use('/api/feedback', feedback);
app.use('/api/recommend', recommendations);
app.use('/api/chat', chat);
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ── API 404 Fallback ────────────────────────────────────────────────
app.use('/api', (_req, res) => {
  res.status(404).json({ message: 'API route not found' });
});

// ── Root (for health probes in Docker / Render) ─────────────────────
app.get('/', (_req, res) => {
  res.json({ status: 'DHP Store API running' });
});

// ── Centralized Error Handler ───────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`, err);

  // Don't leak internal details in production
  const message =
    process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message;

  res.status(err.status || 500).json({ message });
});

// ── Start Server ────────────────────────────────────────────────────
app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});