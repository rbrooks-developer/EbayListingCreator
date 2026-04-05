import React, { useState } from 'react';
import {
  fetchClientCredentialsToken,
  fetchCategories,
  fetchShippingServices,
} from '../../services/ebayApi.js';
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
 *  onConnected(data: { accessToken, categories, shippingServices, marketplace }) => void
 *  connectionData  — current connection data (null if not connected)
 *  onDisconnect()  => void
 */
export default function OAuthSection({ onConnected, connectionData, onDisconnect }) {
  const [credentials, setCredentials] = useState({
    clientId: '',
    clientSecret: '',
    marketplace: 'EBAY_US',
    sandbox: false,
  });

  const [status, setStatus] = useState({ type: null, message: '' }); // type: 'loading'|'success'|'error'
  const [progress, setProgress] = useState('');

  const isConnected = connectionData !== null;

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setCredentials((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  }

  async function handleConnect(e) {
    e.preventDefault();
    const { clientId, clientSecret, marketplace, sandbox } = credentials;

    if (!clientId.trim() || !clientSecret.trim()) {
      setStatus({ type: 'error', message: 'App ID and Client Secret are required.' });
      return;
    }

    setStatus({ type: 'loading', message: '' });

    try {
      setProgress('Requesting access token...');
      const tokenData = await fetchClientCredentialsToken(clientId.trim(), clientSecret.trim(), sandbox);
      const { access_token } = tokenData;

      setProgress('Downloading listing categories (this may take a moment)...');
      const { categories, categoryTreeId } = await fetchCategories(access_token, marketplace, sandbox);

      setProgress('Downloading shipping services...');
      const shippingServices = await fetchShippingServices(access_token, marketplace, sandbox);

      setProgress('');
      setStatus({ type: 'success', message: '' });
      onConnected({ accessToken: access_token, categories, categoryTreeId, shippingServices, marketplace });
    } catch (err) {
      setProgress('');
      setStatus({ type: 'error', message: err.message });
    }
  }

  function handleDisconnect() {
    setStatus({ type: null, message: '' });
    setCredentials((prev) => ({ ...prev, clientId: '', clientSecret: '' }));
    onDisconnect();
  }

  return (
    <section className={styles.section} id="oauth">
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <span className={styles.stepBadge}>1</span>
            <h2>Connect to eBay API</h2>
          </div>
          <p className={styles.subtitle}>
            Enter your eBay developer credentials to fetch listing categories and shipping options.
            Your credentials are only stored in memory for this session.{' '}
            <a
              href="https://developer.ebay.com/my/keys"
              target="_blank"
              rel="noopener noreferrer"
            >
              Get your keys
            </a>
          </p>
        </div>

        {isConnected ? (
          <ConnectedState data={connectionData} onDisconnect={handleDisconnect} />
        ) : (
          <form className={styles.form} onSubmit={handleConnect} noValidate>
            <div className={styles.fieldGrid}>
              <div className={styles.field}>
                <label htmlFor="clientId">App ID (Client ID)</label>
                <input
                  id="clientId"
                  name="clientId"
                  type="text"
                  value={credentials.clientId}
                  onChange={handleChange}
                  placeholder="YourApp-12345-SandBox-abc..."
                  autoComplete="off"
                  disabled={status.type === 'loading'}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="clientSecret">Client Secret (Cert ID)</label>
                <input
                  id="clientSecret"
                  name="clientSecret"
                  type="password"
                  value={credentials.clientSecret}
                  onChange={handleChange}
                  placeholder="SBX-abc123..."
                  autoComplete="off"
                  disabled={status.type === 'loading'}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="marketplace">Marketplace</label>
                <select
                  id="marketplace"
                  name="marketplace"
                  value={credentials.marketplace}
                  onChange={handleChange}
                  disabled={status.type === 'loading'}
                >
                  {MARKETPLACES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.fieldCheckbox}>
                <label>
                  <input
                    type="checkbox"
                    name="sandbox"
                    checked={credentials.sandbox}
                    onChange={handleChange}
                    disabled={status.type === 'loading'}
                  />
                  Use Sandbox environment
                </label>
              </div>
            </div>

            {status.type === 'error' && (
              <div className={styles.alertError} role="alert">
                <strong>Connection failed:</strong> {status.message}
              </div>
            )}

            {status.type === 'loading' && progress && (
              <div className={styles.alertInfo} role="status">
                <span className={styles.spinner} aria-hidden="true" /> {progress}
              </div>
            )}

            <div className={styles.actions}>
              <button
                type="submit"
                className={styles.btnPrimary}
                disabled={status.type === 'loading'}
              >
                {status.type === 'loading' ? 'Connecting...' : 'Connect to eBay'}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

function ConnectedState({ data, onDisconnect }) {
  return (
    <div className={styles.connectedBox}>
      <div className={styles.connectedIcon} aria-hidden="true">&#10003;</div>
      <div className={styles.connectedDetails}>
        <h3>Connected — {data.marketplace}</h3>
        <ul className={styles.statList}>
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
          Credentials are held in session memory only and will be cleared when you close this tab.
        </p>
      </div>
      <button className={styles.btnSecondary} onClick={onDisconnect}>
        Disconnect
      </button>
    </div>
  );
}
