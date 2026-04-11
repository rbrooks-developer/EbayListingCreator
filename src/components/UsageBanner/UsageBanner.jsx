import { useState } from 'react';
import { useSubscription } from '../../contexts/SubscriptionContext.jsx';
import { startCheckout } from '../../services/billingService.js';
import styles from './UsageBanner.module.css';

const PRO_PRICE_ID      = import.meta.env.VITE_STRIPE_PRO_PRICE_ID      ?? '';
const BUSINESS_PRICE_ID = import.meta.env.VITE_STRIPE_BUSINESS_PRICE_ID ?? '';

const TIER_LABEL = { free: 'Free', pro: 'Pro', business: 'Business' };

/**
 * UsageBanner
 * Shows the user's current plan, listings used this billing period, and an
 * upgrade button if they are on the free tier.
 */
export default function UsageBanner() {
  const { usage, loading } = useSubscription();
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState('');

  // Don't render until data is available
  if (loading || !usage) return null;

  const { tier, used, limit } = usage;
  const unlimited = limit === null || limit === undefined;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const nearLimit = !unlimited && pct >= 80;
  const atLimit   = !unlimited && used >= limit;

  async function handleUpgrade(priceId) {
    if (!priceId) return;
    setUpgrading(true);
    setUpgradeError('');
    try {
      await startCheckout(priceId);
    } catch (e) {
      setUpgradeError(e.message);
      setUpgrading(false);
    }
  }

  return (
    <div className={`${styles.banner} ${atLimit ? styles.bannerLimit : nearLimit ? styles.bannerWarn : ''}`}>
      <div className={styles.left}>
        <span className={`${styles.tierBadge} ${styles[`tier_${tier}`]}`}>
          {TIER_LABEL[tier] ?? tier}
        </span>
        <span className={styles.usageText}>
          {unlimited
            ? `${used.toLocaleString()} listings posted this period`
            : `${used.toLocaleString()} / ${limit.toLocaleString()} listings this month`}
        </span>
        {!unlimited && (
          <div className={styles.barWrap} title={`${pct}% used`}>
            <div
              className={`${styles.bar} ${atLimit ? styles.barLimit : nearLimit ? styles.barWarn : ''}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>

      {tier === 'free' && (
        <div className={styles.right}>
          {upgradeError && <span className={styles.upgradeError}>{upgradeError}</span>}
          {PRO_PRICE_ID && (
            <button
              className={styles.btnUpgrade}
              disabled={upgrading}
              onClick={() => handleUpgrade(PRO_PRICE_ID)}
            >
              {upgrading ? 'Redirecting…' : 'Upgrade to Pro — $10/mo'}
            </button>
          )}
          {BUSINESS_PRICE_ID && (
            <button
              className={`${styles.btnUpgrade} ${styles.btnBusiness}`}
              disabled={upgrading}
              onClick={() => handleUpgrade(BUSINESS_PRICE_ID)}
            >
              Business — $25/mo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
