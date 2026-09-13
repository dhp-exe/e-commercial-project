# Walkthrough — CDN Image URL Resolution & Static Asset Caching

## Summary
Updated backend image formatting logic in `server/src/shared/utils/formatImageUrl.js` to dynamically route image requests through the Cloudflare R2 CDN (`process.env.CDN_URL`) in production with safe slash handling and raw path fallback, and added long-term browser cache-control headers (`maxAge: '30d'`, `immutable: true`) for `/uploads` in `server/src/index.js`.

---

## Files Modified

### Modified Files
- `server/src/shared/utils/formatImageUrl.js`
  - Added environment detection for `process.env.NODE_ENV === 'production'`.
  - In production, checks `process.env.CDN_URL`. If unset, falls back directly to the raw `dbPath`.
  - If `CDN_URL` is set, strips trailing slashes and cleanly joins with normalized path to eliminate duplicate slashes.
  - In development, cleanly prepends `process.env.BACKEND_URL || 'http://localhost:5001'`.
  - Preserves handling for null/empty paths and external HTTP/HTTPS URLs.
- `server/src/index.js`
  - Configured `express.static(path.join(process.cwd(), 'src', 'uploads'), { maxAge: '30d', immutable: true })` for `/uploads`.

---

## Phase Completion Log

### Phase 1: Backend Image Formatting Logic (`@be`) ✅
- Implemented environment-driven image URL formatting with fallback and slash de-duplication in `server/src/shared/utils/formatImageUrl.js`.
- Verified with unit tests covering dev default, dev trailing slash, legacy filenames, production CDN, production CDN trailing slash, double slash inputs, missing CDN fallback, null paths, empty paths, and external URLs.
- Lint status: ✅ Clean

### Phase 2: Express Static Asset Cache-Control Middleware (`@be`) ✅
- Added `maxAge: '30d'` and `immutable: true` options to `express.static` serving `/uploads` in `server/src/index.js`.
- Lint status: ✅ Clean

### Phase 3: Comprehensive Verification ✅
- Executed `npm run lint` in `server/` with zero warnings and zero errors.
- Verified test suite and edge cases.
- Lint status: ✅ Clean

---

## Verification Results
- **Backend Lint:** ✅ Clean (`eslint src/` passed with code 0).
- **Unit & Edge Case Matrix:**
  - `Dev default`: `http://localhost:5001/uploads/pic.jpg` ✅
  - `Dev trailing slash`: `http://localhost:5001/uploads/pic.jpg` ✅
  - `Dev legacy filename`: `http://localhost:5001/uploads/123.webp` ✅
  - `Prod CDN`: `https://cdn.dhpstore.studio/uploads/pic.jpg` ✅
  - `Prod CDN trailing slash`: `https://cdn.dhpstore.studio/uploads/pic.jpg` ✅
  - `Prod double slash input`: `https://cdn.dhpstore.studio/uploads/pic.jpg` ✅
  - `Prod fallback raw`: `/uploads/pic.jpg` ✅
  - `Null / empty path`: `null` ✅
  - `External URL`: `https://google.com/pic.png` ✅

---

## Known Limitations
- Images uploaded during development reside in `server/src/uploads` on local disk; syncing local uploads to Cloudflare R2 requires a dedicated migration script or S3/R2 client worker if production replication from local dev is needed in the future.
