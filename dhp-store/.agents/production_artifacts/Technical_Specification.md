# Technical Specification: Catalog Schema Enhancement — Product Variant Hierarchy

> **Revision 2** — Updated to address: AI/Pinecone integration, abandoned reservation cleanup, admin product creation payload, and SKU auto-generation.

## 1. Overview

The current `products` table is a monolithic structure that stores sizes as comma-separated strings (`'S,M,L,XL'`), stock as a single integer, and only supports one image per product. This architecture cannot support:

- **Per-variant pricing** (e.g., a color costs more than another)
- **Per-variant inventory** (e.g., Size M is out of stock but Size L is available)
- **Concurrent checkout safety** (reserved quantity during checkout)
- **Multiple product/variant images**
- **Color variants**

This feature redesigns the schema into a normalized **Product → Variant → Inventory** hierarchy, migrates all existing data without loss, and documents the full impact on the backend, frontend, and AI microservice codebase.

## 2. User Stories

- As a **customer**, I want to select both a color and size when adding to cart, so I can get exactly the variant I want.
- As a **customer**, I want to see real-time stock availability per variant, so I don't order items that are sold out.
- As a **store admin**, I want to manage inventory per variant (color + size), so I can track and restock precisely.
- As a **store admin**, I want to create a product with all its variants and images in a single API call.
- As a **store admin**, I want to upload multiple images per product and per color variant, so customers can see the product from different angles.
- As a **system**, I want to reserve inventory during checkout, so two customers can't buy the last item simultaneously.
- As a **system**, I want abandoned checkout reservations to automatically release after 15 minutes, so stock doesn't leak.
- As a **system**, I want the AI RAG pipeline (Pinecone + Gemini) to correctly embed aggregated variant data for product search and chat.

## 3. Technical Design

### 3.1 Phase 1 — Target Schema Design (DDL)

> **IMPORTANT**: This is a **breaking schema change**. The `order_items` and `cart_items` tables will reference `variant_id` instead of `product_id`. A data migration script is required.

#### 3.1.1 New Lookup Tables

```sql
-- ============================================================================
-- DHP Store — Migration 004: Catalog Schema Enhancement
-- Product → Variant (Color/Size) → Inventory Hierarchy
-- ============================================================================

-- 1. Colors lookup table
CREATE TABLE IF NOT EXISTS colors (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  hex_code VARCHAR(7) DEFAULT NULL,           -- e.g., '#FF0000'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_color_name (name)
);

-- 2. Sizes lookup table
CREATE TABLE IF NOT EXISTS sizes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(10) NOT NULL,                  -- e.g., 'XS', 'S', 'M', 'L', 'XL'
  sort_order INT DEFAULT 0,                   -- for display ordering
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_size_name (name)
);

-- Seed standard sizes
INSERT IGNORE INTO sizes (name, sort_order) VALUES
  ('XS', 1), ('S', 2), ('M', 3), ('L', 4), ('XL', 5);

-- Seed default color
INSERT IGNORE INTO colors (name, hex_code) VALUES ('Default', '#000000');
```

#### 3.1.2 Product Variants Table

```sql
-- 3. Product Variants — SKU combinations (color + size)
CREATE TABLE IF NOT EXISTS product_variants (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT NOT NULL,
  sku VARCHAR(100) NOT NULL,                  -- auto-generated: {CAT}-{NAME}-{COLOR}-{SIZE}
  color_id BIGINT NOT NULL,
  size_id BIGINT NOT NULL,
  price_override DECIMAL(10,2) DEFAULT NULL,  -- NULL = use product.base_price
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
```

#### 3.1.3 Inventory Table

```sql
-- 4. Inventory — separate stock tracking per variant
CREATE TABLE IF NOT EXISTS inventory (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  variant_id BIGINT NOT NULL UNIQUE,          -- 1:1 with product_variants
  quantity INT NOT NULL DEFAULT 0,            -- total physical stock
  reserved_quantity INT NOT NULL DEFAULT 0,   -- held during checkout
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_inventory_variant (variant_id),
  
  CONSTRAINT fk_inventory_variant FOREIGN KEY (variant_id) 
    REFERENCES product_variants(id) ON DELETE CASCADE,
  CONSTRAINT chk_quantity CHECK (quantity >= 0),
  CONSTRAINT chk_reserved CHECK (reserved_quantity >= 0),
  CONSTRAINT chk_available CHECK (quantity >= reserved_quantity)
);
-- Available stock = quantity - reserved_quantity
```

