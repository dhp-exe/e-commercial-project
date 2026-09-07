import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
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
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      console.error('refreshServer error', e);
      setItems([]);
    }
  }

  async function refreshLocal() {
    try {
      const local = JSON.parse(localStorage.getItem('local_cart') || '[]');
      if (!local || local.length === 0) { setItems([]); return; }
      
      const ids = [...new Set(local.map(item => item.product_id))];
      const { data: products } = await api.post('/products/batch', { ids });
      
      const mapped = local.map(l => {
        const p = products.find(a => a.id === l.product_id);
        if (!p) return null;

        const v = l.variant_id && Array.isArray(p.variants)
          ? p.variants.find(item => item.id === l.variant_id)
          : null;

        const effectivePrice = v ? v.price : p.price;
        const effectiveSize = v ? (v.size?.name || v.size) : l.size;

        return { 
          product_id: p.id,
          variant_id: l.variant_id || (v?.id || null),
          qty: l.qty, 
          size: effectiveSize,
          size_name: effectiveSize,
          color_name: v?.color?.name || 'Default',
          name: p.name, 
          sku: v?.sku || '',
          price: effectivePrice, 
          image_url: p.primary_image || p.image_url,
          available_stock: v ? v.available_stock : p.available_stock,
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

  async function add(arg1, qty = 1, size = null) {
    let productId;
    let variantId = null;
    let itemQty = qty;
    let itemSize = size;

    if (typeof arg1 === 'object' && arg1 !== null) {
      productId = arg1.productId || arg1.product_id;
      variantId = arg1.variantId || arg1.variant_id || null;
      itemQty = arg1.qty !== undefined ? arg1.qty : 1;
      itemSize = arg1.size || null;
    } else {
      productId = arg1;
    }

    if (token) {
      try {
        await api.post('/cart/add', {
          productId,
          variantId,
          qty: itemQty,
          size: itemSize,
        });
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
      const ex = local.find(x => 
        (variantId && x.variant_id === variantId) ||
        (x.product_id === productId && x.size === itemSize)
      );
      
      if (ex) {
        ex.qty = Number(ex.qty) + Number(itemQty);
        if (variantId) ex.variant_id = variantId;
      } else {
        local.push({
          product_id: productId,
          variant_id: variantId,
          qty: Number(itemQty),
          size: itemSize,
        });
      }
      
      localStorage.setItem('local_cart', JSON.stringify(local));
      await refreshLocal();
      return true;
    } 
    catch (e) {
      console.error('local add error', e);
      return false;
    }
  }

  async function update(arg1, qty, size) {
    let productId;
    let variantId = null;
    let itemQty = qty;
    let itemSize = size;

    if (typeof arg1 === 'object' && arg1 !== null) {
      productId = arg1.productId || arg1.product_id;
      variantId = arg1.variantId || arg1.variant_id || null;
      itemQty = arg1.qty !== undefined ? arg1.qty : qty;
      itemSize = arg1.size || size;
    } else {
      productId = arg1;
    }

    if (token) {
      try {
        await api.post('/cart/update', {
          productId,
          variantId,
          qty: itemQty,
          size: itemSize,
        });
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
      if (itemQty <= 0) {
        local = local.filter(x => 
          !(variantId ? x.variant_id === variantId : (x.product_id === productId && x.size === itemSize))
        );
      } 
      else {
        const ex = local.find(x => 
          variantId ? x.variant_id === variantId : (x.product_id === productId && x.size === itemSize)
        );
        if (ex) ex.qty = Number(itemQty);
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

  const total = useMemo(
    () => (items || []).reduce((s, i) => s + i.price * i.qty, 0),
    [items]
  );
  const totalQty = useMemo(
    () => (items || []).reduce((sum, item) => sum + Number(item.qty), 0),
    [items]
  );
  return (
    <CartCtx.Provider value={{ items, total, totalQty, add, update, refresh }}>
      {children}
    </CartCtx.Provider>
  );
}

export default CartProvider;