/**
 * Cloudflare Worker — eBay Token Proxy
 *
 * Proxies eBay OAuth token exchange and refresh requests server-side,
 * avoiding CORS restrictions that block browser-to-eBay calls.
 *
 * Environment variables (set via Cloudflare dashboard or wrangler.toml [vars]):
 *   EBAY_CLIENT_ID            — Production App ID
 *   EBAY_CLIENT_SECRET        — Production Client Secret
 *   EBAY_RUNAME               — Production RuName
 *   EBAY_SANDBOX_CLIENT_ID    — Sandbox App ID
 *   EBAY_SANDBOX_CLIENT_SECRET — Sandbox Client Secret
 *   EBAY_SANDBOX_RUNAME       — Sandbox RuName
 *   ALLOWED_ORIGIN            — e.g. https://rbrooks-developer.github.io
 *                               Use * to allow all origins (dev only)
 */

const EBAY_TOKEN_URL         = 'https://api.ebay.com/identity/v1/oauth2/token';
const EBAY_SANDBOX_TOKEN_URL = 'https://api.sandbox.ebay.com/identity/v1/oauth2/token';

const USER_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
].join(' ');

// ── CORS helpers ──────────────────────────────────────────────────────────────

function corsHeaders(env, requestOrigin) {
  const allowed = env.ALLOWED_ORIGIN ?? '*';
  const origin  = allowed === '*' ? '*' : (requestOrigin === allowed ? allowed : allowed);
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function handleOptions(env, requestOrigin) {
  return new Response(null, { status: 204, headers: corsHeaders(env, requestOrigin) });
}

function jsonResponse(data, status, env, requestOrigin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(env, requestOrigin),
    },
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    const url    = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') return handleOptions(env, origin);

    // Only accept POST
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, env, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400, env, origin);
    }

    const sandbox = body.sandbox === true;

    const clientId     = sandbox ? env.EBAY_SANDBOX_CLIENT_ID     : env.EBAY_CLIENT_ID;
    const clientSecret = sandbox ? env.EBAY_SANDBOX_CLIENT_SECRET : env.EBAY_CLIENT_SECRET;
    const ruName       = sandbox ? env.EBAY_SANDBOX_RUNAME        : env.EBAY_RUNAME;
    const tokenUrl     = sandbox ? EBAY_SANDBOX_TOKEN_URL         : EBAY_TOKEN_URL;

    if (!clientId || !clientSecret || !ruName) {
      return jsonResponse(
        { error: `Worker is missing ${sandbox ? 'sandbox' : 'production'} eBay credentials.` },
        500, env, origin
      );
    }

    const credentials = btoa(`${clientId}:${clientSecret}`);
    let formBody;

    // ── Route: /exchange — authorization code → tokens ────────────────────────
    if (url.pathname.endsWith('/exchange')) {
      const { code } = body;
      if (!code) return jsonResponse({ error: 'Missing "code"' }, 400, env, origin);

      formBody = new URLSearchParams({
        grant_type:   'authorization_code',
        code,
        redirect_uri: ruName,
      });

    // ── Route: /refresh — refresh token → new access token ───────────────────
    } else if (url.pathname.endsWith('/refresh')) {
      const { refreshToken } = body;
      if (!refreshToken) return jsonResponse({ error: 'Missing "refreshToken"' }, 400, env, origin);

      formBody = new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: refreshToken,
        scope:         USER_SCOPES,
      });

    } else {
      return jsonResponse({ error: 'Unknown route. Use /exchange or /refresh.' }, 404, env, origin);
    }

    // ── Forward to eBay ───────────────────────────────────────────────────────
    const ebayRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Authorization:  `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody,
    });

    const data = await ebayRes.json().catch(() => ({}));

    if (!ebayRes.ok) {
      return jsonResponse(
        { error: data.error_description ?? data.error ?? `eBay error ${ebayRes.status}` },
        ebayRes.status, env, origin
      );
    }

    return jsonResponse(data, 200, env, origin);
  },
};
