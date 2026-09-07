import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useParams, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useProduct, useProductRecommendations } from '../hooks/useProducts';
import CartDrawer from '../components/CartDrawer';
import RecommendRow from '../components/RecommendRow';
import './ProductDetails.css';

import bagIcon from '../assets/shopping_bag.png';
import accountIcon from '../assets/account_icon.png';

export default function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { add, totalQty } = useCart();
  const { token, name } = useAuth();

  const { data: product, isLoading: loading } = useProduct(id);
  const { data: similarProducts = [] } = useProductRecommendations(id);

  const [selectedColor, setSelectedColor] = useState(null);
  const [selectedSize, setSelectedSize] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [quantity, setQuantity] = useState(1);

  const [isCartOpen, setCartOpen] = useState(false);

  const productImgRef = useRef(null);
  const cartIconRef = useRef(null);
  const [flyingItem, setFlyingItem] = useState(null);

  // Extract distinct colors from variants
  const colors = useMemo(() => {
    if (!product?.variants || product.variants.length === 0) return [];
    const map = new Map();
    for (const v of product.variants) {
      if (v.color && !map.has(v.color.id)) {
        map.set(v.color.id, v.color);
      }
    }
    return Array.from(map.values());
  }, [product]);

  // Set default color when product loads
  useEffect(() => {
    if (colors.length > 0 && !selectedColor) {
      setSelectedColor(colors[0]);
    }
  }, [colors, selectedColor]);

  // Available sizes for the currently selected color
  const availableSizesForColor = useMemo(() => {
    if (!product?.variants || product.variants.length === 0) {
      return product?.sizes
        ? product.sizes.split(',').map((s) => ({
            name: s.trim(),
            sort_order: 0,
            available_stock: product.stock,
          }))
        : [];
    }
    return product.variants
      .filter((v) => !selectedColor || v.color?.id === selectedColor.id)
      .map((v) => ({
        name: v.size?.name || v.size,
        sort_order: v.size?.sort_order || 0,
        available_stock: v.available_stock !== undefined ? v.available_stock : v.stock,
        variant: v,
      }))
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [product, selectedColor]);

  // Reset or initialize size when color changes
  useEffect(() => {
    if (availableSizesForColor.length > 0) {
      // If current selectedSize is not in the new available sizes, select the first in-stock or first available
      const exists = availableSizesForColor.some((s) => s.name === selectedSize);
      if (!exists) {
        const inStockFirst = availableSizesForColor.find((s) => s.available_stock > 0) || availableSizesForColor[0];
        setSelectedSize(inStockFirst.name);
      }
    }
  }, [availableSizesForColor, selectedSize]);

  // Active variant matching selectedColor + selectedSize
  const activeVariant = useMemo(() => {
    if (!product?.variants || product.variants.length === 0) return null;
    return (
      product.variants.find(
        (v) =>
          (!selectedColor || v.color?.id === selectedColor.id) &&
          (v.size?.name === selectedSize || v.size === selectedSize)
      ) || null
    );
  }, [product, selectedColor, selectedSize]);

  // Reset active image when product changes
  useEffect(() => {
    if (product) {
      setSelectedImage(product.primary_image || product.image_url);
    }
  }, [product]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading product...</div>;
  if (!product) return <div style={{ padding: 40, textAlign: 'center' }}>Product not found.</div>;

  const currentMainImage = selectedImage || product.primary_image || product.image_url;
  const currentMaxStock = activeVariant
    ? activeVariant.available_stock
    : product.available_stock !== undefined
    ? product.available_stock
    : product.stock;

  const handleQuantityChange = (delta) => {
    setQuantity((prev) => {
      const next = prev + delta;
      if (next < 1) return 1;
      if (currentMaxStock !== undefined && next > currentMaxStock) return prev;
      return next;
    });
  };

  const triggerFlyAnimation = () => {
    if (!productImgRef.current || !cartIconRef.current) return;

    const startRect = productImgRef.current.getBoundingClientRect();
    const endRect = cartIconRef.current.getBoundingClientRect();

    setFlyingItem({
      src: currentMainImage,
      style: {
        position: 'fixed',
        top: startRect.top,
        left: startRect.left,
        width: startRect.width,
        height: startRect.height,
        opacity: 1,
        zIndex: 9999,
        borderRadius: '12px',
        pointerEvents: 'none',
        transition: 'none',
      },
    });

    requestAnimationFrame(() => {
      setTimeout(() => {
        setFlyingItem({
          src: currentMainImage,
          style: {
            position: 'fixed',
            top: endRect.top + 10,
            left: endRect.left + 10,
            width: '20px',
            height: '20px',
            opacity: 0,
            zIndex: 9999,
            borderRadius: '50%',
            pointerEvents: 'none',
            transition: 'all 0.8s cubic-bezier(0.2, 1, 0.3, 1)',
          },
        });
      }, 20);
    });

    setTimeout(() => setFlyingItem(null), 850);
  };

  const handleAddToCart = async (isBuyNow = false) => {
    if (availableSizesForColor.length > 0 && !selectedSize) {
      alert('Please select a size first.');
      return;
    }

    if (activeVariant && activeVariant.available_stock <= 0) {
      alert('This variant is currently out of stock.');
      return;
    }

    const success = await add({
      productId: product.id,
      variantId: activeVariant ? activeVariant.id : null,
      qty: quantity,
      size: selectedSize,
    });

    if (success) {
      if (isBuyNow) {
        navigate('/checkout');
      } else {
        triggerFlyAnimation();
      }
    }
  };

  // Price formatting
  let displayPrice;
  if (activeVariant) {
    displayPrice = `$${Number(activeVariant.price).toFixed(2)}`;
  } else if (product.min_price && product.max_price && product.min_price !== product.max_price) {
    displayPrice = `$${Number(product.min_price).toFixed(2)} - $${Number(product.max_price).toFixed(2)}`;
  } else {
    displayPrice = `$${Number(product.base_price || product.price).toFixed(2)}`;
  }

  const isOutOfStock = activeVariant ? activeVariant.available_stock <= 0 : currentMaxStock <= 0;

  return (
    <>
      {product && (
        <Helmet>
          <title>{product.name} | DHP Streetwear</title>
          <meta name="description" content={product.description || `Shop ${product.name} at DHP Streetwear.`} />
          <meta property="og:title" content={`${product.name} — DHP Streetwear`} />
          <meta property="og:description" content={product.description || `Shop ${product.name} at DHP Streetwear.`} />
          <meta property="og:type" content="product" />
          <meta property="og:image" content={currentMainImage} />
          <meta property="og:url" content={`https://e-commercial-project-mauve.vercel.app/product/${id}`} />
          <script type="application/ld+json">
            {JSON.stringify({
              '@context': 'https://schema.org/',
              '@type': 'Product',
              name: product.name,
              image: currentMainImage,
              description: product.description || '',
              offers: {
                '@type': 'Offer',
                priceCurrency: 'USD',
                price: String(activeVariant ? activeVariant.price : product.base_price || product.price),
                availability: !isOutOfStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
              },
            })}
          </script>
        </Helmet>
      )}

      {flyingItem && (
        <img src={flyingItem.src} style={flyingItem.style} className="flying-item" alt="" />
      )}

      {/* --- HEADER ICONS --- */}
      <div
        className="home-icons"
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '20px 40px',
        }}
      >
        <button
          onClick={() => navigate(-1)}
          style={{
            position: 'relative',
            color: 'black',
            fontSize: 18,
            cursor: 'pointer',
            borderRadius: 8,
            border: '1px solid rgba(0,0,0,0.12)',
            background: 'white',
            top: 10,
            left: 30,
            padding: '10px 14px',
          }}
        >
          ← Back
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginLeft: 'auto' }}>
          <div ref={cartIconRef} style={{ position: 'relative' }}>
            <img
              src={bagIcon}
              alt="Cart"
              title="Cart"
              onClick={() => setCartOpen(true)}
              style={{ width: 32, height: 32, cursor: 'pointer' }}
            />
            {totalQty > 0 && (
              <span
                style={{
                  position: 'absolute',
                  bottom: -5,
                  left: -5,
                  background: 'black',
                  color: 'white',
                  borderRadius: '50%',
                  padding: '2px 6px',
                  fontSize: 12,
                  fontWeight: 'bold',
                  minWidth: 18,
                  textAlign: 'center',
                }}
              >
                {totalQty}
              </span>
            )}
          </div>

          <img
            src={accountIcon}
            alt="Account"
            title={token ? `Account (${name || 'me'})` : 'Login / Register'}
            onClick={() => navigate(token ? '/account' : '/login')}
            style={{ width: 32, height: 32, cursor: 'pointer' }}
          />
        </div>
      </div>

      {/* --- MAIN PRODUCT CONTENT --- */}
      <div className="pdp-container fade-in">
        {/* Left: Gallery (Main + Thumbnails) */}
        <div className="pdp-gallery">
          <div className="pdp-image-container">
            <img ref={productImgRef} src={currentMainImage} alt={product.name} className="pdp-image" />
          </div>

          {Array.isArray(product.images) && product.images.length > 1 && (
            <div className="pdp-thumbnails">
              {product.images.map((img) => (
                <button
                  key={img.id}
                  className={`pdp-thumb ${selectedImage === img.image_url ? 'active' : ''}`}
                  onClick={() => setSelectedImage(img.image_url)}
                >
                  <img src={img.image_url} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Details & Variant Pickers */}
        <div className="pdp-info">
          <div>
            <div className="pdp-category-tag">{product.category_name}</div>
            <h1 className="pdp-name">{product.name}</h1>
            {activeVariant?.sku && <div className="pdp-sku">Code: {activeVariant.sku}</div>}
          </div>

          <div className="pdp-price-row">
            <span className="pdp-price">{displayPrice}</span>
            {activeVariant && (
              <span className={`stock-badge ${activeVariant.available_stock > 10 ? 'in-stock' : activeVariant.available_stock > 0 ? 'low-stock' : 'out-of-stock'}`}>
                {activeVariant.available_stock > 10
                  ? '● In Stock'
                  : activeVariant.available_stock > 0
                  ? `● Low Stock (${activeVariant.available_stock} left)`
                  : '● Out of Stock'}
              </span>
            )}
          </div>

          {/* Color Selector */}
          {colors.length > 0 && (
            <div className="color-section">
              <h4>
                Color: <strong>{selectedColor?.name || 'Default'}</strong>
              </h4>
              <div className="color-swatches">
                {colors.map((c) => (
                  <button
                    key={c.id}
                    className={`color-swatch-btn ${selectedColor?.id === c.id ? 'selected' : ''}`}
                    onClick={() => setSelectedColor(c)}
                    title={c.name}
                  >
                    <span className="color-dot" style={{ backgroundColor: c.hex_code || '#000000' }}></span>
                    <span className="color-label">{c.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Size Selector */}
          {availableSizesForColor.length > 0 && (
            <div className="size-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h4>
                  Select Size: <strong>{selectedSize}</strong>
                </h4>
              </div>
              <div className="size-grids">
                {availableSizesForColor.map((s) => {
                  const isSizeDisabled = s.available_stock <= 0;
                  return (
                    <button
                      key={s.name}
                      type="button"
                      disabled={isSizeDisabled}
                      className={`size-box ${selectedSize === s.name ? 'selected' : ''} ${isSizeDisabled ? 'disabled' : ''}`}
                      onClick={() => setSelectedSize(s.name)}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quantity Selector */}
          <div className="qty-section">
            <h4>Quantity</h4>
            <div className="qty-wrapper">
              <button className="qty-btn" onClick={() => handleQuantityChange(-1)} disabled={quantity <= 1}>
                −
              </button>
              <div className="qty-display">{quantity}</div>
              <button
                className="qty-btn"
                onClick={() => handleQuantityChange(1)}
                disabled={currentMaxStock !== undefined && quantity >= currentMaxStock}
              >
                +
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="pdp-actions">
            <button
              className="btn-add-cart"
              onClick={() => handleAddToCart(false)}
              disabled={isOutOfStock}
              style={{ opacity: isOutOfStock ? 0.4 : 1, cursor: isOutOfStock ? 'not-allowed' : 'pointer' }}
            >
              {isOutOfStock ? 'Out of Stock' : 'Add to Cart'}
            </button>
            <button
              className="btn-buy-now"
              onClick={() => handleAddToCart(true)}
              disabled={isOutOfStock}
              style={{ opacity: isOutOfStock ? 0.4 : 1, cursor: isOutOfStock ? 'not-allowed' : 'pointer' }}
            >
              {isOutOfStock ? 'Sold Out' : 'Buy Now'}
            </button>
          </div>
        </div>
      </div>

      {/* Similar products */}
      <RecommendRow title="Similar Products" products={similarProducts} />

      <CartDrawer isOpen={isCartOpen} onClose={() => setCartOpen(false)} />
    </>
  );
}