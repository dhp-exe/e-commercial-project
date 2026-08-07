# Technical Specification: Event-Driven Modular Monolith with BullMQ

> **Author:** @pm · **Status:** ✅ APPROVED · **Version:** 1.1
> **Date:** 2026-08-07 · **Approved:** 2026-08-07

---

## 1. Overview

The DHP Store Express backend currently performs several heavy, blocking operations synchronously inside request handlers: sending emails via Nodemailer, triggering Python AI model refreshes, running Redis `SCAN` loops for cache invalidation, and (planned) processing Stripe webhooks. These operations increase response latency, risk timeouts, and violate the single-responsibility principle of request handlers.

This specification introduces an **Event-Driven Modular Monolith** architecture by integrating [BullMQ](https://docs.bullmq.io/) — a Redis-backed job queue — into the existing Express server. Five categories of work will be offloaded from the request path into background workers:

| # | Job Type | Current State | Target State |
|---|----------|---------------|--------------|
| 1 | **Order Confirmation Emails** | No email sent on checkout | Enqueue `email` job → Worker sends via Nodemailer |
| 2 | **Password Reset Emails** | `sendEmail()` fire-and-forget (untracked) | Enqueue `email` job → Worker sends with retry |
| 3 | **AI Model Refresh** | Not exposed from Express (only Python-side) | Enqueue `ai-refresh` job → Worker calls Python `/refresh` |
| 4 | **Cache Invalidation** | Inline `SCAN` loop blocks the request thread | Enqueue `cache-invalidate` job → Worker runs `SCAN` loop |
| 5 | **Stripe Webhook Processing** | No webhook handler exists | Immediate `200 OK` → Enqueue payload → Worker reconciles DB |
| 6 | **Abandoned Cart Cleanup** | Not implemented | Cron-scheduled repeatable job → Weekly `DELETE` on stale carts |

**Key Constraint:** BullMQ reuses the **same Redis instance** (`REDIS_URL`) already deployed in Docker Compose. No new infrastructure services are added.

---

## 2. User Stories

- **As a customer**, I want my order confirmation email delivered reliably even if the mail server is slow, so that my checkout experience is instant.
- **As a customer**, I want my password reset email to retry automatically if the first attempt fails, so that I'm not left without access to my account.
- **As an admin**, I want to trigger an AI model refresh without waiting for the Python service to finish, so that the admin panel stays responsive.
- **As an admin**, I want product CRUD operations to respond instantly, with cache invalidation happening in the background, so that the admin experience is snappy.
- **As the system**, I want Stripe webhooks acknowledged within the 3-second timeout, with reconciliation happening asynchronously, so that Stripe doesn't retry unnecessarily.
- **As the system**, I want abandoned carts automatically cleaned up every week, so that the database doesn't accumulate stale data.

---

## 3. Technical Design

### 3.1 Frontend Changes

**None.** This is a backend-only architectural refactor. No frontend routes, components, hooks, or API contracts change. All existing API response shapes remain identical.

### 3.2 Backend Changes — Directory Structure

The following new directories and files will be created inside `server/src/`:

```
server/src/
├── queues/                          # Queue definitions (producers)
│   ├── connection.js                # Shared BullMQ IORedis connection
│   ├── emailQueue.js                # Email job queue
│   ├── aiRefreshQueue.js            # AI model refresh queue
│   ├── cacheQueue.js                # Cache invalidation queue
│   ├── stripeQueue.js               # Stripe webhook processing queue
│   └── cartCleanupQueue.js          # Abandoned cart cron queue
│
├── workers/                         # Job processors (consumers)
│   ├── emailWorker.js               # Processes email jobs
│   ├── aiRefreshWorker.js           # Calls Python /refresh endpoint
│   ├── cacheWorker.js               # Runs Redis SCAN invalidation
│   ├── stripeWorker.js              # Reconciles Stripe payments in DB
│   └── cartCleanupWorker.js         # Deletes abandoned carts
│
├── cache/
│   └── redis.js                     # (EXISTING — unchanged)
│
├── routes/
│   ├── auth.js                      # (MODIFIED — enqueue password reset email)
│   ├── orders.js                    # (MODIFIED — enqueue order confirmation email)
│   ├── products.js                  # (MODIFIED — enqueue cache invalidation)
│   ├── recommendations.js           # (MODIFIED — add POST /refresh via queue)
│   └── webhooks.js                  # (NEW — Stripe webhook route)
│   └── ...
│
└── index.js                         # (MODIFIED — register webhook route, start workers)
```

### 3.3 BullMQ Connection (Shared IORedis Instance)

BullMQ requires an **IORedis-compatible** connection, not the `redis` (node-redis) client we currently use for caching. A dedicated connection factory will parse the existing `REDIS_URL` environment variable.

**File:** `server/src/queues/connection.js`

```js
// Parse REDIS_URL (e.g., "redis://redis:6379") into IORedis-compatible config.
// BullMQ manages its own connection pool internally.
export const connectionConfig = {
  host,       // extracted from REDIS_URL
  port,       // extracted from REDIS_URL
  maxRetriesPerRequest: null,   // required by BullMQ
};
```

> **Why a separate connection?** BullMQ uses IORedis internally, while our caching layer uses `redis` (node-redis v5). They cannot share the same client. Both connect to the same Redis server — they just use different driver libraries.

### 3.4 Queue Definitions (Producers)

Each queue is a thin module that exports a named `Queue` instance. Route handlers import these queues and call `.add()` to enqueue jobs.

#### 3.4.1 Email Queue

**File:** `server/src/queues/emailQueue.js`

```
Queue Name: "email"
Job Schema: { type: 'email', to: string, template: 'order-confirmation' | 'password-reset', data: object }
```

| Field | Type | Description |
|-------|------|-------------|
| `to` | `string` | Recipient email address |
| `template` | `string` | Template identifier (`order-confirmation`, `password-reset`) |
| `data` | `object` | Template-specific payload (e.g., `{ orderId, resetLink }`) |

**Default Job Options:**
- `attempts: 3`
- `backoff: { type: 'exponential', delay: 5000 }` (5s → 10s → 20s)
- `removeOnComplete: { count: 500 }` (keep last 500 completed for debugging)
- `removeOnFail: { count: 1000 }` (keep last 1000 failed for inspection)

#### 3.4.2 AI Refresh Queue

**File:** `server/src/queues/aiRefreshQueue.js`

```
Queue Name: "ai-refresh"
Job Schema: { type: 'ai-refresh' }
```

**Default Job Options:**
- `attempts: 2`
- `backoff: { type: 'fixed', delay: 10000 }` (10s between retries)
- `removeOnComplete: { count: 50 }`
- `removeOnFail: { count: 100 }`

> **Note:** The Python AI service already handles `/refresh` as a background task internally. The BullMQ worker simply triggers the HTTP call — the actual ML computation is handled by FastAPI's `BackgroundTasks`.

#### 3.4.3 Cache Invalidation Queue

**File:** `server/src/queues/cacheQueue.js`

```
Queue Name: "cache-invalidate"
Job Schema: { type: 'cache-invalidate', pattern: string, productId?: number }
```

| Field | Type | Description |
|-------|------|-------------|
| `pattern` | `string` | Redis key glob pattern (e.g., `products:*`) |
| `productId` | `number?` | Optional specific product key to delete first |

**Default Job Options:**
- `attempts: 2`
- `backoff: { type: 'fixed', delay: 2000 }`
- `removeOnComplete: { count: 200 }`
- `removeOnFail: { count: 200 }`

#### 3.4.4 Stripe Webhook Queue

**File:** `server/src/queues/stripeQueue.js`

```
Queue Name: "stripe-webhook"
Job Schema: { type: 'stripe-webhook', eventType: string, payload: object }
```

| Field | Type | Description |
|-------|------|-------------|
| `eventType` | `string` | Stripe event type (e.g., `payment_intent.succeeded`) |
| `payload` | `object` | Full verified Stripe event object |

**Default Job Options:**
- `attempts: 5`
- `backoff: { type: 'exponential', delay: 3000 }` (3s → 6s → 12s → 24s → 48s)
- `removeOnComplete: { count: 1000 }`
- `removeOnFail: { count: 2000 }`

> **Why more retries?** Payment reconciliation is critical. Failed jobs should be retried aggressively before requiring manual intervention.

#### 3.4.5 Abandoned Cart Cleanup Queue

**File:** `server/src/queues/cartCleanupQueue.js`

```
Queue Name: "cart-cleanup"
Job Schema: { type: 'cart-cleanup' }
Repeat: { pattern: '0 0 * * 1', jobId: 'cart-cleanup-weekly' }   // Every Monday at 00:00 UTC
```

> ⚠️ **Static `jobId`:** The repeatable job uses a fixed `jobId: 'cart-cleanup-weekly'` to prevent BullMQ from registering duplicate cron schedulers on server restart. Without this, each restart would add a new repeatable entry.

**Default Job Options:**
- `attempts: 3`
- `backoff: { type: 'exponential', delay: 60000 }` (1 min → 2 min → 4 min)
- `removeOnComplete: { count: 52 }` (keep ~1 year of weekly runs)
- `removeOnFail: { count: 52 }`

---

### 3.5 Worker Definitions (Consumers)

Each worker is a module that exports a `Worker` instance. Workers are started in `index.js` alongside the Express server.

> **Lifecycle:** All workers are collected into an array at startup. On `SIGTERM`/`SIGINT`, the graceful shutdown handler (§3.6) closes them before the process exits.

#### 3.5.1 Email Worker

**File:** `server/src/workers/emailWorker.js`

**Logic:**
1. Read `job.data.template` to determine which email to send
2. Build HTML content based on template type:
   - `order-confirmation` → Uses `data.orderId`, `data.customerName`, `data.total`
   - `password-reset` → Uses `data.resetLink`
3. Send via the existing Nodemailer `transporter` (moved to a shared utility)
4. Log success with `messageId`
5. On failure, BullMQ auto-retries per the queue's backoff config

**Shared Utility Migration:**
The Nodemailer `transporter` currently lives in [auth.js](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/server/src/routes/auth.js#L27-L33). It will be extracted to a new shared module:

**File:** `server/src/utils/mailer.js`
```js
// Extracted from auth.js — single transporter instance, reused by all email paths
export const transporter = nodemailer.createTransport({ ... });
```

#### 3.5.2 AI Refresh Worker

**File:** `server/src/workers/aiRefreshWorker.js`

**Logic:**
1. Send `POST` request to `AI_SERVICE_URL/refresh` using Axios
2. Log response status
3. On network failure, BullMQ retries after 10s

#### 3.5.3 Cache Invalidation Worker

**File:** `server/src/workers/cacheWorker.js`

**Logic:**
1. If `job.data.productId` is provided, delete `product:{id}` key first
2. Run `SCAN` loop with `MATCH: job.data.pattern, COUNT: 100` (existing logic from [products.js](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/server/src/routes/products.js#L10-L30))
3. Delete matched keys in batches
4. Uses the existing `redis` client from `cache/redis.js`

#### 3.5.4 Stripe Webhook Worker

**File:** `server/src/workers/stripeWorker.js`

**Logic:**
1. Switch on `job.data.eventType`:
   - `payment_intent.succeeded` → Update order `status` and `payment_method` in TiDB
   - `payment_intent.payment_failed` → Log failure, optionally mark order
   - Other events → Log and skip (no-op)
2. Uses `pool` from `db.js` for database operations
3. Idempotency: Check if the order has already been reconciled before updating

#### 3.5.5 Abandoned Cart Cleanup Worker

**File:** `server/src/workers/cartCleanupWorker.js`

**Logic:**
1. Query TiDB for carts where `status = 'active'` AND `created_at < NOW() - INTERVAL 30 DAY`
2. Delete associated `cart_items` for matched carts (foreign key constraint)
3. **Soft-delete:** Update cart `status` to `'abandoned'` (preserves data for analytics)
4. Log number of carts cleaned up

---

## 4. Data Models

### 4.1 Existing Tables Affected

No new database tables are required. BullMQ stores all job metadata in Redis, not in the database.

**Tables referenced by workers:**

| Table | Worker | Operation |
|-------|--------|-----------|
| `orders` | `stripeWorker` | `UPDATE status = 'confirmed' WHERE id = ?` (on `payment_intent.succeeded`) |
| `carts` | `cartCleanupWorker` | `UPDATE status = 'abandoned' WHERE status='active' AND created_at < threshold` |
| `cart_items` | `cartCleanupWorker` | `DELETE WHERE cart_id IN (?)` (cleanup orphaned items) |

### 4.2 Redis Key Namespace

BullMQ uses the prefix `bull:` by default. All queue data lives under:

```
bull:email:*
bull:ai-refresh:*
bull:cache-invalidate:*
bull:stripe-webhook:*
bull:cart-cleanup:*
```

This does **not** conflict with the existing cache keys (`products:*`, `product:*`, `recs:*`, `categories`).

---

## 5. API Contracts

### 5.1 Modified Routes (Response shapes unchanged)

#### `POST /api/orders` — Order Placement
**Change:** After `connection.commit()`, enqueue an email job **only if an email address exists** (fire-and-forget).
```js
// NEW — added after line 159 in orders.js
if (deliveryInfo?.email) {
  await emailQueue.add('order-confirmation', {
    type: 'email',
    to: deliveryInfo.email,
    template: 'order-confirmation',
    data: { orderId, customerName: deliveryInfo?.name, total: finalTotal }
  });
}
```
> **Guard:** Guest orders without an email address silently skip the email job. No error is thrown.

**Response:** Unchanged — `{ message, orderId }`

#### `POST /api/auth/forgot-password` — Password Reset
**Change:** Replace the `sendEmail().catch()` fire-and-forget with an enqueued job.
```js
// REPLACE lines 203-206 in auth.js
await emailQueue.add('password-reset', {
  type: 'email',
  to: email,
  template: 'password-reset',
  data: { resetLink }
});
```
**Response:** Unchanged — `{ message }`

#### `POST /api/products` / `PUT /:id/stock` / `DELETE /:id` — Product Mutations
**Change:** Replace `await clearProductCaches()` with an enqueued job.
```js
// REPLACE clearProductCaches() calls
await cacheQueue.add('invalidate', {
  type: 'cache-invalidate',
  pattern: 'products:*',
  productId: productId  // optional, for specific key deletion
});
```
**Response:** Unchanged for all three endpoints.

### 5.2 New Routes

#### `POST /api/recommend/refresh` — Trigger AI Model Refresh
**Method:** `POST`
**Auth:** `requireAuth` + `verifyAdmin`
**Rate Limit:** `apiLimiter`

**Request:** No body required.

**Response:**
```json
{ "message": "AI model refresh queued", "jobId": "abc123" }
```

**Error:** `500` if queue is unavailable.

---

#### `POST /api/webhooks/stripe` — Stripe Webhook Endpoint

**Method:** `POST`
**Auth:** Stripe signature verification via `stripe.webhooks.constructEvent()`
**Content-Type:** `application/json` with **raw body** (required for signature verification)

> ⚠️ **IMPORTANT:** This route must be registered **before** the global `express.json()` middleware, or use `express.raw({ type: 'application/json' })` specifically for this route.

**Request:** Raw Stripe event payload (sent by Stripe).

**Response:** `200 OK` — `{ received: true }` (immediate acknowledgment)

**Error Cases:**
| Status | Condition |
|--------|-----------|
| `400` | Invalid signature (`Webhook signature verification failed`) |
| `500` | Queue unavailable |

**New Environment Variable:**
```
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## 6. Error Handling

### 6.1 Queue-Level Error Strategy

| Scenario | Behavior |
|----------|----------|
| Redis is down when `.add()` is called | Catch error, log to Sentry, return response to user anyway (graceful degradation) |
| Worker throws during processing | BullMQ auto-retries per queue's `attempts` + `backoff` config |
| All retries exhausted | Job moves to `failed` state; logged to console + Sentry |
| Worker process crashes | BullMQ's `autorun` + stalled job detection picks up orphaned jobs |

### 6.2 Graceful Degradation Principle

Consistent with the existing Redis caching philosophy documented in [architecture.md](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/.agents/architecture.md#L101-L104):

> *"Redis is a performance accelerator, not a hard dependency."*

If a queue `.add()` call fails (e.g., Redis is unreachable), the route handler should:
1. Log the error
2. Report to Sentry
3. **Still return a success response** to the user (the primary database transaction has already committed)
4. The email/cache/webhook processing will simply not happen — acceptable degradation

### 6.3 Worker Error Reporting

All workers will wrap their processing logic in try/catch and report unrecoverable errors to Sentry:
```js
import * as Sentry from '@sentry/node';
// ...
Sentry.captureException(error, { tags: { queue: 'email' } });
```

---

## 7. Security Considerations

### 7.1 Stripe Webhook Verification
- **Mandatory:** All incoming webhook requests must be verified using `stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)`.
- The `STRIPE_WEBHOOK_SECRET` must never be logged or exposed.
- The raw body must be preserved (not parsed by `express.json()`) for signature verification.

### 7.2 AI Refresh Endpoint
- Protected by `requireAuth` + `verifyAdmin` — only admins can trigger model refreshes.
- Rate-limited via `apiLimiter` to prevent abuse.

### 7.3 Redis Key Isolation
- BullMQ keys use the `bull:` prefix by default, cleanly separated from application cache keys.
- No additional ACLs needed since BullMQ and the cache client share the same Redis instance.

### 7.4 Job Payload Sensitivity
- Email jobs contain recipient addresses — these are already stored in the database and transmitted via HTTPS.
- Stripe webhook payloads may contain payment metadata — Redis should be access-controlled in production (already behind Docker network).

---

## 8. Testing Strategy

### 8.1 Manual Verification Steps

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Order confirmation email | Place an order with a valid email → Check inbox | Email arrives within 30s |
| 2 | Password reset email | Trigger forgot-password → Check inbox | Email arrives within 30s |
| 3 | Email retry on failure | Set invalid SMTP creds → Place order → Fix creds | Email delivered on retry |
| 4 | AI refresh via queue | `POST /api/recommend/refresh` → Check AI service logs | Python `/refresh` called |
| 5 | Cache invalidation | Create product → Check Redis → Verify `products:*` keys cleared | Cache keys deleted async |
| 6 | Stripe webhook | Send test event via Stripe CLI → Check order status in DB | Order status updated |
| 7 | Webhook signature fail | Send forged payload to webhook route | `400` error returned |
| 8 | Abandoned cart cleanup | Insert old carts → Wait for cron (or trigger manually) | Stale carts deleted |
| 9 | Redis down graceful degradation | Stop Redis → Place order | Order succeeds, email silently skipped |

### 8.2 Lint Verification
```bash
cd server && npm run lint
```

---

## 9. Deployment Impact

### 9.1 New Dependency

```bash
npm install bullmq
```

`bullmq` depends on `ioredis` (bundled). No other new dependencies required.

### 9.2 New Environment Variable

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STRIPE_WEBHOOK_SECRET` | Yes (for webhook feature) | — | Stripe webhook signing secret (`whsec_...`) |

Add to `server/.env` and the Render/Docker deployment environment.

> **Note:** `STRIPE_WEBHOOK_SECRET` should be added to the required env vars check in [config.js](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/server/src/config.js) only if the webhook feature is deployed. For a phased rollout, make it optional with a console warning.

### 9.3 Docker Compose — No Changes Required

BullMQ connects to the same Redis instance already defined in [docker-compose.yml](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/docker-compose.yml#L41-L46). The `REDIS_URL=redis://redis:6379` environment variable is already injected into the backend service.

### 9.4 Workers Run In-Process

Workers start inside the same Node.js process as the Express server (called from `index.js`). This is the **Modular Monolith** pattern — no separate worker containers or process managers needed.

> **Future Consideration:** If job volume grows, workers can be extracted into a separate container by creating a `server/src/workerEntry.js` entrypoint and a `docker-compose.worker.yml` override. This spec does **not** implement that.

### 9.5 Migration Steps

No database migrations required. BullMQ stores all state in Redis.

### 9.6 Graceful Shutdown (§3.6)

**Added per user approval.** The `index.js` entrypoint must register `SIGTERM` and `SIGINT` handlers that:

1. Call `.close()` on every `Worker` instance (drains in-progress jobs)
2. Call `.close()` on every `Queue` instance (flushes pending commands)
3. Call `server.close()` on the HTTP server
4. Exit with code `0`

```js
// In index.js — after starting the server and workers
const workers = [emailWorker, aiRefreshWorker, cacheWorker, stripeWorker, cartCleanupWorker];
const queues  = [emailQueue, aiRefreshQueue, cacheQueue, stripeQueue, cartCleanupQueue];

async function gracefulShutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully...`);
  await Promise.all(workers.map(w => w.close()));
  await Promise.all(queues.map(q => q.close()));
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
```

> **Why?** Without graceful shutdown, `SIGTERM` (sent by Docker, Render, etc.) kills workers mid-job. BullMQ marks these as "stalled" and retries them, but the retry is unnecessary overhead. Draining first ensures clean exits.

---

## 10. Acceptance Criteria

- [ ] `bullmq` is installed as a production dependency
- [ ] `server/src/queues/connection.js` creates a shared IORedis config from `REDIS_URL`
- [ ] All 5 queue modules exist under `server/src/queues/` with correct job schemas
- [ ] All 5 worker modules exist under `server/src/workers/` with correct processing logic
- [ ] Nodemailer `transporter` is extracted to `server/src/utils/mailer.js` and reused
- [ ] `POST /api/orders` enqueues an `order-confirmation` email job after commit **only if email exists**
- [ ] `POST /api/auth/forgot-password` enqueues a `password-reset` email job (replacing fire-and-forget)
- [ ] `clearProductCaches()` is removed from `products.js`; cache invalidation enqueued instead
- [ ] `POST /api/recommend/refresh` endpoint exists (admin-only, rate-limited)
- [ ] `POST /api/webhooks/stripe` exists with raw body parsing and signature verification
- [ ] Stripe webhook immediately returns `200 OK` and enqueues payload for async processing
- [ ] `payment_intent.succeeded` updates order status to `'confirmed'`
- [ ] Abandoned cart cron job runs every Monday at 00:00 UTC, **soft-deleting** carts older than 30 days
- [ ] Cart cleanup repeatable job uses static `jobId: 'cart-cleanup-weekly'`
- [ ] All queue `.add()` calls are wrapped in try/catch with Sentry reporting
- [ ] All workers log errors to console and report to Sentry
- [ ] `SIGTERM`/`SIGINT` graceful shutdown closes all workers and queues before exit
- [ ] Server boots and operates normally even if Redis/BullMQ is unavailable (graceful degradation)
- [ ] `npm run lint` passes with zero errors
- [ ] No existing API response shapes are altered

---

## Resolved Decisions

| Question | Decision |
|----------|----------|
| **Abandoned Cart Strategy** | **Soft-delete** — Update `status = 'abandoned'`, delete associated `cart_items`. Preserves cart data for analytics. |
| **Guest Order Emails** | **Skip** — Email jobs are only enqueued when `deliveryInfo.email` exists. No error thrown for missing email. |
| **Stripe `payment_intent.succeeded` Mapping** | **Set to `'confirmed'`** — Aligns with existing order status flow (`new → confirmed → shipping → received`). |
