import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createEmptyListing, parseListingFile, exportListingsToExcel, generateTCTemplate } from '../../utils/excelUtils.js';
import { createListing, fetchAspectsForCategory, fetchConditionPolicies, fetchSellerListings } from '../../services/ebayApi.js';
import PriceLookupModal from '../PriceLookupModal/PriceLookupModal.jsx';
import { applyRules } from '../../utils/rulesEngine.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useSubscription } from '../../contexts/SubscriptionContext.jsx';
import useListingDefaults, { countDefaults, applyListingDefaults } from '../../hooks/useListingDefaults.js';
import { useLocalStorage } from '../../hooks/useLocalStorage.js';
import UsageBanner from '../UsageBanner/UsageBanner.jsx';
import CategorySelect from '../CategorySelect/CategorySelect.jsx';
import AspectsModal from '../AspectsModal/AspectsModal.jsx';
import TradingCardModal from '../TradingCardModal/TradingCardModal.jsx';
import ImageManagerModal from '../ImageManagerModal/ImageManagerModal.jsx';
import BulkImageModal from '../BulkImageModal/BulkImageModal.jsx';
import ShippingPicker from '../ShippingPicker/ShippingPicker.jsx';
import DefaultValuesModal from '../DefaultValuesModal/DefaultValuesModal.jsx';
import MultiLevelRow from './MultiLevelRow.jsx';
import TabbedRow from './TabbedRow.jsx';
import styles from './ListingGrid.module.css';

function StandardViewIcon() {
  return (
    <svg width="16" height="14" viewBox="0 0 16 14" fill="none" aria-hidden="true">
      <rect x="0.75" y="0.75" width="14.5" height="2.5" rx="0.75" fill="currentColor" opacity="0.5"/>
      <rect x="0.75" y="5.25" width="14.5" height="2" rx="0.75" fill="currentColor"/>
      <rect x="0.75" y="9.25" width="14.5" height="2" rx="0.75" fill="currentColor"/>
    </svg>
  );
}

function MultiLevelViewIcon() {
  return (
    <svg width="16" height="14" viewBox="0 0 16 14" fill="none" aria-hidden="true">
      <rect x="0.75" y="0.75" width="14.5" height="4.5" rx="1.25" stroke="currentColor" strokeWidth="1.25"/>
      <line x1="3" y1="3" x2="13" y2="3" stroke="currentColor" strokeWidth="0.75"/>
      <rect x="0.75" y="7.75" width="14.5" height="4.5" rx="1.25" stroke="currentColor" strokeWidth="1.25"/>
      <line x1="3" y1="10" x2="13" y2="10" stroke="currentColor" strokeWidth="0.75"/>
    </svg>
  );
}

