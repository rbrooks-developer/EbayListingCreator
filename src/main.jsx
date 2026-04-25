import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import App from './App.jsx';
import './index.css';

// GitHub Pages SPA deep-link redirect — restore path saved by 404.html
const spaRedirect = sessionStorage.getItem('spa_redirect');
if (spaRedirect && spaRedirect !== '/') {
  sessionStorage.removeItem('spa_redirect');
  window.history.replaceState(null, '', spaRedirect);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>
);

// SPAs lose native hash scrolling — manually scroll to the anchor after React paints
if (window.location.hash) {
  const hash = window.location.hash;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth' });
    });
  });
}
