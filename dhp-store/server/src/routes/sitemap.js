/**
 * Dynamic sitemap route.
 *
 * Queries TiDB for all active products and generates a valid XML sitemap.
 * Cached in Redis for 1 hour to avoid hitting the database on every crawler request.
 *
 * Registered in index.js at GET /sitemap.xml
 */

import { Router } from 'express';
import { pool } from '../db.js';
import redis from '../cache/redis.js';

const router = Router();

const SITE_URL = process.env.SITE_URL || 'https://e-commercial-project-mauve.vercel.app';
const CACHE_KEY = 'sitemap:xml';
const CACHE_TTL = 3600; // 1 hour

// Static pages with their change frequency and priority
const STATIC_PAGES = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/products', changefreq: 'daily', priority: '0.9' },
  { path: '/about', changefreq: 'monthly', priority: '0.5' },
  { path: '/contacts', changefreq: 'monthly', priority: '0.5' },
];

router.get('/', async (_req, res) => {
  try {
    // Check Redis cache first
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      res.set('Content-Type', 'application/xml');
      return res.send(cached);
    }

    // Query all active products
    const [products] = await pool.execute(
      'SELECT id, updated_at FROM products WHERE is_active = true ORDER BY id'
    );

    // Build XML
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    // Static pages
    for (const page of STATIC_PAGES) {
      xml += '  <url>\n';
      xml += `    <loc>${SITE_URL}${page.path}</loc>\n`;
      xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
      xml += `    <priority>${page.priority}</priority>\n`;
      xml += '  </url>\n';
    }

    // Dynamic product pages
    for (const product of products) {
      xml += '  <url>\n';
      xml += `    <loc>${SITE_URL}/product/${product.id}</loc>\n`;
      if (product.updated_at) {
        xml += `    <lastmod>${new Date(product.updated_at).toISOString()}</lastmod>\n`;
      }
      xml += '    <changefreq>weekly</changefreq>\n';
      xml += '    <priority>0.8</priority>\n';
      xml += '  </url>\n';
    }

    xml += '</urlset>';

    // Cache in Redis
    await redis.set(CACHE_KEY, xml, { EX: CACHE_TTL });

    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    console.error('Sitemap generation error:', err.message);
    res.status(500).type('text/plain').send('Sitemap temporarily unavailable');
  }
});

export default router;
