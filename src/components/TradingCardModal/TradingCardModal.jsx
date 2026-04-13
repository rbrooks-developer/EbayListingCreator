import React, { useEffect, useRef, useState } from 'react';
import {
  GRADER_OPTIONS,
  GRADE_OPTIONS,
  CARD_COND_OPTIONS,
  resolveDescriptorId,
  descriptorLabel,
} from '../../utils/tcDescriptors.js';
import styles from './TradingCardModal.module.css';

/**
 * TradingCardModal
 *
 * Lets the user select Graded or Ungraded condition for a trading card listing.
 * Uses static numeric IDs from eBay's Condition Descriptor documentation —
 * no API call required.
 *
 * Props:
 *   listing        — listing object (needs categoryName, title, tc* fields)
 *   initialType    — 'graded' | 'ungraded' | '' — pre-selects condition type
 *   onSave(patch)  — called with { conditionId, conditionDescriptors, tcConditionType,
 *                      tcGrader, tcGrade, tcCertNumber, tcCardCondition, tcConditionLabel }
 *   onClose()      — close the modal
 *
 * (accessToken, marketplaceId, sandbox, policiesCache are accepted for compatibility
 *  but are no longer used — the modal works offline with hardcoded eBay descriptor IDs.)
 */
export default function TradingCardModal({
  listing,
  initialType = '',
  onSave,
  onClose,
}) {
  const [condType, setCondType]      = useState(initialType || listing.tcConditionType || '');
  const [grader, setGrader]          = useState(() => resolveDescriptorId(listing.tcGrader      || '', GRADER_OPTIONS));
  const [grade, setGrade]            = useState(() => resolveDescriptorId(listing.tcGrade       || '', GRADE_OPTIONS));
  const [certNumber, setCertNumber]  = useState(listing.tcCertNumber || '');
  const [cardCondition, setCardCond] = useState(() => resolveDescriptorId(listing.tcCardCondition || '', CARD_COND_OPTIONS));

  const overlayRef = useRef(null);

  // Close on Escape
  useEffect(() => {
    function handler(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose();
  }

  // ── Label / descriptor builders ───────────────────────────────────────────

  function buildLabel() {
    if (condType === 'graded') {
      const graderName = descriptorLabel(grader, GRADER_OPTIONS);
      const gradeName  = descriptorLabel(grade,  GRADE_OPTIONS);
      return ['Graded', graderName, gradeName].filter(Boolean).join(' · ');
    }
    if (condType === 'ungraded') {
      const condName = descriptorLabel(cardCondition, CARD_COND_OPTIONS);
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

  // ── Save / clear ──────────────────────────────────────────────────────────

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
    ? !!(grader || grade)
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
          {/* Condition type toggle */}
          <div className={styles.typeToggle}>
            <button
              type="button"
              className={`${styles.typeBtn} ${condType === 'graded' ? styles.typeBtnActive : ''}`}
              onClick={() => setCondType('graded')}
            >
              Graded
            </button>
            <button
              type="button"
              className={`${styles.typeBtn} ${condType === 'ungraded' ? styles.typeBtnActive : ''}`}
              onClick={() => setCondType('ungraded')}
            >
              Ungraded
            </button>
          </div>

          {/* Graded fields */}
          {condType === 'graded' && (
            <div className={styles.fields}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Grading Company</label>
                <select
                  className={styles.fieldSelect}
                  value={grader}
                  onChange={(e) => setGrader(e.target.value)}
                >
                  <option value="">— Select —</option>
                  {GRADER_OPTIONS.map((v) => (
                    <option key={v.valueId} value={v.valueId}>{v.value}</option>
                  ))}
                </select>
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>Grade</label>
                <select
                  className={styles.fieldSelect}
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                >
                  <option value="">— Select —</option>
                  {GRADE_OPTIONS.map((v) => (
                    <option key={v.valueId} value={v.valueId}>{v.value}</option>
                  ))}
                </select>
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
                  maxLength={30}
                />
              </div>
            </div>
          )}

          {/* Ungraded fields */}
          {condType === 'ungraded' && (
            <div className={styles.fields}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Card Condition</label>
                <select
                  className={styles.fieldSelect}
                  value={cardCondition}
                  onChange={(e) => setCardCond(e.target.value)}
                >
                  <option value="">— Select —</option>
                  {CARD_COND_OPTIONS.map((v) => (
                    <option key={v.valueId} value={v.valueId}>{v.value}</option>
                  ))}
                </select>
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
