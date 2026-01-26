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

const CATEGORY_MAP = {
  1: 'Tees',
  2: 'Hoodies/Jackets',
  3: 'Jeans/Pants'
};

export default function Products(){
  const [items, setItems] = useState([]);
  const q = useQuery();
  
  const { add, totalQty } = useCart(); 
  
  const { token, name } = useAuth();
  const navigate = useNavigate();
  const [addedId, setAddedId] = useState(null);
  const [isCartOpen, setCartOpen] = useState(false);

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState(q.q || '');
  const inputRef = useRef(null);

  // Filter & Sort States
  const [sortOption, setSortOption] = useState('relevant');
  const [priceFilter, setPriceFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Fetch Products
  useEffect(()=>{
    let mounted = true;
    api.get('/products', { params: q }).then(r=>{
      if(mounted) {
        setItems(r.data);
      }
    }).catch(()=>{ if(mounted) setItems([]); });
    return ()=> mounted=false;
  }, [q.q, q.categoryId]);

  // Fade-in animation
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
  }, [items, searchTerm, sortOption, priceFilter, categoryFilter]);

  useEffect(() => { if (showSearch && inputRef.current) inputRef.current.focus(); }, [showSearch]);

  function submitSearch(e){ e?.preventDefault?.(); }

  // Helper: Filter & Sort Logic
  const processedItems = items
    .filter(p => {
      // Search Filter
      if (searchTerm && !p.name.toLowerCase().includes(searchTerm.trim().toLowerCase())) return false;
      
      // Category Filter (Using the Map)
      if (categoryFilter !== 'all') {
        const productCategoryName = CATEGORY_MAP[p.category_id]; 
        if (productCategoryName !== categoryFilter) return false;
      }

      // Price Filter
      const price = Number(p.price);
      if (priceFilter === 'under-10') return price < 10;
      if (priceFilter === '10-20') return price >= 10 && price <= 20;
      if (priceFilter === '20-plus') return price > 20;
      
      return true;
    })
    .sort((a, b) => {
      const priceA = Number(a.price);
      const priceB = Number(b.price);

      switch (sortOption) {
        case 'asc': return priceA - priceB;
        case 'desc': return priceB - priceA;
        case 'best-seller': return (b.sold || 0) - (a.sold || 0);
        default: return 0; 
      }
    });

  const filterSelectStyle = {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #ddd',
    fontSize: '14px',
    cursor: 'pointer',
    backgroundColor: '#fff'
  };

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

        {/* Cart Icon with Fixed Badge */}
        <div style={{ position: "relative", display: "inline-block" }}> 
          <img
            src={bagIcon}
            alt="Cart"
            title="Cart"
            onClick={() => setCartOpen(true)}
            style={{ width: 28, height: 28, cursor: 'pointer' }}
          />
          {totalQty > 0 && (
            <span style={{
                position: "absolute",
                bottom: -5,
                left: -5,
                background: "black",
                color: "white",
                borderRadius: "50%",
                padding: "2px 6px",
                fontSize: "12px",
                fontWeight: "bold",
                lineHeight: 1,
                minWidth: "18px",
                textAlign: "center"
              }}>
              {totalQty}
            </span>
          )}
        </div>

        <img
          src={accountIcon}
          alt="Account"
          title={token ? `Account (${name || 'me'})` : 'Login / Register'}
          onClick={() => navigate(token ? '/account' : '/login')}
          style={{ width: 28, height: 28, cursor: 'pointer' }}
        />
      </div>

      {/* Filter Bar */}
      <div className="filter-bar" style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '10px 20px',
        margin: '0 auto 20px',
        maxWidth: '1200px',
        borderBottom: '1px solid #f0f0f0',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', gap: '15px' }}>
          {/* Price Filter */}
          <select 
            value={priceFilter} 
            onChange={(e) => setPriceFilter(e.target.value)}
            style={filterSelectStyle}
          >
            <option value="all">Price: All</option>
            <option value="under-10">Under $10</option>
            <option value="10-20">$10 - $20</option>
            <option value="20-plus">$20+</option>
          </select>

          {/* Category Filter */}
          <select 
            value={categoryFilter} 
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={filterSelectStyle}
          >
            <option value="all">Category: All</option>
            {Object.values(CATEGORY_MAP).map(catName => (
              <option key={catName} value={catName}>{catName}</option>
            ))}
          </select>
        </div>

        <div className="sort-container">
          <label style={{ marginRight: '10px', fontSize: '14px', color: '#666' }}>Sort by:</label>
          <select 
            value={sortOption} 
            onChange={(e) => setSortOption(e.target.value)}
            style={{...filterSelectStyle, fontWeight: '500'}}
          >
            <option value="relevant">Relevant</option>
            <option value="best-seller">Best Seller</option>
            <option value="asc">Price: Low to High</option>
            <option value="desc">Price: High to Low</option>
          </select>
        </div>
      </div>

      <div className="products-grid">
        {processedItems.length > 0 ? (
          processedItems.map(p=> (
            <div key={p.id} className="card fade-in">
              <img src={p.image_url} alt={p.name} />
              <h3>{p.name}</h3>
              <strong>${Number(p.price).toFixed(2)}</strong>
              <button onClick={async () => {
                const ok = await add(p.id,1);
                if (ok) { setAddedId(p.id); setCartOpen(true); setTimeout(()=>setAddedId(null),2000); }
              }}>Add to Cart</button>
              {addedId === p.id && (
                <p style={{ color: 'green', textAlign: 'center', marginTop: 8 }}>✅ Added to Cart</p>
              )}
            </div>
          ))
        ) : (
          <div style={{ width: '100%', textAlign: 'center', padding: '50px', color: '#888' }}>
            No products found matching your filters.
          </div>
        )}
      </div>
      <CartDrawer isOpen={isCartOpen} onClose={() => setCartOpen(false)} />
    </>
  );
}