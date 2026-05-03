import { useEffect, useState } from 'react';

const WORKER_URL = (import.meta.env.VITE_TOKEN_WORKER_URL ?? '').replace(/\/$/, '');

// Module-level cache — fetched once per session, shared across all consumers
let _cache = null;
let _promise = null;

function fetchTiers() {
  if (_cache) return Promise.resolve(_cache);
  if (_promise) return _promise;
  _promise = fetch(`${WORKER_URL}/billing/tiers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
    .then((r) => r.json())
    .then((data) => {
      const map = {};
      (data.tiers ?? []).forEach((t) => { map[t.tier] = t; });
      _cache = map;
      return map;
    })
    .catch(() => null);
  return _promise;
}

/**
 * Returns a map of { free, pro, business } → { tier, price, listings_per_month, max_rules, max_images }
 * Returns null while loading or if the fetch fails.
 */
export function useTierPrices() {
  const [tiers, setTiers] = useState(_cache);

  useEffect(() => {
    if (_cache) return;
    fetchTiers().then((map) => { if (map) setTiers(map); });
  }, []);

  return tiers;
}

/** Format a numeric price from the DB into a display string: 0 → '$0', 9.99 → '$9.99' */
export function fmtPrice(price) {
  if (!price || price === 0) return '$0';
  const n = parseFloat(price);
  return `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
}
