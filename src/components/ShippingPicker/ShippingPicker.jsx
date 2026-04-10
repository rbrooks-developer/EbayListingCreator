import { useEffect, useRef, useState } from 'react';
import styles from './ShippingPicker.module.css';

// ── Helpers ───────────────────────────────────────────────────────────────────

const GROUP_ORDER = ['ECONOMY', 'STANDARD', 'EXPEDITED', 'ONE_DAY'];

const GROUP_LABELS = {
  ECONOMY:   'Economy services',
  STANDARD:  'Standard services',
  EXPEDITED: 'Expedited services',
  ONE_DAY:   'One-day services',
};

function groupLabel(category) {
  if (GROUP_LABELS[category]) return GROUP_LABELS[category];
  // Fallback: SNAKE_CASE → Title Case
  return category
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function daysLabel(min, max) {
  const a = min != null && Number(min) > 0 ? Number(min) : null;
  const b = max != null && Number(max) > 0 ? Number(max) : null;
  if (!a && !b) return '';
  if (a === b || (!a && b)) return `${a ?? b} day${(a ?? b) !== 1 ? 's' : ''}`;
  if (!b && a) return `${a} day${a !== 1 ? 's' : ''}`;
  if (a && b) return `${a} to ${b} days`;
  return '';
}

function groupServices(services) {
  const map = new Map();
  for (const svc of services) {
    const cat = svc.shippingCategory || 'OTHER';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(svc);
  }

  const ordered = [];
  for (const key of GROUP_ORDER) {
    if (map.has(key)) ordered.push({ key, label: groupLabel(key), services: map.get(key) });
  }
  for (const [key, svcs] of map) {
    if (!GROUP_ORDER.includes(key)) ordered.push({ key, label: groupLabel(key), services: svcs });
  }
  return ordered;
}

// ── ShippingPicker ────────────────────────────────────────────────────────────

/**
 * Props:
 *  shippingServices — [{ serviceCode, serviceName, shippingCategory, minShippingTime, maxShippingTime }]
 *  value            — currently selected serviceCode
 *  onChange         — (serviceCode) => void
 */
export default function ShippingPicker({ shippingServices = [], value = '', onChange }) {
  const [open, setOpen] = useState(false);

  const selected = shippingServices.find((s) => s.serviceCode === value) ?? null;

  return (
    <>
      <button
        className={`${styles.triggerBtn} ${!value ? styles.triggerPlaceholder : ''}`}
        onClick={() => setOpen(true)}
        type="button"
        title={selected?.serviceName ?? 'Select shipping service'}
      >
        {selected ? selected.serviceName : '— select —'}
      </button>

      {open && (
        <ShippingModal
          shippingServices={shippingServices}
          value={value}
          onChange={(code) => { onChange(code); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ── ShippingModal ─────────────────────────────────────────────────────────────

function ShippingModal({ shippingServices, value, onChange, onClose }) {
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);
  const overlayRef = useRef(null);

  useEffect(() => {
    searchRef.current?.focus();
    function handler(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose();
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? shippingServices.filter(
        (s) =>
          s.serviceName.toLowerCase().includes(q) ||
          (s.shippingCategory ?? '').toLowerCase().includes(q)
      )
    : shippingServices;

  // If searching, flat list; otherwise grouped
  const selectedSvc = shippingServices.find((s) => s.serviceCode === value) ?? null;
  const groups = q ? null : groupServices(filtered);

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Change shipping service"
    >
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>Change service</h2>
          <button className={styles.doneBtn} onClick={onClose} type="button">Done</button>
        </div>

        {/* Search */}
        <div className={styles.searchBar}>
          <span className={styles.searchIcon} aria-hidden="true">&#128269;</span>
          <input
            ref={searchRef}
            type="text"
            className={styles.searchInput}
            placeholder="Find a shipping service"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search shipping services"
          />
          {query && (
            <button className={styles.clearBtn} onClick={() => setQuery('')} type="button" aria-label="Clear search">
              &#x2715;
            </button>
          )}
        </div>

        {/* List */}
        <div className={styles.listBody}>
          {/* Selected (shown when not searching) */}
          {!q && selectedSvc && (
            <div className={styles.section}>
              <div className={styles.sectionLabel}>Selected</div>
              <ServiceOption
                svc={selectedSvc}
                checked={true}
                onSelect={() => onClose()}
              />
            </div>
          )}

          {/* Flat filtered results */}
          {q && (
            filtered.length === 0
              ? <p className={styles.noResults}>No services match "{query}".</p>
              : filtered.map((svc) => (
                  <ServiceOption
                    key={svc.serviceCode}
                    svc={svc}
                    checked={svc.serviceCode === value}
                    onSelect={() => onChange(svc.serviceCode)}
                  />
                ))
          )}

          {/* Grouped results */}
          {!q && groups && groups.map((group) => {
            const unselected = group.services.filter((s) => s.serviceCode !== value);
            if (unselected.length === 0) return null;
            return (
              <div key={group.key} className={styles.section}>
                <div className={styles.sectionLabel}>{group.label}</div>
                {unselected.map((svc) => (
                  <ServiceOption
                    key={svc.serviceCode}
                    svc={svc}
                    checked={false}
                    onSelect={() => onChange(svc.serviceCode)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── ServiceOption ─────────────────────────────────────────────────────────────

function ServiceOption({ svc, checked, onSelect }) {
  const days = daysLabel(svc.minShippingTime, svc.maxShippingTime);

  return (
    <label className={`${styles.option} ${checked ? styles.optionChecked : ''}`}>
      <input
        type="radio"
        className={styles.radio}
        checked={checked}
        onChange={onSelect}
        name="shippingService"
      />
      <div className={styles.optionInfo}>
        <span className={styles.optionName}>{svc.serviceName}</span>
        {days && <span className={styles.optionDays}>{days}</span>}
      </div>
    </label>
  );
}