function TabbedViewIcon() {
  return (
    <svg width="16" height="14" viewBox="0 0 16 14" fill="none" aria-hidden="true">
      <rect x="0.75" y="4.25" width="14.5" height="9" rx="1.25" stroke="currentColor" strokeWidth="1.25"/>
      <rect x="0.75" y="0.75" width="5.5" height="4.25" rx="1" fill="currentColor" opacity="0.75"/>
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="8.5" y1="8.5" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

/**
 * Client-side pre-flight validation before a listing is sent to the eBay API.
 * Returns an array of human-readable error strings, empty if valid.
 */
function validateListing(listing) {
  const issues = [];
  const isAuction = listing.listingType === 'Auction';

  // ── Price ──────────────────────────────────────────────────────────────────
  if (!isAuction) {
    const price = parseFloat(listing.price);
    if (!listing.price || isNaN(price) || price <= 0) {
      issues.push('Price is required and must be greater than $0');
    }
  } else {
    const start = parseFloat(listing.auctionStartPrice);
    if (!listing.auctionStartPrice || isNaN(start) || start <= 0) {
      issues.push('Auction start price is required and must be greater than $0');
    }
    if (!listing.auctionDays) {
      issues.push('Auction duration is required');
    }
  }

  // ── Quantity ───────────────────────────────────────────────────────────────
  const qty = parseInt(listing.quantity);
  if (!listing.quantity || isNaN(qty) || qty < 1) {
    issues.push('Quantity must be at least 1');
  }

  // ── Package dimensions — optional but must be all filled or all empty ────
  const dims    = ['length', 'width', 'height'];
  const missing = dims.filter((d) => !listing[d] || parseFloat(listing[d]) <= 0);
  if (missing.length > 0 && missing.length < dims.length) {
    issues.push(`Package dimensions must be all filled or all empty (missing: ${missing.join(', ')})`);
  }

  // ── Weight — required when a shipping method is set ───────────────────────
  if (listing.shippingService && !listing.weightLbs && !listing.weightOz) {
    issues.push('Package weight is required when a shipping method is selected (enter lbs and/or oz)');
  }

  // ── Images ─────────────────────────────────────────────────────────────────
  if (!listing.images || listing.images.length === 0) {
    issues.push('At least 1 image is required');
  }

  // ── Expired image sessions ─────────────────────────────────────────────────
  const expiredCount = (listing.images ?? []).filter((img) => img.error?.startsWith('SESSION_EXPIRED')).length;
  if (expiredCount > 0) {
    issues.push(`${expiredCount} image${expiredCount > 1 ? 's have' : ' has'} an expired session — remove and re-add ${expiredCount > 1 ? 'them' : 'it'}, or refresh the page`);
  }

  return issues;
}

const CONDITIONS = ['New', 'Used'];

// These three eBay category IDs always use the trading-card condition system
// (Graded / Ungraded) regardless of whether the API detection has run yet.
const KNOWN_TC_CATEGORY_IDS = new Set(['183050', '183454', '261328']);
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
  const { getAccessToken } = useAuth();
  const { usage, refresh: refreshUsage } = useSubscription();
  const maxImages = usage?.maxImages ?? 24;
  const { defaults, saveDefaults } = useListingDefaults();

  const [viewMode, setViewMode] = useLocalStorage(
    'listingGridViewMode',
    window.innerWidth < 768 ? 'multilevel' : 'standard'
  );
  const [activeTab, setActiveTab] = useLocalStorage('listingGridActiveTab', 'details');

  const [importErrors, setImportErrors] = useState([]);
  const [importStatus, setImportStatus] = useState('');
  const [aspectsListingId, setAspectsListingId] = useState(null);
  const [tcModalListingId, setTcModalListingId]     = useState(null);
  const [tcModalInitialType, setTcModalInitialType] = useState('');
  const [imageModalListingId, setImageModalListingId] = useState(null);
  const [priceLookupListingId, setPriceLookupListingId] = useState(null);
  const [bulkImageOpen, setBulkImageOpen] = useState(false);
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [isPostingAll, setIsPostingAll] = useState(false);
  const [scheduledTime] = useState(null); // reserved for future scheduled-posting feature
  // Set of categoryIds that have condition descriptors (trading card categories).
  // Pre-seeded with the 3 known TC parent IDs; API detection adds more (subcategories).
  const [tcCategoryIds, setTcCategoryIds] = useState(() => new Set(KNOWN_TC_CATEGORY_IDS));
  const policiesCache = useRef(new Map());
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
    onChange([...listings, applyListingDefaults(createEmptyListing(), defaults)]);
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
    if (categoryId) {
      checkConditionPolicies(categoryId);
      // Warm the aspects cache so the status dot updates without opening the modal
      prewarmAspects([categoryId]).then(() => {
        onChange([...listingsRef.current]);
      });
    }
  }

  function updateAspects(id, aspects) {
    onChange(listings.map((l) => (l.id !== id ? l : { ...l, aspects })));
  }

  function updateTradingCard(id, patch) {
    onChange(listings.map((l) => (l.id !== id ? l : { ...l, ...patch })));
  }

  /**
   * Set the TC condition type immediately when the user picks Graded/Ungraded
   * from the dropdown.  This ensures conditionId (2750 or 4000) is always on
   * the listing — even if the detail modal is cancelled — so the worker never
   * falls back to the invalid conditionId 1000 for TC categories.
   */
  function setTcConditionType(id, type) {
    onChange(listings.map((l) => {
      if (l.id !== id) return l;
      return {
        ...l,
        tcConditionType: type,
        conditionId:     type === 'graded' ? '2750' : '4000',
        // Clear stale label / descriptors when switching type
        tcConditionLabel:    '',
        conditionDescriptors: [],
        tcGrader:     '',
        tcGrade:      '',
        tcCertNumber: '',
        tcCardCondition: '',
      };
    }));
  }

  /** Open the TradingCardModal, optionally pre-selecting a condition type */
  function openTcModal(id, type = '') {
    setTcModalInitialType(type);
    setTcModalListingId(id);
  }

  /**
   * Fetch condition policies for a category, cache the result, and mark the
   * category as a trading card category if it has condition descriptors.
   */
  async function checkConditionPolicies(categoryId) {
    if (!categoryId || !accessToken || policiesCache.current.has(categoryId)) return;
    try {
      const data = await fetchConditionPolicies(accessToken, categoryId, marketplace, sandbox);
      policiesCache.current.set(categoryId, data);
      // eBay response: { itemConditionPolicies: [{ itemConditions: [...] }] }
      const itemConditions =
        data?.itemConditionPolicies?.[0]?.itemConditions ??
        data?.itemConditions ?? [];
      const hasDescriptors = itemConditions.some(
        (c) => c.conditionDescriptors?.length > 0
      );
      if (hasDescriptors) {
        setTcCategoryIds((prev) => new Set([...prev, categoryId]));
      }
    } catch {
      // not a TC category or API error — silently ignore
    }
  }

  async function fetchActiveTitles() {
    const titles = new Set();
    let page = 1;
    try {
      while (true) {
        const data = await fetchSellerListings(accessToken, sandbox, page);
        (data.listings ?? []).forEach((l) => {
          if (l.title) titles.add(l.title.toLowerCase().trim());
        });
        if (page >= (data.totalPages ?? 1)) break;
        page++;
      }
    } catch {
      // eBay API unavailable — fail-open so posting isn't permanently blocked
    }
    return titles;
  }

  async function handlePost(id) {
    const listing = listings.find((l) => l.id === id);
    if (!listing || !accessToken) return;

    const isRevision = !!listing.listingId;

    // Show spinner immediately so the user sees feedback during the live check
    onChange(listings.map((l) => l.id !== id ? l : { ...l, postStatus: 'submitting', statusError: '' }));

    // Live duplicate check against active eBay listings — new listings only
    if (!isRevision) {
      const activeTitles = await fetchActiveTitles();
      if (activeTitles.has(listing.title.toLowerCase().trim())) {
        onChange(listingsRef.current.map((l) => l.id !== id ? l : {
          ...l,
          postStatus: 'error',
          statusError: 'Duplicate: a listing with this title is already active on eBay.',
        }));
        return;
      }
    }

    // Client-side validation
    const issues = validateListing(listing);
    if (issues.length) {
      onChange(listingsRef.current.map((l) => l.id !== id ? l : { ...l, postStatus: 'error', statusError: issues.join(' · ') }));
      return;
    }

    const schedUtc = (!isRevision && scheduledTime) ? scheduledTime.toISOString() : null;
    const payload  = schedUtc ? { ...listing, scheduledTime: schedUtc } : listing;

    try {
      const supabaseToken = await getAccessToken();
      const result = await createListing(accessToken, payload, marketplace, sandbox, defaultLocation, defaultPostalCode, supabaseToken);
      if (schedUtc && result._debug) console.log('[schedule debug]', result._debug);
      const { listingId } = result;
      const newStatus = isRevision ? 'updated' : (schedUtc ? 'scheduled' : 'success');
      onChange(listingsRef.current.map((l) => l.id !== id ? l : { ...l, postStatus: newStatus, listingId, ...(schedUtc ? { postedScheduledTime: schedUtc } : {}) }));
      if (!isRevision) refreshUsage();
    } catch (e) {
      const errMsg = e.message === 'limit_reached'
        ? 'Monthly listing limit reached. Upgrade your plan to continue posting.'
        : e.message;
      onChange(listingsRef.current.map((l) => l.id !== id ? l : { ...l, postStatus: 'error', statusError: errMsg }));
    }
  }

  async function handlePostAll() {
    if (!accessToken || isPostingAll) return;
    const pending = listings.filter((l) => l.postStatus === 'new' && l.title && l.categoryId);
    if (!pending.length) return;

    setIsPostingAll(true);
    const schedUtc = scheduledTime ? scheduledTime.toISOString() : null;
    const supabaseToken = await getAccessToken();

    // Fetch all active eBay listing titles once for the whole batch
    const activeTitles = await fetchActiveTitles();

    for (const listing of pending) {
      const isRevision = !!listing.listingId;

      // Live duplicate check — only for new listings
      if (!isRevision && activeTitles.has(listing.title.toLowerCase().trim())) {
        onChange(listingsRef.current.map((l) => l.id !== listing.id ? l : {
          ...l,
          postStatus: 'error',
          statusError: 'Duplicate: a listing with this title is already active on eBay.',
        }));
        continue;
      }

      // Validate before touching status — skip with error if invalid
      const issues = validateListing(listing);
      if (issues.length) {
        onChange(listingsRef.current.map((l) => l.id !== listing.id ? l : { ...l, postStatus: 'error', statusError: issues.join(' · ') }));
        continue;
      }

      // Mark only this listing as submitting, then wait for it to finish
      onChange(listingsRef.current.map((l) => l.id !== listing.id ? l : { ...l, postStatus: 'submitting', statusError: '' }));

      const payload = schedUtc ? { ...listing, scheduledTime: schedUtc } : listing;
      try {
        const { listingId } = await createListing(accessToken, payload, marketplace, sandbox, defaultLocation, defaultPostalCode, supabaseToken);
        const newStatus = schedUtc ? 'scheduled' : 'success';
        onChange(listingsRef.current.map((l) => l.id !== listing.id ? l : { ...l, postStatus: newStatus, listingId, ...(schedUtc ? { postedScheduledTime: schedUtc } : {}) }));
      } catch (e) {
        const errMsg = e.message === 'limit_reached'
          ? 'Monthly listing limit reached. Upgrade your plan to continue posting.'
          : e.message;
        onChange(listingsRef.current.map((l) => l.id !== listing.id ? l : { ...l, postStatus: 'error', statusError: errMsg }));
        if (e.message === 'limit_reached') break;
      }
    }
    refreshUsage();
    setIsPostingAll(false);
  }

  function clearAll() {
    if (listings.length > 0 && !window.confirm('Clear all listings?')) return;
    onChange([]);
    setImportErrors([]);
    setImportStatus('');
  }

  // ── Aspects pre-fetch ────────────────────────────────────────────────────
  // Silently warms the cache for a set of category IDs so the status
  // indicator and footer count are accurate without opening each modal.

  async function prewarmAspects(categoryIds) {
    if (!accessToken || !categoryTreeId) return;
    const uncached = [...new Set(categoryIds)].filter(
      (id) => id && !aspectsCache.current.has(id)
    );
    await Promise.all(
      uncached.map(async (id) => {
        try {
          const defs = await fetchAspectsForCategory(accessToken, categoryTreeId, id, sandbox);
          aspectsCache.current.set(id, defs);
        } catch {
          // leave uncached — user can open the modal manually
        }
      })
    );
  }

  // ── Prewarm cache on page load / reconnect ───────────────────────────────
  // When listings are restored from localStorage after a refresh the in-memory
  // aspectsCache is empty, so every row shows "Click to load". Fire prewarm
  // as soon as an access token is available and force a re-render afterwards.
  useEffect(() => {
    const categoryIds = listings.map((l) => l.categoryId).filter(Boolean);
    if (!categoryIds.length) return;
    prewarmAspects(categoryIds).then(() => {
      onChange([...listings]);          // shallow copy triggers re-render so dots update
    });
  }, [accessToken, categoryTreeId]);   // eslint-disable-line react-hooks/exhaustive-deps

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
        const withDefaults = imported.map((l) => applyListingDefaults(l, defaults));
        const merged = [...listings, ...withDefaults];
        onChange(merged);
        setImportStatus(`Imported ${imported.length} listing${imported.length !== 1 ? 's' : ''} from "${file.name}".`);
        // Pre-fetch aspects for all imported categories so status shows immediately
        const categoryIds = imported.map((l) => l.categoryId).filter(Boolean);
        if (categoryIds.length) {
          await prewarmAspects(categoryIds);
          // Check condition policies (TC detection) in background — no await needed
          categoryIds.forEach((id) => checkConditionPolicies(id));
          // Trigger a re-render so the status dots update — use captured merged
          // array, not listingsRef.current, which may be stale when categories
          // were already cached and prewarmAspects returned synchronously.
          onChange([...merged]);
        }
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

  function applyDefaultsToAll() {
    const d = defaults;
    const next = listings.map((listing) => {
      const patch = {};
      if (d.categoryId) {
        patch.categoryId   = d.categoryId;
        patch.categoryName = d.categoryName || '';
        if (listing.categoryId !== d.categoryId) patch.aspects = {};
      }
      if (d.fulfillmentPolicyId) patch.fulfillmentPolicyId = d.fulfillmentPolicyId;
      if (d.shippingService)     patch.shippingService     = d.shippingService;
      if (d.length    !== '') patch.length    = d.length;
      if (d.width     !== '') patch.width     = d.width;
      if (d.height    !== '') patch.height    = d.height;
      if (d.weightLbs !== '') patch.weightLbs = d.weightLbs;
      if (d.weightOz  !== '') patch.weightOz  = d.weightOz;
      return Object.keys(patch).length ? { ...listing, ...patch } : listing;
    });
    onChange(next);
    if (d.categoryId) {
      prewarmAspects([d.categoryId]).then(() => onChange([...listingsRef.current]));
    }
  }

  const hasListings = listings.length > 0;
  const activeListingForModal = listings.find((l) => l.id === aspectsListingId) ?? null;
  const tcModalListing = listings.find((l) => l.id === tcModalListingId) ?? null;
  const hasCategories = categories.length > 0;

  return (
    <section className={styles.section} id="listings">
      <div className={styles.container}>

        {/* ── eBay not connected overlay ── */}
        {!accessToken && (
          <div className={styles.lockedOverlay}>
            <div className={styles.lockedBox}>
              <div className={styles.lockedIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h3 className={styles.lockedTitle}>Authorize eBay to Unlock Your Workspace</h3>
              <p className={styles.lockedText}>Complete Step 1 above to unlock your listing workspace.</p>
              <a
                href="#oauth"
                className={styles.lockedBtn}
                onClick={(e) => { e.preventDefault(); document.getElementById('oauth')?.scrollIntoView({ behavior: 'smooth' }); }}
              >
                ↑ Go to Step 1
              </a>
            </div>
          </div>
        )}

        {/* ── Section header ── */}
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <span className={styles.stepBadge}>2</span>
            <h2>Listings</h2>
          </div>
          <p className={styles.subtitle}>
            Import listings from an Excel / CSV file or add rows manually. Download the{' '}
            <button className={styles.linkBtn} onClick={downloadTemplate}>
              standard template
            </button>{' '}
            or the{' '}
            <button className={styles.linkBtn} onClick={generateTCTemplate}>
              trading card template
            </button>{' '}
            to see the expected column format.
            {!hasCategories && (
              <span className={styles.noCategoryNote}>
                {' '}Connect to the eBay API (Step 1) to enable category selection and item specifics.
              </span>
            )}
          </p>
        </div>

        {/* ── Usage banner (shown when signed in) ── */}
        <UsageBanner />

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
            <button className={styles.btnOutline} onClick={() => setDefaultsOpen(true)}>
              Defaults{countDefaults(defaults) > 0 ? ` (${countDefaults(defaults)})` : ''}
            </button>
            {hasListings && accessToken && (
              <button className={styles.btnOutline} onClick={() => setBulkImageOpen(true)}>
                Bulk Attach Images
              </button>
            )}
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
            <div className={styles.viewToggle}>
              <button
                title="Standard view"
                className={`${styles.viewBtn} ${viewMode === 'standard' ? styles.viewBtnActive : ''}`}
                onClick={() => setViewMode('standard')}
              >
                <StandardViewIcon />
              </button>
              <button
                title="Multi-level view"
                className={`${styles.viewBtn} ${viewMode === 'multilevel' ? styles.viewBtnActive : ''}`}
                onClick={() => setViewMode('multilevel')}
              >
                <MultiLevelViewIcon />
              </button>
              <button
                title="Tabbed view"
                className={`${styles.viewBtn} ${viewMode === 'tabbed' ? styles.viewBtnActive : ''}`}
                onClick={() => setViewMode('tabbed')}
              >
                <TabbedViewIcon />
              </button>
            </div>
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
        {viewMode === 'standard' && (
          hasListings ? (
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
                    <th className={styles.colDimension}>Length (in)</th>
                    <th className={styles.colDimension}>Width (in)</th>
                    <th className={styles.colDimension}>Height (in)</th>
                    <th className={styles.colWeight}>Pounds</th>
                    <th className={styles.colWeight}>Ounces</th>
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
                      tcCategoryIds={tcCategoryIds}
                      onUpdate={updateField}
                      onUpdateCategory={updateCategory}
                      onRemove={removeRow}
                      onOpenAspects={setAspectsListingId}
                      onSetTcType={setTcConditionType}
                      onOpenTcModal={openTcModal}
                      onPost={handlePost}
                      onOpenImages={() => setImageModalListingId(listing.id)}
                      onOpenPriceLookup={setPriceLookupListingId}
                      hasCategories={hasCategories}
                      canPost={!!accessToken}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState onAdd={addRow} onImport={() => fileInputRef.current?.click()} />
          )
        )}

        {viewMode === 'multilevel' && (
          <div className={styles.mlContainer}>
            {listings.map((listing) => (
              <MultiLevelRow
                key={listing.id}
                listing={listing}
                categories={categories}
                shippingServices={shippingServices}
                fulfillmentPolicies={fulfillmentPolicies}
                aspectsCache={aspectsCache}
                tcCategoryIds={tcCategoryIds}
                onUpdate={updateField}
                onUpdateCategory={updateCategory}
                onRemove={removeRow}
                onOpenAspects={setAspectsListingId}
                onSetTcType={setTcConditionType}
                onOpenTcModal={openTcModal}
                onPost={handlePost}
                onOpenImages={() => setImageModalListingId(listing.id)}
                onOpenPriceLookup={setPriceLookupListingId}
                hasCategories={hasCategories}
                canPost={!!accessToken}
              />
            ))}
            {!hasListings && <EmptyState onAdd={addRow} onImport={() => fileInputRef.current?.click()} />}
          </div>
        )}

        {viewMode === 'tabbed' && (
          <div className={styles.tabbedContainer}>
            <TabBar activeTab={activeTab} onChange={setActiveTab} />
            {listings.map((listing) => (
              <TabbedRow
                key={listing.id}
                listing={listing}
                activeTab={activeTab}
                categories={categories}
                shippingServices={shippingServices}
                fulfillmentPolicies={fulfillmentPolicies}
                aspectsCache={aspectsCache}
                tcCategoryIds={tcCategoryIds}
                onUpdate={updateField}
                onUpdateCategory={updateCategory}
                onRemove={removeRow}
                onOpenAspects={setAspectsListingId}
                onSetTcType={setTcConditionType}
                onOpenTcModal={openTcModal}
                onPost={handlePost}
                onOpenImages={() => setImageModalListingId(listing.id)}
                onOpenPriceLookup={setPriceLookupListingId}
                hasCategories={hasCategories}
                canPost={!!accessToken}
              />
            ))}
            {!hasListings && <EmptyState onAdd={addRow} onImport={() => fileInputRef.current?.click()} />}
          </div>
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

      {/* ── Trading card condition modal ── */}
      {tcModalListing && (
        <TradingCardModal
          listing={tcModalListing}
          initialType={tcModalInitialType}
          accessToken={accessToken}
          marketplaceId={marketplace}
          sandbox={sandbox}
          policiesCache={policiesCache}
          onSave={(patch) => updateTradingCard(tcModalListing.id, patch)}
          onClose={() => { setTcModalListingId(null); setTcModalInitialType(''); }}
        />
      )}

      {/* ── Default values modal ── */}
      {defaultsOpen && (
        <DefaultValuesModal
          defaults={defaults}
          onSave={saveDefaults}
          categories={categories}
          fulfillmentPolicies={fulfillmentPolicies}
          shippingServices={shippingServices}
          onPrewarm={(ids) => prewarmAspects(ids).then(() => onChange([...listingsRef.current]))}
          onApplyToAll={applyDefaultsToAll}
          listingCount={listings.length}
          onClose={() => setDefaultsOpen(false)}
        />
      )}

      {/* ── Bulk image modal ── */}
      {bulkImageOpen && (
        <BulkImageModal
          listings={listings}
          onChange={(updatedListings) => onChange(updatedListings)}
          accessToken={accessToken}
          sandbox={sandbox}
          maxImages={maxImages}
          onClose={() => setBulkImageOpen(false)}
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
            maxImages={maxImages}
            onClose={() => setImageModalListingId(null)}
          />
        );
      })()}

      {/* ── Price lookup modal ── */}
      {priceLookupListingId && (() => {
        const listing = listings.find((l) => l.id === priceLookupListingId);
        if (!listing) return null;
        return (
          <PriceLookupModal
            listing={listing}
            sandbox={sandbox}
            onSelectPrice={(price) => updateField(priceLookupListingId, 'price', price)}
            onClose={() => setPriceLookupListingId(null)}
          />
        );
      })()}
    </section>
  );
}

// ── ErrorMsg — tooltip rendered via portal to escape overflow clipping ────────

function ErrorMsg({ message }) {
  const [pos, setPos] = useState(null);
  const ref = useRef(null);

  function handleMouseEnter() {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ x: rect.left, y: rect.bottom + 6 });
  }

  function handleMouseLeave() {
    setPos(null);
  }

  return (
    <span
      ref={ref}
      className={styles.statusMsg}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {message}
      {pos && createPortal(
        <div
          className={styles.errorTooltip}
          style={{ top: pos.y, left: pos.x }}
        >
          {message}
        </div>,
        document.body
      )}
    </span>
  );
}

