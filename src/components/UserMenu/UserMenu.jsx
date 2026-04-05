import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import styles from './UserMenu.module.css';

/**
 * Renders the signed-in user's avatar + dropdown menu in the header.
 */
export default function UserMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (!menuRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handler(e) { if (e.key === 'Escape') setOpen(false); }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  if (!user) return null;

  const displayName = user.user_metadata?.full_name
    ?? user.user_metadata?.name
    ?? user.email
    ?? 'User';

  const avatarUrl = user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null;

  // Initials fallback
  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  async function handleSignOut() {
    setOpen(false);
    await signOut();
  }

  return (
    <div className={styles.wrapper} ref={menuRef}>
      <button
        className={styles.trigger}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
      >
        <Avatar src={avatarUrl} initials={initials} />
        <span className={styles.displayName}>{displayName.split(' ')[0]}</span>
        <span className={`${styles.chevron} ${open ? styles.chevronUp : ''}`} aria-hidden="true">
          &#8964;
        </span>
      </button>

      {open && (
        <div className={styles.dropdown} role="menu">
          <div className={styles.dropdownHeader}>
            <Avatar src={avatarUrl} initials={initials} size="lg" />
            <div className={styles.dropdownUser}>
              <span className={styles.dropdownName}>{displayName}</span>
              <span className={styles.dropdownEmail}>{user.email}</span>
            </div>
          </div>

          <div className={styles.dropdownDivider} />

          <button
            className={styles.dropdownItem}
            role="menuitem"
            onClick={handleSignOut}
          >
            <span aria-hidden="true">&#x2192;</span>
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

function Avatar({ src, initials, size = 'sm' }) {
  const [imgError, setImgError] = useState(false);

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt=""
        className={`${styles.avatar} ${size === 'lg' ? styles.avatarLg : ''}`}
        onError={() => setImgError(true)}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <span className={`${styles.avatarFallback} ${size === 'lg' ? styles.avatarLg : ''}`}>
      {initials}
    </span>
  );
}
