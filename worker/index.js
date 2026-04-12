/**
 * Cloudflare Worker — eBay API Proxy + Billing
 *
 * Routes:
 *   POST /exchange          — authorization code → tokens
 *   POST /refresh           — refresh token → new access token
 *   POST /proxy             — general eBay API proxy
 *   POST /listing           — create eBay listing (checks usage limits)
 *   POST /upload-image      — upload image to eBay EPS
 *   POST /user-location     — fetch user location from eBay GetUser
 *   POST /billing/usage     — return current tier + usage for the caller
 *   POST /billing/checkout  — create Stripe Checkout Session
 *   POST /billing/portal    — create Stripe Customer Portal session
 *   POST /billing/webhook   — Stripe webhook receiver
 *
 * Secrets (wrangler secret put):
 *   EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_RUNAME, EBAY_DEV_ID
 *   EBAY_SANDBOX_CLIENT_ID, EBAY_SANDBOX_CLIENT_SECRET, EBAY_SANDBOX_RUNAME
 *   SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET
 *   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 *   STRIPE_PRO_PRICE_ID, STRIPE_BUSINESS_PRICE_ID
 *
 * Vars (wrangler.toml [vars]):
 *   ALLOWED_ORIGIN, SUPABASE_URL
 */

const EBAY_TOKEN_URL         = 'https://api.ebay.com/identity/v1/oauth2/token';
const EBAY_SANDBOX_TOKEN_URL = 'https://api.sandbox.ebay.com/identity/v1/oauth2/token';

/** Decode XML/HTML entities in eBay error messages */
function decodeEntities(str) {
  return str
    .replace(/&amp;/g,  '&')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g,  "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>');
}

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

function err(message, status, env, extra = {}) {
  return new Response(JSON.stringify({ error: message, ...extra }), {
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

  const path = new URL(request.url).pathname;

  // Stripe webhook must read raw body before any JSON parsing
  if (path.endsWith('/billing/webhook')) {
    if (request.method !== 'POST') return err('Method not allowed', 405, env);
    return handleStripeWebhook(request, env);
  }

  if (request.method !== 'POST') return err('Method not allowed', 405, env);

  let body;
  try { body = await request.json(); }
  catch { return err('Invalid JSON body', 400, env); }

  if (path.endsWith('/exchange'))         return handleExchange(body, env);
  if (path.endsWith('/refresh'))          return handleRefresh(body, env);
  if (path.endsWith('/proxy'))            return handleProxy(body, env);
  if (path.endsWith('/listing'))          return handleCreateListing(body, env);
  if (path.endsWith('/upload-image'))     return handleUploadImage(body, env);
  if (path.endsWith('/user-location'))    return handleUserLocation(body, env);
  if (path.endsWith('/billing/usage'))    return handleBillingUsage(body, env);
  if (path.endsWith('/billing/checkout')) return handleBillingCheckout(body, env);
  if (path.endsWith('/billing/portal'))   return handleBillingPortal(body, env);

  return err('Unknown route', 404, env);
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

/** Verify a Supabase JWT and return the user's ID, or null on failure. */
async function getSupabaseUserId(supabaseToken, env) {
  if (!supabaseToken || !env.SUPABASE_URL) return null;
  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${supabaseToken}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.id ?? null;
  } catch { return null; }
}

/** Call a Supabase REST endpoint with the service role key (bypasses RLS). */
async function supabaseFetch(path, options = {}, env) {
  const url = `${env.SUPABASE_URL}/rest/v1${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      apikey:         env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization:  `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer:         'return=representation',
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, data: text }; }
}

