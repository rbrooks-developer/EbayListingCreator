import styles from './SiteFooter.module.css';

const INSTAGRAM_URL = 'https://www.instagram.com/createmylistings';

export default function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>

        {/* Brand */}
        <div className={styles.brand}>
          <div className={styles.brandName}>Create My Listings</div>
          <p className={styles.tagline}>
            The fastest way to bulk-list items on eBay — directly from your browser, no software to install.
          </p>
          <p className={styles.disclaimer}>
            Not affiliated with or endorsed by eBay Inc.
          </p>
          <a
            href={INSTAGRAM_URL}
            className={styles.instagram}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Create My Listings on Instagram"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="1.75"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
              <circle cx="12" cy="12" r="4"/>
              <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
            </svg>
            Follow us on Instagram
          </a>
        </div>

        {/* Product links */}
        <div className={styles.col}>
          <h3 className={styles.colHeading}>Product</h3>
          <nav aria-label="Product links">
            <a href="/#home">Home</a>
            <a href="/#oauth">Connect to eBay</a>
            <a href="/#listings">Create Listings</a>
            <a href="/#pricing">Pricing</a>
            <a href="/#articles">Articles</a>
          </nav>
        </div>

        {/* Support links */}
        <div className={styles.col}>
          <h3 className={styles.colHeading}>Support</h3>
          <nav aria-label="Support links">
            <a href="/#faq">FAQ</a>
            <a href="/#contact">Contact Us</a>
          </nav>
        </div>

      </div>

      {/* Bottom bar */}
      <div className={styles.bottom}>
        <span>&copy; {year} Create My Listings. All rights reserved.</span>
      </div>
    </footer>
  );
}
