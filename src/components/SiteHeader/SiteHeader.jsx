import React from 'react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import UserMenu from '../UserMenu/UserMenu.jsx';
import styles from './SiteHeader.module.css';

/**
 * Props:
 *  onSignInClick() — opens the auth modal
 */
export default function SiteHeader({ onSignInClick }) {
  const { user, loading } = useAuth();

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <span className={styles.logo} aria-hidden="true">
            <span className={styles.logoE}>e</span>
            <span className={styles.logoB}>B</span>
            <span className={styles.logoA}>a</span>
            <span className={styles.logoY}>y</span>
          </span>
          <span className={styles.appName}>Listing Creator</span>
        </div>

        <nav className={styles.nav} aria-label="Page sections">
          <a href="#home">Home</a>
          <a href="#oauth">Connect to eBay</a>
          <a href="#listings">Listings</a>
          <a href="#faq">FAQ</a>
        </nav>

        <div className={styles.authSlot}>
          {!loading && (
            user
              ? <UserMenu />
              : (
                <button className={styles.signInBtn} onClick={onSignInClick}>
                  Sign In
                </button>
              )
          )}
        </div>
      </div>
    </header>
  );
}
