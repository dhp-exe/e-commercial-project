import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';

export default function ManageProducts() {
  const { user } = useAuth(); // To check role
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]); // Needed for dropdown
  
  // Form State
  const [newProduct, setNewProduct] = useState({
    name: '', description: '', price: '', stock: '', category_id: ''
  });
  const [imageFile, setImageFile] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [prodRes, catRes] = await Promise.all([
      api.get('/products'),
      api.get('/products/categories')
    ]);
    setProducts(prodRes.data);
    setCategories(catRes.data);
  }

  // --- Actions ---

  async function handleAddProduct(e) {
    e.preventDefault();
    const formData = new FormData();
    Object.keys(newProduct).forEach(key => formData.append(key, newProduct[key]));
    if (imageFile) formData.append('image', imageFile);

    try {
      await api.post('/products', formData, { headers: { 'Content-Type': 'multipart/form-data' }});
      alert('Product Added!');
      setNewProduct({ name: '', description: '', price: '', stock: '', category_id: '' }); // Reset
      setImageFile(null);
      loadData(); // Refresh list
    } catch (err) {
      alert(err.response?.data?.message || 'Error adding product');
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this product?")) return;
    try {
      await api.delete(`/products/${id}`);
      setProducts(products.filter(p => p.id !== id));
    } catch (err) {
      alert("Failed to delete");
    }
  }

  async function handleUpdateStock(id, newStock) {
    const stock = prompt("Enter new stock quantity:", newStock);
    if (stock === null) return;
    try {
      await api.put(`/products/${id}/stock`, { stock: parseInt(stock) });
      loadData();
    } catch (err) {
      alert("Failed to update stock");
    }
  }

  return (
    <div>
      <h2>Manage Products</h2>

      {/* ADD PRODUCT FORM (ADMIN ONLY) */}
      {user.role === 'admin' && (
        <div style={{background: 'white', padding: 20, marginBottom: 30, borderRadius: 8}}>
          <h3>Add New Product</h3>
          <form onSubmit={handleAddProduct} style={{display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 500}}>
            <input placeholder="Name" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} required />
            <textarea placeholder="Description" value={newProduct.description} onChange={e => setNewProduct({...newProduct, description: e.target.value})} />
            
            <div style={{display: 'flex', gap: 10}}>
              <input type="number" placeholder="Price" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} required />
              <input type="number" placeholder="Stock" value={newProduct.stock} onChange={e => setNewProduct({...newProduct, stock: e.target.value})} required />
            </div>

            <select value={newProduct.category_id} onChange={e => setNewProduct({...newProduct, category_id: e.target.value})} required>
              <option value="">Select Category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <input type="file" onChange={e => setImageFile(e.target.files[0])} />
            
            <button type="submit" style={{background: '#222', color: '#fff', padding: 10, cursor: 'pointer'}}>Create Product</button>
          </form>
        </div>
      )}

      {/* PRODUCT LIST */}
      <div className="product-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20}}>
        {products.map(p => (
          <div key={p.id} style={{background: 'white', padding: 15, borderRadius: 8, boxShadow: '0 2px 5px rgba(0,0,0,0.1)'}}>
            <img src={p.image_url || 'https://via.placeholder.com/150'} alt={p.name} style={{width: '100%', height: 150, objectFit: 'cover'}} />
            <h4>{p.name}</h4>
            <p>Stock: <strong>{p.stock}</strong></p>
            
            <div style={{display: 'flex', gap: 10, marginTop: 10}}>
              {/* Staff & Admin can update stock */}
              <button onClick={() => handleUpdateStock(p.id, p.stock)} style={{fontSize: 12}}>Edit Stock</button>
              
              {/* Only Admin can delete */}
              {user.role === 'admin' && (
                <button onClick={() => handleDelete(p.id)} style={{fontSize: 12, background: 'red', color: 'white', border: 'none'}}>Delete</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}