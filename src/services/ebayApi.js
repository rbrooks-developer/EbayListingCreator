/**
 * eBay API Service
 *
 * Auth model:
 *  - Developer credentials (App ID, Client Secret, RuName) live in .env
 *  - Users authorize via the standard OAuth 2.0 authorization-code flow
 *  - The resulting user access token is used for all API calls
 *
 * Because this is a static site, the client secret is baked into the JS
 * bundle — an accepted tradeoff documented in .env.example.
 */

// ── Base URLs ─────────────────────────────────────────────────────────────────

const EBAY_AUTH_URL        = 'https://auth.ebay.com/oauth2/authorize';
const EBAY_TOKEN_URL       = 'https://api.ebay.com/identity/v1/oauth2/token';
const EBAY_IDENTITY_URL    = 'https://apiz.ebay.com/commerce/identity/v1/user/';
const EBAY_TAXONOMY_URL    = 'https://api.ebay.com/commerce/taxonomy/v1';
const EBAY_METADATA_URL    = 'https://api.ebay.com/sell/metadata/v1';

const SANDBOX_AUTH_URL     = 'https://auth.sandbox.ebay.com/oauth2/authorize';
const SANDBOX_TOKEN_URL    = 'https://api.sandbox.ebay.com/identity/v1/oauth2/token';
const SANDBOX_IDENTITY_URL = 'https://apiz.sandbox.ebay.com/commerce/identity/v1/user/';
const SANDBOX_TAXONOMY_URL = 'https://api.sandbox.ebay.com/commerce/taxonomy/v1';
const SANDBOX_METADATA_URL = 'https://api.sandbox.ebay.com/sell/metadata/v1';

// Scopes required to create/update listings on behalf of a seller
const USER_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
].join(' ');

// ── Env helpers ───────────────────────────────────────────────────────────────

function getEnv(sandbox) {
  return {
    clientId:     sandbox ? import.meta.env.VITE_EBAY_SANDBOX_CLIENT_ID     : import.meta.env.VITE_EBAY_CLIENT_ID,
    clientSecret: sandbox ? import.meta.env.VITE_EBAY_SANDBOX_CLIENT_SECRET : import.meta.env.VITE_EBAY_CLIENT_SECRET,
    ruName:       sandbox ? import.meta.env.VITE_EBAY_SANDBOX_RUNAME        : import.meta.env.VITE_EBAY_RUNAME,
  };
}

export function isEbayConfigured(sandbox = false) {
  const { clientId, clientSecret, ruName } = getEnv(sandbox);
  return !!(clientId && clientSecret && ruName);
}

/**
 * Detect whether an App ID string is a Sandbox credential.
 * eBay Sandbox App IDs always contain "-SBX-" in their name.
 */
function isSandboxAppId(clientId = '') {
  return clientId.toUpperCase().includes('-SBX-');
}

/**
 * Return the environment the configured credentials belong to.
 * 'sandbox' | 'production' | 'none'
 */
export function detectConfiguredEnvironment() {
  const prodId    = import.meta.env.VITE_EBAY_CLIENT_ID    ?? '';
  const sandboxId = import.meta.env.VITE_EBAY_SANDBOX_CLIENT_ID ?? '';

  // If only sandbox creds exist, or both sets are sandbox IDs → sandbox
  if (!prodId && sandboxId) return 'sandbox';
  if (prodId && isSandboxAppId(prodId)) return 'sandbox';
  if (prodId && !isSandboxAppId(prodId)) return 'production';
  return 'none';
}

// ── Authorization URL ─────────────────────────────────────────────────────────

/**
 * Build the eBay authorization URL and save a state nonce in sessionStorage
 * for CSRF verification when the user returns.
 */
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

// ── Token exchange ────────────────────────────────────────────────────────────

/**
 * Exchange an authorization code for access + refresh tokens.
 * Persists the refresh token in sessionStorage; returns the access token.
 */
