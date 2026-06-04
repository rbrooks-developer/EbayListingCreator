import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchPriceLookup } from '../../services/ebayApi.js';
import styles from './PriceLookupModal.module.css';

export default function PriceLookupModal({ listing, sandbox, onSelectPrice, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [sales,   setSales]   = useState([]);
  const overlayRef = useRef(null);

  useEffect(() => {
    fetchPriceLookup(listing.title, sandbox)
      .then((data) => { setSales(data.sales ?? []); })
      .catch((e)   => { setError(e.message || 'Failed to load price data.'); })
      .finally(()  => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleSelect(soldPrice) {
    onSelectPrice(soldPrice);
    onClose();
  }

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
            <h2 className={styles.title}>Recent Sales</h2>
            <p className={styles.subtitle} title={listing.title}>{shortTitle}</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={styles.body}>
          {loading && (
            <div className={styles.center}>
              <div className={styles.spinner} />
              <span>Looking up recent sales…</span>
            </div>
          )}

          {!loading && error && (
            <div className={styles.center}>
              <span className={styles.errorText}>{error}</span>
            </div>
          )}

          {!loading && !error && sales.length === 0 && (
            <div className={styles.center}>
              <span>No recent sold listings found for this title.</span>
            </div>
          )}

          {!loading && !error && sales.map((sale, i) => (
            <button
              key={i}
              className={styles.resultRow}
              onClick={() => handleSelect(sale.soldPrice)}
              title={`Use $${sale.soldPrice}`}
            >
              {sale.thumbnailUrl ? (
                <img src={sale.thumbnailUrl} alt="" className={styles.thumbnail} />
              ) : (
                <div className={styles.thumbnailPlaceholder} aria-hidden="true">🖼</div>
              )}
              <div className={styles.info}>
                <span className={styles.itemTitle}>{sale.title}</span>
                <span className={styles.meta}>
                  {sale.condition && <>{sale.condition} · </>}
                  {sale.soldDate && new Date(sale.soldDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
              <div className={styles.priceCol}>
                <div className={styles.soldPrice}>${parseFloat(sale.soldPrice).toFixed(2)}</div>
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
