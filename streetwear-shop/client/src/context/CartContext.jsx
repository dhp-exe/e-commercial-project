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
      // fetch products list and map local entries to product details
      const { data: all } = await api.get('/products');
      const mapped = local.map(l => {
        const p = all.find(a => a.id === l.product_id);
        if (!p) return null;
        return { product_id: p.id, qty: l.qty, name: p.name, price: p.price, image_url: p.image_url };
      }).filter(Boolean);
      setItems(mapped);
    } catch (e) {
      console.error('refreshLocal error', e);
      setItems([]);
    }
  }

  async function refresh() { if (token) return refreshServer(); return refreshLocal(); }

  async function add(productId, qty = 1) {
    if (token) {
      try {
        await api.post('/cart/add', { productId, qty });
        await refreshServer();
        return true;
      } catch (e) {
        console.error('Cart add error', e);
        return false;
      }
    }
    // guest/local cart
    try {
      const local = JSON.parse(localStorage.getItem('local_cart') || '[]');
      const ex = local.find(x => x.product_id === productId);
      if (ex) ex.qty = Number(ex.qty) + Number(qty);
      else local.push({ product_id: productId, qty: Number(qty) });
      localStorage.setItem('local_cart', JSON.stringify(local));
      await refreshLocal();
      return true;
    } catch (e) {
      console.error('local add error', e);
      return false;
    }
  }

  async function update(productId, qty) {
    if (token) {
      try {
        await api.post('/cart/update', { productId, qty });
        await refreshServer();
        return true;
      } catch (e) {
        console.error('Cart update error', e);
        return false;
      }
    }
    try {
      let local = JSON.parse(localStorage.getItem('local_cart') || '[]');
      if (qty <= 0) {
        local = local.filter(x => x.product_id !== productId);
      } else {
        const ex = local.find(x => x.product_id === productId);
        if (ex) ex.qty = Number(qty);
        else local.push({ product_id: productId, qty: Number(qty) });
      }
      localStorage.setItem('local_cart', JSON.stringify(local));
      await refreshLocal();
      return true;
    } catch (e) {
      console.error('local update error', e);
      return false;
    }
  }

  const total = items.reduce((s, i) => s + i.price * i.qty, 0);

  return (
    <CartCtx.Provider value={{ items, total, add, update, refresh }}>
      {children}
    </CartCtx.Provider>
  );
}

export default CartProvider;