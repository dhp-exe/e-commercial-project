# Technical Specification: Cloudflare Infrastructure Documentation Update

> **Author:** @pm (Senior Product Manager)  
> **Date:** 2026-09-14  
> **Scope:** `README.md`, `.agents/architecture.md`, `.env.example` files, `.gitignore`  
> **Constraint:** Documentation-only changes. Do not rewrite entire files. Only modify or insert sections that reflect the new Cloudflare infrastructure additions.

---

## 1. Overview

Three Cloudflare integrations have been completed across the DHP Store production infrastructure:

1. **Cloudflare R2 + CDN (`cdn.dhpstore.studio`)** — Product and user images are stored in a Cloudflare R2 bucket and served via a CDN-mapped custom domain. The upload middleware (`upload.js`) uses `@aws-sdk/client-s3` + `multer-s3` to write directly to R2 in production. The `formatImageUrl` utility conditionally prepends `CDN_URL` in production, falling back to localhost in development.

2. **Static Asset Cache-Control Headers** — The Express `/uploads` static middleware now sets `maxAge: '30d'` and `immutable: true` for browser caching during local development.

3. **Cloudflare AI Gateway** — The Python AI microservice (`ai-service/recommender.py`) routes outbound Google Gemini API requests through Cloudflare AI Gateway when `CF_AI_GATEWAY_URL` is set, providing edge caching, analytics, and rate limiting. Falls back cleanly to the direct Google endpoint when unset.

---

## 2. Changes to `README.md`

### 2.1 Tech Stack Table (Line ~67–77)

**Add to existing rows:**
- **DevOps row:** Append `Cloudflare (R2, CDN, AI Gateway)` to the Technologies column.
- **Utilities row:** Update `Multer (file uploads)` → `Multer + multer-s3 (file uploads, Cloudflare R2)` and add `@aws-sdk/client-s3`.

### 2.2 Architecture Section (Lines ~79–102)

**Insert after the AI Microservice bullet (Line ~93), before "System Flow":**
- A new bullet for **Cloudflare Edge Layer** describing:
  - R2 object storage for product/user images
  - CDN delivery via `cdn.dhpstore.studio`
  - AI Gateway proxying Gemini requests
  - Conditional CDN URL resolution in `formatImageUrl`

### 2.3 Project Structure Tree (Lines ~244–387)

**Modify the `upload.js` annotation:**
- Change `# Multer disk storage configuration` → `# Multer storage (R2 in production, disk in dev)`

### 2.4 Remove Inline `.env` Blocks from README

**Remove** the three inline `.env` code blocks from sections:
- Server `.env` (Lines ~412–439)
- Client `.env` (Lines ~447–452)
- AI Service `.env` (Lines ~460–469)

