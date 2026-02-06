import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import './Account.css';

export default function Account() {
  const { token, name, logout } = useAuth();
  const navigate = useNavigate();
  
  // --- States ---
  const [userInfo, setUserInfo] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    profilePicture: null,
  });
  const [orders, setOrders] = useState({
    new: 0,
    confirmed: 0,
    shipping: 0,
    received: 0,
    cancelled: 0,
  });
  const [vouchers, setVouchers] = useState([]);
  const [passwords, setPasswords] = useState({
    current: '',
    new: '',
    confirm: '',
  });
  
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('orders');
  
  // Popup States
  const [selectedStatus, setSelectedStatus] = useState(null); 
  const [statusOrders, setStatusOrders] = useState([]); 

  // --- Effects ---
  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    fetchUserData();
  }, [token, navigate]);

  // --- Functions ---
  async function fetchUserData() {
    try {
      const { data } = await api.get('/auth/profile');
      setUserInfo({
        name: data.name || '',
        email: data.email || '',
        phone: data.phone || '',
        address: data.address || '',
        profilePicture: data.profilePicture || null,
      });
      setOrders(data.orders || { new: 0, confirmed: 0, shipping: 0, received: 0, cancelled: 0 });
      setVouchers(data.vouchers || []);
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleProfilePictureUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('profilePicture', file);
    try {
      setMessage('');
      const { data } = await api.post('/auth/upload-profile-picture', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUserInfo({ ...userInfo, profilePicture: data.profilePicture });
      setMessage('Profile picture updated successfully!');
    } catch (error) {
      setMessage('Error uploading profile picture: ' + (error.response?.data?.message || error.message));
    }
  }

  async function handleUpdateInfo(e) {
    e.preventDefault();
    try {
      setMessage('');
      await api.put('/auth/profile', {
        phone: userInfo.phone,
        address: userInfo.address,
      });
      setMessage('Profile updated successfully!');
    } catch (error) {
      setMessage('Error updating profile: ' + (error.response?.data?.message || error.message));
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      setMessage('New passwords do not match!');
      return;
    }
    if (passwords.new.length < 6) {
      setMessage('New password must be at least 6 characters!');
      return;
    }
    try {
      setMessage('');
      await api.post('/auth/change-password', {
        currentPassword: passwords.current,
        newPassword: passwords.new,
      });
      setPasswords({ current: '', new: '', confirm: '' });
      setMessage('Password changed successfully!');
    } catch (error) {
      setMessage('Error changing password: ' + (error.response?.data?.message || error.message));
    }
  }

  function handleLogout() {
    logout();
    navigate('/');
  }

  async function handleOrderClick(status) {
    try {
      const { data } = await api.get(`/orders?status=${status}`);
      setStatusOrders(data);
      setSelectedStatus(status);
    } catch (error) {
      console.error("Failed to fetch orders", error);
    }
  }

  async function handleCancelOrder(orderId) {
    if (!window.confirm("Are you sure you want to cancel this order?")) return;   
    try{
      await api.put(`orders/${orderId}/cancel`);
      setStatusOrders(prev => prev.filter(order => order.id !== orderId));
      setOrders(prev => ({ 
          ...prev, 
          new: Math.max(0, prev.new - 1),
          cancelled: prev.cancelled + 1 
      }));
      setMessage('Order cancelled successfully.');
    }
    catch (error) {
      console.error("Error cancelling order", error);
      setMessage('Error cancelling order:' );
    }
  }

  function closePopup() {
    setSelectedStatus(null);
    setStatusOrders([]);
  }

  if (loading) {
    return <div className="account-page"><p>Loading...</p></div>;
  }

  return (
    <div className="account-page">
      <div className="account-container">
        {/* LEFT SIDEBAR */}
        <aside className="account-sidebar">
          <div className="profile-card">
            <div className="profile-picture-container">
              {userInfo.profilePicture ? (
                <img src={userInfo.profilePicture} alt="Profile" className="profile-picture" />
              ) : (
                <div className="profile-picture-placeholder">
                  <span className="initials">{userInfo.name.charAt(0).toUpperCase()}</span>
                </div>
              )}
            </div>
            <h2 className="profile-greeting">Hello, {userInfo.name}!</h2>
            
            <div className="upload-picture-section">
              <label htmlFor="picture-input" className="upload-btn">Update Profile Picture</label>
              <input id="picture-input" type="file" accept="image/*" onChange={handleProfilePictureUpload} style={{ display: 'none' }} />
            </div>

            <nav className="account-nav">
              <button 
                className={`nav-item ${activeTab === 'orders' ? 'active' : ''}`} 
                onClick={() => setActiveTab('orders')}
              >
                My Orders
              </button>
              <button 
                className={`nav-item ${activeTab === 'info' ? 'active' : ''}`} 
                onClick={() => setActiveTab('info')}
              >
                My Information
              </button>
              
              {/* Vouchers Tab Button */}
              <button 
                className={`nav-item ${activeTab === 'vouchers' ? 'active' : ''}`} 
                onClick={() => setActiveTab('vouchers')}
              >
                My Vouchers
              </button>

              <button 
                className={`nav-item ${activeTab === 'password' ? 'active' : ''}`} 
                onClick={() => setActiveTab('password')}
              >
                Change Password
              </button>
              <button className="nav-item logout-btn" onClick={handleLogout}>Log Out</button>
            </nav>
          </div>
        </aside>

        {/* Main Content */}
        <main className="account-main">
          {message && <div className={`message ${message.includes('Error') ? 'error' : 'success'}`}>{message}</div>}

          {/* Orders Section */}
          {activeTab === 'orders' && (
            <section className="account-section">
              <h1>My Orders</h1>
              <div className="orders-grid">
                {['new', 'confirmed', 'shipping', 'received', 'cancelled'].map(status => (
                  <div 
                    key={status} 
                    className={`order-card ${status}`} 
                    onClick={() => handleOrderClick(status)} 
                    style={{cursor: 'pointer'}}
                  >
                    <h3 style={{textTransform: 'capitalize'}}>{status}</h3>
                    <p className="order-count">{orders[status]}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Info Section */}
          {activeTab === 'info' && (
            <section className="account-section">
              <h1>My Information</h1>
              <form onSubmit={handleUpdateInfo} className="info-form">
                <div className="form-group">
                  <label>Username</label>
                  <input type="text" value={userInfo.name} disabled className="form-input disabled" />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={userInfo.email} disabled className="form-input disabled" />
                </div>
                <div className="form-group">
                  <label>Phone Number</label>
                  <input type="tel" value={userInfo.phone} onChange={(e) => setUserInfo({ ...userInfo, phone: e.target.value })} className="form-input" placeholder="Enter phone number" />
                </div>
                <div className="form-group">
                  <label>Address</label>
                  <textarea value={userInfo.address} onChange={(e) => setUserInfo({ ...userInfo, address: e.target.value })} className="form-input" rows="4" placeholder="Enter address" />
                </div>
                <button type="submit" className="save-btn">Save Information</button>
              </form>
            </section>
          )}

          {/* Vouchers Section  */}
          {activeTab === 'vouchers' && (
            <section className="account-section">
              <h1>Available Vouchers</h1>
              <div className="vouchers-section">
                {vouchers.length > 0 ? (
                  <div className="vouchers-list">
                    {vouchers.map((voucher, index) => (
                      <div key={index} className="voucher-card">
                        <div className="voucher-code">{voucher.code}</div>
                        <div className="voucher-details">
                          <p className="voucher-discount">{voucher.discount}</p>
                          <p className="voucher-expiry">Valid until {voucher.expiryDate}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="no-vouchers">No vouchers available at the moment.</p>
                )}
              </div>
            </section>
          )}

          {/* Password Section */}
          {activeTab === 'password' && (
            <section className="account-section">
              <h1>Change Password</h1>
              <form onSubmit={handleChangePassword} className="password-form">
                <div className="form-group">
                  <label>Current Password</label>
                  <input type="password" value={passwords.current} onChange={(e) => setPasswords({ ...passwords, current: e.target.value })} className="form-input" required />
                </div>
                <div className="form-group">
                  <label>New Password</label>
                  <input type="password" value={passwords.new} onChange={(e) => setPasswords({ ...passwords, new: e.target.value })} className="form-input" required />
                </div>
                <div className="form-group">
                  <label>Confirm New Password</label>
                  <input type="password" value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} className="form-input" required />
                </div>
                <button type="submit" className="save-btn">Change Password</button>
              </form>
            </section>
          )}

          {/* ORDER DETAILS POPUP*/}
          {selectedStatus && (
            <div className="modal-overlay" onClick={closePopup}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>{selectedStatus} Orders</h2>
                  <button className="close-btn" onClick={closePopup}>&times;</button>
                </div>

                {statusOrders.length === 0 ? (
                  <p className="muted">No orders found in this category.</p>
                ) : (
                  <div className="order-list">
                    {statusOrders.map((order) => (
                      <div key={order.id} className="order-item">
                        <div className="order-item-header">
                          <span>Order #{order.id}</span>
                          <div style={{ display: "flex", gap: "15px", alignItems: "center" }}>
                            <span style={{ fontWeight: "bold" }}>
                              ${Number(order.total).toFixed(2)}
                            </span>
                          </div>
                        </div>
                        <p className="order-date">
                          Placed on: {new Date(order.created_at).toLocaleDateString()}
                        </p>

                        {/* Wrapper to align List (Left) and Button (Right) */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          
                          {/* Left: List of Items */}
                          <div style={{ display: "flex", flexDirection: "column", gap: "10px", flex: 1 }}>
                            {order.items &&
                              order.items.map((item) => (
                                <div key={item.id} className="mini-product-row">
                                  <img
                                    src={item.image_url || "https://via.placeholder.com/50"}
                                    alt={item.name}
                                    className="mini-product-img"
                                  />
                                  <div className="mini-product-info">
                                    <p className="mini-product-name">{item.name}</p>
                                    <p className="mini-product-meta">
                                      Size: {item.size || "Standard"}
                                    </p>
                                    <p className="mini-product-meta">
                                      Qty: {item.quantity} &times; $
                                      {Number(item.price).toFixed(2)}
                                    </p>
                                  </div>
                                </div>
                              ))}
                          </div>

                          {/* Right: Cancel Button */}
                          {selectedStatus === "new" && (
                            <div style={{ marginLeft: "20px" }}>
                              <button
                                onClick={() => handleCancelOrder(order.id)}
                                style={{
                                  backgroundColor: "#ff4d4f",
                                  color: "white",
                                  border: "none",
                                  padding: "8px 16px", // Increased padding slightly for better look
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  fontSize: "13px",
                                  fontWeight: "500",
                                  whiteSpace: "nowrap" // Prevents text wrapping
                                }}
                              >
                                Cancel Order
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}