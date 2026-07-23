import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';

const Router =
  window.location.hostname.includes('github.io')
    ? HashRouter
    : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root')).render(
  <Router>
    <App />
  </Router>
);
