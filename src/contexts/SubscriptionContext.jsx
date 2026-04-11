import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { fetchUsage } from '../services/billingService.js';

const SubscriptionContext = createContext(null);

/**
 * Provides billing/usage data to the whole app.
 * usage: { tier, used, limit, maxRules, maxImages, periodStart, periodEnd } | null
 */
export function SubscriptionProvider({ children }) {
  const { user } = useAuth();
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) { setUsage(null); return; }
    setLoading(true);
    try {
      const data = await fetchUsage();
      setUsage(data);
    } catch {
      // non-fatal — usage will remain null
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <SubscriptionContext.Provider value={{ usage, loading, refresh }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be used inside <SubscriptionProvider>');
  return ctx;
}
