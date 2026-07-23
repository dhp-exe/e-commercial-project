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
