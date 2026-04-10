import React from 'react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import styles from './HomePage.module.css';

const FEATURES = [
  {
    icon: '🔌',
    title: 'Connect Once',
    body: 'Authorize with your eBay account and we\'ll pull down every listing category, shipping service, and fulfillment policy for the US marketplace — ready to use across all your listings.',
  },
  {
    icon: '📋',
    title: 'Bulk Import or Manual Entry',
    body: 'Add rows one at a time or import an Excel / CSV file. Category and shipping service names are resolved automatically. Download the template to see the exact column format.',
  },
  {
    icon: '🖼️',
    title: 'Image Manager',
    body: 'Upload up to 24 photos per listing directly to eBay\'s picture service. Drag and drop to reorder — the first image is always the main photo shown in search results.',
  },
  {
    icon: '⚡',
    title: 'Listing Rules',
    body: 'Create rules that automatically fill in item specifics based on category and title keywords. Sign in once to save your rules and apply them every time you build a listing.',
  },
  {
    icon: '📤',
    title: 'Post One or All',
    body: 'Post individual listings with a single click, or use Post All to submit every ready row in one go. Each row shows its status in real time — success, error, or in progress.',
  },
  {
    icon: '🔒',
    title: 'Privacy First',
    body: 'Your eBay access token lives only in browser memory and is cleared when you close the tab. Listings are saved locally in your browser so they survive page refreshes.',
  },
];

const STEPS = [
  {
    number: '01',
    label: 'Connect to eBay',
    detail: 'Enter your ZIP code and click Connect. You\'ll be taken to eBay to authorize the app — then we\'ll download your categories, shipping services, and fulfillment policies automatically.',
  },
  {
    number: '02',
    label: 'Build Your Listings',
    detail: 'Add rows manually or import a spreadsheet. Select a category, fill in item specifics, upload images, choose a shipping policy and method, then set your price and format.',
  },
  {
    number: '03',
    label: 'Post to eBay',
    detail: 'Review your listings in the grid, then post them individually or all at once. Each row updates in real time showing the eBay listing ID on success or the error message if something needs fixing.',
  },
];

export default function HomePage({ onSignInClick }) {
  const { user } = useAuth();

  return (
    <div className={styles.page} id="home">
      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroBadge}>Free &amp; Open Source</div>
          <h1 className={styles.heroHeadline}>
            Create eBay Listings
            <br />
            <span className={styles.heroAccent}>at scale, in your browser.</span>
          </h1>
          <p className={styles.heroSubtitle}>
            Connect your eBay account, build listings in a clean grid, upload images,
            and post directly to eBay — one at a time or all at once.
            No backend, no install, no spreadsheet gymnastics.
          </p>
          <div className={styles.heroCtas}>
            <a href="#oauth" className={styles.ctaPrimary}>
              Get Started &rarr;
            </a>
            {user ? (
              <span className={styles.signedInNote}>
                Signed in as <strong>{user.user_metadata?.full_name ?? user.email}</strong>
              </span>
            ) : (
              <button className={styles.ctaSecondary} onClick={onSignInClick}>
                Sign In / Create Account
              </button>
            )}
          </div>
        </div>

        {/* Decorative graphic */}
        <div className={styles.heroGraphic} aria-hidden="true">
          <div className={styles.mockWindow}>
            <div className={styles.mockBar}>
              <span /><span /><span />
            </div>
            <div className={styles.mockTable}>
              <div className={styles.mockThead}>
                {['Title', 'Qty', 'Condition', 'Format', 'Best Offer'].map((h) => (
                  <div key={h} className={styles.mockTh}>{h}</div>
                ))}
              </div>
              {[
                ['Vintage Camera Lens 50mm', '3', 'Used', 'Buy It Now', '$45'],
                ['Mechanical Keyboard RGB', '12', 'New', 'Buy It Now', '$80'],
                ['Antique Pocket Watch', '1', 'Used', 'Auction', '—'],
                ['Gaming Headset 7.1', '5', 'New', 'Buy It Now', '$30'],
                ['Rare Vinyl Record LP', '2', 'Used', 'Auction', '—'],
              ].map((row, i) => (
                <div key={i} className={styles.mockRow} style={{ '--delay': `${i * 0.08}s` }}>
                  {row.map((cell, j) => (
                    <div key={j} className={styles.mockTd}>{cell}</div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className={styles.steps}>
        <div className={styles.sectionInner}>
          <h2 className={styles.sectionTitle}>How it works</h2>
          <p className={styles.sectionSubtitle}>From connecting your account to live eBay listings in three steps.</p>
          <ol className={styles.stepList}>
            {STEPS.map((s) => (
              <li key={s.number} className={styles.stepItem}>
                <div className={styles.stepNumber}>{s.number}</div>
                <div className={styles.stepContent}>
                  <h3>{s.label}</h3>
                  <p>{s.detail}</p>
                </div>
                <div className={styles.stepConnector} aria-hidden="true" />
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Features ── */}
      <section className={styles.features}>
        <div className={styles.sectionInner}>
          <h2 className={styles.sectionTitle}>Everything you need</h2>
          <p className={styles.sectionSubtitle}>Everything you need to go from zero to live eBay listings.</p>
          <div className={styles.featureGrid}>
            {FEATURES.map((f) => (
              <article key={f.title} className={styles.featureCard}>
                <div className={styles.featureIcon} aria-hidden="true">{f.icon}</div>
                <h3 className={styles.featureTitle}>{f.title}</h3>
                <p className={styles.featureBody}>{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className={styles.cta}>
        <div className={styles.ctaInner}>
          <h2>Ready to build your listings?</h2>
          <p>Connect your eBay developer account below and start in minutes.</p>
          <a href="#oauth" className={styles.ctaPrimary}>
            Connect to eBay &rarr;
          </a>
        </div>
      </section>
    </div>
  );
}