// ── ListingRow ────────────────────────────────────────────────────────────────

function ListingRow({ listing, categories, shippingServices, fulfillmentPolicies, aspectsCache, tcCategoryIds, onUpdate, onUpdateCategory, onRemove, onOpenAspects, onSetTcType, onOpenTcModal, onPost, onOpenImages, onOpenPriceLookup, hasCategories, canPost }) {
  const isAuction = listing.listingType === 'Auction';
  const aspectsStatus = getAspectsStatus(listing, aspectsCache.current);
  const statusCfg = STATUS_CONFIG[aspectsStatus];
  const { postStatus, listingId, statusError } = listing;
  // Known TC parent IDs always trigger the TC UI; API-discovered IDs extend this.
  const isTcCategory = listing.categoryId &&
    (KNOWN_TC_CATEGORY_IDS.has(listing.categoryId) || tcCategoryIds.has(listing.categoryId));

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
        {(postStatus === 'success' || postStatus === 'updated') && (
          <div className={styles.statusSuccess}>
            <span className={styles.statusBadge}>{postStatus === 'updated' ? 'Updated' : 'Listed'}</span>
            <span className={styles.statusId} title={listingId}>{listingId}</span>
            <button className={styles.retryBtn} onClick={() => onPost(listing.id)} disabled={!canPost}>
              Update
            </button>
          </div>
        )}
        {postStatus === 'scheduled' && (
          <div className={styles.statusScheduled}>
            <span className={styles.statusBadgeScheduled}>Scheduled</span>
            <span className={styles.statusId} title={listingId}>{listingId}</span>
            {listing.postedScheduledTime && (
              <span className={styles.scheduledFor}>
                {new Date(listing.postedScheduledTime).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
          </div>
        )}
        {postStatus === 'error' && (
          <div className={styles.statusError}>
            <span className={styles.statusBadgeError}>Error</span>
            <ErrorMsg message={statusError} />
            <button className={styles.retryBtn} onClick={() => onPost(listing.id)} disabled={!canPost}>
              Retry
            </button>
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
        {isTcCategory ? (
          <>
            {/* Trading card categories: Graded / Ungraded instead of New / Used */}
            <select
              className={styles.cellSelect}
              value={listing.tcConditionType || ''}
              onChange={(e) => {
                const type = e.target.value;
                if (!type) return;
                // If the type is CHANGING, clear stale data first then open modal.
                // If the user re-selects the same type (e.g. accidentally clicks
                // "Graded" on an already-graded imported row), just open the modal
                // to let them review/edit without wiping the existing descriptors.
                if (type !== listing.tcConditionType) {
                  onSetTcType(listing.id, type);
                }
                onOpenTcModal(listing.id, type);
              }}
              aria-label="Card condition type"
            >
              <option value="">— Select type —</option>
              <option value="graded">Graded</option>
              <option value="ungraded">Ungraded</option>
            </select>
            {listing.tcConditionLabel ? (
              <button
                type="button"
                className={`${styles.imagesBtn} ${styles.tcBtnFilled}`}
                style={{ marginTop: '0.3rem' }}
                onClick={() => onOpenTcModal(listing.id, listing.tcConditionType)}
                title="Edit card grade / condition details"
              >
                {listing.tcConditionLabel}
              </button>
            ) : listing.tcConditionType ? (
              <button
                type="button"
                className={styles.imagesBtn}
                style={{ marginTop: '0.3rem' }}
                onClick={() => onOpenTcModal(listing.id, listing.tcConditionType)}
                title="Add grade / condition details"
              >
                + Add details
              </button>
            ) : null}
          </>
        ) : (
          <select
            className={styles.cellSelect}
            value={listing.condition}
            onChange={(e) => field('condition', e.target.value)}
            aria-label="Condition"
          >
            {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </td>

      {/* Listing Type */}
      <td className={styles.colType}>
        <select
          className={styles.cellSelect}
          value={listing.listingType}
          onChange={(e) => field('listingType', e.target.value)}
          aria-label="Listing type"
          disabled={!!listing.listingId}
        >
          {LISTING_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </td>

      {/* Price (BIN) */}
      <td className={styles.colBestOffer}>
        {!isAuction ? (
          <div className={styles.priceCell}>
            <input
              type="text"
              inputMode="decimal"
              className={`${styles.cellInput} ${listing.title ? styles.cellInputWithIcon : ''}`}
              value={listing.price}
              onChange={(e) => field('price', e.target.value)}
              placeholder="0.00"
              aria-label="Buy It Now price"
            />
            {listing.title && (
              <button className={styles.priceLookupBtn} onClick={() => onOpenPriceLookup(listing.id)} title="Look up recent sold prices">
                <SearchIcon />
              </button>
            )}
          </div>
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

// ── TabBar ────────────────────────────────────────────────────────────────────

function TabBar({ activeTab, onChange }) {
  const tabs = [
    { key: 'details',  label: 'Details' },
    { key: 'pricing',  label: 'Pricing' },
    { key: 'shipping', label: 'Shipping' },
    { key: 'images',   label: 'Images' },
  ];
  return (
    <div className={styles.tabBar}>
      {tabs.map(({ key, label }) => (
        <button
          key={key}
          className={`${styles.tabBtn} ${activeTab === key ? styles.tabBtnActive : ''}`}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Template download ─────────────────────────────────────────────────────────

function downloadTemplate() {
  const sample = {
    ...createEmptyListing(),
    title: 'SDCC 2022 Funko Pop Star Wars Official \'Hall H\' Ahsoka 464 - LE 500',
    description: 'The SDCC 2022 Funko Pop Star Wars Official \'Hall H\' Ahsoka 464 is a limited edition bobblehead collector\'s item featuring the character Ahsoka Tano from the Star Wars series. Produced by Funko, this Pop! Vinyl model is part of the exclusive 2022 release. With only 500 units available, this Ahsoka Funko Pop Star is a highly sought-after item for collectors and fans of the iconic character.',
    category: 'Collectible Figures & Bobbleheads',
    //categoryId: '149372', //'Collectible Figures & Bobbleheads', 
    condition: 'New',
    listingType: 'BuyItNow',
    price: '799.99',    
    bestOffer: '749.99',
    shippingService: 'USPS Ground Advantage',
    length: '8',
    width: '8',
    height: '4',
    weightLbs: '0',
    weightOz: '12'
  };
  exportListingsToExcel([sample], 'ebay_listings_template.xlsx');
}
