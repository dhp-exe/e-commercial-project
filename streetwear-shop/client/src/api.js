import axios from 'axios';

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

const baseURL = isLocal
  ? 'http://localhost:5001/api'
  : 'https://2flhl94d-5001.asse.devtunnels.ms/api';
;
  

export const api = axios.create({ baseURL });

export function setAuth(token) {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
}

export default api;