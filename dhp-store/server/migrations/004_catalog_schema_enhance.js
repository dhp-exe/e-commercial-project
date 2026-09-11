/**
 * DHP Store — Migration 004: Catalog Schema Enhancement
 *
 * Transforms the monolithic products table into a normalized
 * Product → Variant (Color/Size) → Inventory hierarchy.
 *
 * What this script does:
 *   1. Executes DDL from 004_catalog_schema_enhance.sql
 *   2. Idempotently alters products (renames price -> base_price), cart_items, order_items
 *   3. Seeds sizes (XS, S, M, L, XL) and colors (Default) lookup tables
 *   4. For each product: splits CSV sizes → creates variants + inventory (qty=50)
 *   5. Migrates image_url → product_images (is_primary=TRUE)
 *   6. Backfills cart_items.variant_id
 *   7. Adds foreign key constraints on cart_items and order_items
 *
 * Run:  node migrations/004_catalog_schema_enhance.js
 */

import { pool } from '../src/shared/db/pool.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateSku } from '../src/shared/utils/generateSku.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STOCK_PER_VARIANT = 50;
const DEFAULT_COLOR_NAME = 'Default';
const STANDARD_SIZES = [
  { name: 'XS', sort_order: 1 },
  { name: 'S', sort_order: 2 },
  { name: 'M', sort_order: 3 },
  { name: 'L', sort_order: 4 },
  { name: 'XL', sort_order: 5 },
];

/**
 * Execute a SQL file statement by statement.
 */
async function executeSqlFile(conn, filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  const statements = sql
    .split(';')
    .map((s) => s.replace(/--.*$/gm, '').trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    console.log(`  ▸ ${stmt.slice(0, 80).replace(/\n/g, ' ')}...`);
    await conn.query(stmt);
  }
}

