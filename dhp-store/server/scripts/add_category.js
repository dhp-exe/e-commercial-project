import { pool } from '../src/shared/db/pool.js';
import redis from '../src/shared/cache/redis.js';

async function addCategory() {
  const categoryName = process.argv[2]?.trim() || 'Accessories';

  try {
    console.log(`Processing category: "${categoryName}"...`);

    // 1. Remove if already exists so we can reset with the continuous ID
    await pool.execute('DELETE FROM categories WHERE LOWER(name) = LOWER(?)', [categoryName]);

    // 2. Find latest id and calculate continuous next ID (MAX(id) + 1)
    const [rows] = await pool.execute('SELECT COALESCE(MAX(id), 0) AS max_id FROM categories');
    const nextId = (rows[0]?.max_id || 0) + 1;

    // 3. Insert with explicit continuous ID
    await pool.execute('INSERT INTO categories (id, name) VALUES (?, ?)', [nextId, categoryName]);
    console.log(`Successfully created category "${categoryName}" with continuous ID: ${nextId}`);

    // 4. Invalidate Redis cache
    try {
      await redis.del('categories');
      console.log('Cleared Redis cache for "categories"');
    } catch (cacheErr) {
      console.warn('Redis cache clearing skipped or failed:', cacheErr.message);
    }

    // 5. Display updated categories
    const [allCategories] = await pool.execute('SELECT * FROM categories ORDER BY id ASC');
    console.log('\nCurrent Categories:');
    console.table(allCategories);

  } catch (error) {
    console.error('Error adding category:', error);
    process.exit(1);
  } finally {
    await pool.end();
    try {
      redis.disconnect();
    } catch {
      // ignore
    }
    process.exit(0);
  }
}

addCategory();
