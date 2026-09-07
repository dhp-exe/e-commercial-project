import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';

const STANDARD_SIZES = ['XS', 'S', 'M', 'L', 'XL'];

export default function ManageProducts() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [expandedProductId, setExpandedProductId] = useState(null);

  // Form State
  const [productData, setProductData] = useState({
    name: '',
    description: '',
    category_id: '',
    base_price: '',
  });

  const [variants, setVariants] = useState([
    { color_name: 'Default', color_hex: '#000000', size_name: 'M', price_override: '', stock: 50 },
  ]);

  const [imageFiles, setImageFiles] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [prodRes, catRes] = await Promise.all([
        api.get('/products'),
        api.get('/products/categories'),
      ]);
      setProducts(prodRes.data);
      setCategories(catRes.data);
    } catch (err) {
      console.error('Failed to load products/categories:', err);
    }
  }

  // --- Variant Form Handlers ---

  function handleAddVariantRow() {
    setVariants((prev) => [
      ...prev,
      { color_name: 'Default', color_hex: '#000000', size_name: 'M', price_override: '', stock: 50 },
    ]);
  }

  function handleRemoveVariantRow(index) {
    if (variants.length <= 1) return;
    setVariants((prev) => prev.filter((_, i) => i !== index));
  }

  function handleVariantChange(index, field, value) {
    setVariants((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  // --- Actions ---

  async function handleAddProduct(e) {
    e.preventDefault();
    if (variants.length === 0) {
      alert('Please add at least one variant.');
      return;
    }

    setIsSubmitting(true);
    const payloadData = {
      name: productData.name.trim(),
      description: productData.description.trim(),
      category_id: Number(productData.category_id),
      base_price: Number(productData.base_price),
      variants: variants.map((v) => ({
        color_name: v.color_name.trim() || 'Default',
        color_hex: v.color_hex || '#000000',
        size_name: v.size_name.trim().toUpperCase(),
        price_override: v.price_override !== '' ? Number(v.price_override) : null,
        stock: Number(v.stock) || 0,
      })),
    };

    const formData = new FormData();
    formData.append('data', JSON.stringify(payloadData));

    for (let i = 0; i < imageFiles.length; i++) {
      formData.append('images', imageFiles[i]);
    }

    try {
      await api.post('/products', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      alert('Product with variants successfully created!');
      setProductData({ name: '', description: '', category_id: '', base_price: '' });
      setVariants([{ color_name: 'Default', color_hex: '#000000', size_name: 'M', price_override: '', stock: 50 }]);
      setImageFiles([]);
      loadData();
    } catch (err) {
      console.error('Create product error:', err);
      alert(err.response?.data?.message || 'Error adding product');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this product?')) return;
    try {
      await api.delete(`/products/${id}`);
      setProducts(products.filter((p) => p.id !== id));
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete');
    }
  }

  async function handleUpdateVariantInventory(variantId, currentStock, sku) {
    const newStockStr = prompt(`Enter new inventory quantity for ${sku || `Variant #${variantId}`}:`, currentStock);
    if (newStockStr === null) return;
    const newStock = parseInt(newStockStr, 10);
    if (Number.isNaN(newStock) || newStock < 0) {
      alert('Invalid stock quantity');
      return;
    }

    try {
      await api.put(`/products/variants/${variantId}/inventory`, { quantity: newStock });
      alert('Inventory updated!');
      loadData();
    } catch (err) {
      console.error('Update inventory error:', err);
      alert(err.response?.data?.message || 'Failed to update inventory');
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px' }}>
      <h2 style={{ marginBottom: 20 }}>Product & Variant Management</h2>

      {/* ADD PRODUCT FORM (ADMIN ONLY) */}
      {user?.role === 'admin' && (
        <div style={{ background: '#ffffff', padding: 24, marginBottom: 30, borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ marginBottom: 16 }}>Add New Product with Variants</h3>
          <form onSubmit={handleAddProduct} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Core Info */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
              <input
                placeholder="Product Name"
                value={productData.name}
                onChange={(e) => setProductData({ ...productData, name: e.target.value })}
                required
                style={{ padding: '10px 12px', borderRadius: 6, border: '1px solid #ccc' }}
              />

              <input
                type="number"
                step="0.01"
                placeholder="Base Price ($)"
                value={productData.base_price}
                onChange={(e) => setProductData({ ...productData, base_price: e.target.value })}
                required
                style={{ padding: '10px 12px', borderRadius: 6, border: '1px solid #ccc' }}
              />

              <select
                value={productData.category_id}
                onChange={(e) => setProductData({ ...productData, category_id: e.target.value })}
                required
                style={{ padding: '10px 12px', borderRadius: 6, border: '1px solid #ccc' }}
              >
                <option value="">Select Category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <textarea
              placeholder="Description"
              value={productData.description}
              onChange={(e) => setProductData({ ...productData, description: e.target.value })}
              rows={3}
              style={{ padding: '10px 12px', borderRadius: 6, border: '1px solid #ccc', resize: 'vertical' }}
            />

            {/* Multiple Images Upload */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Product Images (Upload up to 10; the 1st will be primary):
              </label>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => setImageFiles(Array.from(e.target.files))}
                style={{ fontSize: 13 }}
              />
              {imageFiles.length > 0 && (
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                  {imageFiles.length} file(s) selected
                </div>
              )}
            </div>

            {/* Variants Table */}
            <div style={{ background: '#f8fafc', padding: 16, borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h4 style={{ margin: 0 }}>Product Variants ({variants.length})</h4>
                <button
                  type="button"
                  onClick={handleAddVariantRow}
                  style={{
                    background: '#2b6cb0',
                    color: '#fff',
                    border: 'none',
                    padding: '6px 12px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  + Add Variant
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {variants.map((v, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 60px 1fr 1fr 1fr 40px',
                      gap: 8,
                      alignItems: 'center',
                    }}
                  >
                    <input
                      placeholder="Color (e.g. Black)"
                      value={v.color_name}
                      onChange={(e) => handleVariantChange(idx, 'color_name', e.target.value)}
                      required
                      style={{ padding: '8px 10px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
                    />
                    <input
                      type="color"
                      value={v.color_hex}
                      onChange={(e) => handleVariantChange(idx, 'color_hex', e.target.value)}
                      title="Pick hex color"
                      style={{ height: 36, width: '100%', padding: 2, borderRadius: 4, cursor: 'pointer' }}
                    />
                    <select
                      value={v.size_name}
                      onChange={(e) => handleVariantChange(idx, 'size_name', e.target.value)}
                      style={{ padding: '8px 10px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
                    >
                      {STANDARD_SIZES.map((sz) => (
                        <option key={sz} value={sz}>
                          {sz}
                        </option>
                      ))}
                      <option value="OS">OS</option>
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Override Price"
                      value={v.price_override}
                      onChange={(e) => handleVariantChange(idx, 'price_override', e.target.value)}
                      style={{ padding: '8px 10px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
                    />
                    <input
                      type="number"
                      placeholder="Stock"
                      value={v.stock}
                      onChange={(e) => handleVariantChange(idx, 'stock', e.target.value)}
                      required
                      style={{ padding: '8px 10px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveVariantRow(idx)}
                      disabled={variants.length <= 1}
                      style={{
                        background: variants.length <= 1 ? '#e2e8f0' : '#e53e3e',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 4,
                        padding: '8px',
                        cursor: variants.length <= 1 ? 'not-allowed' : 'pointer',
                        fontSize: 12,
                      }}
                      title="Remove variant"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                background: '#1a202c',
                color: '#fff',
                padding: '12px 20px',
                border: 'none',
                borderRadius: 6,
                fontWeight: 600,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.6 : 1,
              }}
            >
              {isSubmitting ? 'Creating Product...' : 'Create Product with Variants'}
            </button>
          </form>
        </div>
      )}

      {/* PRODUCT LIST */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {products.map((p) => {
          const isExpanded = expandedProductId === p.id;
          const variantCount = p.variants?.length || 0;

          return (
            <div
              key={p.id}
              style={{
                background: '#ffffff',
                padding: 16,
                borderRadius: 8,
                boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                border: '1px solid #edf2f7',
              }}
            >
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <img
                  src={p.primary_image || p.image_url || 'https://via.placeholder.com/80'}
                  alt={p.name}
                  style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 6 }}
                />

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: '#718096', textTransform: 'uppercase' }}>
                    {p.category_name} • ID: {p.id}
                  </div>
                  <h4 style={{ margin: '2px 0 6px', fontSize: 17 }}>{p.name}</h4>
                  <div style={{ fontSize: 14, color: '#4a5568', display: 'flex', gap: 16 }}>
                    <span>
                      Base Price: <strong>${Number(p.base_price || p.price).toFixed(2)}</strong>
                    </span>
                    <span>
                      Total Stock: <strong>{p.total_stock !== undefined ? p.total_stock : p.stock}</strong>
                    </span>
                    <span>
                      Variants: <strong>{variantCount}</strong>
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setExpandedProductId(isExpanded ? null : p.id)}
                    style={{
                      fontSize: 13,
                      padding: '6px 12px',
                      borderRadius: 4,
                      border: '1px solid #cbd5e0',
                      background: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    {isExpanded ? 'Hide Variants ▲' : 'Manage Variants ▼'}
                  </button>

                  {user?.role === 'admin' && (
                    <button
                      onClick={() => handleDelete(p.id)}
                      style={{
                        fontSize: 13,
                        background: '#fed7d7',
                        color: '#c53030',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {/* Collapsible Variants Table */}
              {isExpanded && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #edf2f7' }}>
                  <h5 style={{ margin: '0 0 10px', fontSize: 14, color: '#2d3748' }}>Variant Inventory</h5>
                  {variantCount === 0 ? (
                    <p style={{ fontSize: 13, color: '#a0aec0' }}>No variants recorded for this product.</p>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#f7fafc', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ padding: '8px 12px' }}>SKU</th>
                          <th style={{ padding: '8px 12px' }}>Color</th>
                          <th style={{ padding: '8px 12px' }}>Size</th>
                          <th style={{ padding: '8px 12px' }}>Effective Price</th>
                          <th style={{ padding: '8px 12px' }}>In Stock</th>
                          <th style={{ padding: '8px 12px' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.variants.map((v) => (
                          <tr key={v.id} style={{ borderBottom: '1px solid #edf2f7' }}>
                            <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{v.sku}</td>
                            <td style={{ padding: '8px 12px' }}>
                              <span
                                style={{
                                  display: 'inline-block',
                                  width: 10,
                                  height: 10,
                                  borderRadius: '50%',
                                  backgroundColor: v.color?.hex_code || '#000',
                                  marginRight: 6,
                                  verticalAlign: 'middle',
                                }}
                              />
                              {v.color?.name || 'Default'}
                            </td>
                            <td style={{ padding: '8px 12px' }}>{v.size?.name || v.size}</td>
                            <td style={{ padding: '8px 12px' }}>${Number(v.price).toFixed(2)}</td>
                            <td style={{ padding: '8px 12px', fontWeight: 600 }}>{v.stock}</td>
                            <td style={{ padding: '8px 12px' }}>
                              <button
                                onClick={() => handleUpdateVariantInventory(v.id, v.stock, v.sku)}
                                style={{
                                  fontSize: 12,
                                  padding: '4px 8px',
                                  background: '#edf2f7',
                                  border: '1px solid #cbd5e0',
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                }}
                              >
                                Edit Stock
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}