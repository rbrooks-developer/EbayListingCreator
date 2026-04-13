import * as XLSX from 'xlsx';
import {
  GRADER_OPTIONS,
  GRADE_OPTIONS,
  CARD_COND_OPTIONS,
  resolveDescriptorId,
  descriptorLabel,
} from './tcDescriptors.js';

/**
 * Column header aliases — maps spreadsheet header names to
 * internal listing field keys (case-insensitive).
 */
const HEADER_MAP = {
  // Title
  'title':                 'title',
  'listing title':         'title',
  // Description
  'description':           'description',
  'desc':                  'description',
  // Category
  'category':              'categoryName',
  'category name':         'categoryName',
  // Quantity
  'quantity':              'quantity',
  'qty':                   'quantity',
  'quantity available':    'quantity',
  // Condition
  'condition':             'condition',
  'item condition':        'condition',
  // Listing type
  'listing type':          'listingType',
  'type':                  'listingType',
  'format':                'listingType',
  // Prices
  'buy it now price':      'price',
  'price':                 'price',
  'auction start price':   'auctionStartPrice',
  'start price':           'auctionStartPrice',
  'best offer price':      'bestOffer',
  'best offer':            'bestOffer',
  'best offer amount':     'bestOffer',
  // Auction
  'auction days':          'auctionDays',
  'auction length':        'auctionDays',
  'duration':              'auctionDays',
  // Shipping
  'shipping method':       'shippingService',
  'shipping service':      'shippingService',
  'ship method':           'shippingService',
  // Dimensions
  'length':                'length',
  'length (in)':           'length',
  'width':                 'width',
  'width (in)':            'width',
  'height':                'height',
  'height (in)':           'height',
  // Weight
  'weight pounds':         'weightLbs',
  'lbs':                   'weightLbs',
  'weight lbs':            'weightLbs',
  'weight ounces':         'weightOz',
  'oz':                    'weightOz',
  'weight oz':             'weightOz',
  // Images
  'image url':             'imageUrl',
  'image':                 'imageUrl',
  'images':                'imageUrl',
  'photo url':             'imageUrl',
  // Trading card — condition type
  'tc condition type':     'tcConditionType',
  'condition type':        'tcConditionType',
  'graded/ungraded':       'tcConditionType',
  // Trading card — condition descriptors
  'tc grader':             'tcGrader',
  'grader':                'tcGrader',
  'grading company':       'tcGrader',
  'tc grade':              'tcGrade',
  'grade':                 'tcGrade',
  'tc cert number':        'tcCertNumber',
  'cert number':           'tcCertNumber',
  'cert #':                'tcCertNumber',
  'certification number':  'tcCertNumber',
  'tc card condition':     'tcCardCondition',
  'card condition':        'tcCardCondition',
};

const CONDITION_MAP = {
  new: 'New',
  used: 'Used',
};

const LISTING_TYPE_MAP = {
  'buy it now':  'BuyItNow',
  'buyitnow':    'BuyItNow',
  'bin':         'BuyItNow',
  'fixed price': 'BuyItNow',
  'auction':     'Auction',
};

const VALID_AUCTION_DAYS = [3, 5, 7, 10];

/**
 * eBay's three trading card parent categories are not leaf nodes, so they
 * never appear in the downloaded taxonomy array. Map common name aliases
 * directly to their category IDs so imports work without the taxonomy lookup.
 */
const TC_CATEGORY_ALIASES = {
  // 261328 — Sports Trading Cards
  'sports trading cards':                      { categoryId: '261328', categoryName: 'Sports Trading Cards' },
  'sports cards':                              { categoryId: '261328', categoryName: 'Sports Trading Cards' },
  'trading cards - sports':                    { categoryId: '261328', categoryName: 'Sports Trading Cards' },
  // 183050 — Non-Sport Trading Cards
  'non-sport trading cards':                   { categoryId: '183050', categoryName: 'Non-Sport Trading Cards' },
  'non sport trading cards':                   { categoryId: '183050', categoryName: 'Non-Sport Trading Cards' },
  'non-sports trading cards':                  { categoryId: '183050', categoryName: 'Non-Sport Trading Cards' },
  'nonsport trading cards':                    { categoryId: '183050', categoryName: 'Non-Sport Trading Cards' },
  // 183454 — Collectible Card Games / MTG / Pokemon
  'collectible card games/mtg':                { categoryId: '183454', categoryName: 'Collectible Card Games/MTG' },
  'collectible card games & supplies':         { categoryId: '183454', categoryName: 'Collectible Card Games/MTG' },
  'collectible card games and supplies':       { categoryId: '183454', categoryName: 'Collectible Card Games/MTG' },
  'collectible card games':                    { categoryId: '183454', categoryName: 'Collectible Card Games/MTG' },
  'ccg':                                       { categoryId: '183454', categoryName: 'Collectible Card Games/MTG' },
  'mtg':                                       { categoryId: '183454', categoryName: 'Collectible Card Games/MTG' },
  'magic the gathering':                       { categoryId: '183454', categoryName: 'Collectible Card Games/MTG' },
  'pokemon':                                   { categoryId: '183454', categoryName: 'Collectible Card Games/MTG' },
  'pokemon cards':                             { categoryId: '183454', categoryName: 'Collectible Card Games/MTG' },
};

