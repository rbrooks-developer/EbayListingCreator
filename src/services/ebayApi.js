/**
 * eBay API Service
 *
 * All calls go through eBay's REST APIs using an OAuth 2.0 access token.
 * Because this app is hosted as a static site (GitHub Pages), the OAuth
 * *client-credentials* flow token exchange must be done client-side using
 * the user's App ID and Client Secret — no backend required.
 *
 * Production notes:
 *  - For user-context tokens (selling on behalf of a real account) you need
 *    a backend to perform the authorization-code exchange securely.
 *  - The CORS proxy below is needed in dev; in production eBay's API supports
 *    CORS for browser requests when using a valid OAuth token.
 */

const EBAY_OAUTH_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const EBAY_TAXONOMY_URL = 'https://api.ebay.com/commerce/taxonomy/v1';
const EBAY_METADATA_URL = 'https://api.ebay.com/sell/metadata/v1';

const SANDBOX_OAUTH_URL = 'https://api.sandbox.ebay.com/identity/v1/oauth2/token';
const SANDBOX_TAXONOMY_URL = 'https://api.sandbox.ebay.com/commerce/taxonomy/v1';
const SANDBOX_METADATA_URL = 'https://api.sandbox.ebay.com/sell/metadata/v1';

// Scopes required for taxonomy and metadata reads (no user context needed).
const REQUIRED_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
].join(' ');

/**
 * Exchange App ID + Client Secret for a client-credentials access token.
 * @param {string} clientId  - eBay App ID
 * @param {string} clientSecret - eBay Client Secret (Cert ID)
 * @param {boolean} sandbox
 * @returns {Promise<{access_token: string, expires_in: number}>}
 */
export async function fetchClientCredentialsToken(clientId, clientSecret, sandbox = false) {
  const url = sandbox ? SANDBOX_OAUTH_URL : EBAY_OAUTH_URL;
  const credentials = btoa(`${clientId}:${clientSecret}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: REQUIRED_SCOPES,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error_description || `Token request failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch the default category tree ID for a given marketplace, then walk the
 * full tree to return a flat list of leaf categories.
 * @param {string} accessToken
 * @param {string} marketplaceId  e.g. 'EBAY_US'
 * @param {boolean} sandbox
 * @returns {Promise<{categories: Array<{categoryId, categoryName, fullPath}>, categoryTreeId: string}>}
 */
export async function fetchCategories(accessToken, marketplaceId = 'EBAY_US', sandbox = false) {
  const baseUrl = sandbox ? SANDBOX_TAXONOMY_URL : EBAY_TAXONOMY_URL;
  const headers = { Authorization: `Bearer ${accessToken}` };

  // Step 1: get the default category tree ID
  const treeIdRes = await fetch(
    `${baseUrl}/get_default_category_tree_id?marketplace_id=${marketplaceId}`,
    { headers }
  );
  if (!treeIdRes.ok) {
    throw new Error(`Failed to fetch category tree ID: ${treeIdRes.status}`);
  }
  const { categoryTreeId } = await treeIdRes.json();

  // Step 2: fetch the full tree (can be large — ~3 MB for EBAY_US)
  const treeRes = await fetch(`${baseUrl}/category_tree/${categoryTreeId}`, { headers });
  if (!treeRes.ok) {
    throw new Error(`Failed to fetch category tree: ${treeRes.status}`);
  }
  const tree = await treeRes.json();

  // Flatten the recursive tree into a list of leaf categories
  const categories = [];
  function walk(node, pathParts = []) {
    const name = node.category?.categoryName ?? '';
    const id = node.category?.categoryId ?? '';
    const currentPath = [...pathParts, name];

    if (!node.childCategoryTreeNodes || node.childCategoryTreeNodes.length === 0) {
      categories.push({
        categoryId: id,
        categoryName: name,
        fullPath: currentPath.join(' > '),
      });
    } else {
      node.childCategoryTreeNodes.forEach((child) => walk(child, currentPath));
    }
  }

  if (tree.rootCategoryNode) {
    walk(tree.rootCategoryNode);
  }

  return { categories, categoryTreeId };
}

/**
 * Fetch item aspects (item specifics) for a single leaf category.
 * Results should be cached by the caller — this can be a slow call.
 * @param {string} accessToken
 * @param {string} categoryTreeId
 * @param {string} categoryId
 * @param {boolean} sandbox
 * @returns {Promise<Array<{aspectName, aspectRequired, aspectMode, aspectCardinality, aspectValues}>>}
 */
export async function fetchAspectsForCategory(accessToken, categoryTreeId, categoryId, sandbox = false) {
  const baseUrl = sandbox ? SANDBOX_TAXONOMY_URL : EBAY_TAXONOMY_URL;
  const headers = { Authorization: `Bearer ${accessToken}` };

  const res = await fetch(
    `${baseUrl}/category_tree/${categoryTreeId}/get_item_aspects_for_category?category_id=${categoryId}`,
    { headers }
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch aspects for category ${categoryId}: ${res.status}`);
  }

  const data = await res.json();

  // Normalise into a flat, easy-to-render shape
  return (data.aspects ?? []).map((a) => ({
    aspectName: a.localAspect?.aspectName ?? '',
    aspectRequired: a.aspectConstraint?.aspectRequired === true,
    aspectUsage: a.aspectConstraint?.aspectUsage ?? 'OPTIONAL', // REQUIRED | RECOMMENDED | OPTIONAL
    aspectMode: a.aspectConstraint?.aspectMode ?? 'FREE_TEXT',  // FREE_TEXT | SELECTION_ONLY
    aspectCardinality: a.aspectConstraint?.itemToAspectCardinality ?? 'SINGLE', // SINGLE | MULTI
    aspectValues: (a.localAspect?.aspectValues ?? []).map((v) => v.localValue),
  }));
}

/**
 * Fetch all shipping carriers / service types for a marketplace.
 * @param {string} accessToken
 * @param {string} marketplaceId  e.g. 'EBAY_US'
 * @param {boolean} sandbox
 * @returns {Promise<Array<{shippingCarrierCode: string, shippingServiceCode: string, ...}>>}
 */
export async function fetchShippingServices(accessToken, marketplaceId = 'EBAY_US', sandbox = false) {
  const baseUrl = sandbox ? SANDBOX_METADATA_URL : EBAY_METADATA_URL;
  const headers = { Authorization: `Bearer ${accessToken}` };

  const res = await fetch(
    `${baseUrl}/marketplace/${marketplaceId}/get_shipping_carriers`,
    { headers }
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch shipping carriers: ${res.status}`);
  }

  const data = await res.json();
  // Flatten carriers → services
  const services = [];
  (data.shippingCarriers ?? []).forEach((carrier) => {
    (carrier.shippingServices ?? []).forEach((svc) => {
      services.push({
        carrierCode: carrier.shippingCarrierCode,
        carrierName: carrier.shippingCarrierCode,
        serviceCode: svc.shippingServiceCode,
        serviceName: svc.shippingServiceCode,
        serviceTypes: svc.shippingServiceType ?? [],
      });
    });
  });

  return services;
}
