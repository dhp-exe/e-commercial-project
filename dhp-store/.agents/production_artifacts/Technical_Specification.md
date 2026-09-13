# Technical Specification: Direct-to-Cloudflare R2 Image Uploads

> **Author:** @pm (Senior Product Manager)  
> **Date:** 2026-09-13  
> **Scope:** `server/src/shared/middleware/upload.js`, `server/src/config.js`, dependencies `@aws-sdk/client-s3` and `multer-s3`  
> **Constraint:** Zero breaking changes to `auth_user` or `catalog` controllers/services; preserve `/uploads/<filename>` relative path schema in TiDB.

---

## 1. Overview

Product static images are now hosted on Cloudflare R2 and served through the high-performance CDN `https://cdn.dhpstore.studio`. In the previous cycle, `formatImageUrl` was updated to resolve `/uploads/...` paths to `https://cdn.dhpstore.studio/uploads/...` in production.

Currently, active image uploads (user profile avatars and admin product/variant gallery images) are written to the local server disk (`server/src/uploads/`). In containerized, serverless, or multi-instance deployments (such as Render or Docker), local disk storage is ephemeral and disconnected from the Cloudflare R2 bucket.

This specification defines the migration of the centralized Multer upload middleware from local disk storage to **direct-to-Cloudflare R2 streaming** via the S3-compatible API (`@aws-sdk/client-s3` + `multer-s3`), while preserving the existing database schema and domain module contracts.

---

## 2. Audit Findings: Current Upload Implementation

### 2.1 Centralized Upload Middleware (`server/src/shared/middleware/upload.js`)
- **Engine:** `multer.diskStorage({ destination: 'src/uploads/', filename: ... })`
- **Allowed MIME Types:** `image/jpeg`, `image/png`, `image/webp`, `image/gif` (`ALLOWED_TYPES`)
- **File Size Limit:** `5 * 1024 * 1024` bytes (5 MB per file) (`limits.fileSize`)
- **File Naming Convention:**
  ```javascript
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
  cb(null, uniqueSuffix + path.extname(file.originalname).toLowerCase());
  ```
  Generates filenames such as: `1773456789123-456789012.webp`.

### 2.2 User Avatar Upload (`server/src/modules/auth_user`)
- **Endpoint:** `POST /api/auth/upload-profile-picture`
- **Middleware:** `requireAuth`, `upload.single('profilePicture')`
- **Field Name:** `'profilePicture'` (single file)
- **Controller (`handleUploadProfilePicture`):**
  Passes `req.file.filename` to `authService.uploadProfilePicture(req.user.id, req.file.filename)`.
- **Service (`uploadProfilePicture`):**
  Constructs relative path: `const filePath = '/uploads/' + filename;`.
- **Database Storage:**
  Executes `UPDATE users SET profile_picture = ? WHERE id = ?`.
  Stored value in TiDB `users.profile_picture`: `'/uploads/1773456789123-456789012.webp'`.

### 2.3 Admin Product / Variant Image Uploads (`server/src/modules/catalog`)
- **Endpoint:** `POST /api/products`
- **Middleware:** `requireAuth`, `verifyAdmin`, `upload.array('images', 10)`
- **Field Name:** `'images'` (up to 10 files)
- **Controller (`createProduct`):**
  Passes parsed multipart JSON `data` and `req.files || []` to `catalogService.createProduct(data, req.files)`.
- **Service (`createProduct`):**
  Loops through `uploadedFiles`:
  ```javascript
  const file = uploadedFiles[i];
  const imgUrl = `/uploads/${file.filename}`;
  const isPrimary = i === 0;
  await catalogRepo.insertProductImage({ productId, imageUrl: imgUrl, isPrimary, sortOrder: i }, conn);
  ```
- **Database Storage:**
  Executes `INSERT INTO product_images (product_id, image_url, is_primary, sort_order) VALUES (?, ?, ?, ?)`.
  Stored value in TiDB `product_images.image_url`: `'/uploads/1773456789123-456789012.webp'`.

