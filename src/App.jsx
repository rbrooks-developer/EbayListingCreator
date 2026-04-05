import React, { useState } from 'react';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import SiteHeader from './components/SiteHeader/SiteHeader.jsx';
import HomePage from './components/HomePage/HomePage.jsx';
import OAuthSection from './components/OAuthSection/OAuthSection.jsx';
import ListingGrid from './components/ListingGrid/ListingGrid.jsx';
import AuthModal from './components/AuthModal/AuthModal.jsx';
import { useSessionStorage } from './hooks/useSessionStorage.js';

function AppContent() {
  // ── Auth modal ──────────────────────────────────────────────────────────
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // ── eBay API connection ─────────────────────────────────────────────────
  const [connectionData, setConnectionData, clearConnection] = useSessionStorage(
    'ebay_connection',
    null
  );
  // Access token is kept only in memory (not sessionStorage) for security
  const [accessToken, setAccessToken] = useState(null);

  // ── Listing data ────────────────────────────────────────────────────────
  const [listings, setListings] = useState([]);

  function handleConnected(data) {
    const { accessToken: token, ...meta } = data;
    setAccessToken(token);
    setConnectionData({
      marketplace: meta.marketplace,
      categories: meta.categories,
      categoryTreeId: meta.categoryTreeId,
      shippingServices: meta.shippingServices,
    });
  }

  function handleDisconnect() {
    setAccessToken(null);
    clearConnection();
  }

  const fullConnectionData = connectionData
    ? { ...connectionData, accessToken }
    : null;

  return (
    <>
      <SiteHeader onSignInClick={() => setAuthModalOpen(true)} />

      <main>
        <HomePage onSignInClick={() => setAuthModalOpen(true)} />
        <OAuthSection
          onConnected={handleConnected}
          connectionData={fullConnectionData}
          onDisconnect={handleDisconnect}
        />
        <ListingGrid
          listings={listings}
          onChange={setListings}
          categories={connectionData?.categories ?? []}
          categoryTreeId={connectionData?.categoryTreeId ?? null}
          accessToken={accessToken}
          sandbox={connectionData?.sandbox ?? false}
        />
      </main>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}
