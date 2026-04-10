/**
 * eBay API Service
 *
 * All eBay API calls are proxied through a Cloudflare Worker to avoid
 * CORS restrictions — eBay blocks all direct browser requests.
 */

// ── Auth URLs (used for the redirect only — not fetched from browser) ─────────

const EBAY_AUTH_URL    = 'https://auth.ebay.com/oauth2/authorize';
const SANDBOX_AUTH_URL = 'https://auth.sandbox.ebay.com/oauth2/authorize';

// ── eBay API base URLs (used server-side by the Worker) ───────────────────────

const EBAY_IDENTITY_URL    = 'https://apiz.ebay.com/commerce/identity/v1/user/';
const EBAY_TAXONOMY_URL    = 'https://api.ebay.com/commerce/taxonomy/v1';
const EBAY_METADATA_URL    = 'https://api.ebay.com/sell/metadata/v1';
const SANDBOX_METADATA_URL = 'https://api.sandbox.ebay.com/sell/metadata/v1';

const SANDBOX_IDENTITY_URL = 'https://apiz.sandbox.ebay.com/commerce/identity/v1/user/';
const SANDBOX_TAXONOMY_URL = 'https://api.sandbox.ebay.com/commerce/taxonomy/v1';

// Scopes required to create/update listings on behalf of a seller
const USER_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
  'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
].join(' ');

// ── Env helpers ───────────────────────────────────────────────────────────────

function getEnv(sandbox) {
  return {
    clientId: sandbox ? import.meta.env.VITE_EBAY_SANDBOX_CLIENT_ID : import.meta.env.VITE_EBAY_CLIENT_ID,
    ruName:   sandbox ? import.meta.env.VITE_EBAY_SANDBOX_RUNAME    : import.meta.env.VITE_EBAY_RUNAME,
  };
}

export function isEbayConfigured(sandbox = false) {
  const { clientId, ruName } = getEnv(sandbox);
  const workerUrl = import.meta.env.VITE_TOKEN_WORKER_URL;
  return !!(clientId && ruName && workerUrl);
}

function isSandboxAppId(clientId = '') {
  return clientId.toUpperCase().includes('-SBX-');
}

export function detectConfiguredEnvironment() {
  const prodId    = import.meta.env.VITE_EBAY_CLIENT_ID             || '';
  const sandboxId = import.meta.env.VITE_EBAY_SANDBOX_CLIENT_ID     || '';

  if (!prodId && sandboxId) return 'sandbox';
  if (prodId && isSandboxAppId(prodId)) return 'sandbox';
  if (prodId && !isSandboxAppId(prodId)) return 'production';
  return 'none';
}

// ── Authorization URL ─────────────────────────────────────────────────────────

export function buildAuthorizationUrl(sandbox = false) {
  const { clientId, ruName } = getEnv(sandbox);
  const state = crypto.randomUUID();
  sessionStorage.setItem('ebay_oauth_state', state);
  sessionStorage.setItem('ebay_oauth_sandbox', String(sandbox));

  const params = new URLSearchParams({
    client_id:     clientId,
    response_type: 'code',
    redirect_uri:  ruName,
    scope:         USER_SCOPES,
    state,
  });

  return `${sandbox ? SANDBOX_AUTH_URL : EBAY_AUTH_URL}?${params.toString()}`;
}

// ── Worker helpers ────────────────────────────────────────────────────────────

function getWorkerUrl() {
  const url = import.meta.env.VITE_TOKEN_WORKER_URL;
  if (!url) throw new Error('VITE_TOKEN_WORKER_URL is not configured.');
  return url.replace(/\/$/, '');
}

async function workerPost(route, payload) {
  const res = await fetch(`${getWorkerUrl()}/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Worker error (${res.status})`);
  return data;
}

/** Proxy a GET request to any eBay API URL through the Worker. */
async function ebayGet(url, accessToken) {
  return workerPost('proxy', { url, token: accessToken, method: 'GET' });
}

// ── Token exchange ────────────────────────────────────────────────────────────

export async function exchangeCodeForTokens(code, sandbox = false) {
  const data = await workerPost('exchange', { code, sandbox });
  sessionStorage.setItem('ebay_refresh_token', data.refresh_token);
  return data.access_token;
}

export async function refreshAccessToken(sandbox = false) {
  const refreshToken = sessionStorage.getItem('ebay_refresh_token');
  if (!refreshToken) throw new Error('No refresh token stored — user must re-connect.');
  const data = await workerPost('refresh', { refreshToken, sandbox });
  return data.access_token;
}

