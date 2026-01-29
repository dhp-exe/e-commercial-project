import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from './AuthContext';

const CartCtx = createContext();
export const CartContext = CartCtx;
export const useCart = () => useContext(CartCtx);

export function CartProvider({ children }) {
  const { token } = useAuth();
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (token) refreshServer(); else refreshLocal();
  }, [token]);

  async function refreshServer() {
    try {
      const { data } = await api.get('/cart');
      setItems(data.items);
    } catch (e) {
      console.error('refreshServer error', e);
      setItems([]);
    }
  }

  async function refreshLocal() {
    try {
      const local = JSON.parse(localStorage.getItem('local_cart') || '[]');
      if (!local || local.length === 0) { setItems([]); return; }
      const { data: all } = await api.get('/products');
      const mapped = local.map(l => {
        const p = all.find(a => a.id === l.product_id);
        if (!p) return null;
    
        return { 
            product_id: p.id, 
            qty: l.qty, 
            size: l.size, 
            name: p.name, 
            price: p.price, 
            image_url: p.image_url 
        };
      }).filter(Boolean);
      setItems(mapped);
    } 
    catch (e) {
      console.error('refreshLocal error', e);
      setItems([]);
    }
  }

  async function refresh() { if (token) return refreshServer(); return refreshLocal(); }

  async function add(productId, qty = 1, size = null) {
    if (token) {
      try {
        await api.post('/cart/add', { productId, qty, size });
        await refreshServer();
        return true;
      } 
      catch (e) {
        console.error('Cart add error', e);
        return false;
      }
    }
    // guest/local cart
    try {
      const local = JSON.parse(localStorage.getItem('local_cart') || '[]');
      const ex = local.find(x => x.product_id === productId && x.size === size);
      
      if (ex) ex.qty = Number(ex.qty) + Number(qty);
      else local.push({ product_id: productId, qty: Number(qty), size });
      
      localStorage.setItem('local_cart', JSON.stringify(local));
      await refreshLocal();
      return true;
    } 
    catch (e) {
      console.error('local add error', e);
      return false;
    }
  }

  async function update(productId, qty, size) { 
    if (token) {
      try {
        await api.post('/cart/update', { productId, qty, size });
        await refreshServer();
        return true;
      } catch (e) {
        console.error('Cart update error', e);
        return false;
      }
    }
    
      // GUEST USER LOGIC
    try {
      let local = JSON.parse(localStorage.getItem('local_cart') || '[]');
      if (qty <= 0) {
        local = local.filter(x => !(x.product_id === productId && x.size === size));
      } 
      else {
        const ex = local.find(x => x.product_id === productId && x.size === size);
        if (ex) ex.qty = Number(qty);
      }
      localStorage.setItem('local_cart', JSON.stringify(local));
      await refreshLocal();
      return true;
    } 
    catch (e) {
        console.error('local update error', e);
        return false;
    }
  }

  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const totalQty = items.reduce((sum, item) => sum + Number(item.qty), 0);
  return (
    <CartCtx.Provider value={{ items, total, totalQty, add, update, refresh }}>
      {children}
    </CartCtx.Provider>
  );
}

export default CartProvider;