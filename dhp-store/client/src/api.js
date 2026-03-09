import axios from 'axios';

// 1. Check if Docker (or another environment) explicitly provided a backend URL
const CUSTOM_URL = import.meta.env.VITE_BACKEND_URL;

const BASE_URL = CUSTOM_URL 
  ? `${CUSTOM_URL}/api`          // Docker: Uses the VITE_BACKEND_URL override
  : import.meta.env.DEV 
    ? 'http://localhost:5001/api' // Development: Talk to separate local backend server
    : '/api';                     // Production/Render: Talk to same origin

export const api = axios.create({ 
  baseURL: BASE_URL, 
  withCredentials: true 
});

export default api;