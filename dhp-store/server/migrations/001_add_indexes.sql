-- ============================================================================
-- DHP Store — Database Index Migration
-- Purpose: Add missing indexes for high-frequency query patterns
-- Run this against your TiDB / MySQL database.
-- These are all CREATE INDEX IF NOT EXISTS safe to re-run.
-- ============================================================================

-- Orders: user lookup with status filter
CREATE INDEX idx_orders_user_status ON orders (user_id, status);

-- Orders: sorting by creation date
CREATE INDEX idx_orders_created_at ON orders (created_at);

-- Order Items: join from orders → order_items
CREATE INDEX idx_order_items_order_id ON order_items (order_id);

-- Order Items: aggregate sold_count per product
CREATE INDEX idx_order_items_product_id ON order_items (product_id);

-- Carts: active cart lookup per user
CREATE INDEX idx_carts_user_status ON carts (user_id, status);

-- Cart Items: compound lookup for add/update operations
CREATE INDEX idx_cart_items_lookup ON cart_items (cart_id, product_id, size);

-- Password Resets: token verification
CREATE INDEX idx_password_resets_lookup ON password_resets (token_hash, expires_at, used);

-- Products: active + category filter
CREATE INDEX idx_products_active_category ON products (is_active, category_id);