**Replace** each with a single-line reference pointing to the corresponding `.env.example` file:
```markdown
Copy the example environment file and fill in your values:
```bash
cp .env.example .env
```

### 2.5 Docker Flow Diagram (Lines ~524–546)

**Update to reflect CDN + AI Gateway edge paths:**
- Add a Cloudflare edge layer showing CDN serving images and AI Gateway proxying Gemini calls.

### 2.6 Notes Section (Lines ~548–551)

**Add note:**
- In production, file uploads go directly to Cloudflare R2 via the S3 API. The `CDN_URL` and `R2_*` environment variables must be configured for production deployments.

---

## 3. Changes to `.agents/architecture.md`

### 3.1 Backend Stack Table (Section 3, Line ~73)

**Update the File Uploads row:**
- Change `Multer ^2.0.2` → `Multer ^2.0.2 + multer-s3 (Cloudflare R2 in production)`

**Add new row:**
- `CDN / Object Storage` | `Cloudflare R2, @aws-sdk/client-s3` | `CDN via cdn.dhpstore.studio, direct S3 uploads in production`

### 3.2 AI Service Table (Section 9, Lines ~200–208)

**Add a new row:**
- `Edge Proxy` | `Cloudflare AI Gateway` | `Optional. Routes Gemini API calls through CF edge for caching, analytics, rate limiting`

### 3.3 New Section: Cloudflare Infrastructure

**Insert as Section 9.5 (between AI Service and Database Transaction Rules), a new section documenting:**

1. **R2 Object Storage** — bucket structure (`uploads/` prefix), CDN mapping, the conditional logic in `formatImageUrl.js` and `upload.js`
2. **AI Gateway** — the `CF_AI_GATEWAY_URL` environment variable, the URL format, fallback behavior
3. **Environment Variables** — complete list of new Cloudflare-related env vars

### 3.4 Project Historical Phases (Section 13, Line ~279)

**Add Phase 6:**
- **Phase 6** | Cloudflare edge integration — R2 object storage for uploads, CDN image delivery (`cdn.dhpstore.studio`), AI Gateway proxy for Gemini requests, static asset Cache-Control headers | CDN URL resolution, direct-to-R2 uploads, AI Gateway routing

---

## 4. New Files: `.env.example`

### 4.1 `server/.env.example` [NEW]

Comprehensive template with all server environment variables, grouped by category:
- **Core** — `PORT`, `NODE_ENV`, `FRONTEND_URL`, `CORS_ORIGINS`, `CSP_CONNECT_SRC`, `SITE_URL`
- **Database** — `DB_HOST`, `DB_USER`, `DB_PORT`, `DB_PASS`, `DB_NAME`, `DB_SSL_CA`
- **Auth** — `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- **Payments** — `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- **Services** — `REDIS_URL`, `AI_SERVICE_URL`
- **Email** — `EMAIL_USER`, `EMAIL_PASS`
- **Observability** — `SENTRY_DSN`
- **Cloudflare R2** — `CDN_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`

All values will be placeholder-only (e.g., `your_database_host`). No real credentials.

### 4.2 `client/.env.example` [NEW]

Template with all client environment variables:
- `VITE_API_URL`
- `VITE_STRIPE_PUBLIC_KEY`
- `VITE_SENTRY_DSN`
- `VITE_GOOGLE_CLIENT_ID`

### 4.3 `ai-service/.env.example` [NEW]

Template with all AI service environment variables:
- **Database** — `DB_HOST`, `DB_USER`, `DB_PORT`, `DB_PASS`, `DB_NAME`, `DB_SSL_CA`, `DB_SSL`
- **AI** — `GOOGLE_API_KEY`, `MODEL_NAME`
- **Vector DB** — `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`
- **Cloudflare AI Gateway** — `CF_AI_GATEWAY_URL` (marked optional)

---

## 5. `.gitignore` Update

The current `.gitignore` has `.env.*` which would exclude `.env.example` files. Add a negation rule:
```gitignore
!.env.example
```

---

## 6. Acceptance Criteria

- [ ] `README.md` Tech Stack table includes Cloudflare R2, CDN, AI Gateway.
- [ ] `README.md` Architecture section includes Cloudflare edge layer description.
- [ ] `README.md` Project Structure tree annotation for `upload.js` is updated.
- [ ] `README.md` inline `.env` blocks replaced with `cp .env.example .env` instructions.
- [ ] `README.md` Docker flow diagram reflects CDN and AI Gateway paths.
- [ ] `README.md` Notes section mentions R2 production configuration requirement.
- [ ] `.agents/architecture.md` Backend Stack table updated for Multer + R2.
- [ ] `.agents/architecture.md` AI Service table includes AI Gateway row.
- [ ] `.agents/architecture.md` contains new Cloudflare Infrastructure section.
- [ ] `.agents/architecture.md` Phase 6 added to historical phases.
- [ ] `server/.env.example` created with all variables (placeholder values only).
- [ ] `client/.env.example` created with all variables (placeholder values only).
- [ ] `ai-service/.env.example` created with all variables (placeholder values only).
- [ ] `.gitignore` updated with `!.env.example` negation rule.
- [ ] All existing content preserved — only targeted insertions and modifications.