// ── User info & location ──────────────────────────────────────────────────────

export async function fetchUserLocation(accessToken, sandbox = false) {
  try {
    const data = await workerPost('user-location', { token: accessToken, sandbox });
    return { location: data.location ?? '', postalCode: data.postalCode ?? '' };
  } catch {
    return { location: '', postalCode: '' };
  }
}

export async function fetchUserInfo(accessToken, sandbox = false) {
  const url = sandbox ? SANDBOX_IDENTITY_URL : EBAY_IDENTITY_URL;
  try {
    const data = await ebayGet(url, accessToken);
    return { username: data.username ?? data.userId ?? 'eBay Seller' };
  } catch {
    return { username: 'eBay Seller' };
  }
}

// ── Categories ────────────────────────────────────────────────────────────────

export async function fetchCategories(accessToken, marketplaceId = 'EBAY_US', sandbox = false) {
  const baseUrl = sandbox ? SANDBOX_TAXONOMY_URL : EBAY_TAXONOMY_URL;

  const treeData = await ebayGet(
    `${baseUrl}/get_default_category_tree_id?marketplace_id=${marketplaceId}`,
    accessToken
  );
  const { categoryTreeId } = treeData;

  const tree = await ebayGet(`${baseUrl}/category_tree/${categoryTreeId}`, accessToken);

  const categories = [];
  function walk(node, pathParts = []) {
    const name = node.category?.categoryName ?? '';
    const id   = node.category?.categoryId   ?? '';
    const path = [...pathParts, name];
    if (!node.childCategoryTreeNodes?.length) {
      categories.push({ categoryId: id, categoryName: name, fullPath: path.join(' > ') });
    } else {
      node.childCategoryTreeNodes.forEach((child) => walk(child, path));
    }
  }
  // Skip the root node itself — start from its children so "Root >" is not in every path
  if (tree.rootCategoryNode) {
    (tree.rootCategoryNode.childCategoryTreeNodes ?? []).forEach((child) => walk(child, []));
  }

  return { categories, categoryTreeId };
}

// ── Shipping services ─────────────────────────────────────────────────────────

const FALLBACK_SHIPPING_SERVICES = [
  { carrierCode: 'USPS',  serviceCode: 'USPSFirstClass',          serviceName: 'USPS First Class',           serviceTypes: ['FLAT_RATE'] },
  { carrierCode: 'USPS',  serviceCode: 'USPSPriority',            serviceName: 'USPS Priority Mail',         serviceTypes: ['FLAT_RATE'] },
  { carrierCode: 'USPS',  serviceCode: 'USPSPriorityMailExpress', serviceName: 'USPS Priority Mail Express', serviceTypes: ['FLAT_RATE'] },
  { carrierCode: 'USPS',  serviceCode: 'USPSParcelSelect',        serviceName: 'USPS Parcel Select',         serviceTypes: ['CALCULATED'] },
  { carrierCode: 'UPS',   serviceCode: 'UPSGround',               serviceName: 'UPS Ground',                 serviceTypes: ['CALCULATED'] },
  { carrierCode: 'UPS',   serviceCode: 'UPS2ndDayAir',            serviceName: 'UPS 2nd Day Air',            serviceTypes: ['CALCULATED'] },
  { carrierCode: 'UPS',   serviceCode: 'UPSNextDayAir',           serviceName: 'UPS Next Day Air',           serviceTypes: ['CALCULATED'] },
  { carrierCode: 'FedEx', serviceCode: 'FedExGround',             serviceName: 'FedEx Ground',               serviceTypes: ['CALCULATED'] },
  { carrierCode: 'FedEx', serviceCode: 'FedEx2Day',               serviceName: 'FedEx 2Day',                 serviceTypes: ['CALCULATED'] },
  { carrierCode: 'FedEx', serviceCode: 'FedExPriorityOvernight',  serviceName: 'FedEx Priority Overnight',   serviceTypes: ['CALCULATED'] },
  { carrierCode: 'OTHER', serviceCode: 'FreightShipping',         serviceName: 'Freight Shipping',           serviceTypes: ['FLAT_RATE'] },
  { carrierCode: 'OTHER', serviceCode: 'LocalPickup',             serviceName: 'Local Pickup',               serviceTypes: ['FLAT_RATE'] },
];