#### 3.1.4 Reservation Tracking Table (for abandoned reservation cleanup)

```sql
-- 5. Inventory Reservations — tracks who reserved what and when
CREATE TABLE IF NOT EXISTS inventory_reservations (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  variant_id BIGINT NOT NULL,
  user_id BIGINT DEFAULT NULL,                -- NULL for guest checkouts
  session_id VARCHAR(128) DEFAULT NULL,       -- for guest identification
  quantity INT NOT NULL,
  status ENUM('active', 'fulfilled', 'expired') DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,               -- created_at + 15 minutes
  
  INDEX idx_reservation_status_expires (status, expires_at),
  INDEX idx_reservation_variant (variant_id),
  
  CONSTRAINT fk_reservation_variant FOREIGN KEY (variant_id) 
    REFERENCES product_variants(id) ON DELETE CASCADE
);
```

#### 3.1.5 Image Tables

```sql
-- 6. Product Images — multiple images per product
CREATE TABLE IF NOT EXISTS product_images (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,           -- the default/hero image
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_product_images_product (product_id),
  
  CONSTRAINT fk_product_images_product FOREIGN KEY (product_id) 
    REFERENCES products(id) ON DELETE CASCADE
);

-- 7. Variant Images — color-specific images
CREATE TABLE IF NOT EXISTS variant_images (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  variant_id BIGINT NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_variant_images_variant (variant_id),
  
  CONSTRAINT fk_variant_images_variant FOREIGN KEY (variant_id) 
    REFERENCES product_variants(id) ON DELETE CASCADE
);
```

#### 3.1.6 Schema Changes to `products` Table

```sql
-- 8. Rename 'price' -> 'base_price' for clarity (the variant can override)
ALTER TABLE products CHANGE COLUMN price base_price DECIMAL(10,2) NOT NULL;

-- The old 'stock', 'sizes', 'image_url' columns will be KEPT during migration
-- and dropped AFTER the data migration script succeeds and is verified.
```

#### 3.1.7 Schema Changes to `cart_items`

```sql
-- 9. cart_items: add variant_id
ALTER TABLE cart_items ADD COLUMN variant_id BIGINT DEFAULT NULL;
ALTER TABLE cart_items ADD CONSTRAINT fk_cart_items_variant 
  FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE;
ALTER TABLE cart_items ADD INDEX idx_cart_items_variant (cart_id, variant_id);
```

#### 3.1.8 Schema Changes to `order_items`

```sql
-- 10. order_items: add variant_id for new orders
ALTER TABLE order_items ADD COLUMN variant_id BIGINT DEFAULT NULL;
ALTER TABLE order_items ADD CONSTRAINT fk_order_items_variant 
  FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE order_items ADD INDEX idx_order_items_variant (variant_id);
```

> **NOTE**: Both `cart_items` and `order_items` keep the old `product_id` and `size` columns temporarily. New code paths will write `variant_id`. Historical `order_items` will have `variant_id = NULL` (old orders before migration).

---

### 3.2 SKU Auto-Generation Format

SKUs follow the pattern: `{CATEGORY_PREFIX}-{NAME_ABBREV}-{COLOR_ABBREV}-{SIZE}`

**Category Prefix Map:**

| Category | Prefix |
|---|---|
| Tees | `T` |
| Hoodies | `HD` |
| Jackets | `JK` |
| Jeans | `J` |
| Pants | `P` |
| Other / Unknown | `X` |

**Name Abbreviation Logic:**
- Take the first letter of each word in the product name, uppercase.
- Max 4 characters. E.g., "Vintage Washed Tee" → `VWT`, "Street Style Hoodie" → `SSH`.

