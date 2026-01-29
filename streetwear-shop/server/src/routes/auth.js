import { Router } from 'express';
import { pool } from '../db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import { requireAuth } from '../middleware/auth.js'; 

dotenv.config();

const router = Router();

// image upload setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'src/uploads/'); 
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });


// POST /register
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ message: 'Missing fields' });
  const hash = await bcrypt.hash(password, 10);
  try {
    const [result] = await pool.execute(
      'INSERT INTO users (email, password_hash, name) VALUES (?,?,?)',
      [email, hash, name]
    );
    const token = jwt.sign({ id: result.insertId, email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  } catch (e) {
    if (e && e.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Email already used' });
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await pool.execute('SELECT * FROM users WHERE email=?', [email]);
    const user = rows[0];
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: 'Invalid email or password' });
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, name: user.name });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /profile - Get current user info
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT id, name, email, phone, address, profile_picture FROM users WHERE id=?', [req.user.id]);
    const user = rows[0];
    if (!user) return res.status(404).json({ message: 'User not found' });

    const [counts] = await pool.execute(
      `SELECT status, COUNT(*) as count FROM orders WHERE user_id = ? GROUP BY status`, 
      [req.user.id]
    );
    const orderStats = { new: 0, confirmed: 0, shipping: 0, received: 0, cancelled: 0 };
    counts.forEach(row => {
      if (orderStats[row.status] !== undefined) orderStats[row.status] = row.count;
    });

    // Dummy vouchers
    const dummyVouchers = [
      { code: 'WELCOME20', discount: '20% OFF', expiryDate: '31-12-2026' },
      { code: 'FREESHIP', discount: 'Free Shipping', expiryDate: '30-06-2026' }
    ];

    res.json({
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      address: user.address || '',
      profilePicture: user.profile_picture ? `http://localhost:5001/uploads/${user.profile_picture}` : null,
      orders: orderStats,
      vouchers: dummyVouchers
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /upload-profile-picture
router.post('/upload-profile-picture', requireAuth, upload.single('profilePicture'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  
  try {
    const fileName = req.file.filename;
    
    await pool.execute('UPDATE users SET profile_picture = ? WHERE id = ?', [fileName, req.user.id]);

    res.json({ 
      message: 'Upload successful', 
      profilePicture: `http://localhost:5001/uploads/${fileName}` 
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error uploading image' });
  }
});

// PUT /profile - Update Phone & Address
router.put('/profile', requireAuth, async (req, res) => {
  const { phone, address } = req.body;
  try {
    await pool.execute('UPDATE users SET phone = ?, address = ? WHERE id = ?', [phone, address, req.user.id]);
    res.json({ message: 'Profile updated successfully' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error updating profile' });
  }
});

// POST /change-password
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ message: 'Missing fields' });

  try {
    // Get current password hash
    const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id=?', [req.user.id]);
    const user = rows[0];
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Verify current password
    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) return res.status(400).json({ message: 'Incorrect current password' });

    // Hash new password and update
    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);

    res.json({ message: 'Password changed successfully' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error changing password' });
  }
});

export default router;