import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import CategorySelect from '../CategorySelect/CategorySelect.jsx';
import ShippingPicker from '../ShippingPicker/ShippingPicker.jsx';
import {
  isTC, getAspectsStatus, ASPECTS_STATUS_CONFIG,
  CONDITIONS, LISTING_TYPES, AUCTION_DAYS,
} from './listingUtils.js';
import gridStyles from './ListingGrid.module.css';
import styles from './TabbedRow.module.css';

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="8.5" y1="8.5" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function ErrorMsg({ message }) {
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  function onEnter() {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ x: r.left, y: r.bottom + 6 });
  }
  return (
    <span ref={ref} className={gridStyles.statusMsg} onMouseEnter={onEnter} onMouseLeave={() => setPos(null)}>
      {message}
      {pos && createPortal(
        <div className={gridStyles.errorTooltip} style={{ top: pos.y, left: pos.x }}>{message}</div>,
        document.body
      )}
    </span>
  );
}

export default function TabbedRow({
  listing, activeTab, categories, shippingServices, fulfillmentPolicies, aspectsCache, tcCategoryIds,
  onUpdate, onUpdateCategory, onRemove, onOpenAspects, onSetTcType, onOpenTcModal, onPost,
  onOpenImages, onOpenPriceLookup, hasCategories, canPost,
}) {
  const isAuction    = listing.listingType === 'Auction';
  const aspectsSt    = getAspectsStatus(listing, aspectsCache.current);
  const statusCfg    = ASPECTS_STATUS_CONFIG[aspectsSt];
  const { postStatus, listingId, statusError } = listing;
  const isTcCategory = isTC(listing, tcCategoryIds);

  function field(name, value) { onUpdate(listing.id, name, value); }

  // ── Status / post cell ────────────────────────────────────────────────────
  const statusCell = (
    <div className={styles.fieldStatus}>
      {postStatus === 'submitting' && (
        <div className={gridStyles.statusSubmitting}>
          <span className={gridStyles.statusSpinner} aria-hidden="true" />
          Posting…
        </div>
      )}
      {(postStatus === 'success' || postStatus === 'updated') && (
        <div className={gridStyles.statusSuccess}>
          <span className={gridStyles.statusBadge}>{postStatus === 'updated' ? 'Updated' : 'Listed'}</span>
          <span className={gridStyles.statusId} title={listingId}>{listingId}</span>
          <button className={gridStyles.retryBtn} onClick={() => onPost(listing.id)} disabled={!canPost}>Update</button>
        </div>
      )}
      {postStatus === 'scheduled' && (
        <div className={gridStyles.statusScheduled}>
          <span className={gridStyles.statusBadgeScheduled}>Scheduled</span>
          <span className={gridStyles.statusId} title={listingId}>{listingId}</span>
          {listing.postedScheduledTime && (
            <span className={gridStyles.scheduledFor}>
              {new Date(listing.postedScheduledTime).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
        </div>
      )}
      {postStatus === 'error' && (
        <div className={gridStyles.statusError}>
          <span className={gridStyles.statusBadgeError}>Error</span>
          <ErrorMsg message={statusError} />
          <button className={gridStyles.retryBtn} onClick={() => onPost(listing.id)} disabled={!canPost}>Retry</button>
        </div>
      )}
      {postStatus === 'new' && (() => {
        const reason = !canPost ? 'Connect to eBay (Step 1)'
          : !listing.title ? 'Title required'
          : !listing.categoryId ? 'Category required'
          : (isTcCategory && !listing.tcConditionType) ? 'Select Graded or Ungraded'
          : null;
        return (
          <>
            <button className={gridStyles.postBtn} onClick={() => onPost(listing.id)} disabled={!!reason}>Post to eBay</button>
            {reason && <span className={gridStyles.postHint}>{reason}</span>}
          </>
        );
      })()}
    </div>
  );

  // ── Condition cell ────────────────────────────────────────────────────────
  const conditionCell = (
    <div className={styles.fieldCondition}>
      <span className={styles.label}>Condition</span>
      {isTcCategory ? (
        <>
          <select
            className={gridStyles.cellSelect}
            value={listing.tcConditionType || ''}
            onChange={(e) => {
              const type = e.target.value;
              if (!type) return;
              if (type !== listing.tcConditionType) onSetTcType(listing.id, type);
              onOpenTcModal(listing.id, type);
            }}
            aria-label="Card condition type"
          >
            <option value="">— Select type —</option>
            <option value="graded">Graded</option>
            <option value="ungraded">Ungraded</option>
          </select>
          {listing.tcConditionLabel ? (
            <button type="button" className={`${gridStyles.imagesBtn} ${gridStyles.tcBtnFilled}`} style={{ marginTop: '0.3rem' }} onClick={() => onOpenTcModal(listing.id, listing.tcConditionType)}>
              {listing.tcConditionLabel}
            </button>
          ) : listing.tcConditionType ? (
            <button type="button" className={gridStyles.imagesBtn} style={{ marginTop: '0.3rem' }} onClick={() => onOpenTcModal(listing.id, listing.tcConditionType)}>
              + Add details
            </button>
          ) : null}
        </>
      ) : (
        <select className={gridStyles.cellSelect} value={listing.condition} onChange={(e) => field('condition', e.target.value)} aria-label="Condition">
          {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
    </div>
  );

  // ── Tab content ───────────────────────────────────────────────────────────
  let tabContent = null;

  if (activeTab === 'details') {
    tabContent = (
      <>
        <div className={`${styles.field} ${styles.fieldWide}`}>
          <span className={styles.label}>Category</span>
          {hasCategories ? (
            <CategorySelect categories={categories} value={listing.categoryId} onChange={(id, name) => onUpdateCategory(listing.id, id, name)} />
          ) : (
            <span className={gridStyles.naText}>Connect API</span>
          )}
        </div>
        <div className={styles.field}>
          <span className={styles.label}>Specifics</span>
          <button
            className={`${gridStyles.specificsBtn} ${gridStyles[`specifics_${aspectsSt}`]}`}
            onClick={() => listing.categoryId && onOpenAspects(listing.id)}
            disabled={!listing.categoryId}
            title={statusCfg.title}
            aria-label={statusCfg.title}
          >
            <span className={`${gridStyles.dot} ${gridStyles[statusCfg.dotKey]}`} aria-hidden="true" />
            <span className={gridStyles.specificsLabel}>{statusCfg.label}</span>
          </button>
        </div>
        {conditionCell}
      </>
    );
  } else if (activeTab === 'pricing') {
    tabContent = (
      <>
        <div className={styles.field}>
          <span className={styles.label}>Type</span>
          <select
            className={gridStyles.cellSelect}
            value={listing.listingType}
            onChange={(e) => field('listingType', e.target.value)}
            aria-label="Listing type"
            disabled={!!listing.listingId}
          >
            {LISTING_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className={`${styles.field} ${styles.fieldNarrow}`}>
          <span className={styles.label}>Qty</span>
          <input type="text" inputMode="numeric" className={gridStyles.cellInput} value={listing.quantity} onChange={(e) => field('quantity', e.target.value.replace(/\D/g, ''))} aria-label="Quantity" />
        </div>
        {!isAuction ? (
          <div className={`${styles.field} ${styles.fieldNarrow}`}>
            <span className={styles.label}>Price ($)</span>
            <div className={styles.priceRow}>
              <input type="text" inputMode="decimal" className={gridStyles.cellInput} value={listing.price} onChange={(e) => field('price', e.target.value)} placeholder="0.00" aria-label="Buy It Now price" />
              {listing.title && (
                <button className={styles.lookupBtn} onClick={() => onOpenPriceLookup(listing.id)} title="Look up recent sold prices">
                  <SearchIcon />
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className={`${styles.field} ${styles.fieldNarrow}`}>
              <span className={styles.label}>Start ($)</span>
              <input type="text" inputMode="decimal" className={gridStyles.cellInput} value={listing.auctionStartPrice} onChange={(e) => field('auctionStartPrice', e.target.value)} placeholder="0.99" aria-label="Auction start price" />
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Duration</span>
              <select className={gridStyles.cellSelect} value={listing.auctionDays} onChange={(e) => field('auctionDays', e.target.value)} aria-label="Auction duration">
                <option value="">— days —</option>
                {AUCTION_DAYS.map((d) => <option key={d} value={d}>{d} days</option>)}
              </select>
            </div>
          </>
        )}
        <div className={`${styles.field} ${styles.fieldNarrow}`}>
          <span className={styles.label}>Best Offer ($)</span>
          <input type="text" inputMode="decimal" className={gridStyles.cellInput} value={listing.bestOffer} onChange={(e) => field('bestOffer', e.target.value)} placeholder="0.00" aria-label="Best offer" />
        </div>
      </>
    );
  } else if (activeTab === 'shipping') {
    tabContent = (
      <>
        <div className={`${styles.field} ${styles.fieldWide}`}>
          <span className={styles.label}>Ship Policy</span>
          {fulfillmentPolicies.length > 0 ? (
            <select className={gridStyles.cellSelect} value={listing.fulfillmentPolicyId} onChange={(e) => field('fulfillmentPolicyId', e.target.value)} aria-label="Shipping policy">
              <option value="">— auto (first) —</option>
              {fulfillmentPolicies.map((p) => <option key={p.fulfillmentPolicyId} value={p.fulfillmentPolicyId}>{p.name}</option>)}
            </select>
          ) : (
            <span className={gridStyles.naText}>Connect API</span>
          )}
        </div>
        <div className={`${styles.field} ${styles.fieldWide}`}>
          <span className={styles.label}>Shipping Method</span>
          {shippingServices.length > 0 ? (
            <ShippingPicker shippingServices={shippingServices} value={listing.shippingService} onChange={(code) => field('shippingService', code)} />
          ) : (
            <span className={gridStyles.naText}>Connect API</span>
          )}
        </div>
        {[['length', 'Length (in)'], ['width', 'Width (in)'], ['height', 'Height (in)']].map(([key, lbl]) => (
          <div key={key} className={`${styles.field} ${styles.fieldTiny}`}>
            <span className={styles.label}>{lbl}</span>
            <input type="text" inputMode="numeric" className={gridStyles.cellInput} value={listing[key]} onChange={(e) => field(key, e.target.value.replace(/\D/g, ''))} placeholder="0" aria-label={lbl} />
          </div>
        ))}
        {[['weightLbs', 'Lbs'], ['weightOz', 'Oz']].map(([key, lbl]) => (
          <div key={key} className={`${styles.field} ${styles.fieldTiny}`}>
            <span className={styles.label}>{lbl}</span>
            <input type="text" inputMode="numeric" className={gridStyles.cellInput} value={listing[key]} onChange={(e) => field(key, e.target.value.replace(/\D/g, ''))} placeholder="0" aria-label={`Weight ${lbl}`} />
          </div>
        ))}
      </>
    );
  } else if (activeTab === 'images') {
    tabContent = (
      <div className={`${styles.field} ${styles.fieldImages}`}>
        <span className={styles.label}>Images</span>
        <button className={gridStyles.imagesBtn} onClick={() => onOpenImages(listing.id)} type="button" title="Manage images">
          {(listing.images ?? []).length > 0
            ? `${listing.images.length} image${listing.images.length !== 1 ? 's' : ''}`
            : '+ Images'}
        </button>
      </div>
    );
  }

  return (
    <div className={`${styles.tabbedRow} ${postStatus === 'error' ? styles.tabbedRowError : ''}`}>

      {/* ── Always visible: Status · Title · Description · Remove ── */}
      <div className={styles.line}>
        {statusCell}
        <div className={`${styles.field} ${styles.fieldWide}`} style={{ flex: 2, minWidth: 180 }}>
          <span className={styles.label}>Title</span>
          <input
            type="text"
            className={gridStyles.cellInput}
            value={listing.title}
            onChange={(e) => field('title', e.target.value)}
            placeholder="Listing title"
            maxLength={80}
            aria-label="Title"
          />
          <span className={gridStyles.charCount}>{listing.title.length}/80</span>
        </div>
        <div className={`${styles.field} ${styles.fieldWide}`}>
          <span className={styles.label}>Description</span>
          <textarea
            className={gridStyles.cellTextarea}
            value={listing.description}
            onChange={(e) => field('description', e.target.value)}
            placeholder="Item description"
            rows={2}
            aria-label="Description"
          />
        </div>
        <div className={styles.removeWrap}>
          <button className={gridStyles.btnRemove} onClick={() => onRemove(listing.id)} aria-label="Remove listing" title="Remove this row">
            &#x2715;
          </button>
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className={`${styles.line} ${styles.lineBorder}`}>
        {tabContent}
      </div>

    </div>
  );
}
