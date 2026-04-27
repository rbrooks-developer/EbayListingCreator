import { useEffect, useRef, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { SubscriptionProvider, useSubscription } from './contexts/SubscriptionContext.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import SiteHeader from './components/SiteHeader/SiteHeader.jsx';
import HomePage from './components/HomePage/HomePage.jsx';
import OAuthSection from './components/OAuthSection/OAuthSection.jsx';
import ListingGrid from './components/ListingGrid/ListingGrid.jsx';
import AuthModal from './components/AuthModal/AuthModal.jsx';
import { useAuth } from './contexts/AuthContext.jsx';
import { useSessionStorage } from './hooks/useSessionStorage.js';
import { useLocalStorage } from './hooks/useLocalStorage.js';
import {
  exchangeCodeForTokens,
  refreshAccessToken,
  fetchUserInfo,
  fetchUserLocation,
  fetchCategories,
  fetchShippingServices,
  fetchFulfillmentPolicies,
} from './services/ebayApi.js';
import { fetchRules } from './services/rulesService.js';
import { supabase } from './services/authService.js';
import RulesManager from './components/RulesManager/RulesManager.jsx';
import FaqPage from './components/FaqPage/FaqPage.jsx';
import ContactPage from './components/ContactPage/ContactPage.jsx';
import CheckoutNotice from './components/CheckoutNotice/CheckoutNotice.jsx';
import PricingSection from './components/PricingSection/PricingSection.jsx';
import UpgradeModal, { hasSeenUpgradePrompt, markUpgradePromptSeen } from './components/UpgradeModal/UpgradeModal.jsx';
import SiteFooter from './components/SiteFooter/SiteFooter.jsx';
import PromoBanner from './components/PromoBanner/PromoBanner.jsx';
import ArticlesSection from './components/ArticlesSection/ArticlesSection.jsx';
import ArticlePage from './components/ArticlePage/ArticlePage.jsx';

const SECTION_TITLES = [
  { id: 'pricing', title: 'Pricing — Create My Listings' },
  { id: 'faq',     title: 'FAQ — Create My Listings' },
  { id: 'contact', title: 'Contact — Create My Listings' },
];
const DEFAULT_TITLE = 'eBay Listing Creator — Bulk List Items on eBay from Your Browser';

function AppContent() {
  const { user } = useAuth();

  // ── Page title — updates as user scrolls to major sections ─────────────
  const [pageTitle, setPageTitle] = useState(DEFAULT_TITLE);
  useEffect(() => {
    const observers = SECTION_TITLES.map(({ id, title }) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setPageTitle(title); },
        { threshold: 0.3 }
      );
      obs.observe(el);
      return obs;
    });
    // Reset to default when all sections leave viewport (scrolled back to top)
    const homeEl = document.getElementById('home');
    let homeObs = null;
    if (homeEl) {
      homeObs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setPageTitle(DEFAULT_TITLE); },
        { threshold: 0.1 }
      );
      homeObs.observe(homeEl);
    }
    return () => {
      observers.forEach((o) => o?.disconnect());
      homeObs?.disconnect();
    };
  }, []);

  // ── Auth modal ──────────────────────────────────────────────────────────
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // ── Upgrade modal — shown once to new free-tier users ───────────────────
  const { usage } = useSubscription();
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  useEffect(() => {
    if (!user || hasSeenUpgradePrompt()) return;
    if (usage && usage.tier === 'free') {
      setUpgradeModalOpen(true);
      markUpgradePromptSeen();
    }
  }, [user, usage]);

  // ── Rules ───────────────────────────────────────────────────────────────
  const [rules, setRules] = useState([]);
  const [rulesOpen, setRulesOpen] = useState(false);

  // Shared aspects cache between ListingGrid and RulesManager
  const aspectsCache = useRef(new Map());

  useEffect(() => {
    if (!user) { setRules([]); return; }
    fetchRules().then(setRules).catch(() => {});
  }, [user]);

  // Disconnect eBay whenever the user signs out
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') handleDisconnect();
    });
    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  const [listings, setListings] = useLocalStorage('ebay_listings', []);

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

      // Fire-and-forget: keep Supabase cache fresh for fallback when eBay is down
      fetch(`${import.meta.env.VITE_TOKEN_WORKER_URL?.replace(/\/$/, '')}/ebay/sync`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, sandbox }),
      }).catch(() => {});

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
    setListings([]);
    sessionStorage.removeItem('ebay_refresh_token');
    sessionStorage.removeItem('ebay_oauth_state');
    sessionStorage.removeItem('ebay_marketplace');
    sessionStorage.removeItem('ebay_postal_code');
  }

  return (
    <Routes>
      <Route path="/articles/:slug" element={<ArticlePage />} />
      <Route path="*" element={<MainLayout
        pageTitle={pageTitle}
        authModalOpen={authModalOpen}
        setAuthModalOpen={setAuthModalOpen}
        upgradeModalOpen={upgradeModalOpen}
        setUpgradeModalOpen={setUpgradeModalOpen}
        connectionData={connectionData}
        accessToken={accessToken}
        isExchanging={isExchanging}
        exchangeError={exchangeError}
        handleDisconnect={handleDisconnect}
        listings={listings}
        setListings={setListings}
        rules={rules}
        setRules={setRules}
        rulesOpen={rulesOpen}
        setRulesOpen={setRulesOpen}
        aspectsCache={aspectsCache}
      />} />
    </Routes>
  );
}

function MainLayout({
  pageTitle, authModalOpen, setAuthModalOpen,
  upgradeModalOpen, setUpgradeModalOpen,
  connectionData, accessToken, isExchanging, exchangeError, handleDisconnect,
  listings, setListings, rules, setRules, rulesOpen, setRulesOpen, aspectsCache,
}) {
  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
      </Helmet>

      <SiteHeader onSignInClick={() => setAuthModalOpen(true)} />

      <main id="main-content">
        <PromoBanner />
        <HomePage onSignInClick={() => setAuthModalOpen(true)} />

        <OAuthSection
          connectionData={connectionData ? { ...connectionData, accessToken } : null}
          isExchanging={isExchanging}
          exchangeError={exchangeError}
          onDisconnect={handleDisconnect}
          onSignInClick={() => setAuthModalOpen(true)}
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
          rules={rules}
          aspectsCache={aspectsCache}
          onOpenRulesManager={() => setRulesOpen(true)}
        />

        <RulesManager
          isOpen={rulesOpen}
          onClose={() => setRulesOpen(false)}
          rules={rules}
          onRulesChange={setRules}
          categories={connectionData?.categories ?? []}
          accessToken={accessToken}
          categoryTreeId={connectionData?.categoryTreeId ?? null}
          sandbox={connectionData?.sandbox ?? false}
          aspectsCache={aspectsCache}
          onSignInClick={() => setAuthModalOpen(true)}
        />

        <PricingSection onSignInClick={() => setAuthModalOpen(true)} />
        <ArticlesSection />
        <FaqPage />
        <ContactPage />
      </main>

      <SiteFooter />

      <CheckoutNotice />

      <UpgradeModal
        isOpen={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
      />

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
        <SubscriptionProvider>
          <AppContent />
        </SubscriptionProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
