import dotenv from 'dotenv';
dotenv.config();

// ── Required Environment Variables ──────────────────────────────────
const required = [
  'DB_HOST',
  'DB_USER',
  'DB_PASS',
  'DB_NAME',
  'JWT_SECRET',
  'STRIPE_SECRET_KEY',
];

const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(`FATAL: Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

// ── Warnings ────────────────────────────────────────────────────────
if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 64) {
  console.warn('WARNING: JWT_SECRET is shorter than recommended (64+ hex chars for HS256).');
}

if (!process.env.CORS_ORIGINS) {
  console.warn('WARNING: CORS_ORIGINS not set. Defaulting to http://localhost:5173.');
}

if (!process.env.STRIPE_WEBHOOK_SECRET) {
  console.warn('WARNING: STRIPE_WEBHOOK_SECRET not set. Stripe webhooks will not function.');
}

if (!process.env.GOOGLE_CLIENT_ID) {
  console.warn('WARNING: GOOGLE_CLIENT_ID not set. Google OAuth login will not function.');
}

if (!process.env.SITE_URL) {
  console.warn('WARNING: SITE_URL not set. Sitemap will use default Vercel URL.');
}

const r2Required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'];
const missingR2 = r2Required.filter((key) => !process.env[key]);
if (missingR2.length > 0) {
  console.warn(`WARNING: Missing Cloudflare R2 environment variables (${missingR2.join(', ')}). Image uploads will fall back to local disk storage.`);
}
