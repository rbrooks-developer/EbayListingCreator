import React, { useState } from 'react';
import { buildAuthorizationUrl, isEbayConfigured, detectConfiguredEnvironment } from '../../services/ebayApi.js';
import EbayConfigModal from '../EbayConfigModal/EbayConfigModal.jsx';
import styles from './OAuthSection.module.css';

const MARKETPLACES = [
  { value: 'EBAY_US', label: 'United States (EBAY_US)' },
  { value: 'EBAY_GB', label: 'United Kingdom (EBAY_GB)' },
  { value: 'EBAY_CA', label: 'Canada (EBAY_CA)' },
  { value: 'EBAY_AU', label: 'Australia (EBAY_AU)' },
  { value: 'EBAY_DE', label: 'Germany (EBAY_DE)' },
  { value: 'EBAY_FR', label: 'France (EBAY_FR)' },
  { value: 'EBAY_IT', label: 'Italy (EBAY_IT)' },
  { value: 'EBAY_ES', label: 'Spain (EBAY_ES)' },
];

/**
 * OAuthSection
 * Props:
 *  connectionData   — null | { marketplace, sandbox, ebayUsername, categories, categoryTreeId, shippingServices }
 *  isExchanging     — bool  (App is mid-callback token exchange)
 *  exchangeError    — string | null
 *  onDisconnect()   => void
 */
export default function OAuthSection({ connectionData, isExchanging, exchangeError, onDisconnect }) {
  const [marketplace, setMarketplace] = useState('EBAY_US');
  const [configOpen, setConfigOpen] = useState(false);
  const [, forceUpdate] = useState(0);

  // Auto-detect whether the configured App ID is sandbox or production
  const detectedEnv = detectConfiguredEnvironment(); // 'sandbox' | 'production' | 'none'
  const [sandbox, setSandbox] = useState(detectedEnv === 'sandbox');

  const configured = isEbayConfigured(sandbox);
  const isConnected = connectionData !== null;

  function handleConfigSaved(saved) {
    setConfigOpen(false);
    if (saved) forceUpdate((n) => n + 1); // re-evaluate isEbayConfigured after save
  }

  // Warn when the checkbox doesn't match the App ID's actual environment
  const envMismatch =
    configured &&
    ((sandbox && detectedEnv === 'production') ||
     (!sandbox && detectedEnv === 'sandbox'));

  function handleConnect() {
    const url = buildAuthorizationUrl(sandbox);
    // Store marketplace choice so we can use it after the OAuth redirect returns
    sessionStorage.setItem('ebay_marketplace', marketplace);
    window.location.href = url;
  }

  return (
    <section className={styles.section} id="oauth">
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <span className={styles.stepBadge}>1</span>
            <h2>Connect Your eBay Account</h2>
            <button className={styles.configureBtn} onClick={() => setConfigOpen(true)} title="Configure eBay API credentials">
              &#9881; Configure
            </button>
          </div>
          <p className={styles.subtitle}>
            Authorize this app to access your eBay selling account. We'll download your
            listing categories and shipping options so you can build listings below.
          </p>
        </div>

        <div className={styles.body}>
          {/* ── Mid-callback loading ── */}
          {isExchanging && (
            <div className={styles.stateBox}>
              <span className={styles.spinner} aria-hidden="true" />
              Completing eBay connection…
            </div>
          )}

          {/* ── Exchange error ── */}
          {!isExchanging && exchangeError && (
            <div className={styles.alertError} role="alert">
              <strong>Connection failed:</strong> {exchangeError}
              <button className={styles.retryBtn} onClick={() => window.location.href = window.location.pathname}>
                Try Again
              </button>
            </div>
          )}

          {/* ── Not configured ── */}
          {!isExchanging && !exchangeError && !isConnected && !configured && (
            <div className={styles.alertWarning} role="alert">
              <strong>eBay API not configured.</strong>{' '}
              Enter your eBay developer credentials and Worker URL to get started.
              <button className={styles.retryBtn} style={{ background: 'var(--warning)', marginTop: '0.5rem', display: 'block' }} onClick={() => setConfigOpen(true)}>
                Configure eBay API
              </button>
            </div>
          )}

          {/* ── Connected ── */}
          {!isExchanging && !exchangeError && isConnected && (
            <ConnectedState data={connectionData} onDisconnect={onDisconnect} />
          )}

          {/* ── Connect form ── */}
          {!isExchanging && !exchangeError && !isConnected && (
            <div className={styles.connectForm}>
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label htmlFor="marketplace">Marketplace</label>
                  <select
                    id="marketplace"
                    value={marketplace}
                    onChange={(e) => setMarketplace(e.target.value)}
                    disabled={!configured}
                  >
                    {MARKETPLACES.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.fieldCheckbox}>
                  <label>
                    <input
                      type="checkbox"
                      checked={sandbox}
                      onChange={(e) => setSandbox(e.target.checked)}
                    />
                    Use Sandbox environment
                  </label>
                  {detectedEnv !== 'none' && (
                    <span className={`${styles.envBadge} ${detectedEnv === 'sandbox' ? styles.envBadgeSandbox : styles.envBadgeProd}`}>
                      {detectedEnv === 'sandbox' ? 'Sandbox credentials detected' : 'Production credentials detected'}
                    </span>
                  )}
                  {envMismatch && (
                    <span className={styles.sandboxWarn}>
                      ⚠ Checkbox doesn't match the App ID — eBay will reject the request.
                    </span>
                  )}
                  {sandbox && !isEbayConfigured(true) && !envMismatch && (
                    <span className={styles.sandboxWarn}>
                      Sandbox credentials not set in .env
                    </span>
                  )}
                </div>
              </div>

              <button
                className={styles.btnConnect}
                onClick={handleConnect}
                disabled={!configured}
              >
                <EbayIcon />
                Connect Your eBay Account →
              </button>

              <p className={styles.permissionNote}>
                You'll be taken to eBay to authorize access. We request permission to
                read your account info and create/update listings on your behalf.
              </p>
            </div>
          )}
        </div>
      </div>
      {configOpen && <EbayConfigModal onClose={handleConfigSaved} />}
    </section>
  );
}

