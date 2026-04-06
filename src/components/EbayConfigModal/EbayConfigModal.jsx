import React, { useState } from 'react';
import { getEbayConfig, saveEbayConfig } from '../../services/ebayConfig.js';
import styles from './EbayConfigModal.module.css';

/**
 * Modal that lets the user enter their eBay developer credentials and Worker URL.
 * Values are saved to localStorage so they survive page refreshes.
 */
export default function EbayConfigModal({ onClose }) {
  const existing = getEbayConfig();
  const [values, setValues] = useState({
    workerUrl:       existing.workerUrl       || '',
    clientId:        existing.clientId        || '',
    ruName:          existing.ruName          || '',
    sandboxClientId: existing.sandboxClientId || '',
    sandboxRuName:   existing.sandboxRuName   || '',
  });

  function set(key, val) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  function handleSave() {
    saveEbayConfig(values);
    onClose(true); // true = saved, trigger re-check
  }

  const overlayRef = React.useRef(null);
  function handleOverlay(e) { if (e.target === overlayRef.current) onClose(false); }

  return (
    <div ref={overlayRef} className={styles.overlay} onClick={handleOverlay} role="dialog" aria-modal="true" aria-label="eBay API Configuration">
      <div className={styles.modal}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Configure eBay API</h2>
            <p className={styles.subtitle}>
              Values are saved in your browser only — never sent to any server except your own Worker.
            </p>
          </div>
          <button className={styles.closeBtn} onClick={() => onClose(false)} aria-label="Close">&#x2715;</button>
        </div>

        <div className={styles.body}>
          {/* Worker URL */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Cloudflare Worker URL</h3>
            <p className={styles.sectionNote}>
              The Worker proxies eBay token exchange. Deploy it from the <code>worker/</code> folder using <code>wrangler deploy</code>.
            </p>
            <Field label="Worker URL" placeholder="https://ebay-token-proxy.your-subdomain.workers.dev" value={values.workerUrl} onChange={(v) => set('workerUrl', v)} />
          </div>

          {/* Sandbox credentials */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Sandbox Credentials</h3>
            <p className={styles.sectionNote}>Use these for testing. Sandbox App IDs contain <code>-SBX-</code>.</p>
            <Field label="Sandbox App ID (Client ID)" placeholder="YourApp-SBX-xxxxxxxx" value={values.sandboxClientId} onChange={(v) => set('sandboxClientId', v)} />
            <Field label="Sandbox RuName" placeholder="YourName-YourApp-SBX-xxxxxxxx" value={values.sandboxRuName} onChange={(v) => set('sandboxRuName', v)} />
          </div>

          {/* Production credentials */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Production Credentials</h3>
            <p className={styles.sectionNote}>Use these for live listings. Leave blank if you only use sandbox.</p>
            <Field label="Production App ID (Client ID)" placeholder="YourApp-PRD-xxxxxxxx" value={values.clientId} onChange={(v) => set('clientId', v)} />
            <Field label="Production RuName" placeholder="YourName-YourApp-PRD-xxxxxxxx" value={values.ruName} onChange={(v) => set('ruName', v)} />
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.btnSecondary} onClick={() => onClose(false)}>Cancel</button>
          <button className={styles.btnPrimary} onClick={handleSave}>Save Configuration</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, placeholder, value, onChange }) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
      <input
        type="text"
        className={styles.fieldInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}
