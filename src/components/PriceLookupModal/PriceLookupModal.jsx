import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchPriceLookup } from '../../services/ebayApi.js';
import styles from './PriceLookupModal.module.css';

export default function PriceLookupModal({ listing, sandbox, onSelectPrice, onClose }) {
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [listings, setListings] = useState([]);
  const overlayRef = useRef(null);

  useEffect(() => {
    fetchPriceLookup(listing.title, sandbox)
      .then((data) => { setListings(data.listings ?? []); })
      .catch((e)   => { setError(e.message || 'Failed to load price data.'); })
      .finally(()  => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ebaySearchUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(listing.title)}&LH_Sold=1&LH_Complete=1`;

  const shortTitle = listing.title.length > 45
    ? listing.title.slice(0, 45) + '…'
    : listing.title;

  return createPortal(
    <div
      className={styles.overlay}
      ref={overlayRef}
      onMouseDown={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className={styles.modal}>

        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Current Prices</h2>
            <p className={styles.subtitle} title={listing.title}>{shortTitle}</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={styles.body}>

          {/* Always-visible link to eBay sold listings */}
          <div className={styles.soldLink}>
            <a href={ebaySearchUrl} target="_blank" rel="noopener noreferrer">
              View actual sold listings on eBay ↗
            </a>
          </div>

          {loading && (
            <div className={styles.center}>
              <div className={styles.spinner} />
              <span>Searching active listings…</span>
            </div>
          )}

          {!loading && error && (
            <div className={styles.center}>
              <span className={styles.errorText}>{error}</span>
            </div>
          )}

          {!loading && !error && listings.length === 0 && (
            <div className={styles.center}>
              <span>No active listings found for this title.</span>
            </div>
          )}

          {!loading && !error && listings.map((item, i) => (
            <button
              key={i}
              className={styles.resultRow}
              onClick={() => { onSelectPrice(item.price); onClose(); }}
              title={`Use $${item.price}`}
            >
              {item.thumbnailUrl ? (
                <img src={item.thumbnailUrl} alt="" className={styles.thumbnail} />
              ) : (
                <div className={styles.thumbnailPlaceholder} aria-hidden="true">🖼</div>
              )}
              <div className={styles.info}>
                <span className={styles.itemTitle}>{item.title}</span>
                {item.condition && <span className={styles.meta}>{item.condition}</span>}
              </div>
              <div className={styles.priceCol}>
                <div className={styles.soldPrice}>${parseFloat(item.price).toFixed(2)}</div>
                <div className={styles.useHint}>click to use</div>
              </div>
            </button>
          ))}
        </div>

        <div className={styles.footer}>
          <button className={styles.closeFooterBtn} onClick={onClose}>Close</button>
        </div>

      </div>
    </div>,
    document.body
  );
}
