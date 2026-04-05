import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { isSupabaseConfigured } from '../../services/authService.js';
import styles from './AuthModal.module.css';

// ── Social provider definitions ───────────────────────────────────────────────

// All four providers below are 100% free to set up:
//   Google   — console.cloud.google.com  → APIs & Services → Credentials → OAuth 2.0 Client ID
//   GitHub   — github.com/settings/developers → OAuth Apps → New OAuth App
//   Discord  — discord.com/developers    → New Application → OAuth2
//   LinkedIn — linkedin.com/developers   → Create App → Auth tab
const PROVIDERS = [
  {
    id: 'google',
    label: 'Google',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
    ),
    className: styles.providerGoogle,
  },
  {
    id: 'github',
    label: 'GitHub',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
      </svg>
    ),
    className: styles.providerGitHub,
  },
  {
    id: 'discord',
    label: 'Discord',
    comingSoon: true,
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
      </svg>
    ),
    className: styles.providerDiscord,
  },
  {
    id: 'linkedin_oidc',
    label: 'LinkedIn',
    comingSoon: true,
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
    ),
    className: styles.providerLinkedIn,
  },
];

// ── Error humaniser ───────────────────────────────────────────────────────────

function humaniseError(err) {
  const msg = err?.message ?? '';
  if (msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('networkerror')) {
    return 'Could not reach the authentication server. Check your internet connection, or verify that your Supabase URL and anon key are correct in your .env file.';
  }
  if (msg.includes('Invalid login credentials')) {
    return 'Incorrect email or password.';
  }
  if (msg.includes('User already registered')) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (msg.includes('Email not confirmed')) {
    return 'Please confirm your email address before signing in.';
  }
  if (msg.includes('Password should be')) {
    return 'Password must be at least 6 characters.';
  }
  return msg || 'Something went wrong. Please try again.';
}

// ── Validation ────────────────────────────────────────────────────────────────

