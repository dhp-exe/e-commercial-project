# DHP Store — System Architecture

> **Auto-generated from codebase analysis.** This document is the single source of truth for all AI agents operating in this repository.

---

## 1. Frontend Stack

| Layer | Technology | Version / Notes |
|---|---|---|
| **Framework** | React | ^18.3.1 (JSX, no TypeScript currently) |
| **Build Tool** | Vite | ^5.4.0 (`@vitejs/plugin-react`) |
| **Routing** | React Router DOM | ^6.26.1 |
| **State / Data Fetching** | TanStack React Query | ^5.101.4 |
| **HTTP Client** | Axios | ^1.7.4 |
| **Payments** | Stripe (`@stripe/react-stripe-js`, `@stripe/stripe-js`) + PayPal (`@paypal/react-paypal-js`) |
| **Error Tracking** | Sentry (`@sentry/react` ^10.69.0) |
| **Icons** | React Icons ^5.5.0 |
| **Linting** | ESLint ^9 with `eslint-plugin-react`, `react-hooks`, `react-refresh` |
| **Deployment** | Vercel (primary), GitHub Pages (`gh-pages`), Docker (Nginx alpine) |

### Key Frontend Patterns
- **Entry point:** `src/main.jsx` → `src/App.jsx`
- **Directory structure:** `pages/`, `components/`, `context/`, `hooks/`, `styles/`, `assets/`
- **API base:** Centralized in `src/api.js` via Axios instance
- **Custom hooks:** Located in `src/hooks/` (e.g., `useProducts`)
- **Styling:** Vanilla CSS with modular page-level stylesheets + global `styles.css`

---

## 2. Backend Stack

| Layer | Technology | Version / Notes |
|---|---|---|
| **Runtime** | Node.js | ≥16.0.0 (runs on `node:22-alpine` in Docker) |
| **Framework** | Express | ^4.19.2 |
| **Database Driver** | mysql2/promise | ^3.14.3 (connection pool) |
| **Database** | TiDB (MySQL-compatible) | Cloud-hosted, SSL in production |
| **Caching** | Redis | ^5.11.0 (`redis:alpine` in Docker) |
| **Auth** | JWT (`jsonwebtoken` ^9) + bcryptjs ^2.4.3 + HTTP-only cookies (`cookie-parser`) |
| **Payments** | Stripe server SDK (`stripe` ^20.2.0) |
| **File Uploads** | Multer ^2.0.2 |
| **Email** | Nodemailer ^7.0.13 |
| **Security** | Helmet ^8.1.0, CORS (env-driven), `express-rate-limit` ^8.2.1 |
| **Observability** | Sentry (`@sentry/node` ^10.69.0), Morgan (`common` format) |
| **Validation** | validator ^13.15.35 |
| **Linting** | ESLint ^10.7.0 with `@eslint/js` flat config |
| **Dev Tooling** | Nodemon ^3.1.0 |

### API Routes

| Route Prefix | Module | Description |
|---|---|---|
| `/api/auth` | `auth.js` | Registration, login, profile, JWT management |
| `/api/products` | `products.js` | Product CRUD, image uploads |
| `/api/cart` | `cart.js` | Shopping cart operations |
| `/api/orders` | `orders.js` | Order management, Stripe checkout |
| `/api/feedback` | `feedback.js` | User feedback/reviews |
| `/api/recommend` | `recommendations.js` | AI-powered product recommendations |
| `/api/chat` | `chat.js` | Chat/support interface |
| `/api/health` | inline | Health check endpoint |

---

## 3. AI Service

| Layer | Technology | Notes |
|---|---|---|
| **Runtime** | Python | FastAPI (`main.py`) |
| **Core Logic** | `recommender.py` | Product recommendation engine |
| **Containerized** | Docker (`Dockerfile`) | Standalone microservice on port `10000` |

---

## 4. Database Transaction Rules (TiDB / MySQL)

- **Driver:** `mysql2/promise` with connection pooling
- **Pool Configuration:**
  - `connectionLimit: 20` — tuned for production concurrency
  - `queueLimit: 0` — unlimited queuing to prevent request drops
  - `idleTimeout: 60000` — clean up idle connections after 60s
