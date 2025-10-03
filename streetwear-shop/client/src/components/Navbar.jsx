import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import logo from "../assets/logo.png";
import CartDrawer from "./CartDrawer";

const Navbar = () => {
  const { user, logout } = useAuth();
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
        height: '140px',
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
          style={{ height: 180, display: 'block', margin: '0 auto', cursor: 'pointer' }}
        />
      </div>

      <div className="navbar-right" style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: '7rem', alignItems: 'center', marginRight: '4rem' }}>
        <Link to="contacts">Contacts</Link>
        {user ? (
          <>
            <button onClick={() => setCartOpen(true)}>Cart ({items?.length ?? 0})</button>
            <button onClick={logout}>Logout</button>
          </>
        ) : (
          <>
            <Link to="/login">Login</Link>
            <Link to="/register">Register</Link>
          </>
        )}
      </div>
      <CartDrawer isOpen={isCartOpen} onClose={() => setCartOpen(false)} />
    </nav>
  );
};

export default Navbar;