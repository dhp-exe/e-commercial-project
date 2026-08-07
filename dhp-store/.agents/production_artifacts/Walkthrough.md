# Walkthrough: Event-Driven Modular Monolith with BullMQ

> **Agent:** @be · **Date:** 2026-08-07 · **Spec Version:** 1.1 (APPROVED)

---

## Summary

Implemented a complete BullMQ-based job queue system within the DHP Store Express backend, transforming it into an Event-Driven Modular Monolith. Five categories of blocking operations have been offloaded from request handlers into background workers, all running in-process and powered by the existing Redis infrastructure.

---

## New Files Created (11)

### Queue Infrastructure (`server/src/queues/`)

| File | Purpose |
|------|---------|
| [connection.js](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/server/src/queues/connection.js) | Shared IORedis config parsed from `REDIS_URL` |
| [emailQueue.js](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/server/src/queues/emailQueue.js) | Email queue (3 attempts, exponential 5s backoff) |
| [aiRefreshQueue.js](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/server/src/queues/aiRefreshQueue.js) | AI refresh queue (2 attempts, fixed 10s backoff) |
| [cacheQueue.js](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/server/src/queues/cacheQueue.js) | Cache invalidation queue (2 attempts, fixed 2s backoff) |
| [stripeQueue.js](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/server/src/queues/stripeQueue.js) | Stripe webhook queue (5 attempts, exponential 3s backoff) |
| [cartCleanupQueue.js](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/server/src/queues/cartCleanupQueue.js) | Abandoned cart cron queue (Monday 00:00 UTC, static `jobId`) |

### Workers (`server/src/workers/`)

| File | Purpose |
|------|---------|
| [emailWorker.js](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/server/src/workers/emailWorker.js) | Sends order-confirmation and password-reset emails via Nodemailer |
| [aiRefreshWorker.js](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/server/src/workers/aiRefreshWorker.js) | POST to Python AI service `/refresh` endpoint |
| [cacheWorker.js](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/server/src/workers/cacheWorker.js) | Redis SCAN loop for cache key deletion |
| [stripeWorker.js](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/server/src/workers/stripeWorker.js) | Payment reconciliation (sets order → `confirmed`) |
| [cartCleanupWorker.js](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/server/src/workers/cartCleanupWorker.js) | Soft-deletes abandoned carts older than 30 days |

### Routes & Utilities

| File | Purpose |
|------|---------|
| [webhooks.js](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/server/src/routes/webhooks.js) | Stripe webhook endpoint (raw body, signature verification, immediate 200 OK) |
| [mailer.js](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/server/src/utils/mailer.js) | Shared Nodemailer transporter (extracted from auth.js) |

---

## Modified Files (6)

### [index.js](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/server/src/index.js)
- Imported all 5 workers and 5 queues
- Registered `/api/webhooks/stripe` **before** `express.json()` (raw body requirement)
- Scheduled cart cleanup cron via `scheduleCartCleanup()`
- Added `SIGTERM`/`SIGINT` graceful shutdown: drains workers → closes queues → closes HTTP server

### [orders.js](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/server/src/routes/orders.js)
- Added `emailQueue` import and `Sentry` import
- After `connection.commit()`, enqueues `order-confirmation` email **only if `deliveryInfo.email` exists**
- Wrapped in try/catch with Sentry reporting for graceful degradation

### [auth.js](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/server/src/routes/auth.js)
- Removed inline `nodemailer` import, `transporter`, and `sendEmail()` function
- Added `emailQueue` import
- `POST /forgot-password`: Replaced fire-and-forget `sendEmail().catch()` with `emailQueue.add('password-reset', ...)`

### [products.js](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/server/src/routes/products.js)
- Removed `clearProductCaches()` function entirely (21 lines)
- Added `cacheQueue` import
- All 3 mutation routes (`POST /`, `PUT /:id/stock`, `DELETE /:id`) now enqueue `cache-invalidate` jobs instead of blocking on SCAN

### [recommendations.js](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/server/src/routes/recommendations.js)
- Added `verifyAdmin`, `apiLimiter`, `Sentry`, and `aiRefreshQueue` imports
- New endpoint: `POST /api/recommend/refresh` (admin-only, rate-limited) — enqueues AI model refresh

### [config.js](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/server/src/config.js)
- Added optional warning for missing `STRIPE_WEBHOOK_SECRET`

---

## New Dependency

```diff
+ "bullmq": "^5.x.x"   (+ ioredis bundled)
```

## New Environment Variable

```
STRIPE_WEBHOOK_SECRET=whsec_...   # Required for Stripe webhook verification
```

---

## Verification Results

| Check | Result |
|-------|--------|
| `npm run lint` | ✅ 0 errors, 9 warnings (all pre-existing) |
| New files follow ESM pattern | ✅ All use `import/export` |
| Graceful degradation maintained | ✅ All `.add()` calls wrapped in try/catch |
| No API response shapes changed | ✅ Verified all modified routes |
| Webhook raw body before JSON parser | ✅ Registered before `express.json()` in index.js |
| Static jobId for repeatable cron | ✅ `'cart-cleanup-weekly'` in cartCleanupQueue.js |
| Graceful shutdown handlers | ✅ SIGTERM/SIGINT close workers → queues → server |

---

## Architecture After

```
┌─────────────────────────────────────────────────────────┐
│                   Express Server (index.js)             │
│                                                         │
│  Routes                          Workers (in-process)   │
│  ┌──────────┐   .add()   ┌─────────────────────────┐   │
│  │ orders   │───────────▶│ emailWorker             │   │
│  │ auth     │───────────▶│                         │   │
│  │ products │───────────▶│ cacheWorker             │   │
│  │ recommend│───────────▶│ aiRefreshWorker         │   │
│  │ webhooks │───────────▶│ stripeWorker            │   │
│  └──────────┘            │ cartCleanupWorker (cron)│   │
│                          └────────────┬────────────┘   │
│                                       │                 │
│  ┌────────────────────────────────────┴───────────┐    │
│  │              Redis (BullMQ + Cache)             │    │
│  │  bull:email:*  bull:cache-invalidate:*           │    │
│  │  products:*    product:*    recs:*               │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```