- **SSL:** Enforced in production (`rejectUnauthorized: true`, `minVersion: TLSv1.2`). Optional CA cert via `DB_SSL_CA` env var.
- **Transaction Pattern:** Use `pool.getConnection()` → `conn.beginTransaction()` → `conn.commit()` / `conn.rollback()` → `conn.release()` for multi-step operations. **Never hold connections across async boundaries without explicit release.**
- **Migrations:** Managed via `run_migration.js` and the `migrations/` directory.

---

## 5. Redis Caching Strategy (Graceful Degradation)

```
┌─────────────┐     ┌───────────┐     ┌──────────┐
│   Express   │────▶│   Redis   │────▶│  TiDB    │
│   Server    │     │  (Cache)  │     │  (Source) │
└─────────────┘     └───────────┘     └──────────┘
                         │
                    Falls back to
                    TiDB if Redis
                    is unavailable
```

- **Connection:** Non-blocking `redis.connect()` — the server boots and operates even if Redis is completely down.
- **Reconnection:** Exponential backoff with `retries * 100ms`, capped at `3000ms`, max `10` retries before giving up.
- **Error Handling:** Errors are logged (`Redis error:`, `Redis reconnecting...`) but never crash the process.
- **Design Principle:** Redis is a **performance accelerator, not a hard dependency**. All read paths must have a TiDB fallback. If Redis is unavailable, the application continues at database speed.

---

## 6. CI/CD Pipeline

### Docker Multi-Stage Builds

**Frontend (`client/Dockerfile`):**
1. **Stage 1 — Builder:** `node:22-alpine`, `npm ci`, inject `VITE_STRIPE_PUBLIC_KEY` and `VITE_API_URL` as build args, `npm run build`
2. **Stage 2 — Serve:** `nginx:alpine`, copy build artifacts, custom `nginx.conf`, expose port `80`

**Backend (`server/Dockerfile`):**
1. **Stage 1 — Deps:** `node:22-alpine`, `npm ci` (all deps)
2. **Stage 2 — Runner:** `node:22-alpine`, copy deps, `npm prune --production`, create uploads directory, run as non-root `node` user, expose port `5001`

### Docker Compose (`docker-compose.yml`)
Orchestrates 4 services:
1. `frontend` — React app (port 5173→80)
2. `backend` — Express API (port 5001)
3. `ai-service` — Python recommendation engine (port 10000)
4. `redis` — Cache layer (port 6379, persistent volume `redis_data`)

### Versioning
- **Semantic Versioning:** Currently at `v1.1.0`
- **Release Automation:** Release Please via GitHub Actions (PR #18: `chore(main): release 1.1.0`)
- **Conventional Commits:** Strictly enforced (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`)

### Security Hardening
- **Helmet:** Full CSP directives (script, style, font, img, connect, frame sources)
- **CORS:** Environment-driven allowlist via `CORS_ORIGINS`
- **Rate Limiting:** Global rate limiter via `express-rate-limit`
- **Trust Proxy:** `app.set('trust proxy', 1)` for correct client IP behind reverse proxies
- **JWT Validation:** Warns if secret < 64 chars
- **Required Env Vars:** Fatal exit on missing: `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`, `JWT_SECRET`, `STRIPE_SECRET_KEY`

---

## 7. Project Historical Phases

| Phase | Focus | Key Commits |
|---|---|---|
| **Phase 1** | Core e-commerce (products, cart, orders, auth, payments) | Initial commits through UI refactors |
| **Phase 2** | Performance optimizations (TanStack Query, Redis caching, Docker refactoring) | `feat: implement useProducts hook and integrate TanStack Query`, `feat: implemented Redis caching layer` |
| **Phase 3** | CI/CD pipeline, production hardening, Sentry observability | `feat: implement phase 2 optimizations and phase 3 ci pipeline`, `feat: integrate Sentry for error tracking` |
| **Current** | UI modularization, responsive layouts, loading states | `refactor: modularize form component`, `feat: implement optimized full-screen video loading screen` |