### 2.4 Critical Architectural Insight: The `file.filename` Contract
- Both `authService` and `catalogService` expect `file.filename` to be a string containing the bare filename (e.g. `1773456789123-456789012.webp`).
- Standard `multer-s3` populates `file.key` (`uploads/1773456789123-456789012.webp`), `file.location`, and `file.bucket`, but **does not natively populate `file.filename`**.
- **Solution:** In the `multer-s3` storage configuration `key` callback, we will compute the unique filename, assign `file.filename = uniqueFilename`, and return `uploads/${uniqueFilename}` as the S3 object key.
- **Impact:** 100% backward-compatibility with existing domain controllers, services, and repositories without changing a single line of business logic in `auth_user` or `catalog`.

---

## 3. User Stories

- **As an admin uploading product images**, I want my images streamed directly to Cloudflare R2 under `uploads/` so that all users globally can immediately access them via our CDN without taxing server disk space.
- **As a customer changing my profile picture**, I want my avatar uploaded directly to secure object storage with instantaneous CDN availability.
- **As a backend developer running tests locally without cloud credentials**, I want the upload middleware to gracefully fall back to local disk storage when R2 credentials are not set, maintaining offline developer velocity.

---

## 4. Technical Design

### 4.1 Required Dependencies
Install standard AWS SDK v3 client and multer-s3:
```bash
npm install @aws-sdk/client-s3 multer-s3
```

### 4.2 Required Environment Variables
The following variables will be defined in `server/.env` and validated in `server/src/config.js`:

| Variable | Description | Example |
|---|---|---|
| `R2_ACCOUNT_ID` | Cloudflare Account ID | `0123456789abcdef0123456789abcdef` |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 S3 Access Key ID | `a1b2c3d4e5f6...` |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 S3 Secret Access Key | `9z8y7x6w5v4u...` |
| `R2_BUCKET_NAME` | Cloudflare R2 Bucket Name | `dhp-store` |

R2 endpoint format:
```
https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com
```

### 4.3 Architecture of `server/src/shared/middleware/upload.js`

```javascript
import multer from 'multer';
import path from 'path';
import { S3Client } from '@aws-sdk/client-s3';
import multerS3 from 'multer-s3';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const isR2Configured = Boolean(
  process.env.R2_ACCOUNT_ID &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET_NAME
);

function generateFilename(file) {
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
  return uniqueSuffix + path.extname(file.originalname).toLowerCase();
}

let storage;

if (isR2Configured) {
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  storage = multerS3({
    s3,
    bucket: process.env.R2_BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function (req, file, cb) {
      const filename = generateFilename(file);
      // Guarantee backward-compatibility with downstream services expecting file.filename
      file.filename = filename;
      cb(null, `uploads/${filename}`);
    },
  });
} else {
  // Graceful fallback for local development when R2 credentials are not set
  storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'src/uploads/');
    },
    filename: function (req, file, cb) {
      cb(null, generateFilename(file));
    },
  });
}

const fileFilter = (req, file, cb) => {
  if (ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, WebP, and GIF images are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

export default upload;
```

### 4.4 Configuration Validation (`server/src/config.js`)
Add non-fatal warning check:
```javascript
const r2Required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'];
const missingR2 = r2Required.filter((k) => !process.env[k]);
if (missingR2.length > 0) {
  console.warn(`WARNING: Missing Cloudflare R2 environment variables (${missingR2.join(', ')}). Uploads will fall back to local disk.`);
}
```

---

## 5. Data Models & Database Compatibility

- **TiDB Schema:** No schema changes.
- **Stored Values:**
  - `users.profile_picture`: `/uploads/<filename>` (e.g. `/uploads/1773456789123-456789012.webp`)
  - `product_images.image_url`: `/uploads/<filename>` (e.g. `/uploads/1773456789123-456789012.webp`)
