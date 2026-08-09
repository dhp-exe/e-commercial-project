# Technical Specification: Google OAuth & SPA SEO

> **Author:** @pm · **Status:** ✅ APPROVED · **Version:** 1.1
> **Date:** 2026-08-08 · **Approved:** 2026-08-09 · **Phase:** 4 — User Acquisition & SEO

---

## 1. Overview

DHP Store currently relies solely on email/password authentication, and its React SPA is invisible to search engines and social media crawlers. This specification addresses two strategic goals:

1. **Google OAuth** — Reduce registration friction by letting users sign in with their Google account. If the email already exists in TiDB, issue a JWT and log them in. If not, auto-register them.
2. **SPA SEO** — Make the store discoverable by search engines through dynamic meta tags, structured data (JSON-LD), a dynamically generated sitemap, and server-side bot detection for pre-rendered HTML.

**No existing API response shapes change. No existing frontend routes change.**

---

## 2. User Stories

### Google OAuth
- As a **visitor**, I want to click "Login with Google" so that I can sign in without creating a new password.
- As a **returning user**, I want Google login to recognize my existing email so that I get my same account and order history.
- As a **new user**, I want Google login to auto-create my account so that I can start shopping immediately.

### SPA SEO
- As a **store owner**, I want Google to index my product pages so that customers find my store via search.
- As a **store owner**, I want a sitemap.xml so that search engines can crawl all active products.
- As a **store owner**, I want product link previews on social media to show the product image, name, and price.

---

## 3. Technical Design

### 3.1 Frontend Changes

#### 3.1.1 Google OAuth Button (`Login.jsx`)

