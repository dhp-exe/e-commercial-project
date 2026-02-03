import axios from 'axios';

// "DEV" is true when running 'npm run dev', false when running the built app
const BASE_URL = import.meta.env.DEV 
  ? 'http://localhost:5001/api' // Development: Talk to separate backend server
  : '/api';                      // Production/Ngrok: Talk to same origin

export const api = axios.create({ 
  baseURL: BASE_URL, 
  withCredentials: true 
});

export default api;