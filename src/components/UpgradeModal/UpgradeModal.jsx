import { useState } from 'react';
import { startCheckout } from '../../services/billingService.js';
import { useTierPrices, fmtPrice } from '../../hooks/useTierPrices.js';
import styles from './UpgradeModal.module.css';

const PRO_PRICE_ID      = import.meta.env.VITE_STRIPE_PRO_PRICE_ID      ?? '';
const BUSINESS_PRICE_ID = import.meta.env.VITE_STRIPE_BUSINESS_PRICE_ID ?? '';

const STORAGE_KEY = 'upgrade_prompt_seen';

export function markUpgradePromptSeen() {
  localStorage.setItem(STORAGE_KEY, 'true');
}

export function hasSeenUpgradePrompt() {
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

export default function UpgradeModal({ isOpen, onClose }) {
  const [upgrading, setUpgrading] = useState(null);
  const [error, setError]         = useState('');
  const tierPrices = useTierPrices();

  const proPrice      = tierPrices?.pro?.price      != null ? fmtPrice(tierPrices.pro.price)      : '$9.99';
  const businessPrice = tierPrices?.business?.price != null ? fmtPrice(tierPrices.business.price) : '$24.99';

  if (!isOpen) return null;

  async function handleUpgrade(priceId, planId) {
    setUpgrading(planId);
    setError('');
    try {
      await startCheckout(priceId);
    } catch (e) {
      setError(e.message);
      setUpgrading(null);
    }
  }

  function handleClose() {
    markUpgradePromptSeen();
    onClose();
  }

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>

        <button className={styles.closeBtn} onClick={handleClose} aria-label="Dismiss">&#10005;</button>

        <div className={styles.header}>
          <h2 className={styles.title}>You're on the Free plan</h2>
          <p className={styles.subtitle}>
            Unlock more listings, rules, and images by upgrading.
          </p>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.plans}>

          <div className={styles.plan}>
            <div className={styles.planHeader}>
              <span className={styles.planName}>Pro</span>
              <span className={styles.planPrice}>{proPrice} <span className={styles.planPeriod}>/ month</span></span>
            </div>
            <ul className={styles.features}>
              <li>{tierPrices?.pro?.listings_per_month == null ? 'Unlimited listings' : `${tierPrices.pro.listings_per_month.toLocaleString()} listings per month`}</li>
              <li>{tierPrices?.pro?.max_rules == null ? 'Unlimited listing rules' : `${tierPrices.pro.max_rules} listing rules`}</li>
              <li>Up to {tierPrices?.pro?.max_images ?? 10} images per listing</li>
              <li>Priority support</li>
            </ul>
            <button
              className={`${styles.btn} ${styles.btnPro}`}
              disabled={!!upgrading}
              onClick={() => handleUpgrade(PRO_PRICE_ID, 'pro')}
            >
              {upgrading === 'pro' ? 'Redirecting…' : `Upgrade to Pro — ${proPrice}/mo`}
            </button>
          </div>

          <div className={`${styles.plan} ${styles.planHighlighted}`}>
            <div className={styles.planHeader}>
              <span className={styles.planName}>Business</span>
              <span className={styles.planPrice}>{businessPrice} <span className={styles.planPeriod}>/ month</span></span>
            </div>
            <ul className={styles.features}>
              <li>{tierPrices?.business?.listings_per_month == null ? 'Unlimited listings' : `${tierPrices.business.listings_per_month.toLocaleString()} listings per month`}</li>
              <li>{tierPrices?.business?.max_rules == null ? 'Unlimited listing rules' : `${tierPrices.business.max_rules} listing rules`}</li>
              <li>Up to {tierPrices?.business?.max_images ?? 24} images per listing</li>
              <li>Priority support</li>
            </ul>
            <button
              className={`${styles.btn} ${styles.btnBusiness}`}
              disabled={!!upgrading}
              onClick={() => handleUpgrade(BUSINESS_PRICE_ID, 'business')}
            >
              {upgrading === 'business' ? 'Redirecting…' : `Upgrade to Business — ${businessPrice}/mo`}
            </button>
          </div>

        </div>

        <button className={styles.laterBtn} onClick={handleClose}>
          Maybe later
        </button>

      </div>
    </div>
  );
}
