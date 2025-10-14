import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import searchIcon from "../assets/search_icon.png";
import bagIcon from "../assets/shopping_bag.png";
import accountIcon from "../assets/account_icon.png";
import CartDrawer from "../components/CartDrawer";

function useQuery(){ const { search } = useLocation(); return Object.fromEntries(new URLSearchParams(search)); }

export default function Products(){
  const [items, setItems] = useState([]);
  const q = useQuery();
  const { add } = useCart();
  const { token, name } = useAuth();
  const navigate = useNavigate();
  const [addedId, setAddedId] = useState(null);
  const [isCartOpen, setCartOpen] = useState(false);

  // search state & ref (for icon-triggered inline search)
  const [showSearch, setShowSearch] = useState(false);
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState(q.q || '');
  const inputRef = useRef(null);

  useEffect(()=>{
    let mounted = true;
    api.get('/products', { params: q }).then(r=>{
      if(mounted) setItems(r.data);
    }).catch(()=>{ if(mounted) setItems([]); });
    return ()=> mounted=false;
  }, [q.q, q.categoryId]);

  useEffect(() => {
    if (!items || items.length === 0) return;
    const cards = document.querySelectorAll('.card.fade-in');
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    cards.forEach(c => observer.observe(c));
    return () => observer.disconnect();
  }, [items, searchTerm]);

  // focus search when shown
  useEffect(() => { if (showSearch && inputRef.current) inputRef.current.focus(); }, [showSearch]);

  function submitSearch(e){
    e?.preventDefault?.();
    // Live filtering handled client-side via searchTerm
  }

  return (
    <>
      <div className="home-icons" style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '8px 1rem' }}>
        <form onSubmit={submitSearch} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {showSearch && (
            <input
              ref={inputRef}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search products..."
              style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)' }}
            />
          )}
          <img
            src={searchIcon}
            alt="Search"
            title="Search"
            onClick={() => setShowSearch(s => !s)}
            style={{ width: 28, height: 28, cursor: 'pointer' }}
          />
        </form>

        <img
          src={bagIcon}
          alt="Cart"
          title="Cart"
          onClick={() => setCartOpen(true)}
          style={{ width: 28, height: 28, cursor: 'pointer' }}
        />

        <img
          src={accountIcon}
          alt="Account"
          title={token ? `Account (${name || 'me'})` : 'Login / Register'}
          onClick={() => navigate(token ? '/account' : '/login')}
          style={{ width: 28, height: 28, cursor: 'pointer' }}
        />
      </div>

      <div className="products-grid">
        {(searchTerm && searchTerm.trim()
          ? items.filter(p => p.name.toLowerCase().includes(searchTerm.trim().toLowerCase()))
          : items
        ).map(p=> (
          <div key={p.id} className="card fade-in">
            <img src={p.image_url} alt={p.name} />
            <h3>{p.name}</h3>
            <p className="muted">{p.category_name}</p>
            <strong>${Number(p.price).toFixed(2)}</strong>
            <button onClick={async () => {
              const ok = await add(p.id,1);
              if (ok) { setAddedId(p.id); setCartOpen(true); setTimeout(()=>setAddedId(null),2000); }
            }}>Add to Cart</button>
            {addedId === p.id && (
              <p style={{ color: 'green', textAlign: 'center', marginTop: 8 }}>✅ Added to Cart</p>
            )}
          </div>
        ))}
      </div>
      <CartDrawer isOpen={isCartOpen} onClose={() => setCartOpen(false)} />
    </>
  );
}