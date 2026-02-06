import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import logo from "../assets/logo.png";
import CartDrawer from "./CartDrawer";

const Navbar = () => {
  const { token, logout } = useAuth();
  const { items } = useCart();
  const navigate = useNavigate();
  const [isCartOpen, setCartOpen] = useState(false);

  return (
    <nav
      className="navbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.5rem 1rem',
        height: '130px',
      }}
    >
      <div className="navbar-left" style={{ flex: 1, display: 'flex', gap: '7rem', alignItems: 'center', marginLeft: '4rem' }}>
        <Link to="/">Home</Link>
        <Link to ="/about">About</Link>
        <Link to ="/products">Products</Link>
      </div>

      <div className="navbar-center" style={{ flex: '0 0 auto', textAlign: 'center' }}>
        <img
          src={logo}
          alt="Streetwear logo"
          onClick={() => navigate('/')}
          style={{ height: 220, display: 'block', margin: '40px auto 0', cursor: 'pointer' }}
        />
      </div>

      <div className="navbar-right" style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: '7rem', alignItems: 'center', marginRight: '4rem' }}>
        <Link to="contacts">Contact</Link>
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
      <CartDrawer isOpen={isCartOpen} onClose={() => setCartOpen(false)} />
    </nav>
  );
};

export default Navbar;