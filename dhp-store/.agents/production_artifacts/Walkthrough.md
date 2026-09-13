# Walkthrough — Direct-to-Cloudflare R2 Image Uploads

## Summary
Migrated active image uploads from local disk storage (`src/uploads/`) to direct-to-Cloudflare R2 streaming via `@aws-sdk/client-s3` and `multer-s3`. 

The upload middleware now automatically streams incoming files to the Cloudflare R2 bucket under the `uploads/` prefix, assigns `file.filename` and `req.file.filename` to preserve 100% compatibility with `auth_user` and `catalog` services, and falls back to local disk storage if R2 environment variables are not provided.

---

## Files Modified

### Dependencies
- `server/package.json` & `server/package-lock.json`: Installed `@aws-sdk/client-s3` and `multer-s3`.

### Backend Code
- `server/src/config.js`
  - Added non-fatal startup check for Cloudflare R2 environment variables (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`).
- `server/src/shared/middleware/upload.js`
  - Initialized `S3Client` with Cloudflare R2 S3-compatible endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`.
  - Configured `multerS3` with `contentType: multerS3.AUTO_CONTENT_TYPE`.
  - Configured `key` callback to generate unique filenames, assign `file.filename = uniqueFilename`, and set bucket key to `uploads/${uniqueFilename}`.
  - Implemented automatic fallback to `multer.diskStorage` if R2 credentials are not set.

---

## Phase Completion Log

### Phase 1: Dependencies Installation (`@be`) ✅
- Installed `@aws-sdk/client-s3` and `multer-s3` into `server/package.json`.
- Lint & lockfile verified.

### Phase 2: Configuration Validation (`@be`) ✅
- Added non-fatal warning check in `server/src/config.js`.

### Phase 3: Centralized Upload Middleware Restructuring (`@be`) ✅
- Refactored `server/src/shared/middleware/upload.js` for dual-mode R2 streaming and disk storage fallback.

### Phase 4: Verification & Auditing ✅
- Ran standalone Node verification script verifying S3 key generation, `file.filename` contract, `req.file.filename` assignment, MIME type filtering, and offline disk storage fallback.
- Ran `eslint src/` with zero errors and zero warnings.

---

## Verification Results
- **Backend Lint:** ✅ Clean (`eslint src/` exited with code 0).
- **Automated Verification Matrix:**
  - `R2 Storage Initialization`: ✅ Initialized with auto region and Cloudflare R2 endpoint.
  - `S3 Key Prefix`: ✅ Outputs `uploads/<timestamp>-<random>.<ext>`.
  - `file.filename Contract`: ✅ Correctly assigned for downstream services.
  - `req.file.filename Contract`: ✅ Correctly assigned for controller access.
  - `MIME Type Filter`: ✅ Accepted valid image MIME types (`image/png`, `image/webp`); rejected non-image types (`application/pdf`).
  - `Offline Disk Fallback`: ✅ Automatically defaults to `src/uploads/` when R2 credentials are unset.