**Color Abbreviation:**
- First 3 letters, uppercase. E.g., "Default" → `DEF`, "Black" → `BLK`, "White" → `WHT`.

**Examples:**
| Product | Color | Size | Generated SKU |
|---|---|---|---|
| Vintage Washed Tee (Tees) | Default | S | `T-VWT-DEF-S` |
| Vintage Washed Tee (Tees) | Default | M | `T-VWT-DEF-M` |
| Street Style Hoodie (Hoodies) | Black | L | `HD-SSH-BLK-L` |
| Classic Denim Jeans (Jeans) | Default | XL | `J-CDJ-DEF-XL` |

**Implementation:** A shared `generateSku(categoryName, productName, colorName, sizeName)` utility function in `server/src/utils/generateSku.js`, used by both the migration script and the `POST /api/products` route.

---

### 3.3 Phase 2 — Data Migration Script

A Node.js script (`server/migrations/004_catalog_schema_enhance.js`) that:

1. **Creates** all new tables and alters existing ones (DDL from Phase 1).
2. **Seeds** the `sizes` lookup table with `XS`, `S`, `M`, `L`, `XL`.
3. **Seeds** the `colors` lookup table with a `'Default'` entry.
4. **For each existing product** in `streetwear_shop.products`:
   - Splits the `sizes` comma-separated string into individual size names.
   - For each size, creates a `product_variant` row with `color_id = DEFAULT_COLOR_ID`, matching `size_id`, and auto-generated `sku` using the format `{CAT}-{NAME}-DEF-{SIZE}`.
   - Creates an `inventory` row with `quantity = 50`, `reserved_quantity = 0` per variant.
   - Migrates the existing `image_url` into `product_images` with `is_primary = TRUE`.
5. **Backfills** existing `cart_items` rows with the correct `variant_id` by matching `product_id` + `size` → `product_variants`.
6. **Wraps** critical operations in a transaction with proper rollback on failure.
7. **Logs** progress to stdout for observability.

**Key Design Decisions:**
- Stock is set to `50` per variant as specified.
- Existing `order_items` are **NOT backfilled** with `variant_id` — they retain the old `product_id` + `size` for historical accuracy. Only new orders will use `variant_id`.

---

### 3.4 Phase 3 — Abandoned Reservation Cleanup

#### 3.4.1 The Problem

When a customer begins checkout, `inventory.reserved_quantity` is incremented to hold stock. If the customer abandons the checkout (closes browser, navigates away, payment fails), the reservation is never released, permanently reducing available stock.

#### 3.4.2 Solution: `reservationCleanupWorker` (BullMQ Cron Job)

**New files:**
- `server/src/queues/reservationCleanupQueue.js` — BullMQ queue with repeatable cron
- `server/src/workers/reservationCleanupWorker.js` — Worker that processes expired reservations

**Cron Schedule:** Every 5 minutes (`*/5 * * * *`)

**Worker Logic:**

```
1. BEGIN TRANSACTION
2. SELECT all rows from `inventory_reservations`
   WHERE status = 'active' AND expires_at < NOW()
3. For each expired reservation:
   a. UPDATE inventory SET reserved_quantity = reserved_quantity - reservation.quantity
      WHERE variant_id = reservation.variant_id
      AND reserved_quantity >= reservation.quantity  -- safety check
   b. UPDATE inventory_reservations SET status = 'expired'
      WHERE id = reservation.id
4. COMMIT
5. Log: "Released N expired reservations"
```

**Reservation Lifecycle:**

```
  Customer starts checkout
          │
          ▼
  ┌─────────────────────────┐
  │ INSERT inventory_       │
  │ reservations (active)   │
  │ expires_at = NOW() +    │
  │ 15 minutes              │
  │                         │
  │ UPDATE inventory SET    │
  │ reserved_quantity += qty │
  └────────────┬────────────┘
               │
       ┌───────┴───────┐
       │               │
   Order placed     Abandoned
       │               │
       ▼               ▼
  status='fulfilled'  Cron picks up
  reserved_qty -= qty  after 15 min
  quantity -= qty     status='expired'
                      reserved_qty -= qty
```