// ── Connected state ───────────────────────────────────────────────────────────

function ConnectedState({ data, onDisconnect }) {
  return (
    <div className={styles.connectedBox}>
      <div className={styles.connectedIcon} aria-hidden="true">&#10003;</div>
      <div className={styles.connectedDetails}>
        <h3>
          Connected{data.ebayUsername ? ` — ${data.ebayUsername}` : ''}
          {data.sandbox && <span className={styles.sandboxBadge}>Sandbox</span>}
        </h3>
        <ul className={styles.statList}>
          <li>
            <span className={styles.statLabel}>Marketplace</span>
            <span className={styles.statValue}>{data.marketplace}</span>
          </li>
          <li>
            <span className={styles.statLabel}>Categories downloaded</span>
            <span className={styles.statValue}>{data.categories.length.toLocaleString()}</span>
          </li>
          <li>
            <span className={styles.statLabel}>Shipping services downloaded</span>
            <span className={styles.statValue}>{data.shippingServices.length.toLocaleString()}</span>
          </li>
        </ul>
        <p className={styles.connectedNote}>
          Your eBay token is held in session memory and will be cleared when you close this tab.
        </p>
      </div>
      <button className={styles.btnSecondary} onClick={onDisconnect}>
        Disconnect
      </button>
    </div>
  );
}

// ── eBay wordmark icon ────────────────────────────────────────────────────────

function EbayIcon() {
  return (
    <span className={styles.ebayWordmark} aria-hidden="true">
      <span style={{ color: '#e53238' }}>e</span>
      <span style={{ color: '#0064d2' }}>B</span>
      <span style={{ color: '#f5af02' }}>a</span>
      <span style={{ color: '#86b817' }}>y</span>
    </span>
  );
}
