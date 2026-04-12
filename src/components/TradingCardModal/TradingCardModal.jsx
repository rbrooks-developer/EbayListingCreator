import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchConditionPolicies } from '../../services/ebayApi.js';
import styles from './TradingCardModal.module.css';

/**
 * TradingCardModal
 *
 * Fetches live condition policies from eBay's Metadata API for trading card
 * categories and lets the user select:
 *   - Graded: grading company, grade, cert number  (conditionId 2750)
 *   - Ungraded: card condition                     (conditionId 4000)
 *
 * Props:
 *   listing          — listing object (needs categoryId, categoryName, title)
 *   accessToken      — eBay access token
 *   marketplaceId    — e.g. 'EBAY_US'
 *   sandbox          — bool
 *   policiesCache    — useRef(Map) keyed by categoryId
 *   onSave(patch)    — called with { conditionId, conditionDescriptors, tcConditionType,
 *                        tcGrader, tcGrade, tcCertNumber, tcCardCondition, tcConditionLabel }
 *   onClose()        — close the modal
 */
export default function TradingCardModal({
  listing,
  initialType = '',      // type pre-selected from the condition dropdown
  accessToken,
  marketplaceId = 'EBAY_US',
  sandbox,
  policiesCache,
  onSave,
  onClose,
}) {
  const [loadStatus, setLoadStatus] = useState('idle');
  const [loadError, setLoadError]   = useState('');
  const [policies, setPolicies]     = useState(null); // raw API response

  // initialType takes priority (user just selected from dropdown) over saved value
  const [condType, setCondType]       = useState(initialType || listing.tcConditionType || '');
  const [grader, setGrader]           = useState(listing.tcGrader || '');
  const [grade, setGrade]             = useState(listing.tcGrade || '');
  const [certNumber, setCertNumber]   = useState(listing.tcCertNumber || '');
  const [cardCondition, setCardCond]  = useState(listing.tcCardCondition || '');

  const overlayRef = useRef(null);

  // ── Load condition policies ───────────────────────────────────────────────

  useEffect(() => {
    if (!listing.categoryId) return;

    if (policiesCache.current.has(listing.categoryId)) {
      setPolicies(policiesCache.current.get(listing.categoryId));
      setLoadStatus('ready');
      return;
    }

    if (!accessToken) {
      setLoadStatus('error');
      setLoadError('Connect to the eBay API first (Step 1) to load condition data.');
      return;
    }

    setLoadStatus('loading');
    fetchConditionPolicies(accessToken, listing.categoryId, marketplaceId, sandbox)
      .then((data) => {
        policiesCache.current.set(listing.categoryId, data);
        setPolicies(data);
        setLoadStatus('ready');
      })
      .catch((err) => {
        setLoadError(err.message);
        setLoadStatus('error');
      });
  }, [listing.categoryId, accessToken, marketplaceId, sandbox, policiesCache]);

  // Close on Escape
  useEffect(() => {
    function handler(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose();
  }

  // ── Derive grader / card-condition options from live API data ─────────────

  const { gradedCondition, ungradedCondition } = useMemo(() => {
    if (!policies) return {};
    const conditions = policies.itemConditions ?? [];
    return {
      // conditionId 2750 = Graded
      gradedCondition:   conditions.find((c) => c.conditionId === '2750'),
      // conditionId 4000 = Ungraded
      ungradedCondition: conditions.find((c) => c.conditionId === '4000'),
    };
  }, [policies]);

  /** Find descriptor values for a given descriptor ID (e.g. "27501" = Grader) */
  function getDescriptorValues(condition, descriptorId) {
    if (!condition?.conditionDescriptors) return [];
    const desc = condition.conditionDescriptors.find((d) => d.name === descriptorId);
    return desc?.values ?? [];
  }

  const graderOptions    = useMemo(() => getDescriptorValues(gradedCondition,   '27501'), [gradedCondition]);
  const gradeOptions     = useMemo(() => getDescriptorValues(gradedCondition,   '27502'), [gradedCondition]);
  const cardCondOptions  = useMemo(() => getDescriptorValues(ungradedCondition, '40001'), [ungradedCondition]);

  // ── Save ──────────────────────────────────────────────────────────────────

  function buildLabel() {
    if (condType === 'graded') {
      const graderName  = graderOptions.find((v) => v.valueId === grader)?.value ?? grader;
      const gradeName   = gradeOptions.find((v) => v.valueId === grade)?.value ?? grade;
      const parts = ['Graded', graderName, gradeName].filter(Boolean);
      return parts.join(' · ');
    }
    if (condType === 'ungraded') {
      const condName = cardCondOptions.find((v) => v.valueId === cardCondition)?.value ?? cardCondition;
      return ['Ungraded', condName].filter(Boolean).join(' · ');
    }
    return '';
  }

  function buildDescriptors() {
    const descriptors = [];
    if (condType === 'graded') {
      if (grader)     descriptors.push({ name: '27501', value: grader });
      if (grade)      descriptors.push({ name: '27502', value: grade });
      if (certNumber) descriptors.push({ name: '27503', value: certNumber });
    } else if (condType === 'ungraded') {
      if (cardCondition) descriptors.push({ name: '40001', value: cardCondition });
    }
    return descriptors;
  }

  function handleSave() {
    const conditionId = condType === 'graded' ? '2750' : condType === 'ungraded' ? '4000' : '';
    onSave({
      conditionId,
      conditionDescriptors: buildDescriptors(),
      tcConditionType:  condType,
      tcGrader:         grader,
      tcGrade:          grade,
      tcCertNumber:     certNumber,
      tcCardCondition:  cardCondition,
      tcConditionLabel: buildLabel(),
    });
    onClose();
  }

  function handleClear() {
    onSave({
      conditionId: '', conditionDescriptors: [],
      tcConditionType: '', tcGrader: '', tcGrade: '',
      tcCertNumber: '', tcCardCondition: '', tcConditionLabel: '',
    });
    onClose();
  }

  const canSave = condType === 'graded'
    ? (grader || grade) // at least grader or grade filled
    : condType === 'ungraded'
      ? !!cardCondition
      : false;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Trading Card Condition"
    >
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Trading Card Condition</h2>
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
              Loading condition data for this category…
            </div>
          )}

          {loadStatus === 'error' && (
            <div className={styles.errorBox} role="alert">
              <strong>Could not load conditions:</strong> {loadError}
            </div>
          )}

          {loadStatus === 'ready' && (
            <>
              {/* Condition type toggle */}
              <div className={styles.typeToggle}>
                <button
                  type="button"
                  className={`${styles.typeBtn} ${condType === 'graded' ? styles.typeBtnActive : ''}`}
                  onClick={() => setCondType('graded')}
                  disabled={!gradedCondition}
                  title={!gradedCondition ? 'Graded not available for this category' : undefined}
                >
                  Graded
                </button>
                <button
                  type="button"
                  className={`${styles.typeBtn} ${condType === 'ungraded' ? styles.typeBtnActive : ''}`}
                  onClick={() => setCondType('ungraded')}
                  disabled={!ungradedCondition}
                  title={!ungradedCondition ? 'Ungraded not available for this category' : undefined}
                >
                  Ungraded
                </button>
              </div>

              {/* Graded fields */}
              {condType === 'graded' && (
                <div className={styles.fields}>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>
                      Grading Company
                    </label>
                    {graderOptions.length > 0 ? (
                      <select
                        className={styles.fieldSelect}
                        value={grader}
                        onChange={(e) => setGrader(e.target.value)}
                      >
                        <option value="">— Select —</option>
                        {graderOptions.map((v) => (
                          <option key={v.valueId} value={v.valueId}>{v.value}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        className={styles.fieldInput}
                        value={grader}
                        onChange={(e) => setGrader(e.target.value)}
                        placeholder="e.g. PSA"
                      />
                    )}
                  </div>

                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>
                      Grade
                    </label>
                    {gradeOptions.length > 0 ? (
                      <select
                        className={styles.fieldSelect}
                        value={grade}
                        onChange={(e) => setGrade(e.target.value)}
                      >
                        <option value="">— Select —</option>
                        {gradeOptions.map((v) => (
                          <option key={v.valueId} value={v.valueId}>{v.value}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        className={styles.fieldInput}
                        value={grade}
                        onChange={(e) => setGrade(e.target.value)}
                        placeholder="e.g. 9.5"
                      />
                    )}
                  </div>

                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>
                      Cert Number
                      <span className={styles.optional}>(optional)</span>
                    </label>
                    <input
                      type="text"
                      className={styles.fieldInput}
                      value={certNumber}
                      onChange={(e) => setCertNumber(e.target.value)}
                      placeholder="Certification number"
                    />
                  </div>
                </div>
              )}

              {/* Ungraded fields */}
              {condType === 'ungraded' && (
                <div className={styles.fields}>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>
                      Card Condition
                    </label>
                    {cardCondOptions.length > 0 ? (
                      <select
                        className={styles.fieldSelect}
                        value={cardCondition}
                        onChange={(e) => setCardCond(e.target.value)}
                      >
                        <option value="">— Select —</option>
                        {cardCondOptions.map((v) => (
                          <option key={v.valueId} value={v.valueId}>{v.value}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        className={styles.fieldInput}
                        value={cardCondition}
                        onChange={(e) => setCardCond(e.target.value)}
                        placeholder="e.g. Near Mint"
                      />
                    )}
                  </div>
                </div>
              )}

              {/* No selection yet */}
              {!condType && (
                <div className={styles.stateBox}>
                  Select <strong>Graded</strong> or <strong>Ungraded</strong> above.
                </div>
              )}

              {/* Preview label */}
              {condType && (
                <div className={styles.previewRow}>
                  <span className={styles.previewLabel}>Preview:</span>
                  <span className={styles.previewValue}>
                    {buildLabel() || <em className={styles.previewEmpty}>fill in fields above</em>}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button className={styles.btnClear} onClick={handleClear}>
            Clear
          </button>
          <div className={styles.footerActions}>
            <button className={styles.btnSecondary} onClick={onClose}>Cancel</button>
            <button
              className={styles.btnPrimary}
              onClick={handleSave}
              disabled={!canSave}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
