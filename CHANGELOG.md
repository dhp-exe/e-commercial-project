# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-03

### Added
- **Phase 2:** Added `POST /api/products/batch` endpoint (max 50 IDs) for efficient cart hydration ([#16](https://github.com/dhp-exe/e-commercial-project/pull/16)).
- **Phase 3:** Added multi-stage Docker builds for all 3 services running under non-root users, utilizing `libmariadb3` for TiDB compatibility ([#17](https://github.com/dhp-exe/e-commercial-project/pull/17)).
- **Phase 3:** Created `.github/workflows/ci.yml` for parallel linting, syntax checking, and Docker Compose build verification ([#17](https://github.com/dhp-exe/e-commercial-project/pull/17)).

### Changed
- **Phase 1:** Integrated TanStack Query (`@tanstack/react-query`) with custom hook factory (`useProducts`) for automatic caching, background refetching, and request deduplication ([#16](https://github.com/dhp-exe/e-commercial-project/pull/16)).
- **Phase 1:** Added `useMemo` optimizations in `Products.jsx` (catalog filtering/sorting) and `CartContext.jsx` (cart total computations) ([#16](https://github.com/dhp-exe/e-commercial-project/pull/16)).
- **Phase 2:** Denormalized `sold_count` into `products` table and updated order transactions to increment it atomically, eliminating expensive subquery joins ([#16](https://github.com/dhp-exe/e-commercial-project/pull/16)).
- **Phase 2:** Wrapped AI recommendation routes with Redis caching (300s TTL) featuring graceful fallback on cache failure ([#16](https://github.com/dhp-exe/e-commercial-project/pull/16)).
- **Phase 3:** Integrated Sentry (`@sentry/node`) for backend error tracking and performance monitoring ([#17](https://github.com/dhp-exe/e-commercial-project/pull/17)).
- **Phase 3:** Hardened Nginx configuration with Gzip compression, static asset caching, and security headers (`X-Frame-Options`, `X-Content-Type-Options`) ([#17](https://github.com/dhp-exe/e-commercial-project/pull/17)).

### Removed
- **Phase 1:** Removed redundant `useEffect`/`useState` logic across page components ([#16](https://github.com/dhp-exe/e-commercial-project/pull/16)).
