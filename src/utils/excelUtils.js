import * as XLSX from 'xlsx';

/**
 * Column header aliases — maps common spreadsheet header names to
 * our internal listing field keys (case-insensitive).
 */
const HEADER_MAP = {
  title: 'title',
  'listing title': 'title',
  description: 'description',
  desc: 'description',
  quantity: 'quantity',
  qty: 'quantity',
  'quantity available': 'quantity',
  condition: 'condition',
  'item condition': 'condition',
  'listing type': 'listingType',
  type: 'listingType',
  format: 'listingType',
  'auction length': 'auctionDays',
  'auction days': 'auctionDays',
  duration: 'auctionDays',
  'best offer': 'bestOffer',
  'best offer amount': 'bestOffer',
  'buy it now price': 'buyItNowPrice',
  price: 'buyItNowPrice',
};

const CONDITION_MAP = {
  new: 'New',
  used: 'Used',
};

const LISTING_TYPE_MAP = {
  'buy it now': 'BuyItNow',
  butitnow: 'BuyItNow',
  bin: 'BuyItNow',
  auction: 'Auction',
};

const VALID_AUCTION_DAYS = [3, 5, 7, 10];

/**
 * Parse an uploaded Excel or CSV file and return an array of listing objects.
 * @param {File} file
 * @returns {Promise<{listings: object[], errors: string[]}>}
 */
export function parseListingFile(file) {
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
          const lineNum = rowIdx + 2; // 1-based, accounting for header row
          const entry = createEmptyListing();

          fieldKeys.forEach((key, colIdx) => {
            if (!key) return;
            const raw = String(row[colIdx] ?? '').trim();
            entry[key] = raw;
          });

          // Normalize condition
          const condLower = entry.condition.toLowerCase();
          entry.condition = CONDITION_MAP[condLower] ?? entry.condition;

          // Normalize listing type
          const typeLower = entry.listingType.toLowerCase().replace(/\s+/g, '');
          entry.listingType = LISTING_TYPE_MAP[typeLower] ?? entry.listingType;

          // Normalize auction days
          if (entry.auctionDays !== '') {
            const days = parseInt(entry.auctionDays, 10);
            if (!VALID_AUCTION_DAYS.includes(days)) {
              errors.push(`Row ${lineNum}: Auction length "${entry.auctionDays}" is not valid (must be 3, 5, 7, or 10).`);
            }
            entry.auctionDays = String(days);
          }

          // Normalize quantity
          if (entry.quantity !== '') {
            const qty = parseInt(entry.quantity, 10);
            if (isNaN(qty) || qty < 1) {
              errors.push(`Row ${lineNum}: Quantity "${entry.quantity}" must be a positive integer.`);
            }
            entry.quantity = String(qty);
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
    'Quantity',
    'Condition',
    'Listing Type',
    'Auction Days',
    'Best Offer',
  ];

  const rows = listings.map((l) => [
    l.title,
    l.description,
    l.quantity,
    l.condition,
    l.listingType,
    l.auctionDays,
    l.bestOffer,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
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
    postStatus: 'new',    // 'new' | 'submitting' | 'success' | 'error'
    listingId: '',        // eBay listing ID on success
    statusError: '',      // error message on failure
    // Listing fields
    title: '',
    description: '',
    price: '',            // Buy It Now price
    quantity: '1',
    condition: 'New',
    listingType: 'BuyItNow',
    auctionDays: '',
    auctionStartPrice: '',
    bestOffer: '',
    categoryId: '',
    categoryName: '',
    aspects: {},
    shippingService: '',
    length: '',
    width: '',
    height: '',
    weight: '',
    imageUrl: '',
  };
}