function validate(mode, fields) {
  const errors = {};
  if (mode === 'signup' && !fields.name.trim()) {
    errors.name = 'Name is required.';
  }
  if (!fields.email.trim()) {
    errors.email = 'Email is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
    errors.email = 'Enter a valid email address.';
  }
  if (!fields.password) {
    errors.password = 'Password is required.';
  } else if (fields.password.length < 8) {
    errors.password = 'Password must be at least 8 characters.';
  }
  if (mode === 'signup' && fields.password !== fields.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }
  return errors;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AuthModal({ isOpen, onClose }) {
  const { signUp, signIn, signInWithProvider } = useAuth();

  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [fields, setFields] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState(null); // provider id

  const firstInputRef = useRef(null);
  const overlayRef = useRef(null);

  // Focus first input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => firstInputRef.current?.focus(), 50);
      setSubmitError('');
      setSuccessMsg('');
      setFieldErrors({});
    }
  }, [isOpen, mode]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose();
  }

  function handleFieldChange(e) {
    const { name, value } = e.target;
    setFields((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => { const n = { ...prev }; delete n[name]; return n; });
    }
    setSubmitError('');
  }

  function switchMode(newMode) {
    setMode(newMode);
    setFields({ name: '', email: '', password: '', confirmPassword: '' });
    setFieldErrors({});
    setSubmitError('');
    setSuccessMsg('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errors = validate(mode, fields);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    setSubmitError('');
    setSuccessMsg('');

    try {
      if (mode === 'signup') {
        await signUp(fields.email, fields.password, fields.name.trim());
        // setSuccessMsg('Account created! Check your email to confirm before signing in.');
        setSuccessMsg('Account created! Please sign in.');
      } else {
        await signIn(fields.email, fields.password);
        onClose();
      }
    } catch (err) {
      setSubmitError(humaniseError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSocialSignIn(providerId) {
    setSocialLoading(providerId);
    setSubmitError('');
    try {
      await signInWithProvider(providerId);
      // Page will redirect — no need to close modal
    } catch (err) {
      setSubmitError(humaniseError(err));
      setSocialLoading(null);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const isSignUp = mode === 'signup';

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={isSignUp ? 'Create account' : 'Sign in'}
    >
      <div className={styles.modal}>
        {/* Close button */}
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
          &#x2715;
        </button>

        {/* Logo + heading */}
        <div className={styles.modalHeader}>
          <div className={styles.logo} aria-hidden="true">
            <span className={styles.logoE}>e</span>
            <span className={styles.logoB}>B</span>
            <span className={styles.logoA}>a</span>
            <span className={styles.logoY}>y</span>
          </div>
          <h2 className={styles.title}>
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </h2>
          <p className={styles.subtitle}>
            {isSignUp
              ? 'Sign up to save your listings and settings.'
              : 'Sign in to access your listings.'}
          </p>
        </div>

        {/* Mode tabs */}
        <div className={styles.tabs} role="tablist">
          <button
            role="tab"
            aria-selected={!isSignUp}
            className={`${styles.tab} ${!isSignUp ? styles.tabActive : ''}`}
            onClick={() => switchMode('signin')}
          >
            Sign In
          </button>
          <button
            role="tab"
            aria-selected={isSignUp}
            className={`${styles.tab} ${isSignUp ? styles.tabActive : ''}`}
            onClick={() => switchMode('signup')}
          >
            Create Account
          </button>
        </div>

        <div className={styles.body}>
          {/* Setup warning — shown when .env is not configured */}
          {!isSupabaseConfigured && (
            <div className={styles.setupBanner} role="alert">
              <strong>Supabase not configured.</strong>
              {' '}Copy <code>.env.example</code> to <code>.env</code> and add your
              project URL and anon key from the{' '}
              <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer">
                Supabase dashboard
              </a>.
            </div>
          )}

          {/* Social providers */}
          <div className={styles.socialGrid}>
            {PROVIDERS.map((p) => (
              <div key={p.id} className={styles.socialBtnWrapper}>
                <button
                  className={`${styles.socialBtn} ${p.className} ${p.comingSoon ? styles.socialBtnDisabled : ''}`}
                  onClick={() => !p.comingSoon && handleSocialSignIn(p.id)}
                  disabled={p.comingSoon || loading || socialLoading !== null}
                  aria-label={p.comingSoon ? `${p.label} (coming soon)` : `Continue with ${p.label}`}
                  title={p.comingSoon ? 'Not configured yet' : undefined}
                >
                  <span className={styles.socialIcon}>
                    {socialLoading === p.id ? <Spinner /> : p.icon}
                  </span>
                  <span className={styles.socialLabel}>{p.label}</span>
                </button>
                {p.comingSoon && <span className={styles.comingSoonBadge}>Soon</span>}
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className={styles.divider}>
            <span>or continue with email</span>
          </div>

          {/* Email / password form */}
          {successMsg ? (
            <div className={styles.successBox} role="status">
              <span className={styles.successIcon}>&#10003;</span>
              <div>
                <strong>Check your inbox</strong>
                <p>{successMsg}</p>
                <button
                  className={styles.linkBtn}
                  onClick={() => switchMode('signin')}
                >
                  Go to Sign In
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              {isSignUp && (
                <Field
                  label="Full name"
                  id="auth-name"
                  name="name"
                  type="text"
                  value={fields.name}
                  onChange={handleFieldChange}
                  error={fieldErrors.name}
                  autoComplete="name"
                  ref={firstInputRef}
                  disabled={loading}
                />
              )}

              <Field
                label="Email address"
                id="auth-email"
                name="email"
                type="email"
                value={fields.email}
                onChange={handleFieldChange}
                error={fieldErrors.email}
                autoComplete="email"
                ref={!isSignUp ? firstInputRef : undefined}
                disabled={loading}
              />

              <Field
                label="Password"
                id="auth-password"
                name="password"
                type="password"
                value={fields.password}
                onChange={handleFieldChange}
                error={fieldErrors.password}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                hint={isSignUp ? 'Minimum 8 characters' : null}
                disabled={loading}
              />

              {isSignUp && (
                <Field
                  label="Confirm password"
                  id="auth-confirm"
                  name="confirmPassword"
                  type="password"
                  value={fields.confirmPassword}
                  onChange={handleFieldChange}
                  error={fieldErrors.confirmPassword}
                  autoComplete="new-password"
                  disabled={loading}
                />
              )}

              {submitError && (
                <div className={styles.errorBox} role="alert">
                  {submitError}
                </div>
              )}

              <button
                type="submit"
                className={styles.submitBtn}
                disabled={loading || socialLoading !== null}
              >
                {loading ? (
                  <><Spinner white /> {isSignUp ? 'Creating account...' : 'Signing in...'}</>
                ) : (
                  isSignUp ? 'Create Account' : 'Sign In'
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Field ─────────────────────────────────────────────────────────────────────

const Field = React.forwardRef(function Field(
  { label, id, name, type, value, onChange, error, autoComplete, hint, disabled },
  ref
) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input
        ref={ref}
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        className={error ? styles.inputError : ''}
      />
      {hint && !error && <span id={`${id}-hint`} className={styles.hint}>{hint}</span>}
      {error && <span id={`${id}-err`} className={styles.fieldError} role="alert">{error}</span>}
    </div>
  );
});

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner({ white }) {
  return <span className={`${styles.spinner} ${white ? styles.spinnerWhite : ''}`} aria-hidden="true" />;
}
