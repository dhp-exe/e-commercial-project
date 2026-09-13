# Audit Report — CDN Image URL Resolution & Static Asset Caching

> **Auditor:** @qa (QA Engineer & Security Auditor)  
> **Date:** 2026-09-13  
> **Scope:** Code changes in `server/src/shared/utils/formatImageUrl.js` and `server/src/index.js`  
> **Status:** 🟢 **PASS**

---

## 1. Specification Compliance

- [x] Prepend `process.env.CDN_URL` when `NODE_ENV === 'production'`.
- [x] Fall back to raw database path when `CDN_URL` is missing in production.
- [x] Keep using localhost URL in development.
- [x] Prevent duplicate slash concatenation (e.g. `//uploads`).
- [x] Add `{ maxAge: '30d', immutable: true }` to `/uploads` static file middleware in `server/src/index.js`.
- [x] No other business logic modified.
- [x] Zero ESLint warnings or errors (`npm run lint` passed cleanly).

---

## 2. Architectural Integrity

- [x] Follows Modular Monolith patterns documented in `.agents/architecture.md`.
- [x] Changes in `formatImageUrl.js` reside in `server/src/shared/utils/`, correctly serving all consuming modules (`catalog`, `orders`, `auth_user`).
- [x] Changes in `index.js` apply only to the composition root static assets middleware.
- [x] No circular dependencies or cross-module boundary violations introduced.

---

## 3. Code Quality — DRY & SRP

- [x] **DRY:** Image URL formatting logic is centralized in `shared/utils/formatImageUrl.js` and reused across the entire application without duplication.
- [x] **SRP:** `formatImageUrl` has a single responsibility: transforming relative database paths or legacy filenames into canonical URLs.
- [x] **Dead Code:** None. No unused variables, dead branches, or commented-out code.
- [x] **Code Smells:** Functions are short (<30 lines), clean, and well-documented.

---

## 4. Strictness & Linter Integrity

- [x] Zero `eslint-disable` or `eslint-disable-next-line` comments.
- [x] Zero type-bypassing or unhandled promise rejections.
- [x] ESLint flat config executed with 0 errors and 0 warnings.

---

## 5. Security Audit

- [x] **Protocol Safety:** Guard `dbPath.startsWith('http')` ensures external URLs (e.g. Google OAuth avatars) are preserved without unwanted manipulation.
- [x] **Slash Sanitation:** Base URLs are stripped of trailing slashes and relative paths normalized to start with a single `/`, preventing malformed open redirect or SSRF-like URL concatenation quirks.
- [x] **CSP Compatibility:** Helmet's `imgSrc` directive in `server/src/index.js` allows `https:` and `http:`, ensuring Cloudflare R2 assets load smoothly without CSP blocks.
- [x] **Secrets / Hardcoding:** No hardcoded endpoints or bucket keys; all URLs rely on environment variables (`CDN_URL`, `BACKEND_URL`).

---

## 6. Error & Edge Case Handling

- [x] `null` / `undefined` / `""` input returns `null`.
- [x] External URLs return untouched.
- [x] Legacy bare filenames without leading slashes (e.g. `1770105462047.webp`) are prefixed with `/uploads/`.
- [x] Missing `CDN_URL` in production gracefully falls back to raw database path without throwing.

---

## 7. Performance

- [x] Cloudflare R2 CDN edge caching reduces backend load and drastically speeds up image delivery for production end-users.
- [x] `Cache-Control: public, max-age=2592000, immutable` headers in Express eliminate redundant 304 revalidation round-trips for local development asset requests.

---

## 8. Audit Findings

### 🔴 FATAL (Must Fix)
*None.*

### 🟡 WARNING (Should Fix)
*None.*

### 🟢 INFO (Observation)
1. **[formatImageUrl.js:8]** When `CDN_URL` is configured in production, any bare legacy filenames will be normalized with `/uploads/` and prepended with `CDN_URL`, ensuring 1:1 mapping with the `uploads/` prefix created in the Cloudflare R2 bucket.

### ✅ PASSED
- Specification compliance verified against approved `Technical_Specification.md`.
- Automated test matrix verified across development, production, fallback, and edge cases.
- Static asset caching verified in `server/src/index.js`.
- Zero lint errors reported by ESLint.
