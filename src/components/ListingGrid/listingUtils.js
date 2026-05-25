export const KNOWN_TC_CATEGORY_IDS = new Set(['183050', '183454', '261328']);

export const CONDITIONS    = ['New', 'Used'];
export const LISTING_TYPES = [
  { value: 'BuyItNow', label: 'Buy It Now' },
  { value: 'Auction',  label: 'Auction' },
];
export const AUCTION_DAYS = [3, 5, 7, 10];

export function isTC(listing, tcCategoryIds) {
  return !!(
    listing.categoryId &&
    (KNOWN_TC_CATEGORY_IDS.has(listing.categoryId) || tcCategoryIds.has(listing.categoryId))
  );
}

export function getAspectsStatus(listing, cache) {
  if (!listing.categoryId) return 'none';
  if (!cache.has(listing.categoryId)) return 'uncached';
  const defs     = cache.get(listing.categoryId);
  const required = defs.filter((d) => d.aspectUsage === 'REQUIRED');
  if (required.length === 0) return 'complete';
  const allFilled = required.every((d) => {
    const v = listing.aspects?.[d.aspectName];
    return v && (Array.isArray(v) ? v.some(Boolean) : v.trim() !== '');
  });
  return allFilled ? 'complete' : 'incomplete';
}

// dotKey maps to CSS class names in ListingGrid.module.css (accessed via gridStyles[cfg.dotKey])
export const ASPECTS_STATUS_CONFIG = {
  none:       { dotKey: 'dotNone',       label: 'No category',      title: 'Select a category to fill in item specifics' },
  uncached:   { dotKey: 'dotUncached',   label: 'Click to load',    title: 'Click to load and fill item specifics' },
  incomplete: { dotKey: 'dotIncomplete', label: 'Specifics needed', title: 'Required item specifics are missing' },
  complete:   { dotKey: 'dotComplete',   label: 'Specifics done',   title: 'All required item specifics are filled' },
};
