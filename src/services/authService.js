import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured =
  !!supabaseUrl &&
  !!supabaseAnonKey &&
  !supabaseUrl.includes('placeholder');

export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder'
);

function assertConfigured() {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Copy .env.example to .env and add your ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from the Supabase dashboard.'
    );
  }
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

export async function signUpWithEmail(email, password, displayName) {
  assertConfigured();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: displayName },
    },
  });
  if (error) throw error;
  return data;
}

export async function signInWithEmail(email, password) {
  assertConfigured();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

/**
 * Kick off a social OAuth flow.
 * @param {'google'|'apple'|'discord'|'linkedin_oidc'} provider
 */
export async function signInWithProvider(provider) {
  assertConfigured();
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      // After OAuth the provider redirects back here; Supabase parses the token.
      redirectTo: window.location.origin + window.location.pathname,
    },
  });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