**Integration with `index.js`:**
- Import `reservationCleanupWorker` and `reservationCleanupQueue`
- Add to `createBullBoard` adapters
- Add to `workers[]` and `queues[]` for graceful shutdown
- Call `scheduleReservationCleanup()` in server startup

---

### 3.5 Phase 3 — AI Microservice & Pinecone Integration

#### 3.5.1 Current State Audit

**`ai-service/app/vector_store.py`** (`sync_products_to_pinecone()`):
- Queries `SELECT p.id, p.name, p.description, p.price, c.name as category`
- Embeds text: `f"{p['name']} {p['description']} {p['category']}"`
- Stores Pinecone metadata: `{name, description, price, category, id}`

**`ai-service/recommender.py`** (`chat()` — PRODUCT_SEARCH path):
- Embeds user query → queries Pinecone with metadata filters: `price` (≤) and `category` (=)
- Uses `match.metadata` for RAG context: `f"- {p['name']} (${p['price']}): {p['description']}"`

**`ai-service/recommender.py`** (`get_similar()`):
- Fetches target product vector → queries nearest neighbors by cosine similarity
- Returns list of product IDs

#### 3.5.2 Breaking Changes

| Issue | Impact | Fix Required |
|---|---|---|
| `p.price` → `p.base_price` | Column rename breaks the SQL query in `vector_store.py` | Update query to use `base_price` |
| No variant data in embeddings | Chat RAG can't answer "do you have this in size M?" or "what colors does X come in?" | Aggregate variant metadata (available sizes, colors, price range) into the embedded text and Pinecone metadata |
| `price` metadata filter | Pinecone filter `price ≤ X` uses a single price, but variants can have `price_override` | Store `min_price` and `max_price` in metadata, filter on `min_price` |

#### 3.5.3 Required Changes

**`ai-service/app/vector_store.py`** — `sync_products_to_pinecone()`:

Updated SQL query:
```sql
SELECT 
  p.id, p.name, p.description, p.base_price, c.name as category,
  GROUP_CONCAT(DISTINCT s.name ORDER BY s.sort_order SEPARATOR ', ') as available_sizes,
  GROUP_CONCAT(DISTINCT cl.name SEPARATOR ', ') as available_colors,
  MIN(COALESCE(pv.price_override, p.base_price)) as min_price,
  MAX(COALESCE(pv.price_override, p.base_price)) as max_price
FROM products p
JOIN categories c ON p.category_id = c.id
LEFT JOIN product_variants pv ON pv.product_id = p.id AND pv.is_active = TRUE
LEFT JOIN sizes s ON pv.size_id = s.id
LEFT JOIN colors cl ON pv.color_id = cl.id
WHERE p.is_active = TRUE
GROUP BY p.id, p.name, p.description, p.base_price, c.name
```

Updated embedding text:
```python
text_to_embed = (
    f"{p['name']} {p['description']} {p['category']} "
    f"Sizes: {p['available_sizes'] or 'N/A'} "
    f"Colors: {p['available_colors'] or 'N/A'}"
)
```

Updated Pinecone metadata:
```python
"metadata": {
    "name": p['name'],
    "description": p['description'] or "",
    "min_price": float(p['min_price'] or p['base_price']),
    "max_price": float(p['max_price'] or p['base_price']),
    "category": p['category'],
    "available_sizes": p['available_sizes'] or "",
    "available_colors": p['available_colors'] or "",
    "id": p['id']
}
```

**`ai-service/recommender.py`** — `chat()` PRODUCT_SEARCH path:

Updated Pinecone filter:
```python
if filters.max_price is not None:
    pinecone_filter["min_price"] = {"$lte": filters.max_price}
```

Updated RAG context string:
```python
context += f"- {p['name']} (${p['min_price']}-${p['max_price']}): {p['description']}. Sizes: {p['available_sizes']}. Colors: {p['available_colors']}\n"
```

**`server/src/workers/aiRefreshWorker.js`** — No change needed. It already calls `POST /refresh` on the Python service, which calls `vector_store.sync_products_to_pinecone()`. The Python side handles the new query.

