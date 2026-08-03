import { pool } from './src/db.js';
import fs from 'fs';

async function run() {
  try {
    const sql = fs.readFileSync('migrations/002_add_sold_count.sql', 'utf8');
    const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('--'));
    for (let statement of statements) {
      if (statement.startsWith('--')) {
          // split removes ;, let's just ignore comments blocks properly
          statement = statement.replace(/--.*$/gm, '').trim();
          if (!statement) continue;
      }
      console.log('Running:', statement);
      await pool.query(statement);
    }
    console.log('Migration successful');
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log('Column already exists, skipping.');
    } else {
      console.error(err);
    }
  } finally {
    process.exit(0);
  }
}
run();