**Library:** [Google Identity Services (GIS)](https://developers.google.com/identity/gsi/web) — loaded via `<script>` tag, no npm package required.

**Flow:**
1. Load `https://accounts.google.com/gsi/client` script in `index.html`
2. In `Login.jsx`, render the `google.accounts.id.renderButton()` element
3. On success, the GIS callback receives a `credential` (a JWT `id_token`)
4. Send this `credential` to `POST /api/auth/google` via Axios
5. Backend verifies the token, issues a session cookie, and responds with `{ name }`
6. `AuthContext` updates state identically to the existing `login()` flow

**New File:** `client/src/components/GoogleLoginButton.jsx`

```jsx
// Self-contained component that initializes GIS and renders the button
// Props: onSuccess(response), onError(error)
```

**Modified Files:**
- `client/index.html` — Add GIS script tag
- `client/src/pages/Login.jsx` — Import and render `<GoogleLoginButton />`
- `client/src/context/AuthContext.jsx` — Add `googleLogin(credential)` function

#### 3.1.2 `react-helmet-async` Integration

**New Dependency:** `react-helmet-async`

**Provider Setup (`main.jsx`):**
Wrap `<App />` in `<HelmetProvider>` to enable per-route `<Helmet>` tags.

**Pages that get `<Helmet>` tags:**

| Page | Title | Meta Description | OG Tags | JSON-LD |
|------|-------|-----------------|---------|---------|
| `Home.jsx` | `DHP Streetwear — Premium Street Fashion` | Store description | og:title, og:image, og:url | `Organization` schema |
| `Products.jsx` | `Shop All — DHP Streetwear` | Product catalog description | og:title | — |
| `ProductDetails.jsx` | `{product.name} — DHP Streetwear` | `{product.description}` | og:title, og:image, og:description, og:type=product | `Product` schema |
| `About.jsx` | `About Us — DHP Streetwear` | About page description | og:title | — |
| `Login.jsx` | `Login — DHP Streetwear` | — | — | — |

**JSON-LD `Product` Schema (ProductDetails.jsx):**
```json
{
  "@context": "https://schema.org/",
  "@type": "Product",
  "name": "Vintage Graphic Tee",
  "image": "https://dhp-store.onrender.com/uploads/vintage-graphic-tee.jpg",
  "description": "Y2K-inspired oversized graphic tee",
  "offers": {
    "@type": "Offer",
    "priceCurrency": "USD",
    "price": "39.99",
    "availability": "https://schema.org/InStock"
  }
}
```

#### 3.1.3 Update `index.html`

**Modified File:** `client/index.html`

```html
<!-- Add default meta tags (overridden per-page by react-helmet-async) -->
<meta name="description" content="DHP Streetwear — Premium Vietnamese street fashion. Shop vintage tees, baggy jeans, bombers & more." />
<meta property="og:title" content="DHP | Streetwear" />
<meta property="og:description" content="Premium Vietnamese street fashion" />
<meta property="og:type" content="website" />

<!-- Google Identity Services -->
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

---

### 3.2 Backend Changes

#### 3.2.1 Google OAuth Endpoint

**New Route:** `POST /api/auth/google`
**File:** `server/src/routes/auth.js` (added to existing auth router)

**Dependencies:** `google-auth-library` (npm package for server-side token verification)

**Flow:**
1. Receive `{ credential }` from frontend (the GIS `id_token` JWT)
2. Verify the token using `google-auth-library`'s `OAuth2Client.verifyIdToken()`
3. Extract `email`, `name`, `picture` from the verified payload
4. Check if user exists in TiDB by email:
   - **Exists:** Issue JWT, set cookie, respond `{ name }`
   - **Not exists:** Insert new user with `password_hash = NULL` (OAuth-only account), issue JWT, set cookie, respond `{ name }`
5. The JWT payload is identical to existing sessions: `{ id, email }`

**Auth Middleware Compatibility:** No changes needed — `requireAuth.js` already decodes JWTs by `{ id, email }`. Google-created users get the same JWT structure.

#### 3.2.2 Dynamic Sitemap Route

**New Route:** `GET /sitemap.xml`
**File:** `server/src/routes/sitemap.js`

**Logic:**
1. Query TiDB for all active products: `SELECT id, updated_at FROM products WHERE is_active = true`
2. Build XML sitemap with static pages + dynamic product URLs
3. Cache the result in Redis for 1 hour (`sitemap:xml`, `EX: 3600`)
4. Respond with `Content-Type: application/xml`

**Static URLs included:**
- `/` (homepage)
- `/products` (catalog)
- `/about`
- `/contacts`

**Dynamic URLs:**
- `/product/:id` for each active product

> **Prerender:** Skipped per user approval. Googlebot executes JavaScript natively. Social media previews use generic OG tags from `index.html`.

---

## 4. Data Models

### 4.1 Users Table Migration

The `users` table needs new columns for OAuth support. The `profile_picture` column already exists.

```sql
ALTER TABLE users ADD COLUMN auth_provider VARCHAR(20) DEFAULT 'local';
ALTER TABLE users ADD COLUMN google_id VARCHAR(255) DEFAULT NULL;
ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL;
```

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `auth_provider` | `VARCHAR(20)` | `'local'` | `'local'` or `'google'` |
| `google_id` | `VARCHAR(255)` | `NULL` | Google's unique user ID (sub claim) |
| `password_hash` | `VARCHAR(255)` | Modified to `NULL`able | OAuth users don't have passwords |

### 4.2 Redis Cache Keys

| Key | TTL | Purpose |
|-----|-----|---------|
| `sitemap:xml` | 3600s (1 hour) | Cached sitemap XML |

No conflict with existing key namespaces (`products:*`, `product:*`, `recs:*`, `user:*`, `bull:*`).

---

## 5. API Contracts

### 5.1 New Endpoints

#### `POST /api/auth/google` — Google OAuth Login/Register

**Auth:** None (public)
**Rate Limit:** `authLimiter`

**Request:**
```json
{
  "credential": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200 — existing user):**
```json
{
  "name": "Phuoc Do"
}
```
Sets `access_token` cookie (same as existing login).

**Response (201 — new user auto-registered):**
```json
{
  "name": "Phuoc Do"
}
```
Sets `access_token` cookie.

**Errors:**
| Status | Body | Cause |
|--------|------|-------|
| `400` | `{ "message": "Missing credential" }` | No credential in body |
| `401` | `{ "message": "Invalid Google token" }` | Token verification failed |
| `500` | `{ "message": "Server error" }` | Database or internal error |

---

#### `GET /sitemap.xml` — Dynamic Sitemap

**Auth:** None (public)
**Content-Type:** `application/xml`

**Response (200):**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://e-commercial-project-mauve.vercel.app/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://e-commercial-project-mauve.vercel.app/products</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://e-commercial-project-mauve.vercel.app/product/1</loc>
    <lastmod>2026-08-07T00:00:00Z</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <!-- ... more products -->
</urlset>
```

---

### 5.2 Modified Routes

None. All existing routes remain unchanged.

---

## 6. Error Handling

### Google OAuth
| Scenario | Handling |
|----------|----------|
| Invalid/expired Google token | `401` — "Invalid Google token" |
| Google API unreachable | `500` — "Server error" (Sentry captures) |
| Duplicate email collision (race condition) | Catch `ER_DUP_ENTRY`, fetch existing user, issue JWT |
| User banned/deactivated | Not currently implemented — future consideration |

### Sitemap
| Scenario | Handling |
|----------|----------|
| Database query fails | `500` — plain text "Sitemap temporarily unavailable" |
| Redis cache miss | Rebuild from database, cache for 1 hour |
| No active products | Return sitemap with static pages only |

---

## 7. Security Considerations

### Google OAuth
- **Token Verification:** Server-side only via `google-auth-library`. The `id_token` is verified against Google's public keys, checking `iss`, `aud`, and `exp` claims.
- **Client ID Validation:** The `GOOGLE_CLIENT_ID` env var must match the `aud` claim in the token. Mismatched tokens are rejected.
- **No Password for OAuth Users:** OAuth-only users have `password_hash = NULL`. The existing `POST /login` endpoint correctly fails for these users (bcrypt.compare against null returns false).
- **Rate Limiting:** `POST /api/auth/google` uses the existing `authLimiter` to prevent abuse.

### CSP Updates (Helmet)
The Google Identity Services SDK requires additional CSP directives:

| Directive | Addition | Reason |
|-----------|----------|--------|
| `scriptSrc` | `https://accounts.google.com` | GIS client library |
| `frameSrc` | `https://accounts.google.com` | GIS popup/redirect iframe |
| `connectSrc` | `https://accounts.google.com` | GIS API calls |
| `styleSrc` | `https://accounts.google.com` | GIS button styling |

### Sitemap
- No authentication required (public endpoint for crawlers)
- Product IDs are already public (visible in frontend URLs)
- No PII exposed in sitemap

---

## 8. Testing Strategy

### Manual Verification

**Google OAuth:**
1. Click "Login with Google" on the login page
2. Select a Google account in the popup
3. Verify redirect to homepage with user name displayed
4. Verify `/api/auth/profile` returns the correct user data
5. Verify the user row in TiDB has `auth_provider = 'google'` and `google_id` set
6. Log out, then log in again with the same Google account → same user, same order history
7. Try logging in with an email that already has a local account → should link to existing account

**SEO:**
1. Visit `http://localhost:5001/sitemap.xml` → verify XML with all active products
2. View page source on ProductDetails → verify JSON-LD `<script>` tag in `<head>`
3. Use [Google Rich Results Test](https://search.google.com/test/rich-results) to validate Product schema
4. Use [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) to test OG tags
5. Verify `<title>` updates on route navigation (check browser tab)

---

## 9. Deployment Impact

### 9.1 New Dependencies

**Server:**
```bash
npm install google-auth-library
```

**Client:**
```bash
npm install react-helmet-async
```

### 9.2 New Environment Variables

| Variable | Required | Where | Description |
|----------|----------|-------|-------------|
| `GOOGLE_CLIENT_ID` | Yes | Server `.env` + Client `.env` (`VITE_GOOGLE_CLIENT_ID`) | Google OAuth 2.0 Client ID from [Google Cloud Console](https://console.cloud.google.com/apis/credentials) |
| `SITE_URL` | Yes | Server `.env` | Public frontend URL for sitemap generation (e.g., `https://e-commercial-project-mauve.vercel.app`) |

### 9.3 Database Migration

```sql
ALTER TABLE users ADD COLUMN auth_provider VARCHAR(20) DEFAULT 'local';
ALTER TABLE users ADD COLUMN google_id VARCHAR(255) DEFAULT NULL;
ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL;
```

> `profile_picture` column already exists — no migration needed for it.

### 9.4 Google Cloud Console Setup

User will set up Google Cloud Console and generate the `GOOGLE_CLIENT_ID` independently.

**Required origins:** `http://localhost:5173`, `https://e-commercial-project-mauve.vercel.app`

### 9.5 Docker / CSP

- **Helmet CSP:** Must add Google domains to `scriptSrc`, `frameSrc`, `connectSrc`, and `styleSrc` arrays in `index.js`
- **Docker:** No new services required
- **Vercel:** No changes required (client-side only)

---

## 10. Acceptance Criteria

### Google OAuth
- [ ] `google-auth-library` is installed as a server dependency
- [ ] `POST /api/auth/google` endpoint exists with token verification
- [ ] New Google users are auto-registered with `auth_provider = 'google'` and `password_hash = NULL`
- [ ] Existing email users are logged in (not duplicated) via Google OAuth
- [ ] JWT cookie is set identically to the existing login flow
- [ ] `GoogleLoginButton` component renders the GIS button on the Login page
- [ ] `AuthContext` has a `googleLogin(credential)` function
- [ ] GIS script is loaded in `index.html`
- [ ] CSP directives updated in Helmet for `accounts.google.com`
- [ ] `GOOGLE_CLIENT_ID` env var added to `config.js` warnings

### SPA SEO
- [ ] `react-helmet-async` is installed as a client dependency
- [ ] `<HelmetProvider>` wraps the app in `main.jsx`
- [ ] `Home.jsx`, `Products.jsx`, `ProductDetails.jsx`, `About.jsx`, `Login.jsx` have `<Helmet>` tags
- [ ] `ProductDetails.jsx` includes JSON-LD `Product` schema
- [ ] `index.html` has default meta tags (description, OG)
- [ ] `GET /sitemap.xml` returns valid XML with all active products
- [ ] Sitemap is cached in Redis for 1 hour
- [ ] `SITE_URL` env var is used for sitemap URL generation

### Database
- [ ] `users.auth_provider` column exists with default `'local'`
- [ ] `users.google_id` column exists
- [ ] `users.password_hash` is nullable

### Quality Gates
- [ ] `cd client && npm run lint` passes with zero errors
- [ ] `cd server && npm run lint` passes with zero errors
- [ ] No existing API response shapes altered
- [ ] No existing frontend routes changed

---

## Resolved Decisions

| Question | Decision |
|----------|----------|
| **Prerender Strategy** | **Skipped** — Googlebot executes JavaScript. Social media uses generic OG tags from `index.html`. No `prerender-node` dependency. |
| **`profile_picture` Column** | **Already exists** — Removed from database migration. |
| **Google Cloud Console** | **User handles setup** — User will create OAuth credentials and provide `GOOGLE_CLIENT_ID`. |
