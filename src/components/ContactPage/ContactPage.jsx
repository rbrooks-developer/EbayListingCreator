import { useEffect, useRef, useState } from 'react';
import styles from './ContactPage.module.css';

const WORKER_URL   = (import.meta.env.VITE_TOKEN_WORKER_URL ?? '').replace(/\/$/, '');
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';

const SUGGESTION_PROMPTS = [
  { icon: '✨', text: 'A new column or field you wish the listing grid had' },
  { icon: '📥', text: 'Import / export improvements or additional file formats' },
  { icon: '🔗', text: 'Integrations with other marketplaces or tools' },
  { icon: '📦', text: 'Better shipping, dimensions, or package-size support' },
  { icon: '🃏', text: 'Trading card or collectibles features' },
  { icon: '⚡', text: 'Speed or workflow improvements for bulk listing' },
];

// Module-level promise so all TurnstileWidget instances share one script load.
// The second widget was returning early when it found the <script> tag already
// in the DOM and never setting ready=true.
let _turnstilePromise = null;

function loadTurnstileScript() {
  if (_turnstilePromise) return _turnstilePromise;
  if (window.turnstile)  return (_turnstilePromise = Promise.resolve());

  _turnstilePromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src   = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = resolve;
    document.head.appendChild(script);
  });
  return _turnstilePromise;
}

function useTurnstileScript() {
  const [ready, setReady] = useState(() => !!window.turnstile);
  useEffect(() => {
    if (window.turnstile) { setReady(true); return; }
    loadTurnstileScript().then(() => setReady(true));
  }, []);
  return ready;
}

function TurnstileWidget({ onToken, onExpire, formId }) {
  const containerRef = useRef(null);
  const widgetId     = useRef(null);
  const scriptReady  = useTurnstileScript();

  useEffect(() => {
    if (!scriptReady || !containerRef.current || !TURNSTILE_SITE_KEY) return;
    if (widgetId.current !== null) return; // already rendered

    widgetId.current = window.turnstile.render(containerRef.current, {
      sitekey:           TURNSTILE_SITE_KEY,
      callback:          onToken,
      'expired-callback': onExpire,
      'error-callback':  onExpire,
    });

    return () => {
      if (widgetId.current !== null) {
        window.turnstile?.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [scriptReady]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!TURNSTILE_SITE_KEY) return null;

  return <div ref={containerRef} className={styles.captcha} />;
}

function ContactForm({ type, emailAddress, buttonLabel, placeholder }) {
  const [name,    setName]    = useState('');
  const [email,   setEmail]   = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [token,   setToken]   = useState('');
  const [status,  setStatus]  = useState('idle'); // idle | sending | success | error
  const [errMsg,  setErrMsg]  = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!message.trim() || status === 'sending') return;
    if (TURNSTILE_SITE_KEY && !token) return; // captcha not completed

    const emailVal = email.trim();
    if (emailVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      setErrMsg('Please enter a valid email address.');
      setStatus('error');
      return;
    }

    setStatus('sending');
    setErrMsg('');

    try {
      const res = await fetch(`${WORKER_URL}/contact`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          name:         name.trim(),
          email:        email.trim(),
          subject:      subject.trim(),
          message:      message.trim(),
          captchaToken: token,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || `Server error (${res.status})`);
      }

      setStatus('success');
      setName(''); setEmail(''); setSubject(''); setMessage(''); setToken('');
      // Reset Turnstile widget so it's ready for another submission
      window.turnstile?.reset();

    } catch (e) {
      setErrMsg(e.message);
      setStatus('error');
      window.turnstile?.reset();
      setToken('');
    }
  }

  const canSubmit = message.trim() && (!TURNSTILE_SITE_KEY || token) && status !== 'sending';

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${type}-name`}>Your name</label>
          <input
            id={`${type}-name`}
            type="text"
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Smith"
            autoComplete="name"
            disabled={status === 'sending'}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${type}-email`}>Your email</label>
          <input
            id={`${type}-email`}
            type="email"
            className={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            autoComplete="email"
            disabled={status === 'sending'}
          />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${type}-subject`}>Subject</label>
        <input
          id={`${type}-subject`}
          type="text"
          className={styles.input}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="What's this about?"
          disabled={status === 'sending'}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${type}-message`}>
          {placeholder} <span className={styles.required}>*</span>
        </label>
        <textarea
          id={`${type}-message`}
          className={styles.textarea}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          required
          placeholder={`Write your ${placeholder.toLowerCase()} here…`}
          disabled={status === 'sending'}
        />
      </div>

      <TurnstileWidget
        formId={type}
        onToken={setToken}
        onExpire={() => setToken('')}
      />

      {status === 'success' && (
        <div className={styles.successMsg} role="status">
          Message sent — we'll get back to you soon.
        </div>
      )}

      {status === 'error' && (
        <div className={styles.errorMsg} role="alert">
          {errMsg || 'Something went wrong. Please try again.'}
        </div>
      )}

      <div className={styles.formFooter}>
        <p className={styles.emailNote}>
          Sent to{' '}
          <a href={`mailto:${emailAddress}`} className={styles.emailLink}>
            {emailAddress}
          </a>
        </p>
        <button type="submit" className={styles.submitBtn} disabled={!canSubmit}>
          {status === 'sending' ? (
            <><span className={styles.spinner} aria-hidden="true" /> Sending…</>
          ) : buttonLabel}
        </button>
      </div>
    </form>
  );
}

export default function ContactPage() {
  return (
    <section className={styles.section} id="contact">
      <div className={styles.container}>

        <div className={styles.pageHeader}>
          <h2 className={styles.pageTitle}>Contact Us</h2>
          <p className={styles.pageSubtitle}>
            We read every message. Whether you have a question or an idea,
            we'd love to hear from you.
          </p>
        </div>

        <div className={styles.panels}>

          {/* ── General Questions ── */}
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div className={styles.panelIcon}>✉</div>
              <div>
                <h3 className={styles.panelTitle}>General Questions</h3>
                <p className={styles.panelSubtitle}>
                  Account help, eBay connection issues, billing, or anything else — we're here.
                </p>
              </div>
            </div>

            <div className={styles.topicList}>
              <span className={styles.topic}>eBay connection &amp; OAuth</span>
              <span className={styles.topic}>Listing errors</span>
              <span className={styles.topic}>Account &amp; billing</span>
              <span className={styles.topic}>Import / export help</span>
              <span className={styles.topic}>Trading card support</span>
            </div>

            <ContactForm
              type="question"
              emailAddress="info@createmylistings.com"
              buttonLabel="Send Question →"
              placeholder="Message"
            />
          </div>

          {/* ── Suggestions ── */}
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div className={styles.panelIcon}>💡</div>
              <div>
                <h3 className={styles.panelTitle}>Suggestions &amp; Feature Requests</h3>
                <p className={styles.panelSubtitle}>
                  Have an idea that would make listing faster or easier? Tell us about it.
                </p>
              </div>
            </div>

            <div className={styles.promptGrid}>
              {SUGGESTION_PROMPTS.map((p) => (
                <div key={p.text} className={styles.prompt}>
                  <span className={styles.promptIcon} aria-hidden="true">{p.icon}</span>
                  <span className={styles.promptText}>{p.text}</span>
                </div>
              ))}
            </div>

            <ContactForm
              type="suggestion"
              emailAddress="suggestions@createmylistings.com"
              buttonLabel="Send Suggestion →"
              placeholder="Suggestion"
            />
          </div>

        </div>
      </div>
    </section>
  );
}
