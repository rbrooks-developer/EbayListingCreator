import React, { useEffect, useRef, useState } from 'react';
import { fetchAspectsForCategory } from '../../services/ebayApi.js';
import styles from './AspectsModal.module.css';

/**
 * AspectsModal
 * Props:
 *  listing          — the listing object (needs categoryId, categoryName, aspects)
 *  accessToken      — eBay access token
 *  categoryTreeId   — eBay category tree ID
 *  sandbox          — bool
 *  aspectsCache     — useRef(Map) shared with parent, keyed by categoryId
 *  onSave(aspects)  — called with the updated aspects map on save
 *  onClose()        — called to close the modal
 */
export default function AspectsModal({
  listing,
  accessToken,
  categoryTreeId,
  sandbox,
  aspectsCache,
  onSave,
  onClose,
}) {
  const [loadStatus, setLoadStatus] = useState('idle'); // idle | loading | error | ready
  const [loadError, setLoadError] = useState('');
  const [aspectDefs, setAspectDefs] = useState([]); // normalised aspect definitions
  const [values, setValues] = useState({ ...listing.aspects }); // working copy

  const overlayRef = useRef(null);

  // Load aspects on mount
  useEffect(() => {
    if (!listing.categoryId) return;

    // Check cache first
    if (aspectsCache.current.has(listing.categoryId)) {
      setAspectDefs(aspectsCache.current.get(listing.categoryId));
      setLoadStatus('ready');
      return;
    }

    if (!accessToken || !categoryTreeId) {
      setLoadStatus('error');
      setLoadError('Connect to the eBay API first (Step 1) to load category aspects.');
      return;
    }

    setLoadStatus('loading');
    fetchAspectsForCategory(accessToken, categoryTreeId, listing.categoryId, sandbox)
      .then((defs) => {
        aspectsCache.current.set(listing.categoryId, defs);
        setAspectDefs(defs);
        setLoadStatus('ready');
      })
      .catch((err) => {
        setLoadError(err.message);
        setLoadStatus('error');
      });
  }, [listing.categoryId, accessToken, categoryTreeId, sandbox, aspectsCache]);

  // Close on Escape
  useEffect(() => {
    function handler(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose();
  }

  function setValue(aspectName, val) {
    setValues((prev) => ({ ...prev, [aspectName]: val }));
  }

  function handleSave() {
    // Strip empty values before saving
    const cleaned = {};
    Object.entries(values).forEach(([k, v]) => {
      const trimmed = Array.isArray(v) ? v.filter(Boolean) : (v ?? '').trim();
      if (trimmed.length > 0) cleaned[k] = trimmed;
    });
    onSave(cleaned);
    onClose();
  }

  // Group aspects by usage tier
  const required     = aspectDefs.filter((a) => a.aspectUsage === 'REQUIRED');
  const recommended  = aspectDefs.filter((a) => a.aspectUsage === 'RECOMMENDED');
  const optional     = aspectDefs.filter((a) => a.aspectUsage === 'OPTIONAL');

  // Can only save once all required aspects are filled
  const missingRequired = required.filter((a) => {
    const v = values[a.aspectName];
    return !v || (Array.isArray(v) ? v.every((x) => !x) : v.trim() === '');
  });
  const canSave = loadStatus === 'ready' && missingRequired.length === 0;

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Item Specifics"
    >
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Item Specifics</h2>
            <p className={styles.subtitle}>
              <strong>{listing.categoryName}</strong>
              {listing.title && <> &mdash; {listing.title}</>}
            </p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            &#x2715;
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {loadStatus === 'loading' && (
            <div className={styles.stateBox}>
              <span className={styles.spinner} aria-hidden="true" />
              Loading item specifics for this category…
            </div>
          )}

          {loadStatus === 'error' && (
            <div className={styles.errorBox} role="alert">
              <strong>Could not load aspects:</strong> {loadError}
            </div>
          )}

          {loadStatus === 'ready' && aspectDefs.length === 0 && (
            <div className={styles.stateBox}>
              No item specifics are defined for this category.
            </div>
          )}

          {loadStatus === 'ready' && aspectDefs.length > 0 && (
            <>
              {missingRequired.length > 0 && (
                <div className={styles.warningBox} role="status">
                  <strong>{missingRequired.length} required field{missingRequired.length > 1 ? 's' : ''} not filled:</strong>{' '}
                  {missingRequired.map((a) => a.aspectName).join(', ')}
                </div>
              )}

              {required.length > 0 && (
                <AspectGroup
                  title="Required"
                  badge="required"
                  aspects={required}
                  values={values}
                  onChange={setValue}
                />
              )}

              {recommended.length > 0 && (
                <AspectGroup
                  title="Recommended"
                  badge="recommended"
                  aspects={recommended}
                  values={values}
                  onChange={setValue}
                />
              )}

              {optional.length > 0 && (
                <AspectGroup
                  title="Optional"
                  badge="optional"
                  aspects={optional}
                  values={values}
                  onChange={setValue}
                  collapsible
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <span className={styles.footerNote}>
            {loadStatus === 'ready' && `${required.length} required · ${recommended.length} recommended · ${optional.length} optional`}
          </span>
          <div className={styles.footerActions}>
            <button className={styles.btnSecondary} onClick={onClose}>Cancel</button>
            <button
              className={styles.btnPrimary}
              onClick={handleSave}
              disabled={!canSave}
              title={!canSave ? `Fill in: ${missingRequired.map((a) => a.aspectName).join(', ')}` : undefined}
            >
              Save Specifics
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AspectGroup ───────────────────────────────────────────────────────────────

function AspectGroup({ title, badge, aspects, values, onChange, collapsible }) {
  const [collapsed, setCollapsed] = useState(collapsible); // optional starts collapsed

  return (
    <div className={styles.group}>
      <button
        type="button"
        className={styles.groupHeader}
        onClick={collapsible ? () => setCollapsed((v) => !v) : undefined}
        style={collapsible ? { cursor: 'pointer' } : { cursor: 'default' }}
        aria-expanded={!collapsed}
      >
        <span className={styles.groupTitle}>{title}</span>
        <span className={`${styles.groupBadge} ${styles[`badge_${badge}`]}`}>
          {aspects.length}
        </span>
        {collapsible && (
          <span className={`${styles.groupChevron} ${collapsed ? '' : styles.groupChevronOpen}`} aria-hidden="true">
            &#8964;
          </span>
        )}
      </button>

      {!collapsed && (
        <div className={styles.groupFields}>
          {aspects.map((aspect) => (
            <AspectField
              key={aspect.aspectName}
              aspect={aspect}
              value={values[aspect.aspectName] ?? ''}
              onChange={(v) => onChange(aspect.aspectName, v)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── AspectField ───────────────────────────────────────────────────────────────

function AspectField({ aspect, value, onChange }) {
  const isRequired = aspect.aspectUsage === 'REQUIRED';
  const isMulti = aspect.aspectCardinality === 'MULTI';
  const isSelectionOnly = aspect.aspectMode === 'SELECTION_ONLY' && aspect.aspectValues.length > 0;

  const inputId = `aspect-${aspect.aspectName.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className={styles.field}>
      <label htmlFor={inputId} className={styles.fieldLabel}>
        {aspect.aspectName}
        {isRequired && <span className={styles.required} aria-label="required"> *</span>}
      </label>

      {isSelectionOnly && !isMulti ? (
        // Single-value select
        <select
          id={inputId}
          className={styles.fieldSelect}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— select —</option>
          {aspect.aspectValues.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      ) : isSelectionOnly && isMulti ? (
        // Multi-value select (checkbox list for manageable option sets, text for large)
        aspect.aspectValues.length <= 20 ? (
          <CheckboxGroup
            options={aspect.aspectValues}
            selected={Array.isArray(value) ? value : (value ? [value] : [])}
            onChange={onChange}
          />
        ) : (
          <input
            id={inputId}
            type="text"
            className={styles.fieldInput}
            value={Array.isArray(value) ? value.join(', ') : value}
            onChange={(e) => onChange(e.target.value.split(',').map((s) => s.trim()))}
            placeholder="Comma-separated values"
          />
        )
      ) : (
        // Free text
        <input
          id={inputId}
          type="text"
          className={styles.fieldInput}
          value={Array.isArray(value) ? value.join(', ') : value}
          onChange={(e) =>
            isMulti
              ? onChange(e.target.value.split(',').map((s) => s.trim()))
              : onChange(e.target.value)
          }
          placeholder={isMulti ? 'Comma-separated values' : ''}
          list={aspect.aspectValues.length > 0 ? `${inputId}-list` : undefined}
        />
      )}

      {/* Datalist for free-text with suggestions */}
      {!isSelectionOnly && aspect.aspectValues.length > 0 && (
        <datalist id={`${inputId}-list`}>
          {aspect.aspectValues.slice(0, 200).map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      )}
    </div>
  );
}

// ── CheckboxGroup ─────────────────────────────────────────────────────────────

function CheckboxGroup({ options, selected, onChange }) {
  function toggle(opt) {
    const next = selected.includes(opt)
      ? selected.filter((s) => s !== opt)
      : [...selected, opt];
    onChange(next);
  }

  return (
    <div className={styles.checkboxGroup}>
      {options.map((opt) => (
        <label key={opt} className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={selected.includes(opt)}
            onChange={() => toggle(opt)}
          />
          {opt}
        </label>
      ))}
    </div>
  );
}
