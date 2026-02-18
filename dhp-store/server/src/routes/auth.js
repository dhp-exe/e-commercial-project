import { Router } from 'express';
import { pool } from '../db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { requireAuth } from '../middleware/requireAuth.js'; 
import upload from '../middleware/upload.js';
import { authLimiter } from '../middleware/rateLimit.js';
import nodemailer from 'nodemailer';

dotenv.config();

const router = Router();

// Determine cookie options that work with ngrok / forwarded requests.
const isSecureCookie = process.env.NODE_ENV === 'production' || process.env.USE_NGROK === 'true' || process.env.TRUST_PROXY === '1';
const cookieOptions = {
  httpOnly: true,
  secure: isSecureCookie,
  sameSite: isSecureCookie ? 'none' : 'strict',
  maxAge: 60 * 60 * 1000
};

// Helper to reliably construct the image URL
const formatImageUrl = (dbPath) => {
  if (!dbPath) return null;
  if (dbPath.startsWith('http')) return dbPath; // Leave external URLs alone
  
  const BASE_URL = process.env.BACKEND_URL || 'http://localhost:5001';
  // Auth sometimes saves just the filename, sometimes the path. Ensure /uploads/ is there.
  const pathWithUploads = dbPath.startsWith('/uploads/') ? dbPath : `/uploads/${dbPath}`;
  return `${BASE_URL}${pathWithUploads}`;
};

async function sendEmail(to, link) {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      logger: true, 
      debug: true   
    });

    const mailOptions = {
      from: `"Streetwear Support" <${process.env.EMAIL_USER}>`,
      to: to,
      subject: 'Password Reset Request',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Password Reset</h2>
          <p>Click below to reset:</p>
          <a href="${link}">Reset Password</a>
        </div>
      `
    };

    await transporter.verify();
    console.log("Server is ready to take our messages");

    const info = await transporter.sendMail(mailOptions);
    
    console.log("---------------------------------------");
    console.log("📧 EMAIL SENT SUCCESSFULLY");
    console.log("Message ID:", info.messageId);
    console.log("---------------------------------------");

  } catch (error) {
    console.error("---------------------------------------");
    console.error("❌ EMAIL FAILED TO SEND");
    console.error("Error Message:", error.message);
    if (error.code === 'EAUTH') {
        console.error("👉 CAUSE: Invalid Login. Check EMAIL_USER and EMAIL_PASS in .env");
        console.error("👉 TIP: You must use an 'App Password', not your login password.");
    }
    console.error("---------------------------------------");
    throw error; 
  }
}

// POST /register
router.post('/register', authLimiter ,async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ message: 'Missing fields' });
  const hash = await bcrypt.hash(password, 10);
  try {
    const [result] = await pool.execute(
      'INSERT INTO users (email, password_hash, name) VALUES (?,?,?)',
      [email, hash, name]
    );
    const userId = result.insertId;
    const token = jwt.sign(
      { id: userId, email },
      process.env.JWT_SECRET,
      { expiresIn: '60m' }
    );

    res.cookie('access_token', token, cookieOptions);
    res.json({ name });
  } 
  catch (e) {
    if (e && e.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Email already used' });
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /login
router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await pool.execute('SELECT * FROM users WHERE email=?', [email]);
    const user = rows[0];
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: 'Invalid email or password' });

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '60m' }
    );

    res.cookie('access_token', token, cookieOptions);
    res.json({ name: user.name });
  } 
  catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /logout
router.post('/logout', (_req, res) => {
  res.clearCookie('access_token', cookieOptions);
  res.json({ message: 'Logged out' });
});

// GET /profile - Get current user info
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT id, name, email, role ,phone, address, profile_picture FROM users WHERE id=?', [req.user.id]);
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

    const dummyVouchers = [
      { code: 'WELCOME20', discount: '20% OFF', expiryDate: '31-12-2026' },
      { code: 'FREESHIP', discount: 'Free Shipping', expiryDate: '30-06-2026' }
    ];

    res.json({
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone || '',
      address: user.address || '',
      profilePicture: formatImageUrl(user.profile_picture), // FIX: Dynamic URL
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
      profilePicture: formatImageUrl(fileName) // FIX: Dynamic URL
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

// POST /forgot-password
router.post('/forgot-password', authLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    const [rows] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);

    if (rows.length > 0) {
      const user = rows[0];
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await pool.execute(
        `INSERT INTO password_resets (user_id, token_hash, expires_at, used) VALUES (?, ?, ?, false)`,
        [user.id, tokenHash, expiresAt]
      );

      const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
      const resetLink = `${FRONTEND_URL}/reset-password?token=${rawToken}&email=${email}`;
      
      await sendEmail(email, resetLink);
    }

    return res.json({ message: 'If the email exists, a reset link has been sent.' });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});


// POST /change-password
router.post('/change-password', authLimiter, requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ message: 'Missing fields' });

  try {
    const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id=?', [req.user.id]);
    const user = rows[0];
    if (!user) return res.status(404).json({ message: 'User not found' });

    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) return res.status(400).json({ message: 'Incorrect current password' });

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);

    res.json({ message: 'Password changed successfully' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error changing password' });
  }
});

// POST /reset-password
router.post('/reset-password', authLimiter, async (req, res) => {
  // ... (No URL fixes needed here, keeping logic the same)
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ message: 'Missing token or password' });
  }

  try {
    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const [rows] = await pool.execute(
      'SELECT * FROM password_resets WHERE token_hash = ? AND expires_at > NOW() AND used = 0',
      [tokenHash]
    );

    if (rows.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    const resetRecord = rows[0];
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    await pool.execute(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [newPasswordHash, resetRecord.user_id]
    );

    await pool.execute(
      'UPDATE password_resets SET used = 1 WHERE id = ?',
      [resetRecord.id]
    );

    res.json({ message: 'Password has been reset successfully' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;