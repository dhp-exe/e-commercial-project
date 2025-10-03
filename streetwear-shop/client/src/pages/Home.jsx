import React, { useEffect, useState, useRef, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import searchIcon from "../assets/search_icon.png";
import bagIcon from "../assets/shopping_bag.png";
import accountIcon from "../assets/account_icon.png";
import homeBanner from "../assets/home-banner3.jpg";
import CartDrawer from "../components/CartDrawer";
import { CartContext } from "../context/CartContext";

export default function Home() {
  const [items, setItems] = useState([]);
  const { add } = useCart();
  const { token, name } = useAuth();
  const navigate = useNavigate();
  const [message, setMessage] = useState(null);
  const [addedId, setAddedId] = useState(null);
  const [isCartOpen, setCartOpen] = useState(false);

  // search state & ref
  const [q, setQ] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const inputRef = useRef(null);
  //cart quantity
  const { items: cartItems } = useContext(CartContext);
  const totalQty = (cartItems || []).reduce((sum, item) => sum + item.qty, 0);

  useEffect(() => {
    let mounted = true;
    api.get('/products')
      .then(res => { if (mounted) setItems(res.data); })
      .catch(() => { if (mounted) setItems([]); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!items.length) return;
    const cards = document.querySelectorAll('.home-grid .card.fade-in');
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
  useEffect(() => {
    if (showSearch && inputRef.current) inputRef.current.focus();
  }, [showSearch]);

  function submitSearch(e) {
    e?.preventDefault();
    // Live search handled client-side via searchTerm filter
  }


  return (
    <>
      <div className="home-banner">
        <img src={homeBanner} alt="Streetwear Banner" />

        {/* moved: home hero section placed inside banner, left aligned */}
        <div className="home-banner__overlay">
          <section className="home">
            <h1>New Drop</h1>
            <p>Premium streetwear basics.</p>
            <Link to="/products" className="button">Shop Now</Link>
          </section>
        </div>
      </div>

      <div className="home-icons" style={{ display: 'flex', justifyContent: 'flex-end', gap: 20, padding: '8px 1rem' }}>
        {/* search bar + icon */}
        <form onSubmit={submitSearch} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {showSearch && (
            <input
              ref={inputRef}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
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

        <div style={{ position: "relative", display: "inline-block" }}>
          <img
            src={bagIcon}
            alt="Cart"
            title="Cart"
            onClick={() => setCartOpen(true)}
            style={{ width: 28, height: 28, cursor: "pointer" }}
          />
          <span style={{
            position: "absolute",
            bottom: -5,   // adjust as needed
            left: -5,     // adjust as needed
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
        </div>


        {/* account icon -> login or account */}
        <img
          src={accountIcon}
          alt="Account"
          title={token ? `Account (${name || 'me'})` : 'Login / Register'}
          onClick={() => navigate(token ? '/account' : '/login')}
          style={{ width: 28, height: 28, cursor: 'pointer' }}
        />
      </div>

      {/* removed duplicate home section (now inside banner) */}
      <section className="container">
        <h2 style={{ textAlign: "center", fontSize: "40px" }}> All Products</h2>
        <div className="grid home-grid">
          {items
            .filter((p) => {
              if (searchTerm.trim() === "") {
                return true; // ✅ show all products if search is empty
              }
              return p.name.toLowerCase().includes(searchTerm.toLowerCase());
            })
            .map(p => (
              <div key={p.id} className="card fade-in">
                <img src={p.image_url} alt={p.name} />
                <h3>{p.name}</h3>
                <p className="muted">{p.category_name}</p>
                <strong>${Number(p.price).toFixed(2)}</strong>
                <button
                  onClick={async () => {
                    const ok = await add(p.id, 1);
                    if (ok) {
                      setAddedId(p.id);
                      setTimeout(() => setAddedId(null), 2000);
                    }
                  }}
                >
                  Add to Cart
                </button>
                {addedId === p.id && (
                  <p style={{ color: 'green', textAlign: 'center', marginTop: 8 }}>✅ Added to Cart</p>
                )}


              </div>
            ))}
        </div>
      </section>{/* Cart Icon */}
      {/* Drawer */}
      <CartDrawer isOpen={isCartOpen} onClose={() => setCartOpen(false)} />
    </>

  );
}