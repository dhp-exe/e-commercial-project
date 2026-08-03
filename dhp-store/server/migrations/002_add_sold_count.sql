-- ============================================================================
-- DHP Store — Database Migration
-- Purpose: Denormalize sold_count into products table to avoid expensive JOINs
-- ============================================================================

-- 1. Add the sold_count column
ALTER TABLE products ADD COLUMN sold_count INT DEFAULT 0;

-- 2. Backfill existing data from order_items
UPDATE products p
SET sold_count = (
  SELECT COALESCE(SUM(oi.quantity), 0) 
  FROM order_items oi 
  WHERE oi.product_id = p.id
);
