import React, { useEffect, useState } from 'react';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import SiteHeader from './components/SiteHeader/SiteHeader.jsx';
import HomePage from './components/HomePage/HomePage.jsx';
import OAuthSection from './components/OAuthSection/OAuthSection.jsx';
import ListingGrid from './components/ListingGrid/ListingGrid.jsx';
import AuthModal from './components/AuthModal/AuthModal.jsx';
import { useSessionStorage } from './hooks/useSessionStorage.js';
import {
  exchangeCodeForTokens,
  refreshAccessToken,
  fetchUserInfo,
  fetchUserLocation,
  fetchCategories,
  fetchShippingServices,
  fetchFulfillmentPolicies,
} from './services/ebayApi.js';

function AppContent() {
  // ── Auth modal ──────────────────────────────────────────────────────────
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // ── eBay connection ─────────────────────────────────────────────────────
  // connectionData persists in sessionStorage (no tokens — just metadata)
  const [connectionData, setConnectionData, clearConnection] = useSessionStorage(
    'ebay_connection',
    null
  );
  // Access token lives only in memory
  const [accessToken, setAccessToken] = useState(null);

  // OAuth callback state
  const [isExchanging, setIsExchanging] = useState(false);
  const [exchangeError, setExchangeError] = useState(null);

  // ── Listings ────────────────────────────────────────────────────────────
  const [listings, setListings] = useState([]);

  // ── Restore access token after page refresh ────────────────────────────
  // connectionData survives in sessionStorage but accessToken is in React state.
  // If we have connection metadata but no token, silently refresh it.
  useEffect(() => {
    if (!connectionData || accessToken) return;
    refreshAccessToken(connectionData.sandbox)
      .then((token) => setAccessToken(token))
      .catch(() => {}); // refresh token expired — user will need to reconnect
  }, [connectionData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handle OAuth callback on mount ──────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code    = params.get('code');
    const error   = params.get('error');
    const state   = params.get('state');

    // Clean the URL regardless of outcome so it doesn't re-trigger on refresh
    if (code || error) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    if (error) {
      setExchangeError(
        error === 'access_denied'
          ? 'You declined to authorize the app. Click "Connect Your eBay Account" to try again.'
          : `eBay returned an error: ${params.get('error_description') ?? error}`
      );
      return;
    }

    if (!code) return; // Normal page load — no callback

    // Verify CSRF state
    const savedState = sessionStorage.getItem('ebay_oauth_state');
    if (state !== savedState) {
      setExchangeError('Security check failed (state mismatch). Please try connecting again.');
      return;
    }

    const sandbox     = sessionStorage.getItem('ebay_oauth_sandbox') === 'true';
    const marketplace = sessionStorage.getItem('ebay_marketplace') ?? 'EBAY_US';
    const manualPostalCode = sessionStorage.getItem('ebay_postal_code') ?? '';

    // Clean up one-use session keys
    sessionStorage.removeItem('ebay_oauth_state');
    sessionStorage.removeItem('ebay_oauth_sandbox');
    sessionStorage.removeItem('ebay_postal_code');

    setIsExchanging(true);

    async function completeConnection() {
      const token = await exchangeCodeForTokens(code, sandbox);
      setAccessToken(token);

      const [userInfo, userLoc, categoryResult, shippingServices, fulfillmentPolicies] = await Promise.all([
        fetchUserInfo(token, sandbox),
        fetchUserLocation(token, sandbox).catch(() => ({ location: '', postalCode: '' })),
        fetchCategories(token, marketplace, sandbox).catch(() => ({ categories: [], categoryTreeId: null })),
        fetchShippingServices(token, marketplace, sandbox).catch(() => []),
        fetchFulfillmentPolicies(token, marketplace, sandbox).catch(() => []),
      ]);
      const { categories, categoryTreeId } = categoryResult;

      setConnectionData({
        marketplace,
        sandbox,
        ebayUsername:      userInfo.username,
        defaultLocation:   userLoc.location,
        defaultPostalCode: userLoc.postalCode || manualPostalCode,
        categories,
        categoryTreeId,
        shippingServices,
        fulfillmentPolicies,
      });

      // Scroll back to the OAuth section after the redirect returns
      requestAnimationFrame(() => {
        document.getElementById('oauth')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    completeConnection()
      .catch((err) => {
        setExchangeError(err.message);
        requestAnimationFrame(() => {
          document.getElementById('oauth')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      })
      .finally(() => setIsExchanging(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Disconnect ──────────────────────────────────────────────────────────
  function handleDisconnect() {
    setAccessToken(null);
    setExchangeError(null);
    clearConnection();
    sessionStorage.removeItem('ebay_refresh_token');
    sessionStorage.removeItem('ebay_oauth_state');
    sessionStorage.removeItem('ebay_marketplace');
    sessionStorage.removeItem('ebay_postal_code');
  }

  return (
    <>
      <SiteHeader onSignInClick={() => setAuthModalOpen(true)} />

      <main>
        <HomePage onSignInClick={() => setAuthModalOpen(true)} />

        <OAuthSection
          connectionData={connectionData ? { ...connectionData, accessToken } : null}
          isExchanging={isExchanging}
          exchangeError={exchangeError}
          onDisconnect={handleDisconnect}
        />

        <ListingGrid
          listings={listings}
          onChange={setListings}
          categories={connectionData?.categories ?? []}
          categoryTreeId={connectionData?.categoryTreeId ?? null}
          shippingServices={connectionData?.shippingServices ?? []}
          fulfillmentPolicies={connectionData?.fulfillmentPolicies ?? []}
          defaultLocation={connectionData?.defaultLocation ?? ''}
          defaultPostalCode={connectionData?.defaultPostalCode ?? ''}
          accessToken={accessToken}
          sandbox={connectionData?.sandbox ?? false}
          marketplace={connectionData?.marketplace ?? 'EBAY_US'}
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
