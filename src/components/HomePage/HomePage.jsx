import React from 'react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import styles from './HomePage.module.css';

const FEATURES = [
  {
    icon: '🔌',
    title: 'Connect Once',
    body: 'Authenticate with your eBay developer credentials and we\'ll pull down every listing category and shipping option available in your marketplace — ready to use across all your listings.',
  },
  {
    icon: '📋',
    title: 'Bulk Import or Manual Entry',
    body: 'Paste your data into the grid one row at a time, or drop in an Excel / CSV file and import hundreds of listings in seconds. Download our template to get started fast.',
  },
  {
    icon: '⚡',
    title: 'Smart Defaults',
    body: 'Condition, listing format, auction duration, and best-offer fields are all context-aware. Auction-only fields only appear when you need them — keeping the grid clean.',
  },
  {
    icon: '🔒',
    title: 'Privacy First',
    body: 'Your App ID and access token live only in your browser\'s session memory. Nothing is sent to any third-party server. Close the tab and your credentials are gone.',
  },
  {
    icon: '📤',
    title: 'Export Anytime',
    body: 'Export your completed listing sheet back to Excel at any point — useful for record-keeping or sharing with a team before pushing listings live to eBay.',
  },
  {
    icon: '🌐',
    title: 'Works Everywhere',
    body: 'A fully static React app — no backend, no install, no account. Host it on GitHub Pages for free and access it from any browser, on any device.',
  },
];

const STEPS = [
  {
    number: '01',
    label: 'Connect to eBay',
    detail: 'Enter your eBay developer App ID and Client Secret. We\'ll fetch an access token and download all categories and shipping methods.',
  },
  {
    number: '02',
    label: 'Build Your Listings',
    detail: 'Add rows manually or import a spreadsheet. Fill in titles, descriptions, quantities, conditions, formats, and pricing.',
  },
  {
    number: '03',
    label: 'Export & Publish',
    detail: 'Review your listings in the grid, export to Excel for your records, then push them to eBay through the Seller Hub or API.',
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
            A developer-friendly tool that connects directly to the eBay API, pulls down
            your categories and shipping options, and gives you a clean grid to build
            bulk listings — no backend, no spreadsheet gymnastics.
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
          <p className={styles.sectionSubtitle}>Three steps from credentials to published listings.</p>
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
          <p className={styles.sectionSubtitle}>Built for eBay sellers who know their way around a spreadsheet.</p>
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
