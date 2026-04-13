import { useState } from 'react';
import styles from './ContactPage.module.css';

const SUGGESTION_PROMPTS = [
  { icon: '✨', text: 'A new column or field you wish the listing grid had' },
  { icon: '📥', text: 'Import / export improvements or additional file formats' },
  { icon: '🔗', text: 'Integrations with other marketplaces or tools' },
  { icon: '📦', text: 'Better shipping, dimensions, or package-size support' },
  { icon: '🃏', text: 'Trading card or collectibles features' },
  { icon: '⚡', text: 'Speed or workflow improvements for bulk listing' },
];

function ContactForm({ to, emailAddress, buttonLabel, placeholder }) {
  const [name,    setName]    = useState('');
  const [email,   setEmail]   = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sent,    setSent]    = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    if (!message.trim()) return;

    const subjectLine = subject.trim() || `${to} from ${name.trim() || 'a user'}`;
    const body = [
      name.trim()  ? `Name: ${name.trim()}`   : '',
      email.trim() ? `Email: ${email.trim()}` : '',
      '',
      message.trim(),
    ].filter((line, i) => i >= 2 || line !== '').join('\n');

    window.location.href =
      `mailto:${emailAddress}` +
      `?subject=${encodeURIComponent(subjectLine)}` +
      `&body=${encodeURIComponent(body)}`;

    setSent(true);
    setTimeout(() => setSent(false), 4000);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${to}-name`}>Your name</label>
          <input
            id={`${to}-name`}
            type="text"
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Smith"
            autoComplete="name"
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${to}-email`}>Your email</label>
          <input
            id={`${to}-email`}
            type="email"
            className={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            autoComplete="email"
          />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${to}-subject`}>Subject</label>
        <input
          id={`${to}-subject`}
          type="text"
          className={styles.input}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="What's this about?"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${to}-message`}>
          {placeholder} <span className={styles.required}>*</span>
        </label>
        <textarea
          id={`${to}-message`}
          className={styles.textarea}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          required
          placeholder={`Write your ${placeholder.toLowerCase()} here…`}
        />
      </div>

      <div className={styles.formFooter}>
        <p className={styles.emailNote}>
          Opens your email client addressed to{' '}
          <a href={`mailto:${emailAddress}`} className={styles.emailLink}>{emailAddress}</a>
        </p>
        <button
          type="submit"
          className={styles.submitBtn}
          disabled={!message.trim()}
        >
          {sent ? '✓ Email client opened' : buttonLabel}
        </button>
      </div>
    </form>
  );
}

export default function ContactPage() {
  return (
    <section className={styles.section} id="contact">
      <div className={styles.container}>

        {/* ── Page header ── */}
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
              to="question"
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
              to="suggestion"
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
