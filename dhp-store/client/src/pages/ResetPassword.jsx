import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // Extract token & email from the URL
  const token = searchParams.get('token');
  const email = searchParams.get('email');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setMessage("Passwords do not match");
      return;
    }

    try {
      // Send the new password AND the token to the backend
      await api.post('/auth/reset-password', { 
        token, 
        email, 
        newPassword: password 
      });
      
      alert("Password reset successful! Please login.");
      navigate('/login');
    } catch (error) {
      console.error(error);
      setMessage("Failed to reset password. Link might be expired.");
    }
  };

  if (!token) return <div style={{padding:40}}>Invalid Link</div>;

  return (
    <div className="auth-container" style={{maxWidth: 400, margin: '50px auto', padding: 20}}>
      <h2>Reset Password</h2>
      {message && <p style={{color: 'red'}}>{message}</p>}
      
      <form onSubmit={handleSubmit} style={{display:'flex', flexDirection:'column', gap: 15}}>
        <div>
           <label>New Password</label>
           <input 
             type="password" 
             required 
             value={password} 
             onChange={e => setPassword(e.target.value)}
             style={{width: '100%', padding: 8}}
           />
        </div>
        <div>
           <label>Confirm Password</label>
           <input 
             type="password" 
             required 
             value={confirm} 
             onChange={e => setConfirm(e.target.value)}
             style={{width: '100%', padding: 8}}
           />
        </div>
        <button type="submit" className="black-btn">Reset Password</button>
      </form>
    </div>
  );
}