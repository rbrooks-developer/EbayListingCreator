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

  if (path.endsWith('/exchange'))     return handleExchange(body, env);
  if (path.endsWith('/refresh'))      return handleRefresh(body, env);
  if (path.endsWith('/proxy'))        return handleProxy(body, env);
  if (path.endsWith('/listing'))      return handleCreateListing(body, env);
  if (path.endsWith('/upload-image')) return handleUploadImage(body, env);

  return err('Unknown route — use /exchange, /refresh, /proxy, /listing, or /upload-image', 404, env);
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

// ── /listing (Trading API) ────────────────────────────────────────────────────

const TRADING_API_URL         = 'https://api.ebay.com/ws/api.dll';
const TRADING_API_SANDBOX_URL = 'https://api.sandbox.ebay.com/ws/api.dll';

const SITE_MAP = {
  EBAY_US: { siteId: '0',  country: 'US',        currency: 'USD', siteName: 'US' },
  EBAY_GB: { siteId: '3',  country: 'GB',        currency: 'GBP', siteName: 'UK' },
  EBAY_CA: { siteId: '2',  country: 'CA',        currency: 'CAD', siteName: 'Canada' },
  EBAY_AU: { siteId: '15', country: 'AU',        currency: 'AUD', siteName: 'Australia' },
  EBAY_DE: { siteId: '77', country: 'DE',        currency: 'EUR', siteName: 'Germany' },
  EBAY_FR: { siteId: '71', country: 'FR',        currency: 'EUR', siteName: 'France' },
  EBAY_IT: { siteId: '101','country': 'IT',      currency: 'EUR', siteName: 'Italy' },
  EBAY_ES: { siteId: '186','country': 'ES',      currency: 'EUR', siteName: 'Spain' },
};

const CONDITION_MAP = { New: '1000', Used: '3000' };

const DURATION_MAP = { '3': 'Days_3', '5': 'Days_5', '7': 'Days_7', '10': 'Days_10' };