export async function exchangeCodeForTokens(code, sandbox = false) {
  const { clientId, clientSecret, ruName } = getEnv(sandbox);
  const tokenUrl = sandbox ? SANDBOX_TOKEN_URL : EBAY_TOKEN_URL;
  const credentials = btoa(`${clientId}:${clientSecret}`);

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization:  `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type:   'authorization_code',
      code,
      redirect_uri: ruName,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || `Token exchange failed (${res.status})`);
  }

  const data = await res.json();
  sessionStorage.setItem('ebay_refresh_token', data.refresh_token);
  return data.access_token;
}

/**
 * Use the stored refresh token to get a new access token silently.
 */
export async function refreshAccessToken(sandbox = false) {
  const { clientId, clientSecret } = getEnv(sandbox);
  const refreshToken = sessionStorage.getItem('ebay_refresh_token');
  if (!refreshToken) throw new Error('No refresh token stored — user must re-connect.');

  const tokenUrl = sandbox ? SANDBOX_TOKEN_URL : EBAY_TOKEN_URL;
  const credentials = btoa(`${clientId}:${clientSecret}`);

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization:  `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      scope:         USER_SCOPES,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || `Token refresh failed (${res.status})`);
  }

  const data = await res.json();
  return data.access_token;
}

// ── User info ─────────────────────────────────────────────────────────────────

/**
 * Fetch the connected eBay account's username.
 */
export async function fetchUserInfo(accessToken, sandbox = false) {
  const url = sandbox ? SANDBOX_IDENTITY_URL : EBAY_IDENTITY_URL;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    // Non-fatal — return a fallback rather than crashing the flow
    return { username: 'eBay Seller' };
  }

  const data = await res.json();
  return { username: data.username ?? data.userId ?? 'eBay Seller' };
}

// ── Categories ────────────────────────────────────────────────────────────────

/**
 * Fetch the full category tree and return a flat list of leaf categories
 * along with the tree ID (needed later for aspect fetching).
 * @returns {Promise<{categories: Array, categoryTreeId: string}>}
 */
export async function fetchCategories(accessToken, marketplaceId = 'EBAY_US', sandbox = false) {
  const baseUrl = sandbox ? SANDBOX_TAXONOMY_URL : EBAY_TAXONOMY_URL;
  const headers = { Authorization: `Bearer ${accessToken}` };

  const treeIdRes = await fetch(
    `${baseUrl}/get_default_category_tree_id?marketplace_id=${marketplaceId}`,
    { headers }
  );
  if (!treeIdRes.ok) throw new Error(`Failed to fetch category tree ID: ${treeIdRes.status}`);
  const { categoryTreeId } = await treeIdRes.json();

  const treeRes = await fetch(`${baseUrl}/category_tree/${categoryTreeId}`, { headers });
  if (!treeRes.ok) throw new Error(`Failed to fetch category tree: ${treeRes.status}`);
  const tree = await treeRes.json();

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
  if (tree.rootCategoryNode) walk(tree.rootCategoryNode);

  return { categories, categoryTreeId };
}

// ── Shipping services ─────────────────────────────────────────────────────────

export async function fetchShippingServices(accessToken, marketplaceId = 'EBAY_US', sandbox = false) {
  const baseUrl = sandbox ? SANDBOX_METADATA_URL : EBAY_METADATA_URL;
  const res = await fetch(
    `${baseUrl}/marketplace/${marketplaceId}/get_shipping_carriers`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Failed to fetch shipping carriers: ${res.status}`);

  const data = await res.json();
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
  return services;
}

// ── Category aspects ──────────────────────────────────────────────────────────

export async function fetchAspectsForCategory(accessToken, categoryTreeId, categoryId, sandbox = false) {
  const baseUrl = sandbox ? SANDBOX_TAXONOMY_URL : EBAY_TAXONOMY_URL;
  const res = await fetch(
    `${baseUrl}/category_tree/${categoryTreeId}/get_item_aspects_for_category?category_id=${categoryId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Failed to fetch aspects for category ${categoryId}: ${res.status}`);

  const data = await res.json();
  return (data.aspects ?? []).map((a) => ({
    aspectName:        a.localAspect?.aspectName ?? '',
    aspectRequired:    a.aspectConstraint?.aspectRequired === true,
    aspectUsage:       a.aspectConstraint?.aspectUsage ?? 'OPTIONAL',
    aspectMode:        a.aspectConstraint?.aspectMode ?? 'FREE_TEXT',
    aspectCardinality: a.aspectConstraint?.itemToAspectCardinality ?? 'SINGLE',
    aspectValues:      (a.localAspect?.aspectValues ?? []).map((v) => v.localValue),
  }));
}
