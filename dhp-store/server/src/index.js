import './config.js'; // env validation — must be first
import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
  });
}

import express from 'express';
import cors from 'cors';
import auth from './routes/auth.js';
import products from './routes/products.js';
import cart from './routes/cart.js';
import orders from './routes/orders.js';
import feedback from './routes/feedback.js';
import recommendations from './routes/recommendations.js';
import chat from './routes/chat.js';
import webhooks from './routes/webhooks.js';
import sitemap from './routes/sitemap.js';
import path from 'path';
import cookieParser from 'cookie-parser';
import { globalLimiter } from './middleware/rateLimit.js';
import { requireAuth } from './middleware/requireAuth.js';
import { verifyAdmin } from './middleware/requireRole.js';
import helmet from 'helmet';
import morgan from 'morgan';

// ── Bull Board ──────────────────────────────────────────────────────
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

// ── BullMQ Workers & Queues ─────────────────────────────────────────
import emailWorker from './workers/emailWorker.js';
import aiRefreshWorker from './workers/aiRefreshWorker.js';
import cacheWorker from './workers/cacheWorker.js';
import stripeWorker from './workers/stripeWorker.js';
import cartCleanupWorker from './workers/cartCleanupWorker.js';
import { emailQueue } from './queues/emailQueue.js';
import { aiRefreshQueue } from './queues/aiRefreshQueue.js';
import { cacheQueue } from './queues/cacheQueue.js';
import { stripeQueue } from './queues/stripeQueue.js';
import { cartCleanupQueue, scheduleCartCleanup } from './queues/cartCleanupQueue.js';

const app = express();
app.set('trust proxy', 1);

// ── Initialize Bull Board ───────────────────────────────────────────
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullMQAdapter(emailQueue),
    new BullMQAdapter(aiRefreshQueue),
    new BullMQAdapter(cacheQueue),
    new BullMQAdapter(stripeQueue),
    new BullMQAdapter(cartCleanupQueue),
  ],
  serverAdapter: serverAdapter,
});

// ── Security Headers (Helmet) ───────────────────────────────────────
const cspConnectSrc = [
  "'self'",
  ...(process.env.CSP_CONNECT_SRC || '').split(',').filter(Boolean),
];
const cspScriptSrc = ["'self'", 'https://js.stripe.com', 'https://accounts.google.com'];
const cspFrameSrc = [
  "'self'",
  'https://js.stripe.com',
  'https://www.google.com',
  'https://maps.google.com',
  'https://accounts.google.com',
];

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: cspScriptSrc,
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://accounts.google.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:', 'http:', 'blob:'],
        connectSrc: cspConnectSrc.concat(['https://accounts.google.com']),
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

// ── Stripe Webhook (raw body — MUST be before express.json()) ───────
app.use('/api/webhooks/stripe', webhooks);

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

// ── SEO ────────────────────────────────────────────────────────────────────
app.use('/sitemap.xml', sitemap);

// ── Admin Dashboard ─────────────────────────────────────────────────
app.use('/admin/queues', requireAuth, verifyAdmin, serverAdapter.getRouter());

app.get("/debug-sentry", function triggerError(req, res) {
  throw new Error("Sentry verification test error!");
});

// ── API 404 Fallback ────────────────────────────────────────────────
app.use('/api', (_req, res) => {
  res.status(404).json({ message: 'API route not found' });
});

// ── Root (for health probes in Docker / Render) ─────────────────────
app.get('/', (_req, res) => {
  res.json({ status: 'DHP Store API running' });
});

// ── Centralized Error Handler ───────────────────────────────────────
Sentry.setupExpressErrorHandler(app);

app.use((err, req, res, _next) => {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`, err);

  const message =
    process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message;

  res.status(err.status || 500).json({ message });
});

// ── Start Server + Workers ──────────────────────────────────────────────────
const server = app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);

  // Schedule the weekly abandoned cart cleanup cron
  scheduleCartCleanup();

  console.log('BullMQ workers started: email, ai-refresh, cache, stripe, cart-cleanup');
});

// ── Graceful Shutdown (SIGTERM/SIGINT) ─────────────────────────────────
const workers = [emailWorker, aiRefreshWorker, cacheWorker, stripeWorker, cartCleanupWorker];
const queues = [emailQueue, aiRefreshQueue, cacheQueue, stripeQueue, cartCleanupQueue];

async function gracefulShutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully...`);

  // Drain all workers (finish in-progress jobs)
  await Promise.all(workers.map((w) => w.close()));
  console.log('All workers closed.');

  // Close all queue connections
  await Promise.all(queues.map((q) => q.close()));
  console.log('All queues closed.');

  // Close HTTP server
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));