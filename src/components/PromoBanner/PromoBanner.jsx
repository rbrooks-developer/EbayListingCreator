import { useEffect, useState } from 'react';
import { fetchFreeTierLimit } from '../../services/billingService.js';
import styles from './PromoBanner.module.css';

const STORAGE_KEY = 'promo_banner_dismissed';

export default function PromoBanner() {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(STORAGE_KEY) === '1'
  );
  const [freeLimit, setFreeLimit] = useState(null);

  useEffect(() => {
    fetchFreeTierLimit().then(setFreeLimit);
  }, []);

  function handleDismiss() {
    localStorage.setItem(STORAGE_KEY, '1');
    setDismissed(true);
  }

  function handleCta() {
    document.getElementById('oauth')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (dismissed) return null;

  return (
    <div className={styles.banner} role="banner">
      <p className={styles.message}>
        {freeLimit != null
          ? `List your first ${freeLimit} items on eBay — free forever, no credit card required.`
          : 'List items on eBay — free forever, no credit card required.'}
      </p>
      <button className={styles.cta} onClick={handleCta} type="button">
        Start listing free &rarr;
      </button>
      <button
        className={styles.dismiss}
        onClick={handleDismiss}
        aria-label="Dismiss banner"
        type="button"
      >
        &#x2715;
      </button>
    </div>
  );
}
