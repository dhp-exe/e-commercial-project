# Audit Report — Direct-to-Cloudflare R2 Image Uploads

> **Auditor:** @qa (QA Engineer & Security Auditor)  
> **Date:** 2026-09-13  
> **Scope:** Code changes in `server/src/shared/middleware/upload.js`, `server/src/config.js`, and `server/package.json`  
> **Status:** 🟢 **PASS**

---

## 1. Specification Compliance

- [x] `@aws-sdk/client-s3` and `multer-s3` installed in `server/`.
- [x] S3Client configured with Cloudflare R2 endpoint format: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`.
- [x] Enforces `contentType: multerS3.AUTO_CONTENT_TYPE` so browsers display image assets inline rather than downloading binary streams.
- [x] Assigns `file.filename` and `req.file.filename` to `uniqueFilename` inside the `key` callback.
- [x] Prepends `uploads/` prefix to object keys in the R2 bucket.
- [x] Implements graceful fallback to `multer.diskStorage` when R2 credentials are missing.
- [x] Added non-fatal startup warning in `server/src/config.js`.
- [x] Zero regressions to `auth_user` and `catalog` controllers and services.
- [x] Zero ESLint warnings or errors (`npm run lint` passed cleanly).

---

## 2. Architectural Integrity

- [x] Modular Monolith design is strictly maintained. The upload abstraction remains in `server/src/shared/middleware/upload.js` as shared infrastructure.
- [x] Neither `auth_user` nor `catalog` modules were modified; their public facades and internal services continue working without awareness of the underlying storage engine.
- [x] Database contracts remain intact: relative path `/uploads/<filename>` is preserved in TiDB.

---

## 3. Code Quality — DRY & SRP

- [x] **DRY:** Unique filename generation logic (`Date.now() + '-' + Math.round(Math.random() * 1e9) + ext`) is extracted into a helper function `generateFilename(file)` shared by both R2 and local disk storage.
- [x] **SRP:** `upload.js` is dedicated exclusively to multipart stream handling, MIME verification, and storage engine orchestration.
- [x] **Dead Code:** Zero dead code, unreachable branches, or unused imports.

---

## 4. Strictness & Linter Integrity

- [x] Zero `eslint-disable` or `@ts-ignore` comments.
- [x] All callback arguments comply with `no-unused-vars` patterns (`_req`, `_file`).
- [x] ESLint flat config executed with 0 errors and 0 warnings.

---

## 5. Security Audit

- [x] **MIME Whitelisting:** Retains strict MIME validation (`image/jpeg`, `image/png`, `image/webp`, `image/gif`) rejecting non-image formats.
- [x] **File Size Bounds:** Retains strict 5 MB file size boundary (`limits.fileSize: 5 * 1024 * 1024`).
- [x] **Credentials Safety:** R2 API tokens and keys are loaded through environment variables; no credentials are hardcoded.
- [x] **Collision & Enumeration Prevention:** Random numeric suffix with microsecond timestamps prevents object overwriting or sequential enumeration in Cloudflare R2.

---

## 6. Error & Fallback Handling

- [x] Graceful fallback to local disk storage prevents startup crashes during offline development or test runs.
- [x] S3Client network timeouts or bad credentials are surfaced through standard Express error pipelines.
- [x] Non-fatal warning logged to console when R2 credentials are missing, preventing silent local disk fallback without developer awareness.

---

## 7. Performance

- [x] Directly streaming uploads to Cloudflare R2 eliminates local disk I/O and server disk bloat.
- [x] Offloading images to R2 enables instant worldwide caching and delivery through Cloudflare CDN (`https://cdn.dhpstore.studio`).

---

## 8. Audit Findings

### 🔴 FATAL (Must Fix)
*None.*

### 🟡 WARNING (Should Fix)
*None.*

### 🟢 INFO (Observation)
1. **[upload.js:41]** Assigning both `file.filename = uniqueFilename` and `req.file.filename = uniqueFilename` cleanly protects against any differences between single-file and multi-file middleware execution in Multer.

### ✅ PASSED
- All requirements from the approved `Technical_Specification.md` implemented.
- Node verification script passed all tests.
- ESLint passed with zero warnings and zero errors.
