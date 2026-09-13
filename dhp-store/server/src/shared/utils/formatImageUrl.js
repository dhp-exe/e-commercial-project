/**
 * Constructs a full image URL from a database-stored path.
 * Shared across all routes to avoid duplicated (and divergent) implementations.
 */
export function formatImageUrl(dbPath) {
  if (!dbPath) return null;
  if (dbPath.startsWith('http')) return dbPath;

  if (process.env.NODE_ENV === 'production') {
    const cdnUrl = process.env.CDN_URL;
    if (!cdnUrl) return dbPath;

    const base = cdnUrl.replace(/\/+$/, '');
    const cleanPath = dbPath.startsWith('/')
      ? dbPath.replace(/^\/+/, '/')
      : `/uploads/${dbPath}`;
    return `${base}${cleanPath}`;
  }

  // Handle legacy bare filenames (e.g., "1770105462047.webp") stored before the /uploads/ prefix fix
  const cleanPath = dbPath.startsWith('/')
    ? dbPath.replace(/^\/+/, '/')
    : `/uploads/${dbPath}`;
  const baseUrl = (process.env.BACKEND_URL || 'http://localhost:5001').replace(/\/+$/, '');
  return `${baseUrl}${cleanPath}`;
}

export default formatImageUrl;