/** Call a Supabase RPC function with the service role key. */
async function supabaseRpc(fn, params, env) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey:         env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization:  `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(params),
  });
  const text = await res.text();
  try { return { ok: res.ok, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, data: text }; }
}

/** Fetch a user's current subscription and usage in one call. */
async function getUserBilling(userId, env) {
  const [subRes, usageRes] = await Promise.all([
    supabaseFetch(
      `/user_subscriptions?user_id=eq.${userId}&select=tier,period_start,period_end,stripe_customer_id,stripe_sub_id`,
      {}, env
    ),
    supabaseFetch(
      `/usage_counters?user_id=eq.${userId}&select=listings_used,period_start`,
      {}, env
    ),
  ]);

  const sub   = Array.isArray(subRes.data)   ? subRes.data[0]   : null;
  const usage = Array.isArray(usageRes.data) ? usageRes.data[0] : null;

  return {
    tier:             sub?.tier ?? 'free',
    stripeCustomerId: sub?.stripe_customer_id ?? null,
    stripeSubId:      sub?.stripe_sub_id ?? null,
    listingsUsed:     usage?.listings_used ?? 0,
    periodStart:      sub?.period_start ?? null,
    periodEnd:        sub?.period_end ?? null,
  };
}

// ── Stripe helpers ────────────────────────────────────────────────────────────

async function stripeFetch(path, params, env) {
  const body = new URLSearchParams(params);
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  try {
    const parts  = sigHeader.split(',');
    const tsPart = parts.find((p) => p.startsWith('t='));
    const sigPart = parts.find((p) => p.startsWith('v1='));
    if (!tsPart || !sigPart) return false;

    const ts  = tsPart.slice(2);
    const sig = sigPart.slice(3);
    const payload = `${ts}.${rawBody}`;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const buf      = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    const expected = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return expected === sig;
  } catch { return false; }
}

const PRICE_TO_TIER = (env) => ({
  [env.STRIPE_PRO_PRICE_ID]:      'pro',
  [env.STRIPE_BUSINESS_PRICE_ID]: 'business',
});

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
  EBAY_US: { siteId: '0',   country: 'US', currency: 'USD', siteName: 'US' },
  EBAY_GB: { siteId: '3',   country: 'GB', currency: 'GBP', siteName: 'UK' },
  EBAY_CA: { siteId: '2',   country: 'CA', currency: 'CAD', siteName: 'Canada' },
  EBAY_AU: { siteId: '15',  country: 'AU', currency: 'AUD', siteName: 'Australia' },
  EBAY_DE: { siteId: '77',  country: 'DE', currency: 'EUR', siteName: 'Germany' },
  EBAY_FR: { siteId: '71',  country: 'FR', currency: 'EUR', siteName: 'France' },
  EBAY_IT: { siteId: '101', country: 'IT', currency: 'EUR', siteName: 'Italy' },
  EBAY_ES: { siteId: '186', country: 'ES', currency: 'EUR', siteName: 'Spain' },
};

const CONDITION_MAP = { New: '1000', Used: '3000' };
const DURATION_MAP  = { '3': 'Days_3', '5': 'Days_5', '7': 'Days_7', '10': 'Days_10' };

function xmlEscape(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function handleCreateListing(body, env) {
  const {
    token, listing, marketplaceId = 'EBAY_US', sandbox = false,
    defaultLocation = '', defaultPostalCode = '', supabaseToken,
  } = body;

  if (!token)   return err('Missing "token"', 400, env);
  if (!listing) return err('Missing "listing"', 400, env);

  // ── Usage check ───────────────────────────────────────────────────────────
  let userId = null;
  if (supabaseToken && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    userId = await getSupabaseUserId(supabaseToken, env);

    if (userId) {
      // Fetch tier limits
      const limitRes = await supabaseFetch(
        `/tier_limits?select=listings_per_month`,
        {
          headers: {
            'Range': '0-0',
          }
        },
        env
      );

      // Get current usage + tier
      const billing = await getUserBilling(userId, env);
      const limitRes2 = await supabaseFetch(
        `/tier_limits?tier=eq.${billing.tier}&select=listings_per_month`,
        {}, env
      );
      const limit = Array.isArray(limitRes2.data) && limitRes2.data[0]?.listings_per_month != null
        ? limitRes2.data[0].listings_per_month
        : null; // null = unlimited

      if (limit !== null && billing.listingsUsed >= limit) {
        return err('limit_reached', 403, env, {
          tier:  billing.tier,
          used:  billing.listingsUsed,
          limit,
        });
      }
    }
  }

  const clientId     = sandbox ? env.EBAY_SANDBOX_CLIENT_ID     : env.EBAY_CLIENT_ID;
  const clientSecret = sandbox ? env.EBAY_SANDBOX_CLIENT_SECRET : env.EBAY_CLIENT_SECRET;
  const devId        = env.EBAY_DEV_ID;

  if (!devId) return err('EBAY_DEV_ID secret is not set on the Worker.', 500, env);

  const site        = SITE_MAP[marketplaceId] ?? SITE_MAP.EBAY_US;
  const isAuction   = listing.listingType === 'Auction';
  const callName    = isAuction ? 'AddItem' : 'AddFixedPriceItem';
  const price       = isAuction ? (listing.auctionStartPrice || '0.99') : (listing.price || '0.00');
  const duration    = isAuction ? (DURATION_MAP[String(listing.auctionDays)] ?? 'Days_7') : 'GTC';
  const listingType = isAuction ? 'Chinese' : 'FixedPriceItem';
  const conditionId = listing.conditionId || CONDITION_MAP[listing.condition] || '1000';

  // ── Trading card category guard ───────────────────────────────────────────
  // Categories 183050 (Non-Sport), 183454 (CCG), 261328 (Sports) only accept
  // conditionId 2750 (Graded) or 4000 (Ungraded). If neither is set, reject
  // early with an actionable message instead of letting eBay return a cryptic error.
  const TC_CATEGORIES   = new Set(['183050', '183454', '261328']);
  const TC_CONDITIONS   = new Set(['2750', '4000']);
  if (TC_CATEGORIES.has(listing.categoryId) && !TC_CONDITIONS.has(conditionId)) {
    return err(
      'Trading card listings require a card condition. In the Condition column, select "Graded" or "Ungraded", then fill in the details.',
      400, env
    );
  }

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
        return vals.filter(Boolean).map((v) =>
          `<NameValueList><Name>${xmlEscape(name)}</Name><Value>${xmlEscape(v)}</Value></NameValueList>`
        );
      }).join('\n      ')}
    </ItemSpecifics>`;

  // ── Condition Descriptors (trading cards: grader, grade, cert#, card condition) ──
  const conditionDescriptorsXml = (listing.conditionDescriptors ?? []).length === 0 ? '' : `
    <ConditionDescriptors>
      ${listing.conditionDescriptors.map((cd) => {
        // Descriptor 27503 = Certification Number — uses AdditionalInfo (free text), not Value
        const inner = cd.name === '27503'
          ? `<AdditionalInfo>${xmlEscape(String(cd.value))}</AdditionalInfo>`
          : `<Value>${xmlEscape(String(cd.value))}</Value>`;
        return `<ConditionDescriptor><Name>${xmlEscape(String(cd.name))}</Name>${inner}</ConditionDescriptor>`;
      }).join('\n      ')}
    </ConditionDescriptors>`;

  // ── Shipping ──────────────────────────────────────────────────────────────
  const hasPackageInfo = !!(listing.length && listing.width && listing.height && (listing.weightLbs || listing.weightOz));
  let shippingXml = '';
  let returnPolicyXml = '';
  let sellerProfilesXml = '';

  if (useBusinessPolicies) {
    const returnProfileId  = returnPolicy?.returnPolicyId ?? '';
    const paymentProfileId = (isAuction || listing.bestOffer) ? '' : (paymentPolicy?.paymentPolicyId ?? '');
    sellerProfilesXml = `
    <SellerProfiles>
      ${fulfillmentPolicyId ? `<SellerShippingProfile><ShippingProfileID>${fulfillmentPolicyId}</ShippingProfileID></SellerShippingProfile>` : ''}
      ${returnProfileId     ? `<SellerReturnProfile><ReturnProfileID>${returnProfileId}</ReturnProfileID></SellerReturnProfile>`             : ''}
      ${paymentProfileId    ? `<SellerPaymentProfile><PaymentProfileID>${paymentProfileId}</PaymentProfileID></SellerPaymentProfile>`       : ''}
    </SellerProfiles>`;
  } else {
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
  const readyImages  = (listing.images ?? []).filter((img) => img.ebayUrl);
  const pictureXml   = readyImages.length > 0 ? `
    <PictureDetails>
      ${readyImages.map((img) => `<PictureURL>${xmlEscape(img.ebayUrl)}</PictureURL>`).join('\n      ')}
    </PictureDetails>` : '';

  // ── Best Offer ────────────────────────────────────────────────────────────
  const hasBestOffer = listing.bestOffer && parseFloat(listing.bestOffer) > 0;
  const bestOfferXml = hasBestOffer ? `
    <BestOfferDetails>
      <BestOfferEnabled>true</BestOfferEnabled>
    </BestOfferDetails>
    <ListingDetails>
      <MinimumBestOfferPrice>${parseFloat(listing.bestOffer).toFixed(2)}</MinimumBestOfferPrice>
    </ListingDetails>` : '';

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
    ${conditionDescriptorsXml}
    <Country>${site.country}</Country>
    <Currency>${site.currency}</Currency>
    <Location>${xmlEscape(defaultLocation || site.country)}</Location>
    ${defaultPostalCode ? `<PostalCode>${xmlEscape(defaultPostalCode)}</PostalCode>` : ''}
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

  const text     = await res.text();
  const ack      = text.match(/<Ack>(.*?)<\/Ack>/)?.[1];
  const itemId   = text.match(/<ItemID>(\d+)<\/ItemID>/)?.[1];
  const shortMsg = decodeEntities(text.match(/<ShortMessage>(.*?)<\/ShortMessage>/)?.[1] ?? '');
  const longMsg  = decodeEntities(text.match(/<LongMessage>(.*?)<\/LongMessage>/)?.[1] ?? '');

  if (ack === 'Failure' || (!itemId && ack !== 'Success' && ack !== 'Warning')) {
    return err(longMsg || shortMsg || `Trading API error (${res.status})`, 400, env);
  }

  // ── Increment usage counter on success ────────────────────────────────────
  if (userId) {
    await supabaseRpc('increment_listing_usage', { p_user_id: userId }, env).catch(() => {});
  }

  // Fetch updated usage to return alongside the listing ID
  let usageInfo = null;
  if (userId) {
    const billing = await getUserBilling(userId, env).catch(() => null);
    if (billing) {
      const limitRes = await supabaseFetch(
        `/tier_limits?tier=eq.${billing.tier}&select=listings_per_month`,
        {}, env
      ).catch(() => null);
      const limit = Array.isArray(limitRes?.data) ? limitRes.data[0]?.listings_per_month ?? null : null;
      usageInfo = { tier: billing.tier, used: billing.listingsUsed, limit };
    }
  }

  return ok({ listingId: itemId, usage: usageInfo }, env);
}

