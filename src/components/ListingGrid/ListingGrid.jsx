import React, { useEffect, useRef, useState } from 'react';
import { createEmptyListing, parseListingFile, exportListingsToExcel } from '../../utils/excelUtils.js';
import { createListing } from '../../services/ebayApi.js';
import { applyRules } from '../../utils/rulesEngine.js';
import CategorySelect from '../CategorySelect/CategorySelect.jsx';
import AspectsModal from '../AspectsModal/AspectsModal.jsx';
import ImageManagerModal from '../ImageManagerModal/ImageManagerModal.jsx';
import ShippingPicker from '../ShippingPicker/ShippingPicker.jsx';
import styles from './ListingGrid.module.css';

const CONDITIONS = ['New', 'Used'];
const LISTING_TYPES = [
  { value: 'BuyItNow', label: 'Buy It Now' },
  { value: 'Auction', label: 'Auction' },
];
const AUCTION_DAYS = [3, 5, 7, 10];

/**
 * Derive the aspects completion status for a single listing.
 * Requires the cached aspect definitions for the listing's category.
 * @param {object} listing
 * @param {Map} cache  — aspectsCache.current
 * @returns {'none'|'uncached'|'incomplete'|'complete'}
 */
function getAspectsStatus(listing, cache) {
  if (!listing.categoryId) return 'none';
  if (!cache.has(listing.categoryId)) return 'uncached';
  const defs = cache.get(listing.categoryId);
  const required = defs.filter((d) => d.aspectUsage === 'REQUIRED');
  if (required.length === 0) return 'complete';
  const allFilled = required.every((d) => {
    const v = listing.aspects?.[d.aspectName];
    return v && (Array.isArray(v) ? v.some(Boolean) : v.trim() !== '');
  });
  return allFilled ? 'complete' : 'incomplete';
}

const STATUS_CONFIG = {
  none:       { dot: styles.dotNone,       label: 'No category',       title: 'Select a category to fill in item specifics' },
  uncached:   { dot: styles.dotUncached,   label: 'Click to load',     title: 'Click to load and fill item specifics' },
  incomplete: { dot: styles.dotIncomplete, label: 'Specifics needed',  title: 'Required item specifics are missing' },
  complete:   { dot: styles.dotComplete,   label: 'Specifics done',    title: 'All required item specifics are filled' },
};

/**
 * ListingGrid
 * Props:
 *  listings: object[]
 *  onChange(listings: object[]) => void
 *  categories: { categoryId, categoryName, fullPath }[]
 *  categoryTreeId: string | null
 *  accessToken: string | null
 *  sandbox: bool
 */
