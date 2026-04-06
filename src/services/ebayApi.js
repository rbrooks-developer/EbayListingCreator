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

const SANDBOX_IDENTITY_URL = 'https://apiz.sandbox.ebay.com/commerce/identity/v1/user/';
const SANDBOX_TAXONOMY_URL = 'https://api.sandbox.ebay.com/commerce/taxonomy/v1';
const SANDBOX_METADATA_URL = 'https://api.sandbox.ebay.com/sell/metadata/v1';

// Scopes required to create/update listings on behalf of a seller
const USER_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
  'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
].join(' ');

// ── Config helpers ────────────────────────────────────────────────────────────

import { getEbayConfig } from './ebayConfig.js';

function getEnv(sandbox) {
  const cfg = getEbayConfig();
  return {
    clientId: sandbox ? cfg.sandboxClientId : cfg.clientId,
    ruName:   sandbox ? cfg.sandboxRuName   : cfg.ruName,
  };
}

export function isEbayConfigured(sandbox = false) {
  const { clientId, ruName } = getEnv(sandbox);
  const { workerUrl } = getEbayConfig();
  return !!(clientId && ruName && workerUrl);
}

function isSandboxAppId(clientId = '') {
  return clientId.toUpperCase().includes('-SBX-');
}

export function detectConfiguredEnvironment() {
  const { clientId: prodId, sandboxClientId: sandboxId } = getEbayConfig();

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
  const { workerUrl } = getEbayConfig();
  if (!workerUrl) throw new Error('Worker URL not configured. Click "Configure eBay API" to set it up.');
  return workerUrl.replace(/\/$/, '');
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

// ── User info ─────────────────────────────────────────────────────────────────

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
      `${baseUrl}/marketplace/${marketplaceId}/get_shipping_carriers`,
      accessToken
    );

    const services = [];
    (data.shippingCarriers ?? []).forEach((carrier) => {
      (carrier.shippingServices ?? []).forEach((svc) => {
        services.push({
          carrierCode:  carrier.shippingCarrierCode,
          serviceCode:  svc.shippingServiceCode,
          serviceName:  svc.shippingServiceCode,
          serviceTypes: svc.shippingServiceType ?? [],
        });
      });
    });

    return services.length > 0 ? services : FALLBACK_SHIPPING_SERVICES;
  } catch {
    return FALLBACK_SHIPPING_SERVICES;
  }
}

// ── Create listing ────────────────────────────────────────────────────────────

export async function createListing(accessToken, listing, marketplaceId, sandbox = false) {
  return workerPost('listing', { token: accessToken, listing, marketplaceId, sandbox });
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