// ── /user-location ────────────────────────────────────────────────────────────

async function handleUserLocation(body, env) {
  const { token, sandbox = false } = body;
  if (!token) return err('Missing "token"', 400, env);

  const clientId     = sandbox ? env.EBAY_SANDBOX_CLIENT_ID     : env.EBAY_CLIENT_ID;
  const clientSecret = sandbox ? env.EBAY_SANDBOX_CLIENT_SECRET : env.EBAY_CLIENT_SECRET;
  const devId        = env.EBAY_DEV_ID;
  if (!devId) return ok({ location: '' }, env);

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetUserRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${token}</eBayAuthToken>
  </RequesterCredentials>
</GetUserRequest>`;

  const apiUrl = sandbox ? TRADING_API_SANDBOX_URL : TRADING_API_URL;
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type':                    'text/xml',
      'X-EBAY-API-COMPATIBILITY-LEVEL':  '1263',
      'X-EBAY-API-DEV-NAME':             devId,
      'X-EBAY-API-APP-NAME':             clientId,
      'X-EBAY-API-CERT-NAME':            clientSecret,
      'X-EBAY-API-CALL-NAME':            'GetUser',
      'X-EBAY-API-SITEID':               '0',
    },
    body: xml,
  });

  const text  = await res.text();
  const city  = text.match(/<CityName>([^<]*)<\/CityName>/)?.[1]?.trim()           ?? '';
  const state = text.match(/<StateOrProvince>([^<]*)<\/StateOrProvince>/)?.[1]?.trim() ?? '';
  const zip   = text.match(/<PostalCode>([^<]*)<\/PostalCode>/)?.[1]?.trim()        ?? '';

  const location = city && state ? `${city}, ${state}` : city || zip || '';
  return ok({ location, postalCode: zip }, env);
}

// ── /upload-image ─────────────────────────────────────────────────────────────

async function handleUploadImage(body, env) {
  const { token, imageBase64, imageName = 'image.jpg', mimeType = 'image/jpeg', sandbox = false } = body;
  if (!token)       return err('Missing "token"', 400, env);
  if (!imageBase64) return err('Missing "imageBase64"', 400, env);

  const clientId     = sandbox ? env.EBAY_SANDBOX_CLIENT_ID     : env.EBAY_CLIENT_ID;
  const clientSecret = sandbox ? env.EBAY_SANDBOX_CLIENT_SECRET : env.EBAY_CLIENT_SECRET;
  const devId        = env.EBAY_DEV_ID;
  if (!devId) return err('EBAY_DEV_ID secret not set', 500, env);

  const binaryStr = atob(imageBase64);
  const bytes     = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  const imageBlob = new Blob([bytes], { type: mimeType });

  const pictureName = imageName.replace(/\.[^.]+$/, '');
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

  const text     = await res.text();
  const ack      = text.match(/<Ack>(.*?)<\/Ack>/)?.[1];
  const fullUrl  = text.match(/<FullURL>(.*?)<\/FullURL>/)?.[1];
  const shortMsg = decodeEntities(text.match(/<ShortMessage>(.*?)<\/ShortMessage>/)?.[1] ?? '');
  const longMsg  = decodeEntities(text.match(/<LongMessage>(.*?)<\/LongMessage>/)?.[1] ?? '');

  if ((ack !== 'Success' && ack !== 'Warning') || !fullUrl) {
    return err(longMsg || shortMsg || 'Image upload failed', 400, env);
  }

  return ok({ url: fullUrl }, env);
}

// ── /billing/usage ────────────────────────────────────────────────────────────

async function handleBillingUsage(body, env) {
  const { supabaseToken } = body;
  if (!supabaseToken) return err('Missing "supabaseToken"', 400, env);

  const userId = await getSupabaseUserId(supabaseToken, env);
  if (!userId) return err('Invalid or expired session', 401, env);

  const billing = await getUserBilling(userId, env);
  const limitRes = await supabaseFetch(
    `/tier_limits?tier=eq.${billing.tier}&select=listings_per_month,max_rules,max_images`,
    {}, env
  );
  const limits = Array.isArray(limitRes.data) ? limitRes.data[0] : {};

  return ok({
    tier:        billing.tier,
    used:        billing.listingsUsed,
    limit:       limits.listings_per_month ?? null,
    maxRules:    limits.max_rules ?? null,
    maxImages:   limits.max_images ?? null,
    periodStart: billing.periodStart,
    periodEnd:   billing.periodEnd,
  }, env);
}

// ── /billing/checkout ─────────────────────────────────────────────────────────

async function handleBillingCheckout(body, env) {
  const { supabaseToken, priceId } = body;
  if (!supabaseToken) return err('Missing "supabaseToken"', 400, env);
  if (!priceId)       return err('Missing "priceId"', 400, env);

  const userId = await getSupabaseUserId(supabaseToken, env);
  if (!userId) return err('Invalid or expired session', 401, env);

  const billing     = await getUserBilling(userId, env);
  const origin      = env.ALLOWED_ORIGIN || 'https://createmylistings.com';

  // Get or create Stripe customer
  let customerId = billing.stripeCustomerId;
  if (!customerId) {
    // Fetch user email from Supabase
    const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${supabaseToken}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      },
    });
    const userData = await userRes.json().catch(() => ({}));
    const email    = userData?.email ?? '';

    const customerRes = await stripeFetch('/customers', { email, metadata: { supabase_user_id: userId } }, env);
    if (!customerRes.ok) return err('Failed to create Stripe customer', 500, env);
    customerId = customerRes.data.id;

    // Save customer ID to Supabase
    await supabaseFetch(`/user_subscriptions?user_id=eq.${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ stripe_customer_id: customerId, updated_at: new Date().toISOString() }),
    }, env);
  }

  // Create Checkout Session
  const sessionRes = await stripeFetch('/checkout/sessions', {
    customer:               customerId,
    mode:                   'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    success_url:            `${origin}?checkout=success`,
    cancel_url:             `${origin}?checkout=cancel`,
    client_reference_id:    userId,
    'subscription_data[trial_period_days]': '14',
  }, env);

  if (!sessionRes.ok) return err('Failed to create checkout session', 500, env);
  return ok({ url: sessionRes.data.url }, env);
}