---

### 3.6 Phase 3 — Application Code Impact Audit

#### 3.6.1 Backend Routes — Breaking Changes

| File | Route | Impact | Change Required |
|---|---|---|---|
| `products.js` | `GET /api/products` | Returns `p.*` (includes `stock`, `sizes`, `image_url`) | Return `base_price`; JOIN variants+inventory+images; return nested `variants[]` with per-variant stock |
| `products.js` | `GET /api/products/:id` | Returns single flat product | Return product with `variants[]` array, each containing `{id, sku, color, size, price, stock, images[]}` |
| `products.js` | `POST /api/products` | Inserts flat product with `stock` | **New nested payload** (see §5.5); create product + variants + inventory + images in one transaction |
| `products.js` | `PUT /api/products/:id/stock` | Updates `products.stock` | **Repurpose** to `PUT /api/products/variants/:variantId/inventory` — update `inventory.quantity` WHERE `variant_id = ?` |
| `products.js` | `POST /api/products/batch` | Returns `SELECT *` | Include primary image + variant summary for cart enrichment |
| `cart.js` | `GET /api/cart` | JOINs `cart_items` with `products` | JOIN with `product_variants`, `inventory`, `colors`, `sizes`; use `variant_id` |
| `cart.js` | `POST /api/cart/add` | Uses `productId` + `size` | Accept `variantId`; deduplicate by `variant_id`; **reserve inventory** (create `inventory_reservations` row, increment `reserved_quantity`) |
| `cart.js` | `POST /api/cart/update` | Uses `productId` + `size` | Use `variantId`; adjust reservation quantities |
| `orders.js` | `POST /api/orders` | Decrements `products.stock` | Decrement `inventory.quantity`; mark reservations as `'fulfilled'`; decrement `reserved_quantity` |
| `orders.js` | `PUT /api/orders/:id/status` | Updates `products.stock` on confirm/cancel | Update `inventory.quantity` on the variant's inventory row |
| `orders.js` | `fetchItemsForOrders()` | JOINs `order_items` with `products` | Add LEFT JOIN with `product_variants`, `colors`, `sizes` for richer order detail |
| `orders.js` | `POST /api/orders/create-payment` | Reads `p.price` | Resolve effective price: `COALESCE(pv.price_override, p.base_price)` |
| `recommendations.js` | `fetchProductsByIds()` | Returns `SELECT *` | Return `base_price` + primary image from `product_images` |
| `sitemap.js` | `GET /sitemap.xml` | Reads `products.updated_at` | No structural change needed |

#### 3.6.2 Frontend Components — Breaking Changes

| File | Component | Impact | Change Required |
|---|---|---|---|
| `ProductDetails.jsx` | `ProductDetails` | Reads `product.sizes.split(',')`, `product.stock`, `product.price`, `product.image_url` | Parse `product.variants[]`; show color selector; derive stock from selected variant; use `product.images[]` for gallery; call `add()` with `variantId` |
| `Products.jsx` | `Products` | Reads `p.sizes.split(',')` for size filter, `p.price`, `p.image_url` | Derive available sizes from `p.variants[]`; use `p.base_price`; use `p.primary_image` |
| `Home.jsx` | `Home` | Reads `p.image_url`, `p.price` | Use `p.primary_image`; use `p.base_price` |
| `CartContext.jsx` | `CartProvider` | `add(productId, qty, size)`, `update(productId, qty, size)` | Change to `add(variantId, qty)`, `update(variantId, qty)`; update local cart keys |
| `CartDrawer.jsx` | `CartDrawer` | Key by `product_id-size`, shows `item.size` | Key by `variant_id`; show `item.color_name + item.size_name`; call `update(item.variant_id, ...)` |
| `Checkout.jsx` | `Checkout` | Key by `product_id-size`, shows `item.size` | Key by `variant_id`; show color + size |
| `Account.jsx` | `Account` (order popup) | Shows `item.size` | Show `item.color_name` + `item.size_name` |
| `ManageProducts.jsx` | `ManageProducts` | Shows `p.stock`, form has `stock` field | **Redesign**: nested form for creating product + variants + images; show variants table with per-variant stock; manage inventory per variant |
| `ManageOrders.jsx` | `ManageOrders` | Shows `item.size` | Show `item.color_name` + `item.size_name` |
| `RecommendRow.jsx` | `RecommendRow` | Renders `p.image_url`, `p.price` | Use `p.primary_image`, `p.base_price` |