- **Compatibility with `formatImageUrl`:**
  - In production: `/uploads/1773...` ➔ `https://cdn.dhpstore.studio/uploads/1773...`
  - In development: `/uploads/1773...` ➔ `http://localhost:5001/uploads/1773...` (or CDN if `NODE_ENV=production` is tested)
  - 1:1 match with the R2 bucket key prefix `uploads/`.

---

## 6. API Contracts

Existing API contracts remain identical.

### 6.1 `POST /api/auth/upload-profile-picture`
- **Headers:** `Authorization` (or JWT cookie), `Content-Type: multipart/form-data`
- **Body:** `profilePicture: <binary>`
- **Response (200 OK):**
  ```json
  {
    "message": "Upload successful",
    "profilePicture": "https://cdn.dhpstore.studio/uploads/1773456789123-456789012.webp"
  }
  ```

### 6.2 `POST /api/products`
- **Headers:** `Authorization` (admin role required), `Content-Type: multipart/form-data`
- **Body:**
  - `data: string` (JSON stringified product info)
  - `images: File[]` (up to 10 image files)
- **Response (201 Created):**
  ```json
  {
    "id": 42,
    "name": "Heavyweight Boxy Tee",
    "base_price": 45,
    "images": [
      {
        "id": 105,
        "image_url": "https://cdn.dhpstore.studio/uploads/1773456789123-456789012.webp",
        "is_primary": true,
        "sort_order": 0
      }
    ]
  }
  ```

---

## 7. Error Handling

| Error Case | Cause | Behavior |
|---|---|---|
| File exceeds 5MB | `limits.fileSize` breached | Multer throws `LIMIT_FILE_SIZE`; centralized error handler or route returns 400/500 |
| Invalid MIME type | e.g. `application/pdf`, `image/bmp` | `fileFilter` rejects with `'Only JPEG, PNG, WebP, and GIF images are allowed'` |
| R2 credentials invalid | Expired/incorrect token | AWS SDK throws S3 client authorization exception; logged to console and returns HTTP 500 |
| R2 bucket unreachable | Cloudflare network partition | S3 connection timeout / error; logged to Sentry & console |
| Offline developer mode | R2 env vars omitted | Automatically falls back to disk storage without throwing startup exceptions |

---

## 8. Security Considerations

- **Credential Isolation:** R2 access keys are stored in environment variables, never committed to git or exposed in client bundles.
- **Least Privilege:** Cloudflare R2 API token should have **Object Read & Write** permissions scoped strictly to the `dhp-store` bucket.
- **Content-Type Enforcement:** `multerS3.AUTO_CONTENT_TYPE` ensures proper `Content-Type` headers are set on R2 objects, avoiding `binary/octet-stream` MIME issues in browsers.
- **Filename Randomization:** `Date.now() + '-' + Math.random()` prevents file overwriting and enumeration attacks.

---

## 9. Testing Strategy

1. **Unit & Contract Verification:**
   - Verify `upload.js` exports a valid Multer instance.
   - Verify that with R2 configured, `file.filename` is assigned during the `key` callback.
   - Verify that with R2 unconfigured, local disk fallback operates seamlessly.
2. **ESLint Verification:**
   - Run `cd server && npm run lint` to verify zero linter errors with ES module imports.
3. **Integration Verification:**
   - Test profile picture upload endpoint.
   - Test product creation upload endpoint.

---

## 10. Acceptance Criteria

- [ ] `@aws-sdk/client-s3` and `multer-s3` installed in `server/package.json`.
- [ ] `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` documented in `.env.example` and validated in `config.js`.
- [ ] `server/src/shared/middleware/upload.js` refactored to use `multer-s3` when R2 credentials exist, targeting the `uploads/` prefix.
- [ ] `file.filename` explicitly populated so downstream `auth_user` and `catalog` services require zero code modifications.
- [ ] Database stores relative path `/uploads/<filename>` matching the R2 bucket key and CDN URL mapping.
- [ ] Zero ESLint errors on `server/src/`.