// ── /billing/portal ───────────────────────────────────────────────────────────

async function handleBillingPortal(body, env) {
  const { supabaseToken } = body;
  if (!supabaseToken) return err('Missing "supabaseToken"', 400, env);

  const userId = await getSupabaseUserId(supabaseToken, env);
  if (!userId) return err('Invalid or expired session', 401, env);

  const billing = await getUserBilling(userId, env);
  if (!billing.stripeCustomerId) return err('No billing account found', 404, env);

  const origin     = env.ALLOWED_ORIGIN || 'https://createmylistings.com';
  const portalRes  = await stripeFetch('/billing_portal/sessions', {
    customer:    billing.stripeCustomerId,
    return_url:  origin,
  }, env);

  if (!portalRes.ok) return err('Failed to create portal session', 500, env);
  return ok({ url: portalRes.data.url }, env);
}

// ── /billing/webhook ──────────────────────────────────────────────────────────

async function handleStripeWebhook(request, env) {
  const rawBody  = await request.text();
  const sigHeader = request.headers.get('stripe-signature') ?? '';

  const valid = await verifyStripeSignature(rawBody, sigHeader, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400 });
  }

  let event;
  try { event = JSON.parse(rawBody); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }); }

  const tierMap = PRICE_TO_TIER(env);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session    = event.data.object;
        const userId     = session.client_reference_id;
        const customerId = session.customer;
        const subId      = session.subscription;
        if (!userId) break;

        // Fetch the subscription to get the price ID and billing period
        const subFetch = await fetch(`https://api.stripe.com/v1/subscriptions/${subId}`, {
          headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
        });
        const sub   = await subFetch.json().catch(() => ({}));
        const priceId = sub?.items?.data?.[0]?.price?.id ?? '';
        const tier    = tierMap[priceId] ?? 'pro';
        const periodStart = sub?.current_period_start
          ? new Date(sub.current_period_start * 1000).toISOString() : new Date().toISOString();
        const periodEnd = sub?.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString() : null;

        await supabaseFetch(`/user_subscriptions?user_id=eq.${userId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            tier,
            stripe_customer_id: customerId,
            stripe_sub_id:      subId,
            period_start:       periodStart,
            period_end:         periodEnd,
            updated_at:         new Date().toISOString(),
          }),
        }, env);
        break;
      }

      case 'customer.subscription.updated': {
        const sub       = event.data.object;
        const priceId   = sub?.items?.data?.[0]?.price?.id ?? '';
        const tier      = tierMap[priceId] ?? 'pro';
        const customerId = sub.customer;
        const periodStart = sub.current_period_start
          ? new Date(sub.current_period_start * 1000).toISOString() : null;
        const periodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString() : null;

        await supabaseFetch(`/user_subscriptions?stripe_customer_id=eq.${customerId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            tier,
            stripe_sub_id: sub.id,
            period_start:  periodStart,
            period_end:    periodEnd,
            updated_at:    new Date().toISOString(),
          }),
        }, env);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub        = event.data.object;
        const customerId = sub.customer;

        await supabaseFetch(`/user_subscriptions?stripe_customer_id=eq.${customerId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            tier:          'free',
            stripe_sub_id: null,
            updated_at:    new Date().toISOString(),
          }),
        }, env);
        break;
      }

      case 'invoice.payment_failed': {
        // Optional: flag the user or send an alert — for now just log
        break;
      }
    }
  } catch (e) {
    // Log but return 200 — Stripe will retry if we return non-2xx
    console.error('Webhook handler error:', e.message);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
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