#### 3.6.3 AI Microservice — Breaking Changes

| File | Function | Impact | Change Required |
|---|---|---|---|
| `vector_store.py` | `sync_products_to_pinecone()` | Queries `p.price` (renamed), no variant data | Update SQL to use `base_price`; JOIN variants for sizes/colors/price range; update embedding text and Pinecone metadata (see §3.5.3) |
| `recommender.py` | `chat()` PRODUCT_SEARCH | Filters on `price` metadata, context uses `p['price']` | Filter on `min_price`; update RAG context to include sizes/colors/price range |
| `recommender.py` | `get_similar()` | Uses product ID vectors | No change needed — vectors are still keyed by `product_id` |

#### 3.6.4 Workers — New & Modified

| File | Worker | Change |
|---|---|---|
| `reservationCleanupWorker.js` | **[NEW]** | Cron every 5 min: release expired `inventory_reservations` (see §3.4) |
| `reservationCleanupQueue.js` | **[NEW]** | Queue + `scheduleReservationCleanup()` |
| `cartCleanupWorker.js` | **[MODIFY]** | Also release any active reservations for the abandoned carts being cleaned up |
| `aiRefreshWorker.js` | No change | Still calls `POST /refresh` — Python side handles the updated query |
| `index.js` | **[MODIFY]** | Import and register new reservation queue/worker, add to Bull Board + graceful shutdown |

---

## 4. Data Models — ERD

```
┌──────────────┐     ┌──────────────────┐     ┌───────────┐
│  categories  │     │    products       │     │  colors   │
│──────────────│     │──────────────────│     │───────────│
│ id (PK)      │◄────│ category_id (FK) │     │ id (PK)   │
│ name         │     │ id (PK)          │     │ name (UK) │
│              │     │ name             │     │ hex_code  │
│              │     │ description      │     └─────┬─────┘
│              │     │ base_price       │           │
│              │     │ is_active        │     ┌─────┴──────────────┐
│              │     │ sold_count       │     │ product_variants   │
└──────────────┘     │ created_at       │     │────────────────────│
                     │ updated_at       │     │ id (PK)            │
                     └────────┬─────────┘     │ product_id (FK) ───┘
                              │               │ sku (UK)           │
                              │               │ color_id (FK) ─────┘
                     ┌────────┴─────────┐     │ size_id (FK) ──────┐
                     │ product_images   │     │ price_override     │
                     │─────────────────│     │ is_active          │
                     │ id (PK)          │     └─────────┬──────────┘
                     │ product_id (FK)  │               │
                     │ image_url        │     ┌─────────┴──────────┐
                     │ is_primary       │     │   inventory        │  
                     │ sort_order       │     │────────────────────│
                     └─────────────────┘     │ id (PK)            │
                                              │ variant_id (FK,UK) │
                     ┌───────────┐            │ quantity           │
                     │  sizes    │            │ reserved_quantity  │
                     │───────────│            │ updated_at         │
                     │ id (PK)   │            └────────┬───────────┘
                     │ name (UK) │─────────────────────┘
                     │ sort_order│
                     └───────────┘     ┌─────────────────────────┐
                                       │ inventory_reservations  │
                     ┌──────────────── │─────────────────────────│
                     │ variant_images  │ id (PK)                 │
                     │────────────────ˇ│ variant_id (FK)         │
                     │ id (PK)        ││ user_id                 │
                     │ variant_id (FK)││ session_id              │
                     │ image_url      ││ quantity                │
                     │ is_primary     ││ status (active/         │
                     │ sort_order     ││         fulfilled/      │
                     └────────────────┘│         expired)        │
                                       │ expires_at              │
                                       └─────────────────────────┘

    cart_items.variant_id ──► product_variants.id
    order_items.variant_id ─► product_variants.id (nullable)
```

