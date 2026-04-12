import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const [loadError, setLoadError]   = useState('');
  const [aspectDefs, setAspectDefs] = useState([]);
  const [values, setValues]         = useState({ ...listing.aspects });

  const overlayRef = useRef(null);

  // Load aspects on mount
  useEffect(() => {
    if (!listing.categoryId) return;

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
    const cleaned = {};
    Object.entries(values).forEach(([k, v]) => {
      const trimmed = Array.isArray(v) ? v.filter(Boolean) : (v ?? '').trim();
      if (trimmed.length > 0) cleaned[k] = trimmed;
    });
    onSave(cleaned);
    onClose();
  }

  const required    = aspectDefs.filter((a) => a.aspectUsage === 'REQUIRED');
  const recommended = aspectDefs.filter((a) => a.aspectUsage === 'RECOMMENDED');
  const optional    = aspectDefs.filter((a) => a.aspectUsage === 'OPTIONAL');

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

        {/* Body — plain block scroll container (flex causes unreliable scroll) */}
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
  const [collapsed, setCollapsed] = useState(collapsible);

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
          <span
            className={`${styles.groupChevron} ${collapsed ? '' : styles.groupChevronOpen}`}
            aria-hidden="true"
          >
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
  const isRequired     = aspect.aspectUsage === 'REQUIRED';
  const isMulti        = aspect.aspectCardinality === 'MULTI';
  const isSelectionOnly = aspect.aspectMode === 'SELECTION_ONLY';
  const hasOptions     = aspect.aspectValues.length > 0;

  const inputId = `aspect-${aspect.aspectName.replace(/\s+/g, '-').toLowerCase()}`;
  const valArray = Array.isArray(value) ? value : (value ? [value] : []);
  const valStr   = Array.isArray(value) ? value.join(', ') : (value || '');

  return (
    <div className={styles.field}>
      <label htmlFor={inputId} className={styles.fieldLabel}>
        {aspect.aspectName}
        {isRequired && <span className={styles.required} aria-label="required"> *</span>}
        {hasOptions && (
          <span
            className={`${styles.modeBadge} ${isSelectionOnly ? styles.modeLocked : styles.modeFree}`}
            title={isSelectionOnly ? 'Must select from the provided list' : 'Suggestions shown — you may also type a custom value'}
          >
            {isSelectionOnly ? 'list only' : '+ custom'}
          </span>
        )}
      </label>

      {/* SELECTION_ONLY multi → searchable checkboxes */}
      {isMulti && isSelectionOnly && hasOptions ? (
        <SearchableCheckboxGroup
          id={inputId}
          options={aspect.aspectValues}
          selected={valArray}
          onChange={onChange}
        />
      ) : hasOptions ? (
        /* Any single-value with options, OR free-text multi with options → combobox */
        <ComboBox
          id={inputId}
          options={aspect.aspectValues}
          value={valStr}
          onChange={(v) =>
            isMulti
              ? onChange(v.split(',').map((s) => s.trim()).filter(Boolean))
              : onChange(v)
          }
          locked={isSelectionOnly}
          placeholder={isMulti ? 'Type or search, comma-separated…' : undefined}
        />
      ) : (
        /* Pure free text — no options at all */
        <input
          id={inputId}
          type="text"
          className={styles.fieldInput}
          value={valStr}
          onChange={(e) =>
            isMulti
              ? onChange(e.target.value.split(',').map((s) => s.trim()))
              : onChange(e.target.value)
          }
          placeholder={isMulti ? 'Comma-separated values' : ''}
        />
      )}
    </div>
  );
}

// ── ComboBox ──────────────────────────────────────────────────────────────────
// Searchable single (or free-text multi) input with a filtered dropdown.
// The dropdown is rendered via a React portal so it escapes any parent
// overflow:hidden constraints (e.g. the group container in this modal).
//
// locked=true  → user should pick from list; warning shown if typed value not found
// locked=false → any value accepted; list is suggestions only

function ComboBox({ id, options, value, onChange, locked, placeholder }) {
  const [query, setQuery]           = useState(value || '');
  const [open, setOpen]             = useState(false);
  const [dropPos, setDropPos]       = useState({ top: 0, left: 0, width: 0 });
  const inputRef                    = useRef(null);
  const wrapRef                     = useRef(null);

  // Keep local query in sync when parent resets the value
  useEffect(() => { setQuery(value || ''); }, [value]);

  // Recompute dropdown position whenever it opens or the window scrolls/resizes
  useEffect(() => {
    if (!open) return;
    function reposition() {
      const rect = inputRef.current?.getBoundingClientRect();
      if (rect) setDropPos({ top: rect.bottom + 2, left: rect.left, width: rect.width });
    }
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 100);
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [query, options]);

  const valueInList = useMemo(
    () => !query || options.some((o) => o.toLowerCase() === query.trim().toLowerCase()),
    [query, options]
  );

  function select(opt) {
    setQuery(opt);
    onChange(opt);
    setOpen(false);
  }

  function handleChange(e) {
    const v = e.target.value;
    setQuery(v);
    setOpen(true);
    if (!locked) onChange(v);
  }

  function handleBlur() {
    // Delay so onMouseDown on a portal option fires first
    setTimeout(() => {
      if (!wrapRef.current?.contains(document.activeElement)) {
        setOpen(false);
        if (locked && query) {
          const exact = options.find((o) => o.toLowerCase() === query.trim().toLowerCase());
          if (exact) { setQuery(exact); onChange(exact); }
        }
      }
    }, 200);
  }

  const dropdown = open && matches.length > 0 && createPortal(
    <ul
      className={styles.comboDropdown}
      style={{ top: dropPos.top, left: dropPos.left, width: dropPos.width }}
      role="listbox"
    >
      {matches.map((opt) => (
        <li
          key={opt}
          className={`${styles.comboOption} ${opt === value ? styles.comboOptionActive : ''}`}
          role="option"
          aria-selected={opt === value}
          onMouseDown={(e) => { e.preventDefault(); select(opt); }}
        >
          {opt}
        </li>
      ))}
    </ul>,
    document.body
  );

  return (
    <div ref={wrapRef} className={styles.comboWrap}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        className={`${styles.fieldInput} ${locked && query && !valueInList ? styles.fieldInputWarn : ''}`}
        value={query}
        onChange={handleChange}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        placeholder={placeholder ?? (locked ? 'Search list…' : 'Type or search…')}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {dropdown}
      {locked && query && !valueInList && (
        <p className={styles.comboWarn}>Not in eBay&apos;s list — may be rejected when posting</p>
      )}
    </div>
  );
}

// ── SearchableCheckboxGroup ───────────────────────────────────────────────────
// Used for SELECTION_ONLY multi-value aspects.

function SearchableCheckboxGroup({ id, options, selected, onChange }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  }, [search, options]);

  function toggle(opt) {
    const next = selected.includes(opt)
      ? selected.filter((s) => s !== opt)
      : [...selected, opt];
    onChange(next);
  }

  return (
    <div className={styles.searchableCheckbox}>
      {options.length > 8 && (
        <input
          type="text"
          className={styles.checkboxSearch}
          placeholder="Filter options…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      <div className={styles.checkboxList}>
        {filtered.map((opt) => (
          <label key={opt} className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={selected.includes(opt)}
              onChange={() => toggle(opt)}
            />
            {opt}
          </label>
        ))}
        {filtered.length === 0 && (
          <span className={styles.noResults}>No matches</span>
        )}
      </div>
    </div>
  );
}
