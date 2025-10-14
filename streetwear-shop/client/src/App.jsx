import React from 'react';
import { Routes, Route } from 'react-router-dom';
import AuthProvider from './context/AuthContext.jsx';
import CartProvider from './context/CartContext.jsx';
import Navbar from './components/Navbar.jsx';
import Home from './pages/Home.jsx';
import Products from './pages/Products.jsx';
import Login from './pages/Login.jsx';
import Feedback from './pages/Feedback.jsx';
import Cart from './pages/Cart.jsx';
import './styles.css';

export default function App(){
  return (
    <AuthProvider>
      <CartProvider>
        <Navbar />
        <main className="container">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/products" element={<Products />} />
            <Route path="/login" element={<Login />} />
            <Route path="/feedback" element={<Feedback />} />
            <Route path="/cart" element={<Cart />} />
          </Routes>
        </main>
      </CartProvider>
    </AuthProvider>
  );
}