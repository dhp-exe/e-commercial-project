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
import helmet from 'helmet'
import fs from 'fs';

dotenv.config();
const morgan = require('morgan');

const app = express();
app.set('trust proxy', 1);

// Define Paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const clientBuildPath = join(__dirname, '../../client/dist');

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://dhp-store.onrender.com"],
      },
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  })
);
app.use(morgan('common'));
app.use('/uploads', express.static(path.join(process.cwd(), 'src', 'uploads')));
app.use(express.static(clientBuildPath));

app.use(globalLimiter); 
app.use(cookieParser());
app.use(cors({ 
  origin: ['http://localhost:5173', 'https://handed-administrative-soo.ngrok-free.dev'], 
  credentials: true 
}));

app.use(express.json());

// API ROUTES
app.use('/api/auth', auth);
app.use('/api/products', products);
app.use('/api/cart', cart);
app.use('/api/orders', orders);
app.use('/api/feedback', feedback);
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('*', (req, res) => {
  res.sendFile(join(clientBuildPath, 'index.html'));
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});