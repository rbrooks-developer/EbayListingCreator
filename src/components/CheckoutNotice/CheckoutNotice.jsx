import { useEffect, useState } from 'react';
import { useSubscription } from '../../contexts/SubscriptionContext.jsx';
import styles from './CheckoutNotice.module.css';

/**
 * Reads ?checkout=success|cancel from the URL on mount, shows a dismissible
 * banner, strips the param from the URL, and refreshes the subscription.
 */
export default function CheckoutNotice() {
  const { refresh } = useSubscription();
  const [notice, setNotice] = useState(null); // 'success' | 'cancel' | null

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('checkout');
    if (status === 'success' || status === 'cancel') {
      // Clean URL
      params.delete('checkout');
      const newSearch = params.toString();
      window.history.replaceState(
        {},
        '',
        window.location.pathname + (newSearch ? `?${newSearch}` : '')
      );
      setNotice(status);
      if (status === 'success') refresh();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!notice) return null;

  return (
    <div className={`${styles.notice} ${notice === 'success' ? styles.success : styles.cancel}`} role="alert">
      {notice === 'success'
        ? 'Your plan has been upgraded — welcome to Pro!'
        : 'Checkout was cancelled. Your plan was not changed.'}
      <button className={styles.dismiss} onClick={() => setNotice(null)} aria-label="Dismiss">
        &times;
      </button>
    </div>
  );
}