---

## 5. API Contracts

### 5.1 `GET /api/products` — New Response Shape

```json
[
  {
    "id": 1,
    "name": "Vintage Washed Tee",
    "description": "...",
    "category_id": 1,
    "category_name": "Tees",
    "base_price": 19.99,
    "is_active": true,
    "sold_count": 42,
    "primary_image": "https://example.com/uploads/tee1.jpg",
    "images": [
      { "id": 1, "image_url": "https://...", "is_primary": true },
      { "id": 2, "image_url": "https://...", "is_primary": false }
    ],
    "variants": [
      {
        "id": 10,
        "sku": "T-VWT-DEF-S",
        "color": { "id": 1, "name": "Default", "hex_code": "#000000" },
        "size": { "id": 2, "name": "S", "sort_order": 2 },
        "price": 19.99,
        "stock": 50,
        "is_active": true
      },
      {
        "id": 11,
        "sku": "T-VWT-DEF-M",
        "color": { "id": 1, "name": "Default", "hex_code": "#000000" },
        "size": { "id": 3, "name": "M", "sort_order": 3 },
        "price": 19.99,
        "stock": 50,
        "is_active": true
      }
    ]
  }
]
```

### 5.2 `POST /api/cart/add` — New Request

```json
{
  "variantId": 10,
  "qty": 1
}
```

### 5.3 `POST /api/cart/update` — New Request

```json
{
  "variantId": 10,
  "qty": 2
}
```

### 5.4 `GET /api/cart` — New Response

```json
{
  "cartId": 5,
  "items": [
    {
      "variant_id": 10,
      "qty": 2,
      "product_id": 1,
      "product_name": "Vintage Washed Tee",
      "sku": "T-VWT-DEF-S",
      "color_name": "Default",
      "size_name": "S",
      "price": 19.99,
      "image_url": "https://..."
    }
  ]
}
```

### 5.5 `POST /api/products` — New Admin Creation Payload

> **IMPORTANT**: This replaces the current flat `{name, description, price, stock, category_id}` + file upload. The new payload creates a product with all its variants, inventory, and images in a single transaction.

**Request** (`multipart/form-data`):

```
Content-Type: multipart/form-data

Fields:
  data (JSON string):
  {
    "name": "Street Style Hoodie",
    "description": "Premium heavyweight hoodie with embroidered logo",
    "category_id": 2,
    "base_price": 49.99,
    "variants": [
      {
        "color_name": "Black",
        "color_hex": "#000000",
        "size_name": "M",
        "price_override": null,
        "stock": 100
      },
      {
        "color_name": "Black",
        "color_hex": "#000000",
        "size_name": "L",
        "price_override": 54.99,
        "stock": 75
      },
      {
        "color_name": "White",
        "color_hex": "#FFFFFF",
        "size_name": "M",
        "price_override": null,
        "stock": 80
      }
    ]
  }

Files:
  images[] — array of product-level image files (first = primary)
```

**Backend Processing (in transaction):**
1. Parse and validate the `data` JSON field.
2. INSERT into `products` → get `product_id`.
3. For each file in `images[]`, INSERT into `product_images` (first file → `is_primary = TRUE`).
4. For each variant in `variants[]`:
   a. INSERT OR GET `color_id` from `colors` (upsert by name).
   b. Validate `size_name` exists in `sizes` table → get `size_id`.
   c. Auto-generate `sku` via `generateSku(categoryName, productName, colorName, sizeName)`.
   d. INSERT into `product_variants`.
   e. INSERT into `inventory` with `{quantity: variant.stock, reserved_quantity: 0}`.
5. COMMIT.
6. Enqueue cache invalidation (`products:*`).
7. Return the complete product object (same shape as `GET /api/products/:id`).

**Response:** `201 Created` with the full product JSON (see §5.1 shape).

### 5.6 `PUT /api/products/variants/:variantId/inventory` — Update Variant Stock

Replaces the old `PUT /api/products/:id/stock`.

**Request:**
```json
{
  "quantity": 150
}
```