export async function fetchShippingServices(accessToken, marketplaceId = 'EBAY_US', sandbox = false) {
  try {
    const baseUrl = sandbox ? SANDBOX_METADATA_URL : EBAY_METADATA_URL;
    const data = await ebayGet(
      `${baseUrl}/shipping/marketplace/${marketplaceId}/get_shipping_services`,
      accessToken
    );

    const ALLOWED_CARRIERS = new Set(['USPS', 'UPS', 'FEDEX']);

    const services = (data.shippingServices ?? [])
      .filter((svc) =>
        svc.validForSellingFlow &&
        !svc.internationalService &&
        ALLOWED_CARRIERS.has(svc.shippingCarrier)
      )
      .map((svc) => ({
        carrierCode:      svc.shippingCarrier,
        serviceCode:      svc.shippingService,
        serviceName:      svc.description ?? svc.shippingService,
        serviceTypes:     svc.shippingCostTypes ?? [],
        shippingCategory: svc.shippingCategory ?? '',
        minShippingTime:  svc.shippingTimeMin ?? null,
        maxShippingTime:  svc.shippingTimeMax ?? null,
      }))
      .sort((a, b) => a.serviceName.localeCompare(b.serviceName));

    return services.length > 0 ? services : FALLBACK_SHIPPING_SERVICES;
  } catch {
    return FALLBACK_SHIPPING_SERVICES;
  }
}

// ── Fulfillment policies ──────────────────────────────────────────────────────

const EBAY_ACCOUNT_URL    = 'https://api.ebay.com/sell/account/v1';
const SANDBOX_ACCOUNT_URL = 'https://api.sandbox.ebay.com/sell/account/v1';

export async function fetchFulfillmentPolicies(accessToken, marketplaceId = 'EBAY_US', sandbox = false) {
  try {
    const baseUrl = sandbox ? SANDBOX_ACCOUNT_URL : EBAY_ACCOUNT_URL;
    const data = await ebayGet(
      `${baseUrl}/fulfillment_policy?marketplace_id=${marketplaceId}`,
      accessToken
    );
    return (data.fulfillmentPolicies ?? []).map((p) => ({
      fulfillmentPolicyId: p.fulfillmentPolicyId,
      name: p.name,
    }));
  } catch {
    return [];
  }
}

// ── Upload image to eBay EPS ──────────────────────────────────────────────────

export async function uploadImage(accessToken, file, sandbox = false) {
  const MAX_BYTES = 7 * 1024 * 1024; // 7 MB — eBay EPS limit
  if (file.size > MAX_BYTES) throw new Error(`"${file.name}" exceeds the 7 MB limit.`);

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  // process in chunks to avoid call-stack overflow on large files
  for (let i = 0; i < bytes.byteLength; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  const imageBase64 = btoa(binary);

  const data = await workerPost('upload-image', {
    token: accessToken,
    imageBase64,
    imageName: file.name,
    mimeType:  file.type || 'image/jpeg',
    sandbox,
  });
  return data.url;
}

// ── Create listing ────────────────────────────────────────────────────────────

export async function createListing(accessToken, listing, marketplaceId, sandbox = false, defaultLocation = '', defaultPostalCode = '') {
  return workerPost('listing', { token: accessToken, listing, marketplaceId, sandbox, defaultLocation, defaultPostalCode });
}

// ── Category aspects ──────────────────────────────────────────────────────────

export async function fetchAspectsForCategory(accessToken, categoryTreeId, categoryId, sandbox = false) {
  const baseUrl = sandbox ? SANDBOX_TAXONOMY_URL : EBAY_TAXONOMY_URL;
  const data = await ebayGet(
    `${baseUrl}/category_tree/${categoryTreeId}/get_item_aspects_for_category?category_id=${categoryId}`,
    accessToken
  );

  return (data.aspects ?? []).map((a) => ({
    aspectName:        a.localizedAspectName ?? '',
    aspectRequired:    a.aspectConstraint?.aspectRequired === true,
    aspectUsage:       a.aspectConstraint?.aspectUsage ?? 'OPTIONAL',
    aspectMode:        a.aspectConstraint?.aspectMode ?? 'FREE_TEXT',
    aspectCardinality: a.aspectConstraint?.itemToAspectCardinality ?? 'SINGLE',
    aspectValues:      (a.aspectValues ?? []).map((v) => v.localizedValue ?? ''),
  }));
}
