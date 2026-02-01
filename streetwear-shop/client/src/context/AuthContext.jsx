import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check auth status on app load / refresh
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await api.get('/auth/profile');
        setUser(res.data);          // full user object
        setIsAuthenticated(true);
      } catch (err) {
        setUser(null);
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    }

    checkAuth();
  }, []);

  // Login
  const login = async (email, password) => {
    try {
      await api.post('/auth/login', { email, password });
      const res = await api.get('/auth/profile');
      setUser(res.data);
      setIsAuthenticated(true);
    } catch (err) {
      console.error('Login sync failed', err);
      throw err;
    }
  };

  // Register
  const register = async (name, email, password) => {
    await api.post('/auth/register', { name, email, password });
    const res = await api.get('/auth/profile');
    setUser(res.data);
    setIsAuthenticated(true);
  };

  // Logout
  const logout = async () => {
    await api.post('/auth/logout');
    setUser(null);
    setIsAuthenticated(false);
  };

  const value = {
    // legacy fields
    token: isAuthenticated ? '__COOKIE_AUTH__' : null,
    name: user?.name || null,

    user,
    isAuthenticated,
    loading,

    // actions
    login,
    register,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
