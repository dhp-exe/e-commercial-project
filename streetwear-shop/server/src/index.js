import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import auth from './routes/auth.js';
import products from './routes/products.js';
import cart from './routes/cart.js';
import orders from './routes/orders.js';
import feedback from './routes/feedback.js';
import path from "path";
dotenv.config();

const app = express();
app.use('/uploads', express.static(path.join(process.cwd(), 'src', 'uploads')));
app.use(cors({ origin: ['http://localhost:5173', 'https://2flhl94d-5173.asse.devtunnels.ms'], credentials: true }));
app.use(express.json());

app.use('/api/auth', auth);
app.use('/api/products', products);
app.use('/api/cart', cart);
app.use('/api/orders', orders);
app.use('/api/feedback', feedback);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(process.env.PORT, () => {
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});