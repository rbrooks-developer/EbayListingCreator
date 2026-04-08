/**
 * Cloudflare Worker — eBay API Proxy
 *
 * Routes:
 *   POST /exchange  — authorization code → tokens
 *   POST /refresh   — refresh token → new access token
 *   POST /proxy     — general eBay API proxy (GET/POST with Bearer token)
 *
 * Secrets (set via `wrangler secret put`):
 *   EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_RUNAME
 *   EBAY_SANDBOX_CLIENT_ID, EBAY_SANDBOX_CLIENT_SECRET, EBAY_SANDBOX_RUNAME
 *
 * Vars (wrangler.toml [vars]):
 *   ALLOWED_ORIGIN — origin to allow, or * for all
 */

const EBAY_TOKEN_URL         = 'https://api.ebay.com/identity/v1/oauth2/token';
const EBAY_SANDBOX_TOKEN_URL = 'https://api.sandbox.ebay.com/identity/v1/oauth2/token';

const USER_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
  'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
].join(' ');

// ── CORS ──────────────────────────────────────────────────────────────────────

function getCorsHeaders(env) {
  return {
    'Access-Control-Allow-Origin':  env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function ok(data, env) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(env) },
  });
}

function err(message, status, env) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(env) },
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (e) {
      return err(e.message ?? 'Internal worker error', 500, env);
    }
  },
};

// ── Router ────────────────────────────────────────────────────────────────────

async function handle(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(env) });
  }
  if (request.method !== 'POST') return err('Method not allowed', 405, env);

  const path = new URL(request.url).pathname;

  let body;
  try { body = await request.json(); }
  catch { return err('Invalid JSON body', 400, env); }

  if (path.endsWith('/exchange')) return handleExchange(body, env);
  if (path.endsWith('/refresh'))  return handleRefresh(body, env);
  if (path.endsWith('/proxy'))    return handleProxy(body, env);
  if (path.endsWith('/listing'))  return handleCreateListing(body, env);

  return err('Unknown route — use /exchange, /refresh, /proxy, or /listing', 404, env);
}

// ── /exchange ─────────────────────────────────────────────────────────────────

async function handleExchange(body, env) {
  const { code, sandbox = false } = body;
  if (!code) return err('Missing "code"', 400, env);

  const { clientId, clientSecret, ruName, tokenUrl } = getEbayEnv(sandbox, env);
  if (!clientId || !clientSecret || !ruName) {
    return err(`Worker secrets not set for ${sandbox ? 'sandbox' : 'production'}`, 500, env);
  }

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization:  `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: ruName }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) return err(data.error_description || data.error || `eBay ${res.status}`, res.status, env);
  return ok(data, env);
}

// ── /refresh ──────────────────────────────────────────────────────────────────

async function handleRefresh(body, env) {
  const { refreshToken, sandbox = false } = body;
  if (!refreshToken) return err('Missing "refreshToken"', 400, env);

  const { clientId, clientSecret, tokenUrl } = getEbayEnv(sandbox, env);
  if (!clientId || !clientSecret) {
    return err(`Worker secrets not set for ${sandbox ? 'sandbox' : 'production'}`, 500, env);
  }

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization:  `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, scope: USER_SCOPES }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) return err(data.error_description || data.error || `eBay ${res.status}`, res.status, env);
  return ok(data, env);
}

// ── /proxy ────────────────────────────────────────────────────────────────────

