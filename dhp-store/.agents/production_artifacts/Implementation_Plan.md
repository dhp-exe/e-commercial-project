# Implementation Plan — Direct-to-Cloudflare R2 Image Uploads

Based on the approved [Technical_Specification.md](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/.agents/production_artifacts/Technical_Specification.md).

## Phase Breakdown

### Phase 1: Install Dependencies (`@be`)
- Install `@aws-sdk/client-s3` and `multer-s3` in `server/`.
- Ensure `server/package.json` reflects the new production dependencies.

### Phase 2: Configuration Validation (`@be`)
- Update `server/src/config.js` to check for `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME`.
- Emit a non-fatal warning if any are missing, indicating fallback to local disk storage.

### Phase 3: Centralized Upload Middleware Restructuring (`@be`)
- Update `server/src/shared/middleware/upload.js`:
  - Check if R2 environment variables are configured.
  - If configured:
    - Initialize `S3Client` with `endpoint: https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, `region: 'auto'`, and R2 credentials.
    - Configure `multerS3` with `s3`, `bucket: process.env.R2_BUCKET_NAME`, and `contentType: multerS3.AUTO_CONTENT_TYPE`.
    - In `key` callback: generate `uniqueSuffix + ext`, set `file.filename = uniqueFilename`, and return `uploads/${uniqueFilename}`.
  - If not configured:
    - Fallback gracefully to `multer.diskStorage` targeting `'src/uploads/'`.
  - Retain `ALLOWED_TYPES` and `limits.fileSize: 5 * 1024 * 1024`.

### Phase 4: Automated Verification & Walkthrough Artifacts
- Run standalone Node verification script testing:
  - `S3Client` instantiation and endpoint generation.
  - Key generation callback and `file.filename` contract.
  - Missing-env fallback to `multer.diskStorage`.
- Run `cd server && npm run lint` to guarantee clean ESLint status.
- Generate `Walkthrough.md` and `Audit_Report.md`.

---

## Dependency Graph

```
Phase 1 (Dependencies) ──▶ Phase 2 (Config check) ──▶ Phase 3 (Upload Middleware) ──▶ Phase 4 (Verification & Artifacts)
```

Critical Path: Phase 1 ➔ Phase 2 ➔ Phase 3 ➔ Phase 4.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Domain services break due to missing `file.filename` | Medium | High | Explicitly assign `file.filename = uniqueFilename` inside `multer-s3` `key` callback so `req.file.filename` is always populated. |
| Browser downloads uploaded images as binary octet-stream | Medium | Medium | Set `contentType: multerS3.AUTO_CONTENT_TYPE` so `multer-s3` sets the correct image MIME type in R2 object metadata. |
| Offline local development crashes if R2 creds are unset | Low | High | Implement conditional fallback to `multer.diskStorage` when R2 credentials are not present in `.env`. |
