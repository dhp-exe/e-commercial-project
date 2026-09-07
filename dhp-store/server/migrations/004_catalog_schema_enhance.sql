-- ============================================================================
-- DHP Store — Migration 004: Catalog Schema Enhancement
-- Product → Variant (Color/Size) → Inventory Hierarchy
--
-- This migration is ADDITIVE — no existing columns are dropped.
-- Old columns (stock, sizes, image_url) are preserved for rollback safety.
-- Run via: node migrations/004_catalog_schema_enhance.js
-- ============================================================================

-- 1. Colors lookup table
CREATE TABLE IF NOT EXISTS colors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  hex_code VARCHAR(7) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_color_name (name)
);

-- 2. Sizes lookup table
CREATE TABLE IF NOT EXISTS sizes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(10) NOT NULL,
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_size_name (name)
);

-- 3. Product Variants — SKU combinations (color + size)
CREATE TABLE IF NOT EXISTS product_variants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  sku VARCHAR(100) NOT NULL,
  color_id INT NOT NULL,
  size_id INT NOT NULL,
  price_override DECIMAL(10,2) DEFAULT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_variant (product_id, color_id, size_id),
  UNIQUE KEY uq_sku (sku),
  INDEX idx_variant_product (product_id),

  CONSTRAINT fk_variant_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_variant_color FOREIGN KEY (color_id) REFERENCES colors(id) ON DELETE RESTRICT,
  CONSTRAINT fk_variant_size FOREIGN KEY (size_id) REFERENCES sizes(id) ON DELETE RESTRICT
);

-- 4. Inventory — separate stock tracking per variant
CREATE TABLE IF NOT EXISTS inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  variant_id INT NOT NULL UNIQUE,
  quantity INT NOT NULL DEFAULT 0,
  reserved_quantity INT NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_inventory_variant (variant_id),

  CONSTRAINT fk_inventory_variant FOREIGN KEY (variant_id)
    REFERENCES product_variants(id) ON DELETE CASCADE,
  CONSTRAINT chk_quantity CHECK (quantity >= 0),
  CONSTRAINT chk_reserved CHECK (reserved_quantity >= 0),
  CONSTRAINT chk_available CHECK (quantity >= reserved_quantity)
);

-- 5. Inventory Reservations — tracks checkout holds for expiration
CREATE TABLE IF NOT EXISTS inventory_reservations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  variant_id INT NOT NULL,
  user_id INT DEFAULT NULL,
  session_id VARCHAR(128) DEFAULT NULL,
  quantity INT NOT NULL,
  status ENUM('active', 'fulfilled', 'expired') DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,

  INDEX idx_reservation_status_expires (status, expires_at),
  INDEX idx_reservation_variant (variant_id),

  CONSTRAINT fk_reservation_variant FOREIGN KEY (variant_id)
    REFERENCES product_variants(id) ON DELETE CASCADE
);

-- 6. Product Images — multiple images per product
CREATE TABLE IF NOT EXISTS product_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_product_images_product (product_id),

  CONSTRAINT fk_product_images_product FOREIGN KEY (product_id)
    REFERENCES products(id) ON DELETE CASCADE
);

-- 7. Variant Images — color-specific images
CREATE TABLE IF NOT EXISTS variant_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  variant_id INT NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_variant_images_variant (variant_id),

  CONSTRAINT fk_variant_images_variant FOREIGN KEY (variant_id)
    REFERENCES product_variants(id) ON DELETE CASCADE
);
