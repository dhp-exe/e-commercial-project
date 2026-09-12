import { pool } from '../../shared/db/pool.js';

/**
 * Find user by email (full record).
 */
export async function findUserByEmail(email) {
  const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
  return rows[0] || null;
}

/**
 * Find user profile by user ID.
 */
export async function findUserById(id) {
  const [rows] = await pool.execute(
    'SELECT id, name, email, role, phone, address, profile_picture, auth_provider FROM users WHERE id = ?',
    [id]
  );
  return rows[0] || null;
}

/**
 * Find user basic info (id, email) by user ID.
 */
export async function findUserBasicById(id) {
  const [rows] = await pool.execute('SELECT id, email FROM users WHERE id = ?', [id]);
  return rows[0] || null;
}

/**
 * Find user password hash by user ID.
 */
export async function findUserPasswordHashById(id) {
  const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id = ?', [id]);
  return rows[0] || null;
}

/**
 * Find user ID by email.
 */
export async function findUserIdByEmail(email) {
  const [rows] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
  return rows[0] || null;
}

/**
 * Insert a new local user.
 */
export async function createUser({ email, passwordHash, name }) {
  const [result] = await pool.execute(
    'INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)',
    [email, passwordHash, name]
  );
  return result.insertId;
}

/**
 * Insert a new Google OAuth user.
 */
export async function createGoogleUser({ email, name, googleId, picture }) {
  const [result] = await pool.execute(
    'INSERT INTO users (email, name, password_hash, auth_provider, google_id, profile_picture) VALUES (?, ?, NULL, ?, ?, ?)',
    [email, name, 'google', googleId, picture || null]
  );
  return result.insertId;
}

/**
 * Update Google ID and auth_provider for an existing user.
 */
export async function updateUserGoogleId({ userId, googleId, authProvider }) {
  await pool.execute(
    'UPDATE users SET google_id = ?, auth_provider = ? WHERE id = ?',
    [googleId, authProvider, userId]
  );
}

/**
 * Update user's profile picture path.
 */
export async function updateUserProfilePicture(userId, filePath) {
  await pool.execute('UPDATE users SET profile_picture = ? WHERE id = ?', [filePath, userId]);
}

/**
 * Update user's phone and address.
 */
export async function updateUserProfile(userId, { phone, address }) {
  await pool.execute('UPDATE users SET phone = ?, address = ? WHERE id = ?', [phone, address, userId]);
}

/**
 * Update user's password hash.
 */
export async function updateUserPassword(userId, passwordHash) {
  await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
}

/**
 * Insert a new refresh token.
 */
export async function createRefreshToken({ userId, tokenHash, expiresAt }) {
  await pool.execute(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
    [userId, tokenHash, expiresAt]
  );
}

/**
 * Find an active, unrevoked refresh token by hash.
 */
export async function findActiveRefreshToken(tokenHash) {
  const [rows] = await pool.execute(
    'SELECT * FROM refresh_tokens WHERE token_hash = ? AND expires_at > NOW() AND revoked = false',
    [tokenHash]
  );
  return rows[0] || null;
}

/**
 * Revoke a refresh token by record ID.
 */
export async function revokeRefreshTokenById(id) {
  await pool.execute('UPDATE refresh_tokens SET revoked = true WHERE id = ?', [id]);
}

/**
 * Revoke a refresh token by hash.
 */
export async function revokeRefreshTokenByHash(tokenHash) {
  await pool.execute('UPDATE refresh_tokens SET revoked = true WHERE token_hash = ?', [tokenHash]);
}

/**
 * Insert a password reset token record.
 */
export async function createPasswordReset({ userId, tokenHash, expiresAt }) {
  await pool.execute(
    'INSERT INTO password_resets (user_id, token_hash, expires_at, used) VALUES (?, ?, ?, false)',
    [userId, tokenHash, expiresAt]
  );
}

/**
 * Find an active, unused password reset token by hash.
 */
export async function findActivePasswordReset(tokenHash) {
  const [rows] = await pool.execute(
    'SELECT * FROM password_resets WHERE token_hash = ? AND expires_at > NOW() AND used = 0',
    [tokenHash]
  );
  return rows[0] || null;
}

/**
 * Mark a password reset token as used.
 */
export async function markPasswordResetUsed(id) {
  await pool.execute('UPDATE password_resets SET used = 1 WHERE id = ?', [id]);
}
