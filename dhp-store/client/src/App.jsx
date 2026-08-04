import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import CartProvider from './context/CartContext.jsx';
import { SearchProvider } from './context/SearchContext.jsx';
import Navbar from './components/Navbar.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import ChatBot from './components/ChatBot.jsx';
import LoadingScreen from './components/LoadingScreen.jsx';

import './styles/main.css';

// Lazy-loaded pages — only downloaded when the route is visited
const Home = lazy(() => import('./pages/Home.jsx'));
const About = lazy(() => import('./pages/About.jsx'));
const Products = lazy(() => import('./pages/Products.jsx'));
const ProductDetails = lazy(() => import('./pages/ProductDetails.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const Feedback = lazy(() => import('./pages/Feedback.jsx'));
const Cart = lazy(() => import('./pages/Cart.jsx'));
const Account = lazy(() => import('./pages/Account.jsx'));
const Contact = lazy(() => import('./pages/Contact.jsx'));
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'));
const Checkout = lazy(() => import('./pages/Checkout.jsx'));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout.jsx'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard.jsx'));
const ManageOrders = lazy(() => import('./pages/admin/ManageOrders.jsx'));
const ManageProducts = lazy(() => import('./pages/admin/ManageProducts.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <SearchProvider>
          <Navbar />
          <ChatBot />
          <main className="container">
            <Suspense fallback={<LoadingScreen />}>
              <Routes>
                {/* Public Storefront */}
                <Route path="" element={<Home />} />
                <Route path="/" element={<Home />} />
                <Route path='/about' element={<About />} />
                <Route path="/products" element={<Products />} />
                <Route path="/product/:id" element={<ProductDetails />} />
                <Route path="/contacts" element={<Contact />} />
                <Route path="/login" element={<Login />} />
                <Route path="/feedback" element={<Feedback />} />
                <Route path="/cart" element={<Cart />} />
                <Route path="/checkout" element={<Checkout />} />
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

                {/* 404 Fallback */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </main>
        </SearchProvider>
      </CartProvider>
    </AuthProvider>
  );
}