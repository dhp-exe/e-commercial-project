import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Link } from 'react-router-dom';

export default function AdminDashboard() {
  const { user } = useAuth();

  return (
    <div>
      <h1>Admin Dashboard</h1>
      <p>Welcome back, <strong>{user?.name}</strong> ({user?.role})!</p>
      
      <div style={{display: 'flex', gap: '20px', marginTop: '20px'}}>
        <Link to="/admin/orders" className="dashboard-card" style={cardStyle}>
          <h3>📦 Manage Orders</h3>
          <p>View and update order statuses.</p>
        </Link>
        
        <Link to="/admin/products" className="dashboard-card" style={cardStyle}>
          <h3>🏷️ Manage Products</h3>
          <p>Update stock, price, or add new items.</p>
        </Link>
      </div>
    </div>
  );
}

const cardStyle = {
  background: 'white',
  padding: '20px',
  borderRadius: '8px',
  boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
  textDecoration: 'none',
  color: '#333',
  width: '200px',
  display: 'block'
};