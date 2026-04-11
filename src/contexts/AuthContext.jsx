import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  supabase,
  signUpWithEmail,
  signInWithEmail,
  signInWithProvider as providerSignIn,
  signOut as authSignOut,
} from '../services/authService.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // true until initial session checked

  useEffect(() => {
    let subscription;

    // Hydrate session — catch network/config errors so they don't crash the app
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null);
      })
      .catch(() => {
        // Supabase unreachable or misconfigured — continue as signed-out
      })
      .finally(() => {
        setLoading(false);
      });

    // Keep state in sync with Supabase auth events
    try {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
      });
      subscription = data.subscription;
    } catch {
      // onAuthStateChange unavailable — non-fatal
    }

    return () => subscription?.unsubscribe();
  }, []);

  async function getAccessToken() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token ?? null;
    } catch {
      return null;
    }
  }

  const value = {
    user,
    loading,
    getAccessToken,
    signUp: signUpWithEmail,
    signIn: signInWithEmail,
    signInWithProvider: providerSignIn,
    signOut: authSignOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
