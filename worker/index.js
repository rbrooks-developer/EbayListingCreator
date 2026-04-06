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

  return err('Unknown route — use /exchange, /refresh, or /proxy', 404, env);
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function getEbayEnv(sandbox, env) {
  return {
    clientId:     sandbox ? env.EBAY_SANDBOX_CLIENT_ID     : env.EBAY_CLIENT_ID,
    clientSecret: sandbox ? env.EBAY_SANDBOX_CLIENT_SECRET : env.EBAY_CLIENT_SECRET,
    ruName:       sandbox ? env.EBAY_SANDBOX_RUNAME        : env.EBAY_RUNAME,
    tokenUrl:     sandbox ? EBAY_SANDBOX_TOKEN_URL         : EBAY_TOKEN_URL,
  };
}
