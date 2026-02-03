import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import auth from './routes/auth.js';
import products from './routes/products.js';
import cart from './routes/cart.js';
import orders from './routes/orders.js';
import feedback from './routes/feedback.js';
import path from "path";
import cookieParser from 'cookie-parser';
import { globalLimiter } from './middleware/rateLimit.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

dotenv.config();

const app = express();

// ---------------------------------------------------------
// 1. SERVE STATIC FILES FIRST (Bypass Rate Limiter & Auth)
// ---------------------------------------------------------

// Define Paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const clientBuildPath = join(__dirname, '../../client/dist');

// Serve Uploads (Images)
app.use('/uploads', express.static(path.join(process.cwd(), 'src', 'uploads')));

// Serve Frontend Assets (CSS, JS, Images)
app.use(express.static(clientBuildPath));

// ---------------------------------------------------------
// 2. APPLY MIDDLEWARE (For API routes)
// ---------------------------------------------------------

app.use(globalLimiter); // 👈 Now this only limits API calls, not CSS/JS
app.use(cookieParser());

app.use(cors({ 
  origin: ['http://localhost:5173', 'https://handed-administrative-soo.ngrok-free.dev'], 
  credentials: true 
}));

app.use(express.json());

// ---------------------------------------------------------
// 3. API ROUTES
// ---------------------------------------------------------
app.use('/api/auth', auth);
app.use('/api/products', products);
app.use('/api/cart', cart);
app.use('/api/orders', orders);
app.use('/api/feedback', feedback);
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ---------------------------------------------------------
// 4. CATCH-ALL ROUTE (For React Router)
// ---------------------------------------------------------
// This must be last, to catch non-API requests
app.get('*', (req, res) => {
  res.sendFile(join(clientBuildPath, 'index.html'));
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});