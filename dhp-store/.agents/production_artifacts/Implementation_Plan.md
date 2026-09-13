# Implementation Plan — CDN Image URL Resolution & Static Asset Caching

Based on the approved [Technical_Specification.md](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/.agents/production_artifacts/Technical_Specification.md).

## Phase Breakdown

### Phase 1: Backend Image Formatting Logic (`@be`)
- **Files to modify:** `server/src/shared/utils/formatImageUrl.js`
- **Dependencies:** None
- **Estimated Complexity:** Low
- **Details:**
  - Check `process.env.NODE_ENV === 'production'`.
  - In production:
    - If `process.env.CDN_URL` is truthy: strip trailing slashes from `process.env.CDN_URL`, normalize `dbPath`, and concatenate ensuring exactly one `/` between host and path.
    - If `process.env.CDN_URL` is missing: return raw `dbPath` as fallback.
  - In development (`NODE_ENV !== 'production'`):
    - Strip trailing slashes from `process.env.BACKEND_URL || 'http://localhost:5001'`, normalize `dbPath`, and concatenate cleanly.
  - Retain existing behavior: `!dbPath` returns `null`, `dbPath.startsWith('http')` returns `dbPath`.
- **Verification:** Run standalone node test script covering all branches.

### Phase 2: Express Static Asset Cache-Control Middleware (`@be`)
- **Files to modify:** `server/src/index.js`
- **Dependencies:** None (`express.static` built-in options)
- **Estimated Complexity:** Low
- **Details:**
  - Update `app.use('/uploads', express.static(...))` on line 123 to include `{ maxAge: '30d', immutable: true }`.
- **Verification:** Run `npm run lint` in `server/`.

### Phase 3: Verification & Walkthrough Artifacts
- Run comprehensive test script across edge cases.
- Run `cd server && npm run lint` to guarantee clean ESLint status.
- Generate `Walkthrough.md` in `.agents/production_artifacts/Walkthrough.md`.

---

## Dependency Graph

```
Phase 1 (formatImageUrl logic) ──▶ Phase 2 (Express static middleware) ──▶ Phase 3 (Verification & Walkthrough)
```

Critical Path: Phase 1 ➔ Phase 2 ➔ Phase 3.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Malformed double-slash URL concatenation (e.g. `https://cdn...//uploads`) | Medium | High | Strip trailing slash from base URLs with `.replace(/\/+$/, '')` and ensure normalized path starts with single `/`. |
| Missing `CDN_URL` in production causing undefined URL prefix | Low | Medium | Strict fallback to return raw `dbPath` when `CDN_URL` is falsy. |
| ESLint failures | Low | Medium | Zero tolerance: run `eslint src/` and ensure clean pass. |