async function run() {
  let conn;
  try {
    conn = await pool.getConnection();

    // ────────────────────────────────────────────────────────────────────────
    // STEP 1: Execute DDL
    // ────────────────────────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  STEP 1/6 — Executing DDL (CREATE TABLE IF NOT EXISTS)');
    console.log('═══════════════════════════════════════════════════════\n');

    const sqlPath = path.join(__dirname, '004_catalog_schema_enhance.sql');
    await executeSqlFile(conn, sqlPath);
    console.log('✅ DDL executed successfully.\n');

    // Alter existing tables idempotently
    console.log('  Checking and applying schema alterations...');
    
    // 1. Rename products.price -> base_price
    const [priceCol] = await conn.execute(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'price'
    `);
    if (priceCol.length > 0) {
      await conn.execute('ALTER TABLE products CHANGE COLUMN price base_price DECIMAL(10,2) NOT NULL');
      console.log('  ✅ products.price renamed to base_price');
    } else {
      console.log('  ⏭️  products.base_price already exists');
    }

    // 2. Add cart_items.variant_id
    const [cartVarCol] = await conn.execute(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cart_items' AND COLUMN_NAME = 'variant_id'
    `);
    if (cartVarCol.length === 0) {
      await conn.execute('ALTER TABLE cart_items ADD COLUMN variant_id INT DEFAULT NULL');
      console.log('  ✅ Added variant_id to cart_items');
    } else {
      console.log('  ⏭️  cart_items.variant_id already exists');
    }

    // 3. Add order_items.variant_id
    const [orderVarCol] = await conn.execute(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND COLUMN_NAME = 'variant_id'
    `);
    if (orderVarCol.length === 0) {
      await conn.execute('ALTER TABLE order_items ADD COLUMN variant_id INT DEFAULT NULL');
      console.log('  ✅ Added variant_id to order_items');
    } else {
      console.log('  ⏭️  order_items.variant_id already exists');
    }

    // 4. Ensure products.sold_count exists
    const [soldCol] = await conn.execute(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'sold_count'
    `);
    if (soldCol.length === 0) {
      await conn.execute('ALTER TABLE products ADD COLUMN sold_count INT DEFAULT 0');
      console.log('  ✅ Added sold_count to products');
    } else {
      console.log('  ⏭️  products.sold_count already exists');
    }

    // ────────────────────────────────────────────────────────────────────────
    // STEP 2: Seed lookup tables
    // ────────────────────────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  STEP 2/6 — Seeding sizes and colors');
    console.log('═══════════════════════════════════════════════════════\n');

    for (const size of STANDARD_SIZES) {
      await conn.execute(
        'INSERT IGNORE INTO sizes (name, sort_order) VALUES (?, ?)',
        [size.name, size.sort_order]
      );
    }
    console.log(`  ✅ Sizes seeded: ${STANDARD_SIZES.map((s) => s.name).join(', ')}`);

    await conn.execute(
      'INSERT IGNORE INTO colors (name, hex_code) VALUES (?, ?), (?, ?), (?, ?)',
      [DEFAULT_COLOR_NAME, '#000000', 'Black', '#000000', 'White', '#FFFFFF']
    );
    console.log(`  ✅ Colors seeded: "${DEFAULT_COLOR_NAME}", "Black", "White"\n`);

    // ────────────────────────────────────────────────────────────────────────
    // STEP 3: Check if data migration already ran
    // ────────────────────────────────────────────────────────────────────────
    const [existingVariants] = await conn.execute('SELECT COUNT(*) as cnt FROM product_variants');
    if (existingVariants[0].cnt > 0) {
      console.log(`⚠️  product_variants already has ${existingVariants[0].cnt} rows. Skipping data migration.`);
      console.log('   If you need to re-run, truncate product_variants, inventory, and product_images first.\n');
      return;
    }

    // Build lookup maps
    const [sizeRows] = await conn.execute('SELECT id, name FROM sizes');
    const sizeMap = new Map(sizeRows.map((r) => [r.name.trim().toUpperCase(), r.id]));

    const [colorRows] = await conn.execute('SELECT id, name FROM colors WHERE name = ?', [DEFAULT_COLOR_NAME]);
    const defaultColorId = colorRows[0].id;

    console.log(`  Size map: ${JSON.stringify(Object.fromEntries(sizeMap))}`);
    console.log(`  Default color ID: ${defaultColorId}\n`);

    // ────────────────────────────────────────────────────────────────────────
    // STEP 4: Migrate products → variants + inventory + images
    // ────────────────────────────────────────────────────────────────────────
    console.log('═══════════════════════════════════════════════════════');
    console.log('  STEP 4/6 — Creating variants, inventory & images');
    console.log('═══════════════════════════════════════════════════════\n');

    await conn.beginTransaction();

    try {
      const [products] = await conn.execute(`
        SELECT p.id, p.name, p.sizes, p.image_url, p.stock, c.name AS category_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.is_active = TRUE
      `);

      console.log(`  Found ${products.length} active products to migrate.\n`);

      let totalVariants = 0;
      let totalImages = 0;

      for (const product of products) {
        const sizesStr = product.sizes || '';
        const sizeNames = sizesStr
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        if (sizeNames.length === 0) {
          console.log(`  ⚠️  Product #${product.id} "${product.name}" has no sizes — skipping variants.`);
          continue;
        }

        console.log(`  📦 Product #${product.id} "${product.name}" — sizes: [${sizeNames.join(', ')}]`);

        // Create variants + inventory for each size
        for (const sizeName of sizeNames) {
          let resolvedSizeId = sizeMap.get(sizeName.toUpperCase());
          if (!resolvedSizeId) {
            console.log(`    ⚠️  Unknown size "${sizeName}" — inserting into sizes table.`);
            const [insertResult] = await conn.execute(
              'INSERT IGNORE INTO sizes (name, sort_order) VALUES (?, ?)',
              [sizeName, 99]
            );
            resolvedSizeId = insertResult.insertId;
            if (!resolvedSizeId) {
              const [refetch] = await conn.execute('SELECT id FROM sizes WHERE name = ?', [sizeName]);
              if (refetch.length > 0) resolvedSizeId = refetch[0].id;
            }
            if (resolvedSizeId) {
              sizeMap.set(sizeName.toUpperCase(), resolvedSizeId);
            }
          }

          if (!resolvedSizeId) {
            console.log(`    ❌ Could not resolve size "${sizeName}" — skipping this variant.`);
            continue;
          }

          const sku = generateSku(product.category_name, product.name, DEFAULT_COLOR_NAME, sizeName);

          // Insert variant
          const [variantResult] = await conn.execute(
            `INSERT INTO product_variants (product_id, sku, color_id, size_id, price_override, is_active)
             VALUES (?, ?, ?, ?, NULL, TRUE)`,
            [product.id, sku, defaultColorId, resolvedSizeId]
          );
          const variantId = variantResult.insertId;

          // Insert inventory (50 per variant)
          await conn.execute(
            'INSERT INTO inventory (variant_id, quantity, reserved_quantity) VALUES (?, ?, 0)',
            [variantId, STOCK_PER_VARIANT]
          );

          totalVariants++;
          console.log(`    ✅ Variant: ${sku} (ID: ${variantId}) — stock: ${STOCK_PER_VARIANT}`);
        }

        // Migrate image_url → product_images
        if (product.image_url) {
          await conn.execute(
            'INSERT INTO product_images (product_id, image_url, is_primary, sort_order) VALUES (?, ?, TRUE, 0)',
            [product.id, product.image_url]
          );
          totalImages++;
          console.log(`    🖼️  Image migrated: ${product.image_url}`);
        }

        console.log('');
      }

      console.log(`  📊 Total variants created: ${totalVariants}`);
      console.log(`  📊 Total images migrated: ${totalImages}\n`);

      // ──────────────────────────────────────────────────────────────────────
      // STEP 5: Backfill cart_items.variant_id
      // ──────────────────────────────────────────────────────────────────────
      console.log('═══════════════════════════════════════════════════════');
      console.log('  STEP 5/6 — Backfilling cart_items.variant_id');
      console.log('═══════════════════════════════════════════════════════\n');

      const [cartItems] = await conn.execute(`
        SELECT ci.id, ci.product_id, ci.size
        FROM cart_items ci
        JOIN carts c ON ci.cart_id = c.id
        WHERE c.status = 'active'
        AND ci.variant_id IS NULL
      `);

      let backfilled = 0;
      let backfillSkipped = 0;

      for (const ci of cartItems) {
        const [variants] = await conn.execute(`
          SELECT pv.id
          FROM product_variants pv
          JOIN sizes s ON pv.size_id = s.id
          WHERE pv.product_id = ?
          AND pv.color_id = ?
          AND s.name = ?
          LIMIT 1
        `, [ci.product_id, defaultColorId, ci.size || '']);

        if (variants.length > 0) {
          await conn.execute(
            'UPDATE cart_items SET variant_id = ? WHERE id = ?',
            [variants[0].id, ci.id]
          );
          backfilled++;
        } else {
          backfillSkipped++;
          console.log(`  ⚠️  No variant found for cart_item #${ci.id} (product=${ci.product_id}, size="${ci.size}")`);
        }
      }

      console.log(`  ✅ Backfilled: ${backfilled} cart items`);
      console.log(`  ⚠️  Skipped: ${backfillSkipped} cart items (no matching variant)\n`);

      // ──────────────────────────────────────────────────────────────────────
      // STEP 6: Add foreign key constraints on cart_items + order_items
      // ──────────────────────────────────────────────────────────────────────
      console.log('═══════════════════════════════════════════════════════');
      console.log('  STEP 6/6 — Adding foreign key constraints');
      console.log('═══════════════════════════════════════════════════════\n');

      const fkStatements = [
        {
          name: 'fk_cart_items_variant',
          sql: 'ALTER TABLE cart_items ADD CONSTRAINT fk_cart_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE',
        },
        {
          name: 'idx_cart_items_variant',
          sql: 'ALTER TABLE cart_items ADD INDEX idx_cart_items_variant (cart_id, variant_id)',
        },
        {
          name: 'fk_order_items_variant',
          sql: 'ALTER TABLE order_items ADD CONSTRAINT fk_order_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL',
        },
        {
          name: 'idx_order_items_variant',
          sql: 'ALTER TABLE order_items ADD INDEX idx_order_items_variant (variant_id)',
        },
      ];

      for (const fk of fkStatements) {
        try {
          await conn.execute(fk.sql);
          console.log(`  ✅ Added: ${fk.name}`);
        } catch (err) {
          if (err.code === 'ER_DUP_KEYNAME' || err.code === 'ER_FK_DUP_NAME' || err.message.includes('Duplicate')) {
            console.log(`  ⏭️  Already exists: ${fk.name}`);
          } else {
            console.error(`  ❌ Failed to add ${fk.name}:`, err.message);
          }
        }
      }

      // Commit transaction
      await conn.commit();
      console.log('\n══════════════════════════════════════════');
      console.log('  ✅ MIGRATION 004 COMPLETED SUCCESSFULLY');
      console.log('══════════════════════════════════════════\n');

    } catch (err) {
      await conn.rollback();
      console.error('\n❌ Migration failed — transaction rolled back.');
      console.error('Error:', err.message);
      throw err;
    }

  } catch (err) {
    console.error('\n❌ Fatal migration error:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  } finally {
    if (conn) conn.release();
    process.exit(0);
  }
}

run();
