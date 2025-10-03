import React, { createContext, useContext, useState } from 'react';
import { api, setAuth } from '../api';

const AuthCtx = createContext();
export const AuthContext = AuthCtx;
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [name, setName] = useState(localStorage.getItem('name'));
  if (token) setAuth(token);

  async function login(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', data.token);
    setToken(data.token);
    if (data.name) { localStorage.setItem('name', data.name); setName(data.name); }
  }

  async function register(payload) {
    const { data } = await api.post('/auth/register', payload);
    localStorage.setItem('token', data.token);
    setToken(data.token);
  }

  function logout() {
    localStorage.clear();
    setToken(null);
    setName(null);
    setAuth(null);
  }

  return (
    <AuthCtx.Provider value={{ token, name, login, register, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export default AuthProvider;