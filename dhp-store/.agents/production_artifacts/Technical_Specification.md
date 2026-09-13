# Technical Specification: CDN Image URL Resolution & Static Asset Caching

> **Author:** @pm (Senior Product Manager)  
> **Date:** 2026-09-13  
> **Scope:** `server/src/shared/utils/formatImageUrl.js` & `server/src/index.js`  
> **Constraint:** Zero regressions to existing image URL consumers; strictly backward-compatible.

---

## 1. Overview

With product assets migrated to Cloudflare R2 mapped to `https://cdn.dhpstore.studio` with an `uploads/` prefix matching existing database paths (e.g. `/uploads/vintage-emo-tee.jpg`), the backend image formatting utility must dynamically resolve full URLs based on the execution environment.

In production (`NODE_ENV === 'production'`), product and user avatar images must be served from the high-performance Cloudflare CDN using `process.env.CDN_URL`, while gracefully falling back to the raw path if `CDN_URL` is unset. In local development, the existing localhost server continues serving static files, augmented with long-term browser cache-control headers (`maxAge: '30d'`, `immutable: true`) on the `/uploads` route to minimize disk I/O and optimize developer reload speeds.

---

## 2. User Stories

- **As a customer browsing the store in production**, I want product images served via Cloudflare R2 CDN (`https://cdn.dhpstore.studio`) with edge caching so that product catalog and detail pages load instantly.
- **As a developer testing locally**, I want `/uploads` static files to return `Cache-Control: public, max-age=2592000, immutable` headers so that repeated local browser requests avoid re-downloading unchanged test images.
- **As an operations engineer**, I want resilient URL generation that prevents malformed URLs (e.g. double slashes `//uploads`) regardless of whether `CDN_URL` or `BACKEND_URL` is configured with or without trailing slashes.

---

## 3. Technical Design

### 3.1 Frontend Changes
- **None**. The frontend already consumes pre-formatted `image_url` / `profilePicture` fields returned by backend endpoints (`/api/products`, `/api/orders`, `/api/auth/me`, etc.). No frontend alterations are required.

### 3.2 Backend Changes

#### 1. `server/src/shared/utils/formatImageUrl.js`
- **Environment Detection**: Inspect `process.env.NODE_ENV === 'production'`.
- **Production Handling**:
  - Check `process.env.CDN_URL`.
  - If `CDN_URL` is missing / falsy, fall back immediately to returning the raw `dbPath` as specified.
  - If `CDN_URL` is present, strip trailing slashes (`cdnUrl.replace(/\/+$/, '')`).
  - Prepend normalized path ensuring single-slash separator.
- **Development Handling**:
  - Prepend `process.env.BACKEND_URL || 'http://localhost:5001'`, stripping any trailing slash before appending `normalizedPath`.
- **Edge Cases & Legacy Support**:
  - `!dbPath`: Return `null` immediately.
  - `dbPath.startsWith('http')`: Return `dbPath` unchanged (external URLs like Google OAuth avatars or already-qualified URLs).
  - Legacy filenames without leading slash or `/uploads/` prefix (e.g., `"1770105462047.webp"`): Normalized to `/uploads/${dbPath}`.
  - Leading slash handling: Strip trailing slashes on base URL and ensure path has a single leading slash to prevent `https://cdn.dhpstore.studio//uploads/...`.

#### 2. `server/src/index.js`
- Update static file middleware for `/uploads`:
  ```javascript
  app.use(
    '/uploads',
    express.static(path.join(process.cwd(), 'src', 'uploads'), {
      maxAge: '30d',
      immutable: true,
    })
  );
  ```
- This adds `Cache-Control: public, max-age=2592000, immutable` to all static uploads served during development.

### 3.3 AI Service Changes
- **None**. The AI recommendation service consumes product IDs and metadata without altering URL generation.

---

## 4. Data Models

- **No schema modifications**.
- Existing database columns (`products.image_url`, `product_images.image_url`, `users.profile_picture`) continue storing relative paths (e.g. `/uploads/vintage-emo-tee.jpg` or bare legacy filenames).

---

## 5. API Contracts

Existing API responses remain structurally identical, with updated URL string values:

