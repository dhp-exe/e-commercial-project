/**
 * Constructs a full image URL from a database-stored path.
 * Shared across all routes to avoid duplicated (and divergent) implementations.
 */
const BASE_URL = process.env.BACKEND_URL || 'http://localhost:5001';

export function formatImageUrl(dbPath) {
  if (!dbPath) return null;
  if (dbPath.startsWith('http')) return dbPath;
  // Handle legacy bare filenames (e.g., "1770105462047.webp") stored before the /uploads/ prefix fix
  const normalizedPath = dbPath.startsWith('/') ? dbPath : `/uploads/${dbPath}`;
  return `${BASE_URL}${normalizedPath}`;
}