async function handleProxy(body, env) {
  const { url, token, method = 'GET', body: reqBody } = body;
  if (!url)   return err('Missing "url"', 400, env);
  if (!token) return err('Missing "token"', 400, env);

  const res = await fetch(url, {
    method,
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: method !== 'GET' && reqBody ? JSON.stringify(reqBody) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) return err(data.error_description || data.error || `eBay ${res.status}`, res.status, env);
  return ok(data, env);
}

// ── /listing ──────────────────────────────────────────────────────────────────

async function handleCreateListing(body, env) {
  const { token, listing, marketplaceId = 'EBAY_US', sandbox = false } = body;
  if (!token)   return err('Missing "token"', 400, env);
  if (!listing) return err('Missing "listing"', 400, env);

  const base = sandbox
    ? 'https://api.sandbox.ebay.com'
    : 'https://api.ebay.com';
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Language': 'en-US' };

  // ── 1. Fetch account policies ─────────────────────────────────────────────
  const [fpRes, ppRes, rpRes] = await Promise.all([
    fetch(`${base}/sell/account/v1/fulfillment_policy?marketplace_id=${marketplaceId}`, { headers: h }),
    fetch(`${base}/sell/account/v1/payment_policy?marketplace_id=${marketplaceId}`,     { headers: h }),
    fetch(`${base}/sell/account/v1/return_policy?marketplace_id=${marketplaceId}`,      { headers: h }),
  ]);
  const [fpData, ppData, rpData] = await Promise.all([
    fpRes.json().catch(() => ({})),
    ppRes.json().catch(() => ({})),
    rpRes.json().catch(() => ({})),
  ]);

  const fulfillmentPolicyId = fpData.fulfillmentPolicies?.[0]?.fulfillmentPolicyId;
  const paymentPolicyId     = ppData.paymentPolicies?.[0]?.paymentPolicyId;
  const returnPolicyId      = rpData.returnPolicies?.[0]?.returnPolicyId;

  if (!fulfillmentPolicyId || !paymentPolicyId || !returnPolicyId) {
    const missing = [
      !fulfillmentPolicyId && 'shipping',
      !paymentPolicyId     && 'payment',
      !returnPolicyId      && 'return',
    ].filter(Boolean).join(', ');
    return err(
      `No ${missing} polic${missing.includes(',') ? 'ies' : 'y'} found in your eBay account. ` +
      'Set up your business policies in eBay Seller Hub first.',
      422, env
    );
  }

  // ── 2. Create / update inventory item ────────────────────────────────────
  const sku = listing.id;
  const conditionMap = { New: 'NEW', Used: 'USED_GOOD' };

  // Aspects must be arrays of strings
  const aspects = {};
  Object.entries(listing.aspects ?? {}).forEach(([k, v]) => {
    aspects[k] = Array.isArray(v) ? v.map(String).filter(Boolean) : [String(v)];
  });

  const inventoryItem = {
    availability: { shipToLocationAvailability: { quantity: parseInt(listing.quantity) || 1 } },
    condition: conditionMap[listing.condition] ?? 'NEW',
    product: {
      title: listing.title,
      description: listing.description || listing.title,
      aspects,
      ...(listing.imageUrl ? { imageUrls: [listing.imageUrl] } : {}),
    },
  };

  const invRes = await fetch(`${base}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
    method: 'PUT', headers: h, body: JSON.stringify(inventoryItem),
  });
  if (!invRes.ok && invRes.status !== 204) {
    const e = await invRes.json().catch(() => ({}));
    return err(e.errors?.[0]?.message ?? `Inventory item error (${invRes.status})`, invRes.status, env);
  }

  // ── 3. Create offer ───────────────────────────────────────────────────────
  const isAuction = listing.listingType === 'Auction';
  const durationMap = { '3': 'DAYS_3', '5': 'DAYS_5', '7': 'DAYS_7', '10': 'DAYS_10' };

  const offer = {
    sku,
    marketplaceId,
    format: isAuction ? 'AUCTION' : 'FIXED_PRICE',
    availableQuantity: parseInt(listing.quantity) || 1,
    categoryId: listing.categoryId,
    listingDescription: listing.description || listing.title,
    listingPolicies: { fulfillmentPolicyId, paymentPolicyId, returnPolicyId },
    pricingSummary: {
      price: { currency: 'USD', value: String(isAuction ? (listing.auctionStartPrice || '0.99') : (listing.price || '0.00')) },
      ...(listing.bestOffer && !isAuction ? { minimumAdvertisedPrice: { currency: 'USD', value: String(listing.bestOffer) } } : {}),
    },
    ...(isAuction ? { listingDuration: durationMap[String(listing.auctionDays)] ?? 'DAYS_7' } : {}),
  };

  const offerRes = await fetch(`${base}/sell/inventory/v1/offer`, {
    method: 'POST', headers: h, body: JSON.stringify(offer),
  });
  const offerData = await offerRes.json().catch(() => ({}));
  if (!offerRes.ok) {
    return err(offerData.errors?.[0]?.message ?? `Offer error (${offerRes.status})`, offerRes.status, env);
  }

  // ── 4. Publish offer ──────────────────────────────────────────────────────
  const publishRes = await fetch(`${base}/sell/inventory/v1/offer/${offerData.offerId}/publish`, {
    method: 'POST', headers: { Authorization: h.Authorization },
  });
  const publishData = await publishRes.json().catch(() => ({}));
  if (!publishRes.ok) {
    return err(publishData.errors?.[0]?.message ?? `Publish error (${publishRes.status})`, publishRes.status, env);
  }

  return ok({ listingId: publishData.listingId }, env);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getEbayEnv(sandbox, env) {
  return {
    clientId:     sandbox ? env.EBAY_SANDBOX_CLIENT_ID     : env.EBAY_CLIENT_ID,
    clientSecret: sandbox ? env.EBAY_SANDBOX_CLIENT_SECRET : env.EBAY_CLIENT_SECRET,
    ruName:       sandbox ? env.EBAY_SANDBOX_RUNAME        : env.EBAY_RUNAME,
    tokenUrl:     sandbox ? EBAY_SANDBOX_TOKEN_URL         : EBAY_TOKEN_URL,
  };
}
