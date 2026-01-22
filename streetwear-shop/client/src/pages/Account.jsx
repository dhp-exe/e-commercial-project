import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import './Account.css';

export default function Account() {
  const { token, name, logout } = useAuth();
  const navigate = useNavigate();
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

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    fetchUserData();
  }, [token, navigate]);

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

  if (loading) {
    return <div className="account-page"><p>Loading...</p></div>;
  }

  return (
    <div className="account-page">
      <div className="account-container">
        {/* Left Sidebar */}
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
            <h2 className="profile-greeting">Hello, {userInfo.name}</h2>
            
            <div className="upload-picture-section">
              <label htmlFor="picture-input" className="upload-btn">
                Update Profile Picture
              </label>
              <input
                id="picture-input"
                type="file"
                accept="image/*"
                onChange={handleProfilePictureUpload}
                style={{ display: 'none' }}
              />
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
              <button
                className={`nav-item ${activeTab === 'password' ? 'active' : ''}`}
                onClick={() => setActiveTab('password')}
              >
                Change Password
              </button>
              <button className="nav-item logout-btn" onClick={handleLogout}>
                Log Out
              </button>
            </nav>
          </div>
        </aside>

        {/* Main Content */}
        <main className="account-main">
          {message && (
            <div className={`message ${message.includes('Error') ? 'error' : 'success'}`}>
              {message}
            </div>
          )}

          {/* My Orders Section */}
          {activeTab === 'orders' && (
            <section className="account-section">
              <h1>My Orders</h1>
              <div className="orders-grid">
                <div className="order-card new">
                  <h3>New Orders</h3>
                  <p className="order-count">{orders.new}</p>
                </div>
                <div className="order-card confirmed">
                  <h3>Confirmed</h3>
                  <p className="order-count">{orders.confirmed}</p>
                </div>
                <div className="order-card shipping">
                  <h3>Shipping</h3>
                  <p className="order-count">{orders.shipping}</p>
                </div>
                <div className="order-card received">
                  <h3>Received</h3>
                  <p className="order-count">{orders.received}</p>
                </div>
                <div className="order-card cancelled">
                  <h3>Cancelled</h3>
                  <p className="order-count">{orders.cancelled}</p>
                </div>
              </div>
            </section>
          )}

          {/* My Information Section */}
          {activeTab === 'info' && (
            <section className="account-section">
              <h1>My Information</h1>
              <form onSubmit={handleUpdateInfo} className="info-form">
                <div className="form-group">
                  <label>Username</label>
                  <input
                    type="text"
                    value={userInfo.name}
                    disabled
                    className="form-input disabled"
                  />
                </div>

                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={userInfo.email}
                    disabled
                    className="form-input disabled"
                  />
                </div>

                <div className="form-group">
                  <label>Phone Number</label>
                  <input
                    type="tel"
                    value={userInfo.phone}
                    onChange={(e) => setUserInfo({ ...userInfo, phone: e.target.value })}
                    className="form-input"
                    placeholder="Enter your phone number"
                  />
                </div>

                <div className="form-group">
                  <label>Address</label>
                  <textarea
                    value={userInfo.address}
                    onChange={(e) => setUserInfo({ ...userInfo, address: e.target.value })}
                    className="form-input"
                    placeholder="Enter your address"
                    rows="4"
                  />
                </div>

                <button type="submit" className="save-btn">
                  Save Information
                </button>
              </form>

              {/* Vouchers Section */}
              <div className="vouchers-section">
                <h2>Available Vouchers</h2>
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
                  <p className="no-vouchers">No vouchers available</p>
                )}
              </div>
            </section>
          )}

          {/* Change Password Section */}
          {activeTab === 'password' && (
            <section className="account-section">
              <h1>Change Password</h1>
              <form onSubmit={handleChangePassword} className="password-form">
                <div className="form-group">
                  <label>Current Password</label>
                  <input
                    type="password"
                    value={passwords.current}
                    onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                    className="form-input"
                    placeholder="Enter your current password"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>New Password</label>
                  <input
                    type="password"
                    value={passwords.new}
                    onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                    className="form-input"
                    placeholder="Enter your new password"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Confirm New Password</label>
                  <input
                    type="password"
                    value={passwords.confirm}
                    onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                    className="form-input"
                    placeholder="Confirm your new password"
                    required
                  />
                </div>

                <button type="submit" className="save-btn">
                  Change Password
                </button>
              </form>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}