import React, { useEffect, useRef, useState } from 'react';
import styles from './TradingCardModal.module.css';

/**
 * Hardcoded from eBay's "Condition Descriptor IDs for Trading Cards" docs.
 * The Metadata API returns human-readable labels as its valueIds, but the
 * Trading API XML requires these static numeric IDs — so we hardcode them.
 */
const GRADER_OPTIONS = [
  { valueId: '275010',  value: 'PSA'   },
  { valueId: '275011',  value: 'BCCG'  },
  { valueId: '275012',  value: 'BVG'   },
  { valueId: '275013',  value: 'BGS'   },
  { valueId: '275014',  value: 'CSG'   },
  { valueId: '275015',  value: 'CGC'   },
  { valueId: '275016',  value: 'SGC'   },
  { valueId: '275017',  value: 'KSA'   },
  { valueId: '275018',  value: 'GMA'   },
  { valueId: '275019',  value: 'HGA'   },
  { valueId: '2750110', value: 'ISA'   },
  { valueId: '2750111', value: 'PCA'   },
  { valueId: '2750112', value: 'GSG'   },
  { valueId: '2750113', value: 'PGS'   },
  { valueId: '2750114', value: 'MNT'   },
  { valueId: '2750115', value: 'TAG'   },
  { valueId: '2750116', value: 'Rare'  },
  { valueId: '2750117', value: 'RCG'   },
  { valueId: '2750118', value: 'PCG'   },
  { valueId: '2750119', value: 'Ace'   },
  { valueId: '2750120', value: 'CGA'   },
  { valueId: '2750121', value: 'TCG'   },
  { valueId: '2750122', value: 'ARK'   },
  { valueId: '2750123', value: 'Other' },
];

const GRADE_OPTIONS = [
  { valueId: '275020',  value: '10'                    },
  { valueId: '275021',  value: '9.5'                   },
  { valueId: '275022',  value: '9'                     },
  { valueId: '275023',  value: '8.5'                   },
  { valueId: '275024',  value: '8'                     },
  { valueId: '275025',  value: '7.5'                   },
  { valueId: '275026',  value: '7'                     },
  { valueId: '275027',  value: '6.5'                   },
  { valueId: '275028',  value: '6'                     },
  { valueId: '275029',  value: '5.5'                   },
  { valueId: '2750210', value: '5'                     },
  { valueId: '2750211', value: '4.5'                   },
  { valueId: '2750212', value: '4'                     },
  { valueId: '2750213', value: '3.5'                   },
  { valueId: '2750214', value: '3'                     },
  { valueId: '2750215', value: '2.5'                   },
  { valueId: '2750216', value: '2'                     },
  { valueId: '2750217', value: '1.5'                   },
  { valueId: '2750218', value: '1'                     },
  { valueId: '2750219', value: 'Authentic'             },
  { valueId: '2750220', value: 'Authentic Altered'     },
  { valueId: '2750221', value: 'Authentic - Trimmed'   },
  { valueId: '2750222', value: 'Authentic - Coloured'  },
];

const CARD_COND_OPTIONS = [
  { valueId: '400010', value: 'Near Mint or Better'            },
  { valueId: '400011', value: 'Excellent'                      },
  { valueId: '400012', value: 'Very Good'                      },
  { valueId: '400013', value: 'Poor'                           },
  { valueId: '400015', value: 'Lightly Played (Excellent)'     },
  { valueId: '400016', value: 'Moderately Played (Very Good)'  },
  { valueId: '400017', value: 'Heavily Played (Poor)'          },
];

/**
 * Resolve a stored value to its valueId.
 * Handles two cases:
 *   - Already a numeric ID (e.g. "275022") → returned as-is
 *   - A human-readable label (e.g. "9") → looked up by display value
 */
function resolveId(stored, options) {
  if (!stored) return '';
  if (options.find((o) => o.valueId === stored)) return stored;
  const byLabel = options.find((o) => o.value === stored);
  return byLabel ? byLabel.valueId : '';
}

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
  const [grader, setGrader]          = useState(() => resolveId(listing.tcGrader      || '', GRADER_OPTIONS));
  const [grade, setGrade]            = useState(() => resolveId(listing.tcGrade       || '', GRADE_OPTIONS));
  const [certNumber, setCertNumber]  = useState(listing.tcCertNumber || '');
  const [cardCondition, setCardCond] = useState(() => resolveId(listing.tcCardCondition || '', CARD_COND_OPTIONS));

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
      const graderName = GRADER_OPTIONS.find((v) => v.valueId === grader)?.value ?? grader;
      const gradeName  = GRADE_OPTIONS.find((v) => v.valueId === grade)?.value   ?? grade;
      return ['Graded', graderName, gradeName].filter(Boolean).join(' · ');
    }
    if (condType === 'ungraded') {
      const condName = CARD_COND_OPTIONS.find((v) => v.valueId === cardCondition)?.value ?? cardCondition;
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