function xmlEscape(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function handleCreateListing(body, env) {
  const { token, listing, marketplaceId = 'EBAY_US', sandbox = false } = body;
  if (!token)   return err('Missing "token"', 400, env);
  if (!listing) return err('Missing "listing"', 400, env);

  const clientId     = sandbox ? env.EBAY_SANDBOX_CLIENT_ID     : env.EBAY_CLIENT_ID;
  const clientSecret = sandbox ? env.EBAY_SANDBOX_CLIENT_SECRET : env.EBAY_CLIENT_SECRET;
  const devId        = env.EBAY_DEV_ID;

  if (!devId) return err('EBAY_DEV_ID secret is not set on the Worker.', 500, env);

  const site       = SITE_MAP[marketplaceId] ?? SITE_MAP.EBAY_US;
  const isAuction  = listing.listingType === 'Auction';
  const callName   = isAuction ? 'AddItem' : 'AddFixedPriceItem';
  const price      = isAuction ? (listing.auctionStartPrice || '0.99') : (listing.price || '0.00');
  const duration   = isAuction ? (DURATION_MAP[String(listing.auctionDays)] ?? 'Days_7') : 'GTC';
  const listingType = isAuction ? 'Chinese' : 'FixedPriceItem';
  const conditionId = CONDITION_MAP[listing.condition] ?? '1000';

  // ── Business Policies ─────────────────────────────────────────────────────
  const accountBase = sandbox
    ? 'https://api.sandbox.ebay.com/sell/account/v1'
    : 'https://api.ebay.com/sell/account/v1';

  async function fetchFirstPolicy(type) {
    try {
      const r = await fetch(
        `${accountBase}/${type}_policy?marketplace_id=${marketplaceId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!r.ok) return null;
      const d = await r.json().catch(() => null);
      const key = type.replace(/_([a-z])/g, (_, c) => c.toUpperCase()) + 'Policies';
      return d?.[key]?.[0] ?? null;
    } catch { return null; }
  }

  // Use the user-selected fulfillment policy ID if provided; otherwise auto-pick the first
  const selectedFulfillmentPolicyId = listing.fulfillmentPolicyId || null;
  const [autoFulfillmentPolicy, returnPolicy, paymentPolicy] = await Promise.all([
    selectedFulfillmentPolicyId ? Promise.resolve(null) : fetchFirstPolicy('fulfillment'),
    fetchFirstPolicy('return'),
    fetchFirstPolicy('payment'),
  ]);
  const fulfillmentPolicyId = selectedFulfillmentPolicyId
    ?? autoFulfillmentPolicy?.fulfillmentPolicyId
    ?? null;

  const useBusinessPolicies = !!(fulfillmentPolicyId || returnPolicy || paymentPolicy);

  // ── Item Specifics ────────────────────────────────────────────────────────
  const aspectEntries = Object.entries(listing.aspects ?? {});
  const itemSpecificsXml = aspectEntries.length === 0 ? '' : `
    <ItemSpecifics>
      ${aspectEntries.flatMap(([name, value]) => {
        const vals = Array.isArray(value) ? value : [value];
        return vals.filter(Boolean).map(v =>
          `<NameValueList><Name>${xmlEscape(name)}</Name><Value>${xmlEscape(v)}</Value></NameValueList>`
        );
      }).join('\n      ')}
    </ItemSpecifics>`;

  // ── Shipping / Return — business policies OR legacy inline ────────────────
  const hasPackageInfo = !!(listing.length && listing.width && listing.height && (listing.weightLbs || listing.weightOz));
  let shippingXml = '';
  let returnPolicyXml = '';
  let sellerProfilesXml = '';

  if (useBusinessPolicies) {
    const returnProfileId  = returnPolicy?.returnPolicyId  ?? '';
    // Omit payment profile when Best Offer is enabled — eBay rejects the
    // combination of Best Offer with a payment policy that requires immediate payment.
    const paymentProfileId = (listing.bestOffer && !isAuction) ? '' : (paymentPolicy?.paymentPolicyId ?? '');
    sellerProfilesXml = `
    <SellerProfiles>
      ${fulfillmentPolicyId ? `<SellerShippingProfile><ShippingProfileID>${fulfillmentPolicyId}</ShippingProfileID></SellerShippingProfile>` : ''}
      ${returnProfileId     ? `<SellerReturnProfile><ReturnProfileID>${returnProfileId}</ReturnProfileID></SellerReturnProfile>`             : ''}
      ${paymentProfileId    ? `<SellerPaymentProfile><PaymentProfileID>${paymentProfileId}</PaymentProfileID></SellerPaymentProfile>`       : ''}
    </SellerProfiles>`;
  } else {
    // Legacy inline fields (no business policies)
    shippingXml = hasPackageInfo ? `
    <ShippingDetails>
      <ShippingType>Calculated</ShippingType>
      <ShippingServiceOptions>
        <ShippingServicePriority>1</ShippingServicePriority>
        <ShippingService>${xmlEscape(listing.shippingService || 'USPSPriority')}</ShippingService>
      </ShippingServiceOptions>
      <PackageDepth>${listing.height}</PackageDepth>
      <PackageLength>${listing.length}</PackageLength>
      <PackageWidth>${listing.width}</PackageWidth>
      <WeightMajor>${parseInt(listing.weightLbs) || 0}</WeightMajor>
      <WeightMinor>${parseInt(listing.weightOz) || 0}</WeightMinor>
    </ShippingDetails>` : `
    <ShippingDetails>
      <ShippingType>Flat</ShippingType>
      <ShippingServiceOptions>
        <ShippingServicePriority>1</ShippingServicePriority>
        <ShippingService>${xmlEscape(listing.shippingService || 'USPSPriority')}</ShippingService>
        <ShippingServiceCost>0.00</ShippingServiceCost>
      </ShippingServiceOptions>
    </ShippingDetails>`;
    returnPolicyXml = `
    <ReturnPolicy>
      <ReturnsAcceptedOption>ReturnsAccepted</ReturnsAcceptedOption>
      <RefundOption>MoneyBack</RefundOption>
      <ReturnsWithinOption>Days_30</ReturnsWithinOption>
      <ShippingCostPaidByOption>Buyer</ShippingCostPaidByOption>
    </ReturnPolicy>`;
  }

  // ── Package dimensions (for calculated shipping rate at checkout) ─────────
  const packageXml = hasPackageInfo ? `
    <ShippingPackageDetails>
      <MeasurementUnit>English</MeasurementUnit>
      <PackageDepth>${listing.height}</PackageDepth>
      <PackageLength>${listing.length}</PackageLength>
      <PackageWidth>${listing.width}</PackageWidth>
      <WeightMajor>${parseInt(listing.weightLbs) || 0}</WeightMajor>
      <WeightMinor>${parseInt(listing.weightOz) || 0}</WeightMinor>
    </ShippingPackageDetails>` : '';

  // ── Pictures ──────────────────────────────────────────────────────────────
  const readyImages = (listing.images ?? []).filter((img) => img.ebayUrl);
  const pictureXml = readyImages.length > 0 ? `
    <PictureDetails>
      ${readyImages.map((img) => `<PictureURL>${xmlEscape(img.ebayUrl)}</PictureURL>`).join('\n      ')}
    </PictureDetails>` : '';

  // ── Best Offer ────────────────────────────────────────────────────────────
  const bestOfferXml = (listing.bestOffer && !isAuction) ? `
    <BestOfferDetails>
      <BestOfferEnabled>true</BestOfferEnabled>
    </BestOfferDetails>` : '';

  // ── Build XML ─────────────────────────────────────────────────────────────
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<${callName}Request xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${token}</eBayAuthToken>
  </RequesterCredentials>
  <Item>
    <Title>${xmlEscape(listing.title)}</Title>
    <Description><![CDATA[${listing.description || listing.title}]]></Description>
    <PrimaryCategory>
      <CategoryID>${listing.categoryId}</CategoryID>
    </PrimaryCategory>
    <StartPrice>${price}</StartPrice>
    <ConditionID>${conditionId}</ConditionID>
    <Country>${site.country}</Country>
    <Currency>${site.currency}</Currency>
    <Location>${xmlEscape(listing.location || site.country)}</Location>
    <DispatchTimeMax>3</DispatchTimeMax>
    <ListingDuration>${duration}</ListingDuration>
    <ListingType>${listingType}</ListingType>
    <Quantity>${parseInt(listing.quantity) || 1}</Quantity>
    <Site>${site.siteName}</Site>
    ${returnPolicyXml}
    ${shippingXml}
    ${sellerProfilesXml}
    ${packageXml}
    ${pictureXml}
    ${itemSpecificsXml}
    ${bestOfferXml}
  </Item>
</${callName}Request>`;

  // ── Call Trading API ──────────────────────────────────────────────────────
  const apiUrl = sandbox ? TRADING_API_SANDBOX_URL : TRADING_API_URL;
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type':                    'text/xml',
      'X-EBAY-API-COMPATIBILITY-LEVEL':  '1263',
      'X-EBAY-API-DEV-NAME':             devId,
      'X-EBAY-API-APP-NAME':             clientId,
      'X-EBAY-API-CERT-NAME':            clientSecret,
      'X-EBAY-API-CALL-NAME':            callName,
      'X-EBAY-API-SITEID':               site.siteId,
    },
    body: xml,
  });

  const text = await res.text();

  // ── Parse XML response ────────────────────────────────────────────────────
  const ack         = text.match(/<Ack>(.*?)<\/Ack>/)?.[1];
  const itemId      = text.match(/<ItemID>(\d+)<\/ItemID>/)?.[1];
  const shortMsg    = text.match(/<ShortMessage>(.*?)<\/ShortMessage>/)?.[1];
  const longMsg     = text.match(/<LongMessage>(.*?)<\/LongMessage>/)?.[1];

  if (ack === 'Failure' || (!itemId && ack !== 'Success' && ack !== 'Warning')) {
    return err(longMsg || shortMsg || `Trading API error (${res.status})`, 400, env);
  }

  return ok({ listingId: itemId }, env);
}

// ── /upload-image (eBay EPS) ──────────────────────────────────────────────────

async function handleUploadImage(body, env) {
  const { token, imageBase64, imageName = 'image.jpg', mimeType = 'image/jpeg', sandbox = false } = body;
  if (!token)       return err('Missing "token"', 400, env);
  if (!imageBase64) return err('Missing "imageBase64"', 400, env);

  const clientId     = sandbox ? env.EBAY_SANDBOX_CLIENT_ID     : env.EBAY_CLIENT_ID;
  const clientSecret = sandbox ? env.EBAY_SANDBOX_CLIENT_SECRET : env.EBAY_CLIENT_SECRET;
  const devId        = env.EBAY_DEV_ID;
  if (!devId) return err('EBAY_DEV_ID secret not set', 500, env);

  // Decode base64 → binary blob
  const binaryStr = atob(imageBase64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  const imageBlob = new Blob([bytes], { type: mimeType });

  const pictureName = imageName.replace(/\.[^.]+$/, ''); // strip extension
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${token}</eBayAuthToken>
  </RequesterCredentials>
  <PictureName>${xmlEscape(pictureName)}</PictureName>
</UploadSiteHostedPicturesRequest>`;

  const form = new FormData();
  form.append('XMLPayload', new Blob([xml], { type: 'text/xml' }), 'payload.xml');
  form.append('image', imageBlob, imageName);

  const apiUrl = sandbox ? TRADING_API_SANDBOX_URL : TRADING_API_URL;
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1263',
      'X-EBAY-API-DEV-NAME':            devId,
      'X-EBAY-API-APP-NAME':            clientId,
      'X-EBAY-API-CERT-NAME':           clientSecret,
      'X-EBAY-API-CALL-NAME':           'UploadSiteHostedPictures',
      'X-EBAY-API-SITEID':              '0',
    },
    body: form,
  });

  const text = await res.text();
  const ack      = text.match(/<Ack>(.*?)<\/Ack>/)?.[1];
  const fullUrl  = text.match(/<FullURL>(.*?)<\/FullURL>/)?.[1];
  const shortMsg = text.match(/<ShortMessage>(.*?)<\/ShortMessage>/)?.[1];
  const longMsg  = text.match(/<LongMessage>(.*?)<\/LongMessage>/)?.[1];

  if ((ack !== 'Success' && ack !== 'Warning') || !fullUrl) {
    return err(longMsg || shortMsg || 'Image upload failed', 400, env);
  }

  return ok({ url: fullUrl }, env);
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
