import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useSearch } from '../context/SearchContext';
import logo from "../assets/logo.png";
import searchIcon from "../assets/search_icon.png";
import bagIcon from "../assets/shopping_bag.png";
import accountIcon from "../assets/account_icon.png";
import CartDrawer from "./CartDrawer";

const Navbar = () => {
  const { token } = useAuth();
  const { totalQty } = useCart();
  const navigate = useNavigate();
  const [isCartOpen, setCartOpen] = useState(false);
  const { showSearch, setShowSearch, searchTerm, setSearchTerm } = useSearch();
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef(null);

  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    if (showSearch && inputRef.current) inputRef.current.focus();
  }, [showSearch]);

  function submitSearch(e) {
    e?.preventDefault();
    // Match Home.jsx: prevent page reload, but filtering happens
    // live via shared `searchTerm` in Home / Products components.
  }

  return (
    <>
      <nav className="navbar">
        {/* Mobile: left – Menu + Search */}
        <div className="navbar-mobile-left">
          <button
            type="button"
            className="navbar-menu-btn"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <span className="navbar-menu-icon" aria-hidden>
              <span /><span /><span />
            </span>
          </button>
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
              className="navbar-search-toggle-icon"
              style={{ width: 32, height: 32, cursor: 'pointer' }}
            />
          </form>
        </div>

        {/* Desktop: left links */}
        <div className="navbar-desktop-left">
          <Link to="/">Home</Link>
          <Link to="/about">About</Link>
          <Link to="/products">Products</Link>
        </div>

        {/* Center: logo */}
        <div className="navbar-center">
          <img
            src={logo}
            alt="Streetwear logo"
            onClick={() => navigate('/')}
            className="navbar-logo"
          />
        </div>

        {/* Mobile: right – Cart + Account */}
        <div className="navbar-mobile-right">
          <button
            type="button"
            className="navbar-icon-btn navbar-cart-btn"
            onClick={() => setCartOpen(true)}
            aria-label="Cart"
          >
            <img src={bagIcon} alt="" />
            {totalQty > 0 && (
              <span className="navbar-cart-badge">{totalQty}</span>
            )}
          </button>
          <button
            type="button"
            className="navbar-icon-btn"
            onClick={() => {
              navigate(token ? '/account' : '/login');
            }}
            aria-label={token ? 'Account' : 'Login'}
          >
            <img src={accountIcon} alt="" />
          </button>
        </div>

        {/* Desktop: right links */}
        <div className="navbar-desktop-right">
          <Link to="/contacts">Contact</Link>
          {token ? (
            <>
              <Link to="/account">Account</Link>
              <Link to="/feedback">Feedback</Link>
            </>
          ) : (
            <>
              <Link to="/login">Login</Link>
              <Link to="/feedback">Feedback</Link>
            </>
          )}
        </div>
      </nav>

      {/* Mobile menu overlay */}
      <div
        className={`navbar-menu-overlay ${menuOpen ? 'navbar-menu-overlay--open' : ''}`}
        aria-hidden={!menuOpen}
      >
        <div className="navbar-menu-backdrop" onClick={closeMenu} />
        <div className="navbar-menu-drawer">
          <div className="navbar-menu-header">
            <span>Menu</span>
            <button
              type="button"
              className="navbar-menu-close"
              onClick={closeMenu}
              aria-label="Close menu"
            >
              ×
            </button>
          </div>
          <nav className="navbar-menu-links">
            <Link to="/" onClick={closeMenu}>Home</Link>
            <Link to="/about" onClick={closeMenu}>About</Link>
            <Link to="/products" onClick={closeMenu}>Products</Link>
            <Link to="/contacts" onClick={closeMenu}>Contact</Link>
            <Link to={token ? '/account' : '/login'} onClick={closeMenu}>
              {token ? 'Account' : 'Login'}
            </Link>
            <Link to="/feedback" onClick={closeMenu}>Feedback</Link>
          </nav>
        </div>
      </div>

      <CartDrawer isOpen={isCartOpen} onClose={() => setCartOpen(false)} />
    </>
  );
};

export default Navbar;
