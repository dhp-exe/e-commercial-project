/**
 * SKU Auto-Generation Utility
 *
 * Generates SKUs in the format: {CATEGORY_PREFIX}-{NAME_ABBREV}-{COLOR_ABBREV}-{SIZE}
 *
 * Category Prefix Map:
 *   Tees → T, Hoodies → HD, Jackets → JK, Jeans → J, Pants → P, Other → X
 *
 * Examples:
 *   generateSku('Tees', 'Vintage Washed Tee', 'Default', 'S')  → 'T-VWT-DEF-S'
 *   generateSku('Hoodies/Jackets', 'Street Style Hoodie', 'Black', 'L') → 'HD-SSH-BLK-L'
 */

/**
 * Map a category name to its SKU prefix.
 * Handles the combined "Hoodies/Jackets" category by defaulting to HD.
 *
 * @param {string} categoryName - The category name from the categories table
 * @returns {string} The 1-2 character prefix
 */
function getCategoryPrefix(categoryName) {
  if (!categoryName) return 'X';

  const normalized = categoryName.toLowerCase().trim();

  if (normalized.includes('tee')) return 'T';
  if (normalized.includes('hoodie')) return 'HD';
  if (normalized.includes('jacket')) return 'JK';
  if (normalized.includes('jean')) return 'J';
  if (normalized.includes('pant')) return 'P';

  return 'X';
}

/**
 * Abbreviate a product name to initials (max 4 chars).
 * Takes the first letter of each word, uppercased.
 *
 * @param {string} productName - The product name
 * @returns {string} Abbreviated name, e.g. "Vintage Washed Tee" → "VWT"
 */
function abbreviateName(productName) {
  if (!productName) return 'UNK';

  const initials = productName
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase())
    .join('')
    .slice(0, 4);

  return initials || 'UNK';
}

/**
 * Abbreviate a color name to 3 uppercase chars.
 *
 * @param {string} colorName - The color name
 * @returns {string} Abbreviated color, e.g. "Default" → "DEF", "Black" → "BLK"
 */
function abbreviateColor(colorName) {
  if (!colorName) return 'UNK';

  return colorName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 3) || 'UNK';
}

/**
 * Generate a deterministic SKU for a product variant.
 *
 * @param {string} categoryName - Category name (e.g., 'Tees', 'Hoodies/Jackets')
 * @param {string} productName  - Product name (e.g., 'Vintage Washed Tee')
 * @param {string} colorName    - Color name (e.g., 'Default', 'Black')
 * @param {string} sizeName     - Size name (e.g., 'S', 'M', 'L')
 * @returns {string} The generated SKU, e.g. 'T-VWT-DEF-S'
 */
export function generateSku(categoryName, productName, colorName, sizeName) {
  const prefix = getCategoryPrefix(categoryName);
  const name = abbreviateName(productName);
  const color = abbreviateColor(colorName);
  const size = (sizeName || 'OS').toUpperCase().trim();

  return `${prefix}-${name}-${color}-${size}`;
}

export default generateSku;
