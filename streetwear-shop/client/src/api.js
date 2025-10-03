import axios from 'axios';

export const api = axios.create({
  baseURL: 'http://localhost:5001/api'
});

export function setAuth(token) {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
}

export default api;