import { supabase } from './authService.js';

const WORKER_URL = (import.meta.env.VITE_TOKEN_WORKER_URL ?? '').replace(/\/$/, '');

/**
 * Fetch the free tier's listing limit from tier_limits (public, no auth required).
 * Returns the number (e.g. 20) or null on failure.
 */
export async function fetchFreeTierLimit() {
  try {
    const { data, error } = await supabase
      .from('tier_limits')
      .select('listings_per_month')
      .eq('tier', 'free')
      .single();
    if (error || !data) return null;
    return data.listings_per_month;
  } catch {
    return null;
  }
}

async function getToken() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function workerPost(route, payload) {
  const res = await fetch(`${WORKER_URL}/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Worker error (${res.status})`);
  return data;
}

/**
 * Fetch the current user's billing usage from the worker.
 * Returns { tier, used, limit, maxRules, maxImages, periodStart, periodEnd }
 * or null if not signed in or on error.
 */
export async function fetchUsage() {
  const supabaseToken = await getToken();
  if (!supabaseToken) return null;
  try {
    return await workerPost('billing/usage', { supabaseToken });
  } catch {
    return null;
  }
}

/**
 * Create a Stripe Checkout Session for the given price ID.
 * Redirects the browser to Stripe on success.
 */
export async function startCheckout(priceId) {
  const supabaseToken = await getToken();
  if (!supabaseToken) throw new Error('You must be signed in to upgrade.');
  const data = await workerPost('billing/checkout', { supabaseToken, priceId });
  if (data.upgraded) {
    // Existing subscription was updated in place — reload to refresh usage/tier
    window.location.reload();
  } else {
    window.location.href = data.url;
  }
}

/**
 * Open the Stripe Customer Portal so the user can manage their subscription.
 * Redirects the browser on success.
 */
export async function openCustomerPortal() {
  const supabaseToken = await getToken();
  if (!supabaseToken) throw new Error('You must be signed in.');
  const data = await workerPost('billing/portal', { supabaseToken });
  window.location.href = data.url;
}
