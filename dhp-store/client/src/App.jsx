import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import CartProvider from './context/CartContext.jsx';
import Navbar from './components/Navbar.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import ChatBot from './components/Chatbot.jsx';

import AdminLayout from './pages/admin/AdminLayout.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import ManageOrders from './pages/admin/ManageOrders.jsx';
import ManageProducts from './pages/admin/ManageProducts.jsx';

import Home from './pages/Home.jsx';
import About from './pages/About.jsx';
import Products from './pages/Products.jsx';
import Login from './pages/Login.jsx';
import Feedback from './pages/Feedback.jsx';
import Cart from './pages/Cart.jsx';
import Account from './pages/Account.jsx';
import Contact from './pages/Contact.jsx';
import ResetPassword from './pages/ResetPassword.jsx';

import './styles.css';
const ProductDetails = lazy(() => import('./pages/ProductDetails'));
const Checkout = lazy(() => import('./pages/Checkout'));

export default function App(){
  return (
    <AuthProvider>
      <CartProvider>
        <Navbar />
        <ChatBot />
        <main className="container">
          <Routes>
            {/* Public Storefront */}
            <Route path="" element={<Home />} />
            <Route path="/" element={<Home />} />
            <Route path='/about' element={<About />} />
            <Route path="/products" element={<Products />} />
            <Route path="/product/:id" element={<Suspense fallback={<div>Loading...</div>}><ProductDetails /></Suspense>} />
            <Route path="/contacts" element={<Contact />} />
            <Route path="/login" element={<Login />} />
            <Route path="/feedback" element={<Feedback />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<Suspense fallback={<div style={{padding:'50px', textAlign:'center'}}>Loading Checkout...</div>}><Checkout /></Suspense>} />
            <Route path="/account" element={<Account />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Admin / Staff Routes */}
            <Route element={<ProtectedRoute allowedRoles={['admin', 'staff']} />}>
              <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminDashboard />} /> {/* Overview */}
                  <Route path="orders" element={<ManageOrders />} />
                  <Route path="products" element={<ManageProducts />} />
              </Route>
          </Route>
          </Routes>
        </main>
      </CartProvider>
    </AuthProvider>
  );
}