export default function ListingGrid({
  listings,
  onChange,
  categories = [],
  categoryTreeId = null,
  shippingServices = [],
  fulfillmentPolicies = [],
  defaultLocation = '',
  defaultPostalCode = '',
  accessToken = null,
  sandbox = false,
  marketplace = 'EBAY_US',
  rules = [],
  aspectsCache,
  onOpenRulesManager,
}) {
  const [importErrors, setImportErrors] = useState([]);
  const [importStatus, setImportStatus] = useState('');
  const [aspectsListingId, setAspectsListingId] = useState(null);
  const [imageModalListingId, setImageModalListingId] = useState(null);
  const [isPostingAll, setIsPostingAll] = useState(false);
  const fileInputRef = useRef(null);
  const listingsRef = useRef(listings);
  useEffect(() => { listingsRef.current = listings; }, [listings]);

  function updateImages(listingId, images) {
    onChange(listings.map((l) => l.id !== listingId ? l : { ...l, images }));
  }

  // ── Auto-apply rules ────────────────────────────────────────────────────
  useEffect(() => {
    if (!rules.length) return;
    const next = listings.map((listing) => {
      if (!listing.categoryId) return listing;
      const ruleAspects = applyRules(rules, listing);
      if (Object.keys(ruleAspects).length === 0) return listing;
      return { ...listing, aspects: { ...ruleAspects, ...listing.aspects } };
    });
    const changed = next.some((l, i) => JSON.stringify(l.aspects) !== JSON.stringify(listings[i].aspects));
    if (changed) onChange(next);
  }, [listings, rules]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Row mutation helpers ─────────────────────────────────────────────────

  function addRow() {
    onChange([...listings, createEmptyListing()]);
  }

  function removeRow(id) {
    onChange(listings.filter((l) => l.id !== id));
  }

  function updateField(id, field, value) {
    onChange(
      listings.map((l) => {
        if (l.id !== id) return l;
        const updated = { ...l, [field]: value };
        if (field === 'listingType' && value !== 'Auction') {
          updated.auctionDays = '';
          updated.auctionStartPrice = '';
        }
        // Changing category clears aspects (they belong to the old category)
        if (field === 'categoryId') {
          updated.aspects = {};
        }
        return updated;
      })
    );
  }

  function updateCategory(id, categoryId, categoryName) {
    onChange(
      listings.map((l) =>
        l.id !== id ? l : { ...l, categoryId, categoryName, aspects: {} }
      )
    );
  }

  function updateAspects(id, aspects) {
    onChange(listings.map((l) => (l.id !== id ? l : { ...l, aspects })));
  }

  async function handlePost(id) {
    const listing = listings.find((l) => l.id === id);
    if (!listing || !accessToken) return;

    onChange(listings.map((l) => l.id !== id ? l : { ...l, postStatus: 'submitting', statusError: '' }));

    try {
      const { listingId } = await createListing(accessToken, listing, marketplace, sandbox, defaultLocation, defaultPostalCode);
      onChange(listings.map((l) => l.id !== id ? l : { ...l, postStatus: 'success', listingId }));
    } catch (e) {
      onChange(listings.map((l) => l.id !== id ? l : { ...l, postStatus: 'error', statusError: e.message }));
    }
  }

  async function handlePostAll() {
    if (!accessToken || isPostingAll) return;
    const pending = listings.filter((l) => l.postStatus === 'new' && l.title && l.categoryId);
    if (!pending.length) return;

    setIsPostingAll(true);

    // Mark all pending as submitting at once
    onChange(listingsRef.current.map((l) =>
      pending.some((p) => p.id === l.id) ? { ...l, postStatus: 'submitting', statusError: '' } : l
    ));

    // Post sequentially to avoid hammering the API
    for (const listing of pending) {
      try {
        const { listingId } = await createListing(accessToken, listing, marketplace, sandbox, defaultLocation, defaultPostalCode);
        onChange(listingsRef.current.map((l) => l.id !== listing.id ? l : { ...l, postStatus: 'success', listingId }));
      } catch (e) {
        onChange(listingsRef.current.map((l) => l.id !== listing.id ? l : { ...l, postStatus: 'error', statusError: e.message }));
      }
    }

    setIsPostingAll(false);
  }

  function clearAll() {
    if (listings.length > 0 && !window.confirm('Clear all listings?')) return;
    onChange([]);
    setImportErrors([]);
    setImportStatus('');
  }

  // ── Excel import ─────────────────────────────────────────────────────────

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImportErrors([]);
    setImportStatus('Parsing file...');
    try {
      const { listings: imported, errors } = await parseListingFile(file, categories, shippingServices);
      setImportErrors(errors);
      if (imported.length > 0) {
        onChange([...listings, ...imported]);
        setImportStatus(`Imported ${imported.length} listing${imported.length !== 1 ? 's' : ''} from "${file.name}".`);
      } else {
        setImportStatus('No listings found in file.');
      }
    } catch (err) {
      setImportErrors([err.message]);
      setImportStatus('');
    }
  }

  function handleExport() {
    exportListingsToExcel(listings);
  }

  const hasListings = listings.length > 0;
  const activeListingForModal = listings.find((l) => l.id === aspectsListingId) ?? null;
  const hasCategories = categories.length > 0;

  return (
    <section className={styles.section} id="listings">
      <div className={styles.container}>
        {/* ── Section header ── */}
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <span className={styles.stepBadge}>2</span>
            <h2>Listings</h2>
          </div>
          <p className={styles.subtitle}>
            Import listings from an Excel / CSV file or add rows manually. Download the{' '}
            <button className={styles.linkBtn} onClick={downloadTemplate}>
              template spreadsheet
            </button>{' '}
            to see the expected column format.
            {!hasCategories && (
              <span className={styles.noCategoryNote}>
                {' '}Connect to the eBay API (Step 1) to enable category selection and item specifics.
              </span>
            )}
          </p>
        </div>

        {/* ── Toolbar ── */}
        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft}>
            <button className={styles.btnPrimary} onClick={addRow}>+ Add Row</button>
            <button className={styles.btnOutline} onClick={() => fileInputRef.current?.click()}>
              Import Excel / CSV
            </button>
            <button className={styles.btnOutline} onClick={onOpenRulesManager}>
              Rules{rules.length > 0 ? ` (${rules.length})` : ''}
            </button>
            {hasListings && accessToken && (() => {
              const pendingCount = listings.filter((l) => l.postStatus === 'new' && l.title && l.categoryId).length;
              return pendingCount > 0 ? (
                <button
                  className={styles.btnPrimary}
                  onClick={handlePostAll}
                  disabled={isPostingAll}
                >
                  {isPostingAll ? 'Posting…' : `Post All (${pendingCount})`}
                </button>
              ) : null;
            })()}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              style={{ display: 'none' }}
              aria-hidden="true"
            />
          </div>
          <div className={styles.toolbarRight}>
            {hasListings && (
              <>
                <button className={styles.btnOutline} onClick={handleExport}>Export Excel</button>
                <button className={styles.btnDanger} onClick={clearAll}>Clear All</button>
              </>
            )}
          </div>
        </div>

        {/* ── Import feedback ── */}
        {importStatus && <div className={styles.alertInfo} role="status">{importStatus}</div>}
        {importErrors.length > 0 && (
          <div className={styles.alertWarning} role="alert">
            <strong>Import warnings:</strong>
            <ul>{importErrors.map((err, i) => <li key={i}>{err}</li>)}</ul>
          </div>
        )}

        {/* ── Grid ── */}
        {hasListings ? (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.colStatus}>Status</th>
                  <th className={styles.colTitle}>Title</th>
                  <th className={styles.colDescription}>Description</th>
                  <th className={styles.colCategory}>Category</th>
                  <th className={styles.colSpecifics}>Specifics</th>
                  <th className={styles.colDimension}>Qty</th>
                  <th className={styles.colCondition}>Condition</th>
                  <th className={styles.colType}>Listing Type</th>
                  <th className={styles.colBestOffer}>Price ($)</th>
                  <th className={styles.colAuctionStartPrice}>Start Price ($)</th>
                  <th className={styles.colAuctionDays}>Auction Days</th>
                  <th className={styles.colBestOffer}>Best Offer ($)</th>
                  <th className={styles.colShipPolicy}>Ship Policy</th>
                  <th className={styles.colShipping}>Shipping Method</th>
                  <th className={styles.colDimension}>L (in)</th>
                  <th className={styles.colDimension}>W (in)</th>
                  <th className={styles.colDimension}>H (in)</th>
                  <th className={styles.colDimension}>Lbs</th>
                  <th className={styles.colDimension}>Oz</th>
                  <th className={styles.colImages}>Images</th>
                  <th className={styles.colActions} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {listings.map((listing) => (
                  <ListingRow
                    key={listing.id}
                    listing={listing}
                    categories={categories}
                    shippingServices={shippingServices}
                    fulfillmentPolicies={fulfillmentPolicies}
                    aspectsCache={aspectsCache}
                    onUpdate={updateField}
                    onUpdateCategory={updateCategory}
                    onRemove={removeRow}
                    onOpenAspects={setAspectsListingId}
                    onPost={handlePost}
                    onOpenImages={() => setImageModalListingId(listing.id)}
                    hasCategories={hasCategories}
                    canPost={!!accessToken}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState onAdd={addRow} onImport={() => fileInputRef.current?.click()} />
        )}

        {hasListings && (
          <div className={styles.footer}>
            {listings.length} listing{listings.length !== 1 ? 's' : ''}
            {hasCategories && (() => {
              const complete = listings.filter((l) => getAspectsStatus(l, aspectsCache.current) === 'complete').length;
              const incomplete = listings.filter((l) => getAspectsStatus(l, aspectsCache.current) === 'incomplete').length;
              return incomplete > 0
                ? <span className={styles.footerWarn}> · {incomplete} with missing specifics</span>
                : complete > 0
                ? <span className={styles.footerOk}> · {complete} specifics complete</span>
                : null;
            })()}
          </div>
        )}
      </div>

      {/* ── Aspects modal ── */}
      {activeListingForModal && (
        <AspectsModal
          listing={activeListingForModal}
          accessToken={accessToken}
          categoryTreeId={categoryTreeId}
          sandbox={sandbox}
          aspectsCache={aspectsCache}
          onSave={(aspects) => updateAspects(activeListingForModal.id, aspects)}
          onClose={() => setAspectsListingId(null)}
        />
      )}

      {/* ── Image manager modal ── */}
      {imageModalListingId && (() => {
        const listing = listings.find((l) => l.id === imageModalListingId);
        if (!listing) return null;
        return (
          <ImageManagerModal
            images={listing.images ?? []}
            onChange={(images) => updateImages(imageModalListingId, images)}
            accessToken={accessToken}
            sandbox={sandbox}
            onClose={() => setImageModalListingId(null)}
          />
        );
      })()}
    </section>
  );
}

// ── ListingRow ────────────────────────────────────────────────────────────────

function ListingRow({ listing, categories, shippingServices, fulfillmentPolicies, aspectsCache, onUpdate, onUpdateCategory, onRemove, onOpenAspects, onPost, onOpenImages, hasCategories, canPost }) {
  const isAuction = listing.listingType === 'Auction';
  const aspectsStatus = getAspectsStatus(listing, aspectsCache.current);
  const statusCfg = STATUS_CONFIG[aspectsStatus];
  const { postStatus, listingId, statusError } = listing;

  function field(name, value) { onUpdate(listing.id, name, value); }

  return (
    <tr className={styles.row}>
      {/* Status */}
      <td className={styles.colStatus}>
        {postStatus === 'submitting' && (
          <div className={styles.statusSubmitting}>
            <span className={styles.statusSpinner} aria-hidden="true" />
            Posting…
          </div>
        )}
        {postStatus === 'success' && (
          <div className={styles.statusSuccess}>
            <span className={styles.statusBadge}>Listed</span>
            <span className={styles.statusId} title={listingId}>{listingId}</span>
          </div>
        )}
        {postStatus === 'error' && (
          <div className={styles.statusError}>
            <span className={styles.statusBadgeError}>Error</span>
            <span className={styles.statusMsg} title={statusError}>{statusError}</span>
            <button className={styles.retryBtn} onClick={() => onPost(listing.id)} disabled={!canPost}>
              Retry
            </button>
          </div>
        )}
        {postStatus === 'new' && (() => {
          const reason = !canPost ? 'Connect to eBay (Step 1)' : !listing.title ? 'Title required' : !listing.categoryId ? 'Category required' : null;
          return (
            <>
              <button
                className={styles.postBtn}
                onClick={() => onPost(listing.id)}
                disabled={!!reason}
              >
                Post to eBay
              </button>
              {reason && <span className={styles.postHint}>{reason}</span>}
            </>
          );
        })()}
      </td>

      {/* Title */}
      <td className={styles.colTitle}>
        <input
          type="text"
          className={styles.cellInput}
          value={listing.title}
          onChange={(e) => field('title', e.target.value)}
          placeholder="Listing title"
          maxLength={80}
          aria-label="Title"
        />
        <span className={styles.charCount}>{listing.title.length}/80</span>
      </td>

      {/* Description */}
      <td className={styles.colDescription}>
        <textarea
          className={styles.cellTextarea}
          value={listing.description}
          onChange={(e) => field('description', e.target.value)}
          placeholder="Item description"
          rows={2}
          aria-label="Description"
        />
      </td>

      {/* Category */}
      <td className={styles.colCategory}>
        {hasCategories ? (
          <CategorySelect
            categories={categories}
            value={listing.categoryId}
            onChange={(id, name) => onUpdateCategory(listing.id, id, name)}
          />
        ) : (
          <span className={styles.naText}>Connect API</span>
        )}
      </td>

      {/* Specifics status + button */}
      <td className={styles.colSpecifics}>
        <button
          className={`${styles.specificsBtn} ${styles[`specifics_${aspectsStatus}`]}`}
          onClick={() => listing.categoryId && onOpenAspects(listing.id)}
          disabled={!listing.categoryId}
          title={statusCfg.title}
          aria-label={statusCfg.title}
        >
          <span className={`${styles.dot} ${statusCfg.dot}`} aria-hidden="true" />
          <span className={styles.specificsLabel}>{statusCfg.label}</span>
        </button>
      </td>

      {/* Quantity */}
      <td className={styles.colDimension}>
        <input
          type="text"
          inputMode="numeric"
          className={styles.cellInput}
          value={listing.quantity}
          onChange={(e) => field('quantity', e.target.value.replace(/\D/g, ''))}
          aria-label="Quantity"
        />
      </td>

      {/* Condition */}
      <td className={styles.colCondition}>
        <select
          className={styles.cellSelect}
          value={listing.condition}
          onChange={(e) => field('condition', e.target.value)}
          aria-label="Condition"
        >
          {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </td>

      {/* Listing Type */}
      <td className={styles.colType}>
        <select
          className={styles.cellSelect}
          value={listing.listingType}
          onChange={(e) => field('listingType', e.target.value)}
          aria-label="Listing type"
        >
          {LISTING_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </td>

      {/* Price (BIN) */}
      <td className={styles.colBestOffer}>
        {!isAuction ? (
          <input
            type="text"
            inputMode="decimal"
            className={styles.cellInput}
            value={listing.price}
            onChange={(e) => field('price', e.target.value)}
            placeholder="0.00"
            aria-label="Buy It Now price"
          />
        ) : (
          <span className={styles.naText}>N/A</span>
        )}
      </td>

      {/* Auction Start Price */}
      <td className={styles.colAuctionStartPrice}>
        {isAuction ? (
          <input
            type="text"
            inputMode="decimal"
            className={styles.cellInput}
            value={listing.auctionStartPrice}
            onChange={(e) => field('auctionStartPrice', e.target.value)}
            placeholder="0.99"
            aria-label="Auction start price"
          />
        ) : (
          <span className={styles.naText}>N/A</span>
        )}
      </td>

      {/* Auction Days */}
      <td className={styles.colAuctionDays}>
        {isAuction ? (
          <select
            className={styles.cellSelect}
            value={listing.auctionDays}
            onChange={(e) => field('auctionDays', e.target.value)}
            aria-label="Auction duration in days"
          >
            <option value="">— days —</option>
            {AUCTION_DAYS.map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        ) : (
          <span className={styles.naText}>N/A</span>
        )}
      </td>

      {/* Best Offer */}
      <td className={styles.colBestOffer}>
        <input
          type="text"
          inputMode="decimal"
          className={styles.cellInput}
          value={listing.bestOffer}
          onChange={(e) => field('bestOffer', e.target.value)}
          placeholder="0.00"
          aria-label="Best offer amount"
        />
      </td>

      {/* Shipping Policy (business policies) */}
      <td className={styles.colShipPolicy}>
        {fulfillmentPolicies.length > 0 ? (
          <select
            className={styles.cellSelect}
            value={listing.fulfillmentPolicyId}
            onChange={(e) => field('fulfillmentPolicyId', e.target.value)}
            aria-label="Shipping policy"
          >
            <option value="">— auto (first) —</option>
            {fulfillmentPolicies.map((p) => (
              <option key={p.fulfillmentPolicyId} value={p.fulfillmentPolicyId}>
                {p.name}
              </option>
            ))}
          </select>
        ) : (
          <span className={styles.naText}>Connect API</span>
        )}
      </td>

      {/* Shipping Method */}
      <td className={styles.colShipping}>
        {shippingServices.length > 0 ? (
          <ShippingPicker
            shippingServices={shippingServices}
            value={listing.shippingService}
            onChange={(code) => field('shippingService', code)}
          />
        ) : (
          <span className={styles.naText}>Connect API</span>
        )}
      </td>

      {/* Dimensions */}
      <td className={styles.colDimension}>
        <input
          type="text"
          inputMode="numeric"
          className={styles.cellInput}
          value={listing.length}
          onChange={(e) => field('length', e.target.value.replace(/\D/g, ''))}
          placeholder="0"
          aria-label="Length (inches)"
        />
      </td>
      <td className={styles.colDimension}>
        <input
          type="text"
          inputMode="numeric"
          className={styles.cellInput}
          value={listing.width}
          onChange={(e) => field('width', e.target.value.replace(/\D/g, ''))}
          placeholder="0"
          aria-label="Width (inches)"
        />
      </td>
      <td className={styles.colDimension}>
        <input
          type="text"
          inputMode="numeric"
          className={styles.cellInput}
          value={listing.height}
          onChange={(e) => field('height', e.target.value.replace(/\D/g, ''))}
          placeholder="0"
          aria-label="Height (inches)"
        />
      </td>

      {/* Weight */}
      <td className={styles.colDimension}>
        <input
          type="text"
          inputMode="numeric"
          className={styles.cellInput}
          value={listing.weightLbs}
          onChange={(e) => field('weightLbs', e.target.value.replace(/\D/g, ''))}
          placeholder="0"
          aria-label="Weight pounds"
        />
      </td>
      <td className={styles.colDimension}>
        <input
          type="text"
          inputMode="numeric"
          className={styles.cellInput}
          value={listing.weightOz}
          onChange={(e) => field('weightOz', e.target.value.replace(/\D/g, ''))}
          placeholder="0"
          aria-label="Weight ounces"
        />
      </td>

      {/* Images */}
      <td className={styles.colImages}>
        <button
          className={styles.imagesBtn}
          onClick={onOpenImages}
          type="button"
          title="Manage images"
        >
          {(listing.images ?? []).length > 0
            ? `${listing.images.length} image${listing.images.length !== 1 ? 's' : ''}`
            : '+ Images'}
        </button>
      </td>

      {/* Remove */}
      <td className={styles.colActions}>
        <button
          className={styles.btnRemove}
          onClick={() => onRemove(listing.id)}
          aria-label="Remove listing"
          title="Remove this row"
        >
          &#x2715;
        </button>
      </td>
    </tr>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({ onAdd, onImport }) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon} aria-hidden="true">&#128230;</div>
      <h3>No listings yet</h3>
      <p>Add rows manually or import a spreadsheet to get started.</p>
      <div className={styles.emptyActions}>
        <button className={styles.btnPrimary} onClick={onAdd}>+ Add Row</button>
        <button className={styles.btnOutline} onClick={onImport}>Import Excel / CSV</button>
      </div>
    </div>
  );
}

// ── Template download ─────────────────────────────────────────────────────────

function downloadTemplate() {
  const sample = {
    ...createEmptyListing(),
    title: 'Sample Item Title',
    description: 'Sample item description',
    quantity: '1',
    condition: 'New',
    listingType: 'BuyItNow',
    auctionDays: '',
    bestOffer: '25.00',
  };
  exportListingsToExcel([sample], 'ebay_listings_template.xlsx');
}
