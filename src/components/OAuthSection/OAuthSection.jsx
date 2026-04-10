import { useState } from 'react';
import { buildAuthorizationUrl, isEbayConfigured } from '../../services/ebayApi.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import styles from './OAuthSection.module.css';

/**
 * OAuthSection
 * Props:
 *  connectionData   — null | { marketplace, sandbox, ebayUsername, categories, categoryTreeId, shippingServices }
 *  isExchanging     — bool  (App is mid-callback token exchange)
 *  exchangeError    — string | null
 *  onDisconnect()   => void
 *  onSignInClick()  => void
 */
export default function OAuthSection({ connectionData, isExchanging, exchangeError, onDisconnect, onSignInClick }) {
  const { user } = useAuth();
  const marketplace = 'EBAY_US';
  const [postalCode, setPostalCode] = useState(() => localStorage.getItem('ebay_saved_postal_code') ?? '');

  const sandbox = false;
  const configured = isEbayConfigured(sandbox);
  const isConnected = connectionData !== null;

  function handleConnect() {
    if (!user) {
      onSignInClick?.();
      return;
    }
    const url = buildAuthorizationUrl(sandbox);
    sessionStorage.setItem('ebay_marketplace', marketplace);
    sessionStorage.setItem('ebay_postal_code', postalCode.trim());
    localStorage.setItem('ebay_saved_postal_code', postalCode.trim());
    window.location.href = url;
  }

  return (
    <section className={styles.section} id="oauth">
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <span className={styles.stepBadge}>1</span>
            <h2>Connect Your eBay Account</h2>
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
              <strong>eBay API not configured.</strong> Add{' '}
              <code>VITE_EBAY_CLIENT_ID</code>, <code>VITE_EBAY_RUNAME</code>, and{' '}
              <code>VITE_TOKEN_WORKER_URL</code> to your GitHub repository secrets.
            </div>
          )}

          {/* ── Connected ── */}
          {!isExchanging && !exchangeError && isConnected && (
            <ConnectedState data={connectionData} onDisconnect={onDisconnect} />
          )}

          {/* ── Connect form ── */}
          {!isExchanging && !exchangeError && !isConnected && (
            <div className={styles.connectForm}>

              <div className={styles.field} style={{ maxWidth: 180 }}>
                <label htmlFor="postalCode">Your ZIP / Postal Code</label>
                <input
                  id="postalCode"
                  type="text"
                  className={styles.postalInput}
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="e.g. 78701"
                  maxLength={10}
                  disabled={!configured}
                />
              </div>

              <button
                className={styles.btnConnect}
                onClick={handleConnect}
                disabled={!configured || (!!user && !postalCode.trim())}
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
