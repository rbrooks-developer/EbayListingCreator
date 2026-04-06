/**
 * eBay configuration — reads from localStorage first, falls back to env vars.
 * This lets the app work without build-time secrets.
 */

const STORAGE_KEY = 'ebay_dev_config';

export function getEbayConfig() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch { /* ignore */ }

  return {
    clientId:        stored.clientId        || import.meta.env.VITE_EBAY_CLIENT_ID             || '',
    ruName:          stored.ruName          || import.meta.env.VITE_EBAY_RUNAME                || '',
    sandboxClientId: stored.sandboxClientId || import.meta.env.VITE_EBAY_SANDBOX_CLIENT_ID     || '',
    sandboxRuName:   stored.sandboxRuName   || import.meta.env.VITE_EBAY_SANDBOX_RUNAME        || '',
    workerUrl:       stored.workerUrl       || import.meta.env.VITE_TOKEN_WORKER_URL            || '',
  };
}

export function saveEbayConfig(values) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
}

export function clearEbayConfig() {
  localStorage.removeItem(STORAGE_KEY);
}