**Response:**
```json
{
  "message": "Inventory updated",
  "variantId": 10,
  "sku": "T-VWT-DEF-S",
  "quantity": 150
}
```

---

## 6. Error Handling

| Scenario | HTTP Code | Message |
|---|---|---|
| Variant not found | 404 | `"Variant not found"` |
| Variant out of stock (available <= 0) | 400 | `"Variant is out of stock"` |
| Insufficient stock during checkout | 400 | `"Insufficient stock for variant: {sku}"` |
| Invalid variant ID | 400 | `"Invalid variant ID"` |
| Duplicate variant (product + color + size) | 409 | `"Variant already exists for this color/size combination"` |
| Duplicate SKU | 409 | `"SKU already exists: {sku}"` |
| Invalid size name in admin payload | 400 | `"Unknown size: {name}. Valid sizes: XS, S, M, L, XL"` |

---

## 7. Security Considerations

- **SQL Injection:** All new queries use parameterized `?` placeholders — no string concatenation.
- **Authorization:** Inventory updates require `verifyStaff` middleware (unchanged). Product creation requires `verifyAdmin`.
- **Input Validation:** `variantId` must be validated as a positive integer. Admin payload JSON is validated for required fields. SKU generation sanitizes input (alphanumeric only).
- **Race Conditions:** The `inventory` table uses `reserved_quantity` with CHECK constraints to prevent overselling. Stock decrements use `FOR UPDATE` row locks within transactions. The `inventory_reservations` table provides an audit trail.

---

## 8. Redis Caching Impact

- **Invalidation:** The existing `products:*` pattern invalidation via `cacheQueue` still works.
- **New cache keys:** `product:{id}` responses will include the full variant tree — no separate variant cache needed initially.
- **TTL:** No change (1 hour for product lists, 1 hour for single products).

---

## 9. Deployment Impact

- **Database migration required** before deploying new backend code.
- **No new environment variables** needed for Node.js. Python AI service env vars unchanged.
- **No Docker changes** needed.
- **Pinecone re-sync required** after migration: trigger `POST /api/recommend/refresh` (admin) to rebuild vectors with variant-aware metadata.
- **Rollback plan:** The migration is additive (new tables + new columns). Old columns preserved. Rolling back = revert code, no data loss.

---

## 10. Acceptance Criteria

- [ ] All 7 new tables created (`colors`, `sizes`, `product_variants`, `inventory`, `product_images`, `variant_images`, `inventory_reservations`)
- [ ] `products.price` renamed to `products.base_price`
- [ ] `cart_items` and `order_items` have `variant_id` column
- [ ] SKU auto-generated in format `{CAT}-{NAME}-{COLOR}-{SIZE}` (e.g., `T-VWT-DEF-S`)
- [ ] Migration script populates all variants from existing `sizes` CSV with auto-generated SKUs
- [ ] Migration script sets `quantity = 50` per variant in `inventory`
- [ ] Migration script copies `image_url` to `product_images` as primary
- [ ] Existing cart items backfilled with correct `variant_id`
- [ ] `POST /api/products` accepts nested JSON payload with variants + images
- [ ] `GET /api/products` returns variant array with stock info
- [ ] `GET /api/products/:id` returns full variant + image tree
- [ ] Cart add/update uses `variantId` instead of `productId + size`
- [ ] Cart add reserves inventory (creates `inventory_reservations` row)
- [ ] Order creation uses `variant_id`, marks reservations as `fulfilled`
- [ ] Order status changes update `inventory` (not `products.stock`)
- [ ] `reservationCleanupWorker` runs every 5 min, releases expired reservations
- [ ] `cartCleanupWorker` also releases reservations for abandoned carts
- [ ] `vector_store.py` syncs aggregated variant data (sizes, colors, price range) to Pinecone
- [ ] `recommender.py` chat path uses `min_price` filter and includes sizes/colors in RAG context
- [ ] Admin ManageProducts UI redesigned with variant management
- [ ] All SQL queries are parameterized (no concatenation)
- [ ] Backend lint: Clean
- [ ] Frontend lint: Clean
