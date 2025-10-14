import axios from 'axios';

// Detect if you are visiting from your local environment
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// Always prefer localhost backend when you're coding locally
// Fallback to the forwarded backend only when you're NOT on localhost
const baseURL = isLocal
  ? 'http://localhost:5001/api'
  : 'https://ckgkbm1c-5001.asse.devtunnels.ms/api';
  

export const api = axios.create({ baseURL });

export function setAuth(token) {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
}

export default api;