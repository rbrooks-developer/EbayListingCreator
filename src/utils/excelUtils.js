import * as XLSX from 'xlsx';

/**
 * Column header aliases — maps spreadsheet header names to
 * internal listing field keys (case-insensitive).
 */
const HEADER_MAP = {
  // Title
  'title':                'title',
  'listing title':        'title',
  // Description
  'description':          'description',
  'desc':                 'description',
  // Category
  'category':             'categoryName',
  'category name':        'categoryName',
  // Quantity
  'quantity':             'quantity',
  'qty':                  'quantity',
  'quantity available':   'quantity',
  // Condition
  'condition':            'condition',
  'item condition':       'condition',
  // Listing type
  'listing type':         'listingType',
  'type':                 'listingType',
  'format':               'listingType',
  // Prices
  'buy it now price':     'price',
  'price':                'price',
  'auction start price':  'auctionStartPrice',
  'start price':          'auctionStartPrice',
  'best offer price':     'bestOffer',
  'best offer':           'bestOffer',
  'best offer amount':    'bestOffer',
  // Auction
  'auction days':         'auctionDays',
  'auction length':       'auctionDays',
  'duration':             'auctionDays',
  // Shipping
  'shipping method':      'shippingService',
  'shipping service':     'shippingService',
  'ship method':          'shippingService',
  // Dimensions
  'length':               'length',
  'length (in)':          'length',
  'width':                'width',
  'width (in)':           'width',
  'height':               'height',
  'height (in)':          'height',
  // Weight
  'weight pounds':        'weightLbs',
  'lbs':                  'weightLbs',
  'weight lbs':           'weightLbs',
  'weight ounces':        'weightOz',
  'oz':                   'weightOz',
  'weight oz':            'weightOz',
  // Images
  'image url':            'imageUrl',
  'image':                'imageUrl',
  'images':               'imageUrl',
  'photo url':            'imageUrl',
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
          if (entry.categoryName && categories.length > 0) {
            // Normalize separators: both " > " and ">" should match
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
              // Partial match fallback: last segment of the path
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
                // Partial: input is a substring of the service name or vice versa
                normalize(s.serviceName).includes(svcLower) ||
                svcLower.includes(normalize(s.serviceName))
            );
            if (match) {
              entry.shippingService = match.serviceCode;
            } else {
              errors.push(`Row ${lineNum}: Shipping method "${entry.shippingService}" not found — select it manually.`);
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
    // Export the first ready image URL if any
    l.images?.find((img) => img.ebayUrl)?.ebayUrl ?? '',
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Set column widths
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
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Listings');
  XLSX.writeFile(wb, filename);
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
  };
}
