-- Migration: Add refresh_tokens table for rotating refresh token sessions
-- Run: node run_migration.js (update the filename in run_migration.js first)

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  token_hash VARCHAR(128) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_refresh_token_hash (token_hash),
  INDEX idx_refresh_user_id (user_id),
  INDEX idx_refresh_expires (expires_at)
);
