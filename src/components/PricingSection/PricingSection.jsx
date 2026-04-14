import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useSubscription } from '../../contexts/SubscriptionContext.jsx';
import { startCheckout } from '../../services/billingService.js';
import styles from './PricingSection.module.css';

const PRO_PRICE_ID      = import.meta.env.VITE_STRIPE_PRO_PRICE_ID      ?? '';
const BUSINESS_PRICE_ID = import.meta.env.VITE_STRIPE_BUSINESS_PRICE_ID ?? '';

const PLANS = [
  {
    id:          'free',
    name:        'Free',
    price:       '$0',
    period:      'forever',
    description: 'Everything you need to get started selling on eBay.',
    features: [
      '20 listings per month',
      '5 listing rules',
      'Up to 4 images per listing',
      'Excel & CSV import / export',
      'Trading card support',
    ],
    priceId:     null,
    highlighted: false,
  },
  {
    id:          'pro',
    name:        'Pro',
    price:       '$10',
    period:      '/ month',
    description: 'For regular sellers who need more volume and automation.',
    features: [
      '150 listings per month',
      '25 listing rules',
      'Up to 10 images per listing',
      'Excel & CSV import / export',
      'Trading card support',
      'Priority support',
    ],
    priceId:     PRO_PRICE_ID,
    highlighted: true,
  },
  {
    id:          'business',
    name:        'Business',
    price:       '$25',
    period:      '/ month',
    description: 'For power sellers with high volume and complex workflows.',
    features: [
      'Unlimited listings',
      'Unlimited listing rules',
      'Up to 24 images per listing',
      'Excel & CSV import / export',
      'Trading card support',
      'Priority support',
    ],
    priceId:     BUSINESS_PRICE_ID,
    highlighted: false,
  },
];

export default function PricingSection({ onSignInClick }) {
  const { user } = useAuth();
  const { usage } = useSubscription();
  const [upgrading, setUpgrading] = useState(null); // plan id being upgraded to
  const [upgradeError, setUpgradeError] = useState('');

  const currentTier = usage?.tier ?? null;

  async function handleUpgrade(plan) {
    if (!user) { onSignInClick?.(); return; }
    if (!plan.priceId) return;
    setUpgrading(plan.id);
    setUpgradeError('');
    try {
      await startCheckout(plan.priceId);
    } catch (e) {
      setUpgradeError(e.message);
      setUpgrading(null);
    }
  }

  return (
    <section className={styles.section} id="pricing">
      <div className={styles.container}>

        <div className={styles.pageHeader}>
          <h2 className={styles.pageTitle}>Simple, transparent pricing</h2>
          <p className={styles.pageSubtitle}>
            Start for free. Upgrade when you need more listings, rules, or images.
          </p>
        </div>

        {upgradeError && (
          <p className={styles.globalError}>{upgradeError}</p>
        )}

        <div className={styles.cards}>
          {PLANS.map((plan) => {
            const isCurrent = user && currentTier === plan.id;
            const isLoading = upgrading === plan.id;

            let btnLabel;
            let btnDisabled = false;

            if (isCurrent) {
              btnLabel    = 'Current Plan';
              btnDisabled = true;
            } else if (!user) {
              btnLabel = plan.id === 'free' ? 'Get Started Free' : `Get Started`;
            } else if (plan.id === 'free') {
              btnLabel    = 'Free Plan';
              btnDisabled = true;
            } else {
              btnLabel = isLoading ? 'Redirecting…' : `Upgrade to ${plan.name}`;
            }

            return (
              <div
                key={plan.id}
                className={`${styles.card} ${plan.highlighted ? styles.cardHighlighted : ''} ${isCurrent ? styles.cardCurrent : ''}`}
              >
                {plan.highlighted && (
                  <div className={styles.popularBadge}>Most Popular</div>
                )}

                <div className={styles.cardHeader}>
                  <h3 className={styles.planName}>{plan.name}</h3>
                  <div className={styles.priceRow}>
                    <span className={styles.price}>{plan.price}</span>
                    <span className={styles.period}>{plan.period}</span>
                  </div>
                  <p className={styles.description}>{plan.description}</p>
                </div>

                <ul className={styles.features}>
                  {plan.features.map((f) => (
                    <li key={f} className={styles.feature}>
                      <span className={styles.check} aria-hidden="true">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  className={`${styles.btn} ${plan.highlighted ? styles.btnHighlighted : ''} ${isCurrent ? styles.btnCurrent : ''}`}
                  disabled={btnDisabled || isLoading}
                  onClick={() => handleUpgrade(plan)}
                >
                  {btnLabel}
                </button>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
