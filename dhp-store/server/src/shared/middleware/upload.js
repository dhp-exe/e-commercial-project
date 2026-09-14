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
  const ext = path.extname(file.originalname).toLowerCase();
  const rawBaseName = path.parse(file.originalname).name;
  const sanitized = rawBaseName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'image';
  const randomSuffix = Math.floor(1000 + Math.random() * 9000); // 4-digit suffix (1000-9999)
  return `${sanitized}-${randomSuffix}${ext}`;
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
    key: function (_req, file, cb) {
      const uniqueFilename = generateFilename(file);
      file.filename = uniqueFilename;
      cb(null, `uploads/${uniqueFilename}`);
    },
  });
} else {
  storage = multer.diskStorage({
    destination: function (_req, _file, cb) {
      cb(null, 'src/uploads/');
    },
    filename: function (_req, file, cb) {
      cb(null, generateFilename(file));
    },
  });
}

const fileFilter = (_req, file, cb) => {
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
