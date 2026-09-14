import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

const STANDARD_SIZES = ['XS', 'S', 'M', 'L', 'XL'];

export default function ManageProducts() {
  const { user } = useAuth();
  const { showToast } = useToast();
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
    {
      colorMode: 'existing',
      color_id: '',
      color_name: 'Default',
      color_hex: '#000000',
      size_name: 'M',
      price_override: '',
      stock: 50,
      image_index: null,
    },
  ]);

  const [imageFiles, setImageFiles] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [primaryImageIndex, setPrimaryImageIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [colors, setColors] = useState([]);

  // Generate object URLs for image preview & clean up on unmount/change
  useEffect(() => {
    const urls = imageFiles.map((f) => URL.createObjectURL(f));
    setImagePreviews(urls);
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [imageFiles]);

  // Edit Variant Modal State
  const [editingVariant, setEditingVariant] = useState(null);
  const [isSavingVariant, setIsSavingVariant] = useState(false);

  // Add Variant Modal State
  const [addingVariantProduct, setAddingVariantProduct] = useState(null);
  const [newVariantData, setNewVariantData] = useState({
    size_name: 'M',
    colorMode: 'existing',
    color_id: '',
    new_color_name: '',
    new_color_hex: '#000000',
    price_override: '',
    stock: 50,
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData(showSpinner = false) {
    if (showSpinner) setIsRefreshing(true);
    try {
      const timestamp = Date.now();
      const [prodRes, catRes, colRes] = await Promise.all([
        api.get(`/products?_t=${timestamp}`),
        api.get(`/products/categories?_t=${timestamp}`),
        api.get(`/products/colors?_t=${timestamp}`),
      ]);
      setProducts(prodRes.data);
      setCategories(catRes.data);
      setColors(colRes.data);

      if (colRes.data.length > 0) {
        setVariants((prev) =>
          prev.map((v) =>
            !v.color_id && v.colorMode === 'existing'
              ? {
                ...v,
                color_id: colRes.data[0].id,
                color_name: colRes.data[0].name,
                color_hex: colRes.data[0].hex_code || '#000000',
              }
              : v
          )
        );
      }

      if (showSpinner) showToast('Products refreshed', 'info');
    } catch (err) {
      console.error('Failed to load products/categories/colors:', err);
      if (showSpinner) showToast('Failed to refresh data', 'error');
    } finally {
      if (showSpinner) setIsRefreshing(false);
    }
  }

  // --- Variant Form Handlers ---

  function handleAddVariantRow() {
    const defaultColor = colors.length > 0 ? colors[0] : { id: '', name: 'Default', hex_code: '#000000' };
    setVariants((prev) => [
      ...prev,
      {
        colorMode: 'existing',
        color_id: defaultColor.id || '',
        color_name: defaultColor.name || 'Default',
        color_hex: defaultColor.hex_code || '#000000',
        size_name: 'M',
        price_override: '',
        stock: 50,
        image_index: null,
      },
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
      showToast('Please add at least one variant.', 'warning');
      return;
    }

    // Validate no duplicate variant rows (same color and size)
    const seenVariantKeys = new Set();
    for (const v of variants) {
      const cKey = v.colorMode === 'existing' && v.color_id ? `id:${v.color_id}` : `name:${(v.color_name || 'Default').trim().toLowerCase()}`;
      const sKey = (v.size_name || 'OS').trim().toUpperCase();
      const comboKey = `${cKey}__${sKey}`;
      if (seenVariantKeys.has(comboKey)) {
        const displayColor = v.colorMode === 'existing' && v.color_id ? (colors.find((c) => c.id === Number(v.color_id))?.name || v.color_name) : v.color_name;
        showToast(`Duplicate variant: Color "${displayColor || 'Default'}" with Size "${sKey}". Each variant must have a unique color/size combination.`, 'warning');
        return;
      }
      seenVariantKeys.add(comboKey);
    }

    setIsSubmitting(true);
    const payloadData = {
      name: productData.name.trim(),
      description: productData.description.trim(),
      category_id: Number(productData.category_id),
      base_price: Number(productData.base_price),
      primary_image_index: primaryImageIndex,
      variants: variants.map((v) => ({
        color_id: v.colorMode === 'existing' && v.color_id ? Number(v.color_id) : undefined,
        color_name: v.color_name.trim() || 'Default',
        color_hex: v.color_hex || '#000000',
        size_name: v.size_name.trim().toUpperCase(),
        price_override: v.price_override !== '' ? Number(v.price_override) : null,
        stock: Number(v.stock) || 0,
        image_index: v.image_index !== null && v.image_index !== undefined ? Number(v.image_index) : null,
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
      showToast('Product with variants successfully created!', 'success');
      setProductData({ name: '', description: '', category_id: '', base_price: '' });
      const defaultColor = colors.length > 0 ? colors[0] : { id: '', name: 'Default', hex_code: '#000000' };
      setVariants([
        {
          colorMode: 'existing',
          color_id: defaultColor.id || '',
          color_name: defaultColor.name || 'Default',
          color_hex: defaultColor.hex_code || '#000000',
          size_name: 'M',
          price_override: '',
          stock: 50,
          image_index: null,
        },
      ]);
      setImageFiles([]);
      setPrimaryImageIndex(0);
      loadData();
    } catch (err) {
      console.error('Create product error:', err);
      showToast(err.response?.data?.message || 'Error adding product', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this product?')) return;
    try {
      await api.delete(`/products/${id}`);
      setProducts(products.filter((p) => p.id !== id));
      showToast('Product deleted successfully', 'success');
    } catch (err) {
      console.error('Delete error:', err);
      showToast('Failed to delete product', 'error');
    }
  }

  function openEditVariantModal(product, variant) {
    const existingColorId = variant.color_id || variant.color?.id || (colors.length > 0 ? colors[0].id : '');
    setEditingVariant({
      product,
      variant,
      colorMode: 'existing',
      color_id: existingColorId,
      new_color_name: '',
      new_color_hex: '#000000',
      price_override: variant.price_override !== null && variant.price_override !== undefined ? String(variant.price_override) : '',
      stock: variant.stock !== undefined ? variant.stock : 0,
    });
  }

  async function handleSaveEditVariant(e) {
    e.preventDefault();
    if (!editingVariant) return;
    setIsSavingVariant(true);

    const payload = {
      price_override: editingVariant.price_override !== '' ? Number(editingVariant.price_override) : null,
      stock: Number(editingVariant.stock) || 0,
    };

    if (editingVariant.colorMode === 'new') {
      if (!editingVariant.new_color_name?.trim()) {
        showToast('Please provide a name for the new color.', 'warning');
        setIsSavingVariant(false);
        return;
      }
      payload.color_name = editingVariant.new_color_name.trim();
      payload.color_hex = editingVariant.new_color_hex || '#000000';
    } else {
      payload.color_id = Number(editingVariant.color_id);
    }

    try {
      await api.put(`/products/variants/${editingVariant.variant.id}`, payload);
      showToast('Variant updated successfully!', 'success');
      setEditingVariant(null);
      loadData();
    } catch (err) {
      console.error('Update variant error:', err);
      showToast(err.response?.data?.message || 'Failed to update variant', 'error');
    } finally {
      setIsSavingVariant(false);
    }
  }

  function openAddVariantModal(product) {
    setAddingVariantProduct(product);
    setNewVariantData({
      size_name: 'M',
      colorMode: 'existing',
      color_id: colors.length > 0 ? colors[0].id : '',
      new_color_name: '',
      new_color_hex: '#000000',
      price_override: '',
      stock: 50,
    });
  }

  async function handleCreateVariant(e) {
    e.preventDefault();
    if (!addingVariantProduct) return;
    setIsSavingVariant(true);

    const payload = {
      size_name: newVariantData.size_name,
      price_override: newVariantData.price_override !== '' ? Number(newVariantData.price_override) : null,
      stock: Number(newVariantData.stock) || 0,
    };

    if (newVariantData.colorMode === 'new') {
      if (!newVariantData.new_color_name?.trim()) {
        showToast('Please provide a name for the new color.', 'warning');
        setIsSavingVariant(false);
        return;
      }
      payload.color_name = newVariantData.new_color_name.trim();
      payload.color_hex = newVariantData.new_color_hex || '#000000';
    } else {
      payload.color_id = Number(newVariantData.color_id);
    }

    // Check if addingVariantProduct already has this color + size combination
    const targetSizeName = (newVariantData.size_name || 'OS').trim().toUpperCase();
    const isDuplicate = addingVariantProduct.variants?.some((v) => {
      const vSize = (v.size?.name || v.size || '').trim().toUpperCase();
      if (vSize !== targetSizeName) return false;
      if (newVariantData.colorMode === 'new') {
        const vColorName = (v.color?.name || v.color_name || '').trim().toLowerCase();
        return vColorName === payload.color_name.toLowerCase();
      }
      const vColorId = v.color?.id || v.color_id;
      return Number(vColorId) === payload.color_id;
    });

    if (isDuplicate) {
      showToast(`A variant with this color and size (${targetSizeName}) already exists on this product. Please edit the existing variant's stock instead.`, 'warning');
      setIsSavingVariant(false);
      return;
    }

    try {
      await api.post(`/products/${addingVariantProduct.id}/variants`, payload);
      showToast('Variant added successfully!', 'success');
      setAddingVariantProduct(null);
      loadData();
    } catch (err) {
      console.error('Create variant error:', err);
      showToast(err.response?.data?.message || 'Failed to create variant', 'error');
    } finally {
      setIsSavingVariant(false);
    }
  }

  async function handleDeleteVariant(product, variant) {
    if ((product.variants?.length || 0) <= 1) {
      showToast('Cannot delete the only variant of a product. Every product must have at least one variant.', 'warning');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete variant "${variant.sku}"?`)) return;

    try {
      await api.delete(`/products/variants/${variant.id}`);
      showToast('Variant deleted successfully!', 'success');
      loadData();
    } catch (err) {
      console.error('Delete variant error:', err);
      showToast(err.response?.data?.message || 'Failed to delete variant', 'error');
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Product & Variant Management</h2>
        <button
          onClick={() => loadData(true)}
          disabled={isRefreshing}
          style={{
            padding: '8px 16px',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: isRefreshing ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          🔄 {isRefreshing ? 'Refreshing...' : 'Refresh Products'}
        </button>
      </div>

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
                Product Images (Upload up to 10; #1 will be primary):
              </label>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => {
                  const files = Array.from(e.target.files);
                  setImageFiles(files);
                  setPrimaryImageIndex(0);
                }}
                style={{ fontSize: 13 }}
              />
              {imageFiles.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: '#4a5568', fontWeight: 600 }}>
                      {imageFiles.length} file(s) selected
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {imageFiles.map((file, fIdx) => {
                      const isPrimary = fIdx === primaryImageIndex;
                      return (
                        <div
                          key={fIdx}
                          onClick={() => setPrimaryImageIndex(fIdx)}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            padding: 6,
                            background: isPrimary ? '#ebf8ff' : '#edf2f7',
                            borderRadius: 6,
                            border: isPrimary ? '2px solid #2b6cb0' : '1px solid #cbd5e0',
                            position: 'relative',
                            cursor: 'pointer',
                            boxShadow: isPrimary ? '0 2px 6px rgba(43, 108, 176, 0.25)' : 'none',
                            transition: 'all 0.15s ease',
                          }}
                          title={isPrimary ? 'Current Primary (Default) Image' : 'Click to set as Primary Image'}
                        >
                          <img
                            src={imagePreviews[fIdx]}
                            alt={file.name}
                            style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 4 }}
                          />
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                            <input
                              type="radio"
                              name="primary_image_choice"
                              checked={isPrimary}
                              onChange={() => setPrimaryImageIndex(fIdx)}
                              style={{ cursor: 'pointer', accentColor: '#2b6cb0' }}
                            />
                            <span style={{ fontSize: 11, fontWeight: 700, color: isPrimary ? '#2b6cb0' : '#4a5568' }}>
                              #{fIdx + 1} {isPrimary ? '★ Primary' : ''}
                            </span>
                          </div>
                          <span
                            style={{
                              fontSize: 10,
                              color: '#718096',
                              maxWidth: 70,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              marginTop: 2,
                            }}
                            title={file.name}
                          >
                            {file.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
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

              {/* Table Column Headers */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2.4fr 1fr 1.1fr 1fr 2fr 36px',
                  gap: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#4a5568',
                  marginBottom: 6,
                  padding: '0 2px',
                }}
              >
                <div>Color (Choose or Add)</div>
                <div>Size</div>
                <div>Override ($)</div>
                <div>Stock</div>
                <div>Assign Image</div>
                <div></div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {variants.map((v, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2.4fr 1fr 1.1fr 1fr 2fr 36px',
                      gap: 8,
                      alignItems: 'center',
                    }}
                  >
                    {/* Color selection */}
                    {v.colorMode === 'new' ? (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input
                          placeholder="Color Name"
                          value={v.color_name}
                          onChange={(e) => handleVariantChange(idx, 'color_name', e.target.value)}
                          required
                          style={{ flex: 1, padding: '8px 8px', borderRadius: 4, border: '1px solid #2563eb', fontSize: 13 }}
                        />
                        <input
                          type="color"
                          value={v.color_hex}
                          onChange={(e) => handleVariantChange(idx, 'color_hex', e.target.value)}
                          title="Pick hex color"
                          style={{ height: 36, width: 36, padding: 2, borderRadius: 4, cursor: 'pointer', border: '1px solid #ccc' }}
                        />
                        <button
                          type="button"
                          title="Switch back to existing colors"
                          onClick={() => {
                            const defaultColor = colors[0] || { id: '', name: 'Default', hex_code: '#000000' };
                            handleVariantChange(idx, 'colorMode', 'existing');
                            handleVariantChange(idx, 'color_id', defaultColor.id);
                            handleVariantChange(idx, 'color_name', defaultColor.name);
                            handleVariantChange(idx, 'color_hex', defaultColor.hex_code || '#000000');
                          }}
                          style={{
                            background: '#f1f5f9',
                            border: '1px solid #cbd5e1',
                            borderRadius: 4,
                            padding: '6px 8px',
                            fontSize: 11,
                            cursor: 'pointer',
                            color: '#475569',
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <select
                          value={v.color_id || ''}
                          onChange={(e) => {
                            if (e.target.value === '__NEW__') {
                              handleVariantChange(idx, 'colorMode', 'new');
                              handleVariantChange(idx, 'color_id', '');
                              handleVariantChange(idx, 'color_name', '');
                              handleVariantChange(idx, 'color_hex', '#000000');
                            } else {
                              const selected = colors.find((c) => String(c.id) === e.target.value);
                              handleVariantChange(idx, 'colorMode', 'existing');
                              handleVariantChange(idx, 'color_id', selected ? selected.id : '');
                              handleVariantChange(idx, 'color_name', selected ? selected.name : '');
                              handleVariantChange(idx, 'color_hex', selected ? (selected.hex_code || '#000000') : '#000000');
                            }
                          }}
                          style={{ flex: 1, padding: '8px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
                        >
                          <option value="" disabled>Select Color</option>
                          {colors.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                          <option value="__NEW__" style={{ fontWeight: 600, color: '#2563eb' }}>
                            + Add New Color...
                          </option>
                        </select>
                        <div
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            backgroundColor: v.color_hex || '#000000',
                            border: '1px solid #cbd5e1',
                            flexShrink: 0,
                          }}
                          title={v.color_hex || '#000000'}
                        />
                      </div>
                    )}

                    {/* Size */}
                    <select
                      value={v.size_name}
                      onChange={(e) => handleVariantChange(idx, 'size_name', e.target.value)}
                      style={{ padding: '8px 6px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
                    >
                      {STANDARD_SIZES.map((sz) => (
                        <option key={sz} value={sz}>
                          {sz}
                        </option>
                      ))}
                      <option value="OS">OS</option>
                    </select>

                    {/* Override Price */}
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Optional"
                      value={v.price_override}
                      onChange={(e) => handleVariantChange(idx, 'price_override', e.target.value)}
                      style={{ padding: '8px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
                    />

                    {/* Stock */}
                    <input
                      type="number"
                      placeholder="Stock"
                      value={v.stock}
                      onChange={(e) => handleVariantChange(idx, 'stock', e.target.value)}
                      required
                      style={{ padding: '8px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
                    />

                    {/* Assign Image */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {v.image_index !== null && v.image_index !== undefined && imagePreviews[v.image_index] ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                          <img
                            src={imagePreviews[v.image_index]}
                            alt={`Variant`}
                            style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 4, border: '1px solid #2563eb', flexShrink: 0 }}
                          />
                          <select
                            value={v.image_index}
                            onChange={(e) => handleVariantChange(idx, 'image_index', e.target.value === '' ? null : Number(e.target.value))}
                            style={{ flex: 1, padding: '6px 6px', borderRadius: 4, border: '1px solid #ccc', fontSize: 12 }}
                          >
                            <option value="">Default (Primary: Image #{primaryImageIndex + 1})</option>
                            {imageFiles.map((file, fIdx) => (
                              <option key={fIdx} value={fIdx}>
                                #{fIdx + 1}: {file.name.length > 14 ? file.name.slice(0, 11) + '...' : file.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <select
                          value=""
                          onChange={(e) => handleVariantChange(idx, 'image_index', e.target.value === '' ? null : Number(e.target.value))}
                          disabled={imageFiles.length === 0}
                          style={{
                            width: '100%',
                            padding: '8px 8px',
                            borderRadius: 4,
                            border: '1px dashed #cbd5e1',
                            fontSize: 12,
                            color: imageFiles.length === 0 ? '#94a3b8' : '#334155',
                            background: imageFiles.length === 0 ? '#f8fafc' : '#ffffff',
                            cursor: imageFiles.length === 0 ? 'not-allowed' : 'pointer',
                          }}
                        >
                          <option value="">
                            {imageFiles.length === 0 ? 'Upload image first' : '📷 Assign Image...'}
                          </option>
                          {imageFiles.map((file, fIdx) => (
                            <option key={fIdx} value={fIdx}>
                              #{fIdx + 1}: {file.name.length > 18 ? file.name.slice(0, 15) + '...' : file.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

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
                      borderRadius: 6,
                      border: '1px solid #3b82f6',
                      background: isExpanded ? '#2563eb' : '#eff6ff',
                      color: isExpanded ? '#ffffff' : '#1d4ed8',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
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
                        borderRadius: 6,
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <h5 style={{ margin: 0, fontSize: 15, color: '#1d4ed8', fontWeight: 700 }}>
                        Manage Variants ({variantCount})
                      </h5>
                      <span style={{ fontSize: 12, color: '#64748b' }}>
                        Modify variant prices, colors, stock, or add/remove variants.
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => openAddVariantModal(p)}
                      style={{
                        background: '#2563eb',
                        color: '#fff',
                        border: 'none',
                        padding: '6px 14px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      + Add Variant
                    </button>
                  </div>

                  {variantCount === 0 ? (
                    <p style={{ fontSize: 13, color: '#a0aec0' }}>No variants recorded for this product.</p>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ padding: '8px 12px' }}>Code (SKU)</th>
                          <th style={{ padding: '8px 12px' }}>Color</th>
                          <th style={{ padding: '8px 12px' }}>Size</th>
                          <th style={{ padding: '8px 12px' }}>Price Override</th>
                          <th style={{ padding: '8px 12px' }}>Effective Price</th>
                          <th style={{ padding: '8px 12px' }}>In Stock</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.variants.map((v) => (
                          <tr key={v.id} style={{ borderBottom: '1px solid #edf2f7' }}>
                            <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 500 }}>{v.sku}</td>
                            <td style={{ padding: '8px 12px' }}>
                              <span
                                style={{
                                  display: 'inline-block',
                                  width: 12,
                                  height: 12,
                                  borderRadius: '50%',
                                  backgroundColor: v.color?.hex_code || '#000',
                                  marginRight: 6,
                                  verticalAlign: 'middle',
                                  border: '1px solid rgba(0,0,0,0.15)',
                                }}
                              />
                              {v.color?.name || 'Default'}
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              <span style={{ fontWeight: 600, padding: '2px 6px', background: '#f1f5f9', borderRadius: 4 }}>
                                {v.size?.name || v.size}
                              </span>
                            </td>
                            <td style={{ padding: '8px 12px', color: v.price_override !== null && v.price_override !== undefined ? '#1d4ed8' : '#64748b' }}>
                              {v.price_override !== null && v.price_override !== undefined
                                ? `$${Number(v.price_override).toFixed(2)}`
                                : 'None (Base Price)'}
                            </td>
                            <td style={{ padding: '8px 12px', fontWeight: 600 }}>${Number(v.price).toFixed(2)}</td>
                            <td style={{ padding: '8px 12px', fontWeight: 600 }}>{v.stock}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: 6 }}>
                                <button
                                  type="button"
                                  onClick={() => openEditVariantModal(p, v)}
                                  style={{
                                    fontSize: 12,
                                    padding: '5px 10px',
                                    background: '#eff6ff',
                                    color: '#1d4ed8',
                                    border: '1px solid #93c5fd',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                  }}
                                >
                                  ✏️ Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteVariant(p, v)}
                                  style={{
                                    fontSize: 12,
                                    padding: '5px 10px',
                                    background: '#fef2f2',
                                    color: '#dc2626',
                                    border: '1px solid #fca5a5',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                  }}
                                >
                                  🗑️ Delete
                                </button>
                              </div>
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

      {/* EDIT VARIANT MODAL */}
      {editingVariant && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
          }}
          onClick={() => setEditingVariant(null)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 10,
              padding: 24,
              width: '90%',
              maxWidth: 500,
              boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, color: '#1d4ed8' }}>Edit Variant</h3>
              <button
                onClick={() => setEditingVariant(null)}
                style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
              Product: <strong>{editingVariant.product.name}</strong> • SKU: <code>{editingVariant.variant.sku}</code>
            </div>

            <form onSubmit={handleSaveEditVariant} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Color Selection */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Color:
                </label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <button
                    type="button"
                    onClick={() => setEditingVariant((prev) => ({ ...prev, colorMode: 'existing' }))}
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      borderRadius: 4,
                      border: '1px solid #cbd5e1',
                      background: editingVariant.colorMode === 'existing' ? '#2563eb' : '#f8fafc',
                      color: editingVariant.colorMode === 'existing' ? '#fff' : '#334155',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Choose Existing Color
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingVariant((prev) => ({ ...prev, colorMode: 'new' }))}
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      borderRadius: 4,
                      border: '1px solid #cbd5e1',
                      background: editingVariant.colorMode === 'new' ? '#2563eb' : '#f8fafc',
                      color: editingVariant.colorMode === 'new' ? '#fff' : '#334155',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    + Add New Color
                  </button>
                </div>

                {editingVariant.colorMode === 'existing' ? (
                  <select
                    value={editingVariant.color_id}
                    onChange={(e) => setEditingVariant((prev) => ({ ...prev, color_id: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                  >
                    {colors.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.hex_code || '#000'})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px', gap: 8 }}>
                    <input
                      placeholder="New Color Name (e.g. Navy Blue)"
                      value={editingVariant.new_color_name}
                      onChange={(e) => setEditingVariant((prev) => ({ ...prev, new_color_name: e.target.value }))}
                      required
                      style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                    />
                    <input
                      type="color"
                      value={editingVariant.new_color_hex}
                      onChange={(e) => setEditingVariant((prev) => ({ ...prev, new_color_hex: e.target.value }))}
                      title="Choose Color Hex"
                      style={{ height: 38, width: '100%', padding: 2, borderRadius: 6, border: '1px solid #cbd5e1', cursor: 'pointer' }}
                    />
                  </div>
                )}
              </div>

              {/* Price Override */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Price Override ($):
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={`Base price: $${Number(editingVariant.product.base_price || editingVariant.product.price).toFixed(2)}`}
                  value={editingVariant.price_override}
                  onChange={(e) => setEditingVariant((prev) => ({ ...prev, price_override: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                />
                <span style={{ fontSize: 11, color: '#64748b', display: 'block', marginTop: 4 }}>
                  Leave blank or clear to use the base price ($
                  {Number(editingVariant.product.base_price || editingVariant.product.price).toFixed(2)}).
                </span>
              </div>

              {/* Stock */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Stock Quantity:
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={editingVariant.stock}
                  onChange={(e) => setEditingVariant((prev) => ({ ...prev, stock: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setEditingVariant(null)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingVariant}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 6,
                    border: 'none',
                    background: '#2563eb',
                    color: '#fff',
                    fontWeight: 600,
                    cursor: isSavingVariant ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSavingVariant ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD VARIANT MODAL */}
      {addingVariantProduct && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
          }}
          onClick={() => setAddingVariantProduct(null)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 10,
              padding: 24,
              width: '90%',
              maxWidth: 500,
              boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, color: '#1d4ed8' }}>Add Variant</h3>
              <button
                onClick={() => setAddingVariantProduct(null)}
                style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
              Product: <strong>{addingVariantProduct.name}</strong> • Base Price: $
              {Number(addingVariantProduct.base_price || addingVariantProduct.price).toFixed(2)}
            </div>

            <form onSubmit={handleCreateVariant} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Size Selection */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Size:
                </label>
                <select
                  value={newVariantData.size_name}
                  onChange={(e) => setNewVariantData((prev) => ({ ...prev, size_name: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                >
                  {STANDARD_SIZES.map((sz) => (
                    <option key={sz} value={sz}>{sz}</option>
                  ))}
                </select>
              </div>

              {/* Color Selection */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Color:
                </label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <button
                    type="button"
                    onClick={() => setNewVariantData((prev) => ({ ...prev, colorMode: 'existing' }))}
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      borderRadius: 4,
                      border: '1px solid #cbd5e1',
                      background: newVariantData.colorMode === 'existing' ? '#2563eb' : '#f8fafc',
                      color: newVariantData.colorMode === 'existing' ? '#fff' : '#334155',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Choose Existing Color
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewVariantData((prev) => ({ ...prev, colorMode: 'new' }))}
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      borderRadius: 4,
                      border: '1px solid #cbd5e1',
                      background: newVariantData.colorMode === 'new' ? '#2563eb' : '#f8fafc',
                      color: newVariantData.colorMode === 'new' ? '#fff' : '#334155',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    + Add New Color
                  </button>
                </div>

                {newVariantData.colorMode === 'existing' ? (
                  <select
                    value={newVariantData.color_id}
                    onChange={(e) => setNewVariantData((prev) => ({ ...prev, color_id: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                  >
                    {colors.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.hex_code || '#000'})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px', gap: 8 }}>
                    <input
                      placeholder="New Color Name (e.g. Sage Green)"
                      value={newVariantData.new_color_name}
                      onChange={(e) => setNewVariantData((prev) => ({ ...prev, new_color_name: e.target.value }))}
                      required
                      style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                    />
                    <input
                      type="color"
                      value={newVariantData.new_color_hex}
                      onChange={(e) => setNewVariantData((prev) => ({ ...prev, new_color_hex: e.target.value }))}
                      title="Choose Color Hex"
                      style={{ height: 38, width: '100%', padding: 2, borderRadius: 6, border: '1px solid #cbd5e1', cursor: 'pointer' }}
                    />
                  </div>
                )}
              </div>

              {/* Price Override */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Price Override ($):
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={`Base price: $${Number(addingVariantProduct.base_price || addingVariantProduct.price).toFixed(2)} (Optional)`}
                  value={newVariantData.price_override}
                  onChange={(e) => setNewVariantData((prev) => ({ ...prev, price_override: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                />
                <span style={{ fontSize: 11, color: '#64748b', display: 'block', marginTop: 4 }}>
                  Leave blank to inherit the base product price ($
                  {Number(addingVariantProduct.base_price || addingVariantProduct.price).toFixed(2)}).
                </span>
              </div>

              {/* Stock */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Initial Stock:
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={newVariantData.stock}
                  onChange={(e) => setNewVariantData((prev) => ({ ...prev, stock: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setAddingVariantProduct(null)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingVariant}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 6,
                    border: 'none',
                    background: '#2563eb',
                    color: '#fff',
                    fontWeight: 600,
                    cursor: isSavingVariant ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSavingVariant ? 'Adding...' : 'Add Variant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}