import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL;

if (!BASE_URL && !import.meta.env.DEV) {
  console.error(
    'VITE_API_URL is not configured for production. ' +
    'Set VITE_API_URL in your Vercel environment variables.'
  );
}

export const api = axios.create({
  baseURL: BASE_URL || 'http://localhost:5001/api',
  withCredentials: true,
});

export default api;