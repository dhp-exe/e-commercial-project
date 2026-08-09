# Walkthrough: Phase 4 — Google OAuth & SPA SEO

> **Spec:** [Technical_Specification.md](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/.agents/production_artifacts/Technical_Specification.md)
> **Completed:** 2026-08-09

---

## Summary

Phase 4 adds two strategic features: **Google OAuth login** for reduced registration friction and **SPA SEO** for search engine discoverability. No existing API contracts or frontend routes were changed.

---

## Changes Made

### New Files (3)

| File | Purpose |
|------|---------|
| [GoogleLoginButton.jsx](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/client/src/components/GoogleLoginButton.jsx) | Self-contained GIS button component using `google.accounts.id.renderButton()` |
| [sitemap.js](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/server/src/routes/sitemap.js) | Dynamic XML sitemap route — queries TiDB for active products, caches in Redis for 1hr |

### Modified Files (10)

| File | Change |
|------|--------|
| [auth.js](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/server/src/routes/auth.js) | Added `POST /google` endpoint with `google-auth-library` token verification, auto-register, and race condition handling |
| [index.js](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/server/src/index.js) | Registered `/sitemap.xml` route; updated CSP `scriptSrc`, `frameSrc`, `connectSrc`, `styleSrc` with `accounts.google.com` |
| [config.js](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/server/src/config.js) | Added warnings for `GOOGLE_CLIENT_ID` and `SITE_URL` env vars |
| [index.html](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/client/index.html) | Added default SEO meta/OG tags + GIS `<script>` tag |
| [main.jsx](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/client/src/main.jsx) | Wrapped app in `<HelmetProvider>` from `react-helmet-async` |
| [AuthContext.jsx](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/client/src/context/AuthContext.jsx) | Added `googleLogin(credential)` function to context |
| [Login.jsx](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/client/src/pages/Login.jsx) | Added `<GoogleLoginButton>` with "or" divider + `<Helmet>` title |
| [Home.jsx](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/client/src/pages/Home.jsx) | Added `<Helmet>` with title, meta, OG tags, Organization JSON-LD |
| [Products.jsx](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/client/src/pages/Products.jsx) | Added `<Helmet>` with title, meta, OG tags |
| [ProductDetails.jsx](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/client/src/pages/ProductDetails.jsx) | Added `<Helmet>` with dynamic title, meta, OG, + Product JSON-LD schema |
| [About.jsx](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/client/src/pages/About.jsx) | Added `<Helmet>` with title, meta, OG tags |

### Dependencies

| Package | Where | Version |
|---------|-------|---------|
| `google-auth-library` | Server | Latest |
| `react-helmet-async` | Client | Latest |

### Database Migration

```sql
ALTER TABLE users ADD COLUMN auth_provider VARCHAR(20) DEFAULT 'local';
ALTER TABLE users ADD COLUMN google_id VARCHAR(255) DEFAULT NULL;
ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL;
```

### New Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth 2.0 Client ID (server + client as `VITE_GOOGLE_CLIENT_ID`) |
| `SITE_URL` | Yes | Public frontend URL for sitemap generation |

---

## Verification

| Check | Result |
|-------|--------|
| `cd server && npm run lint` | ✅ 0 errors (9 pre-existing warnings) |
| `cd client && npm run lint` | ✅ 0 errors |
| No API contracts changed | ✅ Confirmed |
| No frontend routes changed | ✅ Confirmed |

---

## Architecture Decisions

1. **Google OAuth uses GIS (Google Identity Services)** — loaded via `<script>` tag in `index.html`, not an npm package. This is Google's recommended approach for web apps.
2. **Token verification is server-side only** — the frontend sends the raw `credential` to `POST /api/auth/google`, which uses `OAuth2Client.verifyIdToken()` to validate against Google's public keys.
3. **OAuth users have `password_hash = NULL`** — the existing `POST /login` naturally rejects them (bcrypt.compare against null returns false).
4. **JSON-LD is rendered inline via react-helmet-async** — injected as `<script type="application/ld+json">` in the `<head>`, which Googlebot parses during JavaScript execution.
5. **Prerendering is skipped** — Googlebot executes JS natively. Social media crawlers get generic OG fallbacks from `index.html`.
