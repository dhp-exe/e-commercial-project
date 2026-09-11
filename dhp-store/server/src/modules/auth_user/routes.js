import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/requireAuth.js'; 
import upload from '../../shared/middleware/upload.js';
import { authLimiter } from '../../shared/middleware/rateLimit.js';
import * as authController from './controller.js';

const router = Router();

// POST /api/auth/register
router.post('/register', authLimiter, authController.handleRegister);

// POST /api/auth/login
router.post('/login', authLimiter, authController.handleLogin);

// POST /api/auth/refresh
router.post('/refresh', authController.handleRefreshToken);

// POST /api/auth/logout
router.post('/logout', authController.handleLogout);

// GET /api/auth/profile
router.get('/profile', requireAuth, authController.handleGetProfile);

// POST /api/auth/upload-profile-picture
router.post('/upload-profile-picture', requireAuth, upload.single('profilePicture'), authController.handleUploadProfilePicture);

// PUT /api/auth/profile
router.put('/profile', requireAuth, authController.handleUpdateProfile);

// POST /api/auth/forgot-password
router.post('/forgot-password', authLimiter, authController.handleForgotPassword);

// POST /api/auth/change-password
router.post('/change-password', authLimiter, requireAuth, authController.handleChangePassword);

// POST /api/auth/reset-password
router.post('/reset-password', authLimiter, authController.handleResetPassword);

// POST /api/auth/google
router.post('/google', authLimiter, authController.handleGoogleAuth);

export default router;
