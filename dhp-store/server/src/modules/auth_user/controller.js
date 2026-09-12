import * as Sentry from '@sentry/node';
import { validatePassword } from '../../shared/utils/validatePassword.js';
import * as authService from './service.js';

export async function handleRegister(req, res) {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ message: 'Missing fields' });

  const pwCheck = validatePassword(password);
  if (!pwCheck.valid) return res.status(400).json({ message: pwCheck.message });

  try {
    const result = await authService.register({ email, password, name, res });
    res.json(result);
  } catch (e) {
    if (e && e.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Email already used' });
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
}

export async function handleLogin(req, res) {
  const { email, password } = req.body;
  try {
    const result = await authService.login({ email, password, res });
    if (result.error) return res.status(result.statusCode || 401).json({ message: result.error });
    res.json({ name: result.name });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
}

export async function handleRefreshToken(req, res) {
  const rawToken = req.cookies?.refresh_token;
  if (!rawToken) return res.status(401).json({ message: 'No refresh token' });

  try {
    const result = await authService.refreshToken({ rawToken, res });
    if (result.error) return res.status(result.statusCode || 401).json({ message: result.error });
    res.json(result);
  } catch (err) {
    console.error('Refresh token error:', err);
    Sentry.captureException(err, { tags: { route: 'auth/refresh' } });
    res.status(500).json({ message: 'Server error' });
  }
}

export async function handleLogout(req, res) {
  const rawToken = req.cookies?.refresh_token;
  const result = await authService.logout({ rawToken, res });
  res.json(result);
}

export async function handleGetProfile(req, res) {
  try {
    const profile = await authService.getProfile(req.user.id);
    if (!profile) return res.status(404).json({ message: 'User not found' });
    res.json(profile);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
}

export async function handleUploadProfilePicture(req, res) {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  try {
    const result = await authService.uploadProfilePicture(req.user.id, req.file.filename);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error uploading image' });
  }
}

export async function handleUpdateProfile(req, res) {
  const { phone, address } = req.body;
  try {
    const result = await authService.updateProfile(req.user.id, { phone, address });
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error updating profile' });
  }
}

export async function handleForgotPassword(req, res) {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    const result = await authService.forgotPassword(email);
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function handleChangePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ message: 'Missing fields' });

  const pwCheck = validatePassword(newPassword);
  if (!pwCheck.valid) return res.status(400).json({ message: pwCheck.message });

  try {
    const result = await authService.changePassword(req.user.id, { currentPassword, newPassword });
    if (result.error) return res.status(result.statusCode || 400).json({ message: result.error });
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error changing password' });
  }
}

export async function handleResetPassword(req, res) {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ message: 'Missing token or password' });
  }

  const pwCheck = validatePassword(newPassword);
  if (!pwCheck.valid) return res.status(400).json({ message: pwCheck.message });

  try {
    const result = await authService.resetPassword({ token, newPassword });
    if (result.error) return res.status(result.statusCode || 400).json({ message: result.error });
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
}

export async function handleGoogleAuth(req, res) {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ message: 'Missing credential' });

  try {
    const result = await authService.handleGoogleLogin({ credential, res });
    if (result.error) return res.status(result.statusCode || 500).json({ message: result.error });
    res.status(result.isNewUser ? 201 : 200).json({ name: result.name });
  } catch (err) {
    console.error('Google OAuth error:', err.message);

    if (err.message?.includes('Token used too late') || err.message?.includes('Invalid token')) {
      return res.status(401).json({ message: 'Invalid Google token' });
    }

    if (err.code === 'ER_DUP_ENTRY') {
      try {
        const fallback = await authService.handleGoogleDuplicateFallback(req.body.email, res);
        if (fallback) {
          return res.json({ name: fallback.name });
        }
      } catch {
        // Fall through to generic error
      }
    }

    Sentry.captureException(err, { tags: { route: 'auth/google' } });
    res.status(500).json({ message: 'Server error' });
  }
}