/**
 * Parse an uploaded Excel or CSV file and return an array of listing objects.
 * @param {File} file
 * @param {object[]} categories        — [{ categoryId, categoryName, fullPath }]
 * @param {object[]} shippingServices  — [{ serviceCode, serviceName }]
 * @returns {Promise<{listings: object[], errors: string[]}>}
 */
export function parseListingFile(file, categories = [], shippingServices = []) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (rows.length < 2) {
          resolve({ listings: [], errors: ['Spreadsheet has no data rows.'] });
          return;
        }

        const rawHeaders = rows[0].map((h) => String(h).trim().toLowerCase());
        const fieldKeys = rawHeaders.map((h) => HEADER_MAP[h] ?? null);

        const errors = [];
        const listings = [];

        rows.slice(1).forEach((row, rowIdx) => {
          // Skip completely empty rows
          if (row.every((cell) => String(cell).trim() === '')) return;

          const lineNum = rowIdx + 2;
          const entry = createEmptyListing();

          fieldKeys.forEach((key, colIdx) => {
            if (!key) return;
            const raw = String(row[colIdx] ?? '').trim();

            // Image URLs get converted to the images array format
            if (key === 'imageUrl') {
              if (raw) {
                entry.images = raw.split(/[,;|]/).map((url) => url.trim()).filter(Boolean).map((url) => ({
                  id:         crypto.randomUUID(),
                  name:       url.split('/').pop() || 'image',
                  previewUrl: url,
                  ebayUrl:    url,
                  status:     'ready',
                  error:      '',
                }));
              }
              return;
            }

            entry[key] = raw;
          });

          // Normalize condition
          const condLower = entry.condition.toLowerCase();
          entry.condition = CONDITION_MAP[condLower] ?? (entry.condition || 'New');

          // Normalize listing type
          const typeLower = entry.listingType.toLowerCase().replace(/\s+/g, ' ').trim();
          entry.listingType = LISTING_TYPE_MAP[typeLower] ?? (entry.listingType || 'BuyItNow');

          // Normalize auction days
          if (entry.auctionDays !== '') {
            const days = parseInt(entry.auctionDays, 10);
            if (!VALID_AUCTION_DAYS.includes(days)) {
              errors.push(`Row ${lineNum}: Auction Days "${entry.auctionDays}" is not valid (must be 3, 5, 7, or 10).`);
            }
            entry.auctionDays = String(days);
          }

          // Normalize quantity
          if (entry.quantity !== '') {
            const qty = parseInt(entry.quantity, 10);
            if (isNaN(qty) || qty < 1) {
              errors.push(`Row ${lineNum}: Quantity "${entry.quantity}" must be a positive integer.`);
            }
            entry.quantity = String(Math.max(1, qty || 1));
          }

          // Resolve category name → categoryId
          // Step 1: TC parent categories are never leaf nodes so they won't appear
          // in the eBay taxonomy array — resolve them directly by known aliases.
          if (entry.categoryName && !entry.categoryId) {
            const tcAlias = TC_CATEGORY_ALIASES[entry.categoryName.toLowerCase().trim()];
            if (tcAlias) {
              entry.categoryId   = tcAlias.categoryId;
              entry.categoryName = tcAlias.categoryName;
            }
          }

          // Step 2: general lookup against the downloaded category tree
          if (entry.categoryName && !entry.categoryId && categories.length > 0) {
            const normalize = (s) => s.toLowerCase().replace(/\s*>\s*/g, ' > ').trim();
            const nameLower = normalize(entry.categoryName);
            const match = categories.find(
              (c) =>
                normalize(c.categoryName) === nameLower ||
                normalize(c.fullPath ?? '') === nameLower
            );
            if (match) {
              entry.categoryId   = match.categoryId;
              entry.categoryName = match.categoryName;
            } else {
              const lastSegment = nameLower.split('>').pop().trim();
              const partial = categories.find(
                (c) => normalize(c.categoryName) === lastSegment
              );
              if (partial) {
                entry.categoryId   = partial.categoryId;
                entry.categoryName = partial.categoryName;
              } else {
                errors.push(`Row ${lineNum}: Category "${entry.categoryName}" not found — select it manually.`);
              }
            }
          }

          // Resolve shipping service name → serviceCode
          if (entry.shippingService && shippingServices.length > 0) {
            const normalize = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
            const svcLower = normalize(entry.shippingService);
            const match = shippingServices.find(
              (s) =>
                normalize(s.serviceName) === svcLower ||
                normalize(s.serviceCode) === svcLower ||
                normalize(s.serviceName).includes(svcLower) ||
                svcLower.includes(normalize(s.serviceName))
            );
            if (match) {
              entry.shippingService = match.serviceCode;
            } else {
              errors.push(`Row ${lineNum}: Shipping method "${entry.shippingService}" not found — select it manually.`);
            }
          }

          // ── Resolve trading card condition descriptors ──────────────────────
          if (entry.tcConditionType) {
            const tcType = entry.tcConditionType.toLowerCase().trim();

            if (tcType === 'graded') {
              entry.tcConditionType = 'graded';
              entry.conditionId     = '2750';

              entry.tcGrader       = resolveDescriptorId(entry.tcGrader, GRADER_OPTIONS);
              entry.tcGrade        = resolveDescriptorId(entry.tcGrade,  GRADE_OPTIONS);
              // Cert number is free text — preserve as-is, enforce 30-char max
              if (entry.tcCertNumber.length > 30) entry.tcCertNumber = entry.tcCertNumber.slice(0, 30);

              const descriptors = [];
              if (entry.tcGrader)     descriptors.push({ name: '27501', value: entry.tcGrader });
              if (entry.tcGrade)      descriptors.push({ name: '27502', value: entry.tcGrade });
              if (entry.tcCertNumber) descriptors.push({ name: '27503', value: entry.tcCertNumber });
              entry.conditionDescriptors = descriptors;

              entry.tcConditionLabel = [
                'Graded',
                descriptorLabel(entry.tcGrader, GRADER_OPTIONS),
                descriptorLabel(entry.tcGrade,  GRADE_OPTIONS),
              ].filter(Boolean).join(' · ');

            } else if (tcType === 'ungraded') {
              entry.tcConditionType = 'ungraded';
              entry.conditionId     = '4000';

              entry.tcCardCondition = resolveDescriptorId(entry.tcCardCondition, CARD_COND_OPTIONS);

              const descriptors = [];
              if (entry.tcCardCondition) descriptors.push({ name: '40001', value: entry.tcCardCondition });
              entry.conditionDescriptors = descriptors;

              entry.tcConditionLabel = [
                'Ungraded',
                descriptorLabel(entry.tcCardCondition, CARD_COND_OPTIONS),
              ].filter(Boolean).join(' · ');
            }
          }

          listings.push(entry);
        });

        resolve({ listings, errors });
      } catch (err) {
        reject(new Error(`Failed to parse file: ${err.message}`));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Export an array of listing objects to an Excel file and trigger download.
 * TC descriptor IDs are converted back to human-readable labels so the file
 * can be read and re-imported without changes.
 * @param {object[]} listings
 * @param {string} filename
 */
export function exportListingsToExcel(listings, filename = 'ebay_listings.xlsx') {
  const headers = [
    'Title',
    'Description',
    'Category',
    'Qty',
    'Condition',
    'Listing Type',
    'Buy It Now Price',
    'Auction Start Price',
    'Auction Days',
    'Best Offer Price',
    'Shipping Method',
    'Length (in)',
    'Width (in)',
    'Height (in)',
    'Weight Pounds',
    'Weight Ounces',
    'Image URL',
    'TC Condition Type',
    'Grading Company',
    'Grade',
    'Cert Number',
    'Card Condition',
  ];

  const rows = listings.map((l) => [
    l.title,
    l.description,
    l.categoryName ?? '',
    l.quantity,
    l.condition,
    l.listingType === 'BuyItNow' ? 'Buy It Now' : l.listingType,
    l.price,
    l.auctionStartPrice,
    l.auctionDays,
    l.bestOffer,
    l.shippingService,
    l.length,
    l.width,
    l.height,
    l.weightLbs,
    l.weightOz,
    l.images?.find((img) => img.ebayUrl)?.ebayUrl ?? '',
    // TC fields — export as human-readable labels, not numeric IDs
    l.tcConditionType === 'graded'   ? 'Graded'
      : l.tcConditionType === 'ungraded' ? 'Ungraded' : '',
    descriptorLabel(l.tcGrader       ?? '', GRADER_OPTIONS),
    descriptorLabel(l.tcGrade        ?? '', GRADE_OPTIONS),
    l.tcCertNumber ?? '',
    descriptorLabel(l.tcCardCondition ?? '', CARD_COND_OPTIONS),
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  ws['!cols'] = [
    { wch: 50 }, // Title
    { wch: 40 }, // Description
    { wch: 30 }, // Category
    { wch: 6  }, // Qty
    { wch: 10 }, // Condition
    { wch: 14 }, // Listing Type
    { wch: 16 }, // Buy It Now Price
    { wch: 18 }, // Auction Start Price
    { wch: 13 }, // Auction Days
    { wch: 16 }, // Best Offer Price
    { wch: 28 }, // Shipping Method
    { wch: 10 }, // Length
    { wch: 10 }, // Width
    { wch: 10 }, // Height
    { wch: 14 }, // Weight Pounds
    { wch: 14 }, // Weight Ounces
    { wch: 50 }, // Image URL
    { wch: 16 }, // TC Condition Type
    { wch: 16 }, // Grading Company
    { wch: 10 }, // Grade
    { wch: 16 }, // Cert Number
    { wch: 28 }, // Card Condition
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Listings');
  XLSX.writeFile(wb, filename);
}

/**
 * Generate and download a trading-card-specific Excel template.
 * Sheet 1 ("Listings"): column headers + 2 example rows (one graded, one ungraded).
 * Sheet 2 ("Reference"): all valid values for TC Condition Type, Grading Company,
 *   Grade, and Card Condition.
 */
export function generateTCTemplate() {
  // ── Sheet 1: Listings ───────────────────────────────────────────────────────
  const listingsHeaders = [
    'Title', 'Description', 'Category', 'Qty',
    'Listing Type', 'Buy It Now Price',
    'Auction Start Price', 'Auction Days',
    'Best Offer Price',
    'Shipping Method',
    'Length (in)', 'Width (in)', 'Height (in)',
    'Weight Pounds', 'Weight Ounces',
    'Image URL',
    'TC Condition Type',
    'Grading Company',
    'Grade',
    'Cert Number',
    'Card Condition',
  ];

  const exampleGraded = [
    '1998 PSA 9.5 Michael Jordan #1 Topps Chrome',
    'PSA graded 9.5 Michael Jordan Topps Chrome 1998. Near mint condition.',
    'Sports Trading Cards',
    '1',
    'Buy It Now',
    '299.99',
    '', '', '',
    'USPS Priority Mail',
    '4', '3', '0.25',
    '0', '2',
    '',
    'Graded',
    'PSA',
    '9.5',
    '12345678',
    '',
  ];

  const exampleUngraded = [
    '1999 Charizard Base Set Unlimited Holo',
    'Ungraded Charizard from the 1999 Base Set Unlimited printing. Lightly played.',
    'Collectible Card Games/MTG',
    '1',
    'Buy It Now',
    '149.00',
    '', '', '',
    'USPS First Class',
    '4', '3', '0.1',
    '0', '1',
    '',
    'Ungraded',
    '',
    '',
    '',
    'Lightly Played (Excellent)',
  ];

  const wsListings = XLSX.utils.aoa_to_sheet([listingsHeaders, exampleGraded, exampleUngraded]);

  wsListings['!cols'] = [
    { wch: 50 }, // Title
    { wch: 50 }, // Description
    { wch: 30 }, // Category
    { wch: 6  }, // Qty
    { wch: 14 }, // Listing Type
    { wch: 16 }, // Buy It Now Price
    { wch: 18 }, // Auction Start Price
    { wch: 13 }, // Auction Days
    { wch: 16 }, // Best Offer Price
    { wch: 24 }, // Shipping Method
    { wch: 10 }, // Length
    { wch: 10 }, // Width
    { wch: 10 }, // Height
    { wch: 14 }, // Weight Pounds
    { wch: 14 }, // Weight Ounces
    { wch: 50 }, // Image URL
    { wch: 18 }, // TC Condition Type
    { wch: 16 }, // Grading Company
    { wch: 10 }, // Grade
    { wch: 16 }, // Cert Number
    { wch: 30 }, // Card Condition
  ];

  // ── Sheet 2: Reference ─────────────────────────────────────────────────────
  const maxRows = Math.max(GRADER_OPTIONS.length, GRADE_OPTIONS.length, CARD_COND_OPTIONS.length) + 1;

  const refRows = [];

  // Header row
  refRows.push([
    'TC Condition Type',
    '',
    'Grading Company',
    '',
    'Grade',
    '',
    'Card Condition (Ungraded only)',
  ]);

  // Note row
  refRows.push([
    'Graded',
    '',
    '(use for graded cards)',
    '',
    '(use for graded cards)',
    '',
    '(use for ungraded cards)',
  ]);
  refRows.push([
    'Ungraded',
    '', '', '', '', '', '',
  ]);

  // Blank separator
  refRows.push(['', '', '', '', '', '', '']);

  // Column sub-headers
  refRows.push(['', '', 'Abbreviation', 'Full Name', 'Value', '', 'Condition']);

  // Data rows — graders, grades, card conditions side by side
  const maxLen = Math.max(GRADER_OPTIONS.length, GRADE_OPTIONS.length, CARD_COND_OPTIONS.length);
  for (let i = 0; i < maxLen; i++) {
    const grader   = GRADER_OPTIONS[i];
    const grade    = GRADE_OPTIONS[i];
    const cardCond = CARD_COND_OPTIONS[i];

    refRows.push([
      '',
      '',
      grader   ? grader.value   : '',
      grader   ? graderFullName(grader.value) : '',
      grade    ? grade.value    : '',
      '',
      cardCond ? cardCond.value : '',
    ]);
  }

  const wsRef = XLSX.utils.aoa_to_sheet(refRows);

  wsRef['!cols'] = [
    { wch: 20 }, // TC Condition Type
    { wch: 2  }, // spacer
    { wch: 12 }, // Grading Company abbrev
    { wch: 40 }, // Grading Company full name
    { wch: 10 }, // Grade
    { wch: 2  }, // spacer
    { wch: 32 }, // Card Condition
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsListings, 'Listings');
  XLSX.utils.book_append_sheet(wb, wsRef, 'Reference');
  XLSX.writeFile(wb, 'trading_cards_template.xlsx');
}

/** Map grader abbreviation to its full name for the reference sheet. */
function graderFullName(abbrev) {
  const names = {
    PSA:   'Professional Sports Authenticator',
    BCCG:  'Beckett Collectors Club Grading',
    BVG:   'Beckett Vintage Grading',
    BGS:   'Beckett Grading Services',
    CSG:   'Certified Sports Guaranty',
    CGC:   'Certified Guaranty Company',
    SGC:   'Sportscard Guaranty Corporation',
    KSA:   'K Sportscard Authentication',
    GMA:   'Gem Mint Authentication',
    HGA:   'Hybrid Grading Approach',
    ISA:   'International Sports Authentication',
    PCA:   'Professional Card Authenticator',
    GSG:   'Gold Standard Grading',
    PGS:   'Platin Grading Service',
    MNT:   'MNT Grading',
    TAG:   'Technical Authentication & Grading',
    Rare:  'Rare Edition',
    RCG:   'Revolution Card Grading',
    PCG:   'Premier Card Grading',
    Ace:   'Ace Grading',
    CGA:   'Card Grading Australia',
    TCG:   'Trading Card Grading',
    ARK:   'ARK Grading',
    Other: 'Other',
  };
  return names[abbrev] ?? abbrev;
}

/**
 * Returns a blank listing object with all required fields initialized.
 */
export function createEmptyListing() {
  return {
    id: crypto.randomUUID(),
    // Submission status
    postStatus:   'new',
    listingId:    '',
    statusError:  '',
    // Listing fields
    title:            '',
    description:      '',
    price:            '',
    quantity:         '1',
    condition:        'New',
    listingType:      'BuyItNow',
    auctionDays:      '',
    auctionStartPrice: '',
    bestOffer:        '',
    categoryId:       '',
    categoryName:     '',
    aspects:          {},
    fulfillmentPolicyId: '',
    shippingService:  '',
    length:           '',
    width:            '',
    height:           '',
    weightLbs:        '',
    weightOz:         '',
    images:           [],
    // Trading card condition (populated by TradingCardModal or Excel import)
    conditionId:          '',   // overrides CONDITION_MAP in worker when set (e.g. '2750', '4000')
    conditionDescriptors: [],   // [{ name: descriptorId, value: descriptorValueId }, …]
    tcConditionType:      '',   // 'graded' | 'ungraded' | ''
    tcGrader:             '',   // eBay numeric valueId (e.g. '275010' for PSA)
    tcGrade:              '',   // eBay numeric valueId (e.g. '275022' for grade 9)
    tcCertNumber:         '',   // free-text cert number (max 30 chars)
    tcCardCondition:      '',   // eBay numeric valueId (e.g. '400010')
    tcConditionLabel:     '',   // display string e.g. "Graded · PSA · 9.5"
  };
}