### In Production (`NODE_ENV=production`, `CDN_URL=https://cdn.dhpstore.studio`):
```json
{
  "id": 101,
  "name": "Vintage Emo Tee",
  "image_url": "https://cdn.dhpstore.studio/uploads/vintage-emo-tee.jpg"
}
```

### In Production (`NODE_ENV=production`, `CDN_URL` unset):
```json
{
  "id": 101,
  "name": "Vintage Emo Tee",
  "image_url": "/uploads/vintage-emo-tee.jpg"
}
```

### In Development (`NODE_ENV=development`, default):
```json
{
  "id": 101,
  "name": "Vintage Emo Tee",
  "image_url": "http://localhost:5001/uploads/vintage-emo-tee.jpg"
}
```

### Static Asset Headers (`GET /uploads/vintage-emo-tee.jpg`):
```http
HTTP/1.1 200 OK
Cache-Control: public, max-age=2592000, immutable
Content-Type: image/jpeg
```

---

## 6. Error Handling

| Scenario | Input | Expected Output |
|---|---|---|
| Null / undefined path | `null` / `undefined` | `null` |
| Empty string | `""` | `null` |
| Already fully-qualified URL | `"https://lh3.googleusercontent.com/..."` | `"https://lh3.googleusercontent.com/..."` |
| Trailing slash in `CDN_URL` | `CDN_URL="https://cdn.dhpstore.studio/"`, `dbPath="/uploads/tee.jpg"` | `"https://cdn.dhpstore.studio/uploads/tee.jpg"` |
| Missing `CDN_URL` in production | `NODE_ENV="production"`, `CDN_URL=""`, `dbPath="/uploads/tee.jpg"` | `"/uploads/tee.jpg"` (raw path) |
| Missing leading slash in `dbPath` | `dbPath="legacy.webp"` | `"https://cdn.dhpstore.studio/uploads/legacy.webp"` (normalized) |

---

## 7. Security Considerations

- **CORS / CORB / CSP**: Helmet's `imgSrc` directive in `server/src/index.js` already includes `https:`, `http:`, and `'self'`, permitting images from `https://cdn.dhpstore.studio`.
- **Protocol Safety**: Existing guard `if (dbPath.startsWith('http')) return dbPath;` preserves external resources while preventing protocol injection.
- **Cache Header Immutability**: `immutable: true` instructs modern browsers not to send conditional revalidation (`304 Not Modified`) requests during page reloads, reducing latency.

---

## 8. Testing Strategy

1. **Unit Test / Direct Verification**:
   - Test `formatImageUrl` with:
     - `NODE_ENV='production'` and `CDN_URL='https://cdn.dhpstore.studio'`
     - `NODE_ENV='production'` and `CDN_URL='https://cdn.dhpstore.studio/'` (trailing slash)
     - `NODE_ENV='production'` and `CDN_URL` undefined / empty (verify fallback to raw `dbPath`)
     - `NODE_ENV='development'` (verify localhost resolution and trailing slash safety)
     - External URL input (verify untouched return)
     - Legacy filename without slash (verify `/uploads/` prefix applied)
2. **Header Verification**:
   - Verify `express.static` configuration with `maxAge: '30d'` and `immutable: true`.
3. **Lint Verification**:
   - Run `npm run lint` in `server/` to ensure zero ESLint warnings/errors.

---

## 9. Deployment Impact

- **Environment Variables**: `CDN_URL` is already added to `server/.env` (`https://cdn.dhpstore.studio`). Needs to be set in production hosting environment (e.g. Render / Docker environment).
- **Zero Downtime**: Fully backward-compatible; fallback mechanism ensures images do not break if `CDN_URL` is missing.

---

## 10. Acceptance Criteria

- [ ] `server/src/shared/utils/formatImageUrl.js` prepends `process.env.CDN_URL` when `NODE_ENV === 'production'`.
- [ ] If `CDN_URL` is unset in production, it falls back to returning raw `dbPath`.
- [ ] In development (`NODE_ENV !== 'production'`), it continues using the local base URL (`process.env.BACKEND_URL || 'http://localhost:5001'`).
- [ ] Slash concatenation prevents double slashes (e.g., no `...//uploads...`).
- [ ] `server/src/index.js` configures `express.static` for `/uploads` with `{ maxAge: '30d', immutable: true }`.
- [ ] No other logic modified.
- [ ] `npm run lint` in `server/` passes with zero errors.
