import { useEffect, useRef, useState } from 'react';
import { fetchSellerListings } from '../../services/ebayApi.js';
import styles from './OpenListingsModal.module.css';

const EBAY_ITEM_URL = 'https://www.ebay.com/itm/';

function formatListingType(type) {
  if (type === 'FixedPriceItem' || type === 'StoresFixedPrice') return 'Buy It Now';
  if (type === 'Chinese') return 'Auction';
  return type;
}

function formatPrice(price, currency) {
  if (!price) return '—';
  const num = parseFloat(price);
  if (isNaN(num)) return '—';
  return num.toLocaleString('en-US', { style: 'currency', currency: currency || 'USD' });
}

function formatEndTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function buildCsvRow(cols) {
  return cols.map((c) => {
    const s = String(c ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  }).join(',');
}

export default function OpenListingsModal({ accessToken, sandbox, onClose }) {
  const [listings,      setListings]      = useState([]);
  const [page,          setPage]          = useState(1);
  const [totalPages,    setTotalPages]    = useState(1);
  const [totalEntries,  setTotalEntries]  = useState(0);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [exporting,     setExporting]     = useState(false);
  const overlayRef = useRef(null);

  useEffect(() => {
    loadPage(page);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadPage(p) {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSellerListings(accessToken, sandbox, p);
      setListings(data.listings);
      setTotalPages(data.totalPages);
      setTotalEntries(data.totalEntries);
    } catch (e) {
      setError(e.message || 'Failed to load listings');
    } finally {
      setLoading(false);
    }
  }

  async function handleExportCsv() {
    setExporting(true);
    try {
      // Collect all pages
      let all = [...listings];
      for (let p = 2; p <= totalPages; p++) {
        const data = await fetchSellerListings(accessToken, sandbox, p);
        all = [...all, ...data.listings];
      }

      const header = buildCsvRow(['Item ID', 'Title', 'Type', 'Price', 'Quantity Available', 'Total Quantity', 'Ends', 'eBay URL']);
      const rows = all.map((l) =>
        buildCsvRow([
          l.itemId,
          l.title,
          formatListingType(l.listingType),
          l.price ? parseFloat(l.price).toFixed(2) : '',
          l.quantityAvailable,
          l.quantity,
          l.endTime ? new Date(l.endTime).toLocaleString('en-US') : '',
          l.itemId ? `${EBAY_ITEM_URL}${l.itemId}` : '',
        ])
      );

      const csv  = [header, ...rows].join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `ebay_open_listings_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`Export failed: ${e.message}`);
    } finally {
      setExporting(false);
    }
  }

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose();
  }

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Open eBay Listings"
    >
      <div className={styles.modal}>

        {/* Header */}
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Open eBay Listings</h2>
            {!loading && !error && (
              <p className={styles.subtitle}>
                {totalEntries.toLocaleString()} active listing{totalEntries !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {loading && (
            <div className={styles.loadingState}>
              <span className={styles.spinner} aria-hidden="true" />
              Loading listings…
            </div>
          )}

          {!loading && error && (
            <div className={styles.errorState}>
              <p className={styles.errorMsg}>{error}</p>
              <button className={styles.retryBtn} onClick={() => loadPage(page)}>Try Again</button>
            </div>
          )}

          {!loading && !error && listings.length === 0 && (
            <div className={styles.emptyState}>No active listings found on this account.</div>
          )}

          {!loading && !error && listings.length > 0 && (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.colImg} aria-label="Image" />
                  <th className={styles.colTitle}>Title</th>
                  <th className={styles.colType}>Type</th>
                  <th className={styles.colQty}>Qty</th>
                  <th className={styles.colPrice}>Price</th>
                  <th className={styles.colEnds}>Ends</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((l) => (
                  <tr key={l.itemId} className={styles.row}>
                    <td className={styles.colImg}>
                      {l.galleryUrl ? (
                        <img
                          src={l.galleryUrl}
                          alt=""
                          className={styles.thumb}
                          loading="lazy"
                        />
                      ) : (
                        <div className={styles.thumbPlaceholder} />
                      )}
                    </td>
                    <td className={styles.colTitle}>
                      <a
                        href={`${EBAY_ITEM_URL}${l.itemId}`}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.titleLink}
                      >
                        {l.title}
                      </a>
                    </td>
                    <td className={styles.colType}>
                      <span className={l.listingType === 'Chinese' ? styles.badgeAuction : styles.badgeBin}>
                        {formatListingType(l.listingType)}
                      </span>
                    </td>
                    <td className={styles.colQty}>
                      {l.quantityAvailable ?? l.quantity ?? '—'}
                      {l.quantity && l.quantityAvailable !== l.quantity
                        ? <span className={styles.qtyTotal}> / {l.quantity}</span>
                        : null}
                    </td>
                    <td className={styles.colPrice}>{formatPrice(l.price, l.currency)}</td>
                    <td className={styles.colEnds}>{formatEndTime(l.endTime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {!loading && !error && listings.length > 0 && (
          <div className={styles.footer}>
            <div className={styles.pagination}>
              <button
                className={styles.pageBtn}
                onClick={() => setPage((p) => p - 1)}
                disabled={page <= 1}
              >
                ‹ Prev
              </button>
              <span className={styles.pageInfo}>Page {page} of {totalPages}</span>
              <button
                className={styles.pageBtn}
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
              >
                Next ›
              </button>
            </div>
            <button
              className={styles.exportBtn}
              onClick={handleExportCsv}
              disabled={exporting}
            >
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
