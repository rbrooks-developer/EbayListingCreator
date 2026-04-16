import styles from './SiteFooter.module.css';

const INSTAGRAM_URL = 'https://www.instagram.com/createmylistings';

export default function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>

        <span className={styles.copy}>
          &copy; {year} Create My Listings
        </span>

        <nav className={styles.nav} aria-label="Footer navigation">
          <a href="#home">Home</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
          <a href="#contact">Contact</a>
        </nav>

        <a
          href={INSTAGRAM_URL}
          className={styles.instagram}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Create My Listings on Instagram"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
            <circle cx="12" cy="12" r="4"/>
            <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
          </svg>
          Instagram
        </a>

      </div>
    </footer>
  );
}
