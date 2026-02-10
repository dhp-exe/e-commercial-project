import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import auth from './routes/auth.js';
import products from './routes/products.js';
import cart from './routes/cart.js';
import orders from './routes/orders.js';
import feedback from './routes/feedback.js';
import recommendations from './routes/recommendations.js';
import chat from './routes/chat.js';
import path from "path";
import cookieParser from 'cookie-parser';
import { globalLimiter } from './middleware/rateLimit.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import helmet from 'helmet';
import morgan from 'morgan';
import fs from 'fs';

dotenv.config();

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
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:", "http:", "blob:"],
        connectSrc: ["'self'", "https://dhp-store.onrender.com", "http://localhost:5001"],
      },
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    crossOriginResourcePolicy: { policy: "cross-origin" } 
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
app.use('/api/recommend', recommendations);
app.use('/api/chat', chat);
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('*', (req, res) => {
  res.sendFile(join(clientBuildPath, 'index.html'));
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});