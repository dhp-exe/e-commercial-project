import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import * as Sentry from '@sentry/node';
import { OAuth2Client } from 'google-auth-library';
import { formatImageUrl } from '../../shared/utils/formatImageUrl.js';
import { emailQueue } from '../communication/index.js';
import { getOrderStatsByUserId } from '../orders/index.js';
import * as authRepository from './repository.js';

// ── Cookie Configuration ────────────────────────────────────────────
const isSecureCookie = process.env.NODE_ENV === 'production' || process.env.USE_NGROK === 'true' || process.env.TRUST_PROXY === '1';

export const accessCookieOptions = {
  httpOnly: true,
  secure: isSecureCookie,
  sameSite: isSecureCookie ? 'none' : 'strict',
  maxAge: 15 * 60 * 1000, // 15 minutes
};

export const refreshCookieOptions = {
  httpOnly: true,
  secure: isSecureCookie,
  sameSite: isSecureCookie ? 'none' : 'strict',
  path: '/api/auth', // Only sent to auth endpoints
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
}

export async function generateRefreshToken(userId) {
  const rawToken = crypto.randomBytes(64).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await authRepository.createRefreshToken({ userId, tokenHash, expiresAt });
  return rawToken;
}

export async function issueTokenPair(res, user) {
  const accessToken = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user.id);

  res.cookie('access_token', accessToken, accessCookieOptions);
  res.cookie('refresh_token', refreshToken, refreshCookieOptions);
}

export function clearAuthCookies(res) {
  res.clearCookie('access_token', accessCookieOptions);
  res.clearCookie('refresh_token', refreshCookieOptions);
}

export async function register({ email, password, name, res }) {
  const hash = await bcrypt.hash(password, 10);
  const userId = await authRepository.createUser({ email, passwordHash: hash, name });
  const user = { id: userId, email };

  await issueTokenPair(res, user);
  return { name };
}

export async function login({ email, password, res }) {
  const user = await authRepository.findUserByEmail(email);
  if (!user) {
    return { error: 'Invalid email or password', statusCode: 401 };
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return { error: 'Invalid email or password', statusCode: 401 };
  }

  await issueTokenPair(res, user);
  return { name: user.name };
}

export async function refreshToken({ rawToken, res }) {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const refreshRecord = await authRepository.findActiveRefreshToken(tokenHash);

  if (!refreshRecord) {
    clearAuthCookies(res);
    return { error: 'Invalid or expired refresh token', statusCode: 401 };
  }

  // Revoke old refresh token (single-use rotation)
  await authRepository.revokeRefreshTokenById(refreshRecord.id);

  const user = await authRepository.findUserBasicById(refreshRecord.user_id);
  if (!user) {
    clearAuthCookies(res);
    return { error: 'User no longer exists', statusCode: 401 };
  }

  await issueTokenPair(res, user);
  return { message: 'Token refreshed' };
}

export async function logout({ rawToken, res }) {
  if (rawToken) {
    try {
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      await authRepository.revokeRefreshTokenByHash(tokenHash);
    } catch (err) {
      console.error('Error revoking refresh token:', err.message);
    }
  }

  clearAuthCookies(res);
  return { message: 'Logged out' };
}

export async function getProfile(userId) {
  const user = await authRepository.findUserById(userId);
  if (!user) return null;

  // Cross-module call: order stats
  const orderStats = await getOrderStatsByUserId(userId);

  const dummyVouchers = [
    { code: 'WELCOME20', discount: '20% OFF', expiryDate: '31-12-2026' },
    { code: 'FREESHIP', discount: 'Free Shipping', expiryDate: '30-06-2026' }
  ];

  return {
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone || '',
    address: user.address || '',
    profilePicture: formatImageUrl(user.profile_picture),
    authProvider: user.auth_provider,
    orders: orderStats,
    vouchers: dummyVouchers
  };
}

export async function uploadProfilePicture(userId, filename) {
  const filePath = `/uploads/${filename}`;
  await authRepository.updateUserProfilePicture(userId, filePath);
  return {
    message: 'Upload successful',
    profilePicture: formatImageUrl(filePath)
  };
}

export async function updateProfile(userId, { phone, address }) {
  await authRepository.updateUserProfile(userId, { phone, address });
  return { message: 'Profile updated successfully' };
}

export async function forgotPassword(email) {
  const user = await authRepository.findUserIdByEmail(email);

  if (user) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await authRepository.createPasswordReset({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetLink = `${FRONTEND_URL}/reset-password?token=${rawToken}&email=${email}`;

    try {
      await emailQueue.add('password-reset', {
        type: 'email',
        to: email,
        template: 'password-reset',
        data: { resetLink },
      });
    } catch (queueErr) {
      console.error('Failed to enqueue password reset email:', queueErr.message);
      Sentry.captureException(queueErr, { tags: { queue: 'email' } });
    }
  }

  return { message: 'If the email exists, a reset link has been sent.' };
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await authRepository.findUserPasswordHashById(userId);
  if (!user) {
    return { error: 'User not found', statusCode: 404 };
  }

  const match = await bcrypt.compare(currentPassword, user.password_hash);
  if (!match) {
    return { error: 'Incorrect current password', statusCode: 400 };
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await authRepository.updateUserPassword(userId, newHash);
  return { message: 'Password changed successfully' };
}

export async function resetPassword({ token, newPassword }) {
  const tokenHash = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  const resetRecord = await authRepository.findActivePasswordReset(tokenHash);
  if (!resetRecord) {
    return { error: 'Invalid or expired token', statusCode: 400 };
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 10);
  await authRepository.updateUserPassword(resetRecord.user_id, newPasswordHash);
  await authRepository.markPasswordResetUsed(resetRecord.id);

  return { message: 'Password has been reset successfully' };
}

export async function handleGoogleLogin({ credential, res }) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    console.error('GOOGLE_CLIENT_ID not configured');
    return { error: 'Google login not configured', statusCode: 500 };
  }

  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: clientId,
  });

  const payload = ticket.getPayload();
  const { sub: googleId, email, name, picture } = payload;

  const existing = await authRepository.findUserByEmail(email);

  let user;
  let isNewUser = false;

  if (existing) {
    user = existing;
    if (!user.google_id) {
      await authRepository.updateUserGoogleId({
        userId: user.id,
        googleId,
        authProvider: user.auth_provider === 'local' ? 'local' : 'google',
      });
    }
  } else {
    const insertId = await authRepository.createGoogleUser({
      email,
      name,
      googleId,
      picture,
    });
    user = { id: insertId, email, name };
    isNewUser = true;
  }

  await issueTokenPair(res, user);
  return { name: user.name, isNewUser };
}

export async function handleGoogleDuplicateFallback(email, res) {
  const user = await authRepository.findUserByEmail(email || '');
  if (user) {
    await issueTokenPair(res, user);
    return { name: user.name };
  }
  return null;
}
