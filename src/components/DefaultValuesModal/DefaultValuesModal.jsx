import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import CategorySelect from '../CategorySelect/CategorySelect.jsx';
import ShippingPicker from '../ShippingPicker/ShippingPicker.jsx';
import styles from './DefaultValuesModal.module.css';

export default function DefaultValuesModal({
  defaults,
  onSave,
  categories,
  fulfillmentPolicies,
  shippingServices,
  onPrewarm,
  onApplyToAll,
  listingCount,
  onClose,
}) {
  const [length,    setLength]    = useState(defaults.length    ?? '');
  const [width,     setWidth]     = useState(defaults.width     ?? '');
  const [height,    setHeight]    = useState(defaults.height    ?? '');
  const [weightLbs, setWeightLbs] = useState(defaults.weightLbs ?? '');
  const [weightOz,  setWeightOz]  = useState(defaults.weightOz  ?? '');
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [applied, setApplied] = useState(false);

  // Keep local numeric state in sync if defaults are changed externally
  useEffect(() => {
    setLength(defaults.length       ?? '');
    setWidth(defaults.width         ?? '');
    setHeight(defaults.height       ?? '');
    setWeightLbs(defaults.weightLbs ?? '');
    setWeightOz(defaults.weightOz   ?? '');
  }, [defaults.length, defaults.width, defaults.height, defaults.weightLbs, defaults.weightOz]);

  async function save(patch) {
    setSaving(true);
    setSaved(false);
    await onSave(patch);
    setSaving(false);
    setSaved(true);
  }

  async function handleCategory(categoryId, categoryName) {
    await save({ categoryId, categoryName });
    if (categoryId) onPrewarm([categoryId]);
  }

  async function handleNumBlur() {
    await save({ length, width, height, weightLbs, weightOz });
  }

  async function clearCategory() {
    await save({ categoryId: '', categoryName: '' });
  }

  async function clearFulfillment() {
    await save({ fulfillmentPolicyId: '' });
  }

  async function clearShipping() {
    await save({ shippingService: '' });
  }

  async function clearDimensions() {
    setLength(''); setWidth(''); setHeight('');
    await save({ length: '', width: '', height: '' });
  }

  async function clearWeight() {
    setWeightLbs(''); setWeightOz('');
    await save({ weightLbs: '', weightOz: '' });
  }

  const hasDims   = Number(length) > 0 || Number(width) > 0 || Number(height) > 0;
  const hasWeight = Number(weightLbs) > 0 || Number(weightOz) > 0;

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.modal}>

        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Default Values</h2>
            <p className={styles.subtitle}>Applied to new rows and blank cells when importing. Use "Apply to All" to push changes to existing listings.</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={styles.body}>

          {/* Category */}
          <div className={styles.field}>
            <div className={styles.fieldHeader}>
              <span className={styles.label}>Category</span>
              {defaults.categoryId && (
                <button className={styles.clearBtn} onClick={clearCategory} title="Clear category">✕ Clear</button>
              )}
            </div>
            {categories.length > 0 ? (
              <CategorySelect
                categories={categories}
                value={defaults.categoryId}
                onChange={handleCategory}
              />
            ) : (
              <span className={styles.naText}>Connect API to select a category</span>
            )}
            {defaults.categoryName && (
              <span className={styles.hint}>{defaults.categoryName}</span>
            )}
          </div>

          {/* Ship Policy */}
          <div className={styles.field}>
            <div className={styles.fieldHeader}>
              <span className={styles.label}>Ship Policy</span>
              {defaults.fulfillmentPolicyId && (
                <button className={styles.clearBtn} onClick={clearFulfillment} title="Clear policy">✕ Clear</button>
              )}
            </div>
            {fulfillmentPolicies.length > 0 ? (
              <select
                className={styles.select}
                value={defaults.fulfillmentPolicyId}
                onChange={(e) => save({ fulfillmentPolicyId: e.target.value })}
              >
                <option value="">— auto (first) —</option>
                {fulfillmentPolicies.map((p) => (
                  <option key={p.fulfillmentPolicyId} value={p.fulfillmentPolicyId}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className={styles.naText}>Connect API to see policies</span>
            )}
          </div>

          {/* Shipping Method */}
          <div className={styles.field}>
            <div className={styles.fieldHeader}>
              <span className={styles.label}>Shipping Method</span>
              {defaults.shippingService && (
                <button className={styles.clearBtn} onClick={clearShipping} title="Clear shipping method">✕ Clear</button>
              )}
            </div>
            {shippingServices.length > 0 ? (
              <ShippingPicker
                shippingServices={shippingServices}
                value={defaults.shippingService}
                onChange={(code) => save({ shippingService: code })}
              />
            ) : (
              <span className={styles.naText}>Connect API to see shipping methods</span>
            )}
          </div>

          {/* Dimensions */}
          <div className={styles.field}>
            <div className={styles.fieldHeader}>
              <span className={styles.label}>Dimensions (inches)</span>
              {hasDims && (
                <button className={styles.clearBtn} onClick={clearDimensions} title="Clear dimensions">✕ Clear</button>
              )}
            </div>
            <div className={styles.dimRow}>
              <div className={styles.dimField}>
                <label className={styles.subLabel}>Length</label>
                <input
                  type="text" inputMode="numeric" className={styles.numInput}
                  value={length}
                  onChange={(e) => setLength(e.target.value.replace(/\D/g, ''))}
                  onBlur={handleNumBlur}
                  placeholder="0"
                />
              </div>
              <div className={styles.dimField}>
                <label className={styles.subLabel}>Width</label>
                <input
                  type="text" inputMode="numeric" className={styles.numInput}
                  value={width}
                  onChange={(e) => setWidth(e.target.value.replace(/\D/g, ''))}
                  onBlur={handleNumBlur}
                  placeholder="0"
                />
              </div>
              <div className={styles.dimField}>
                <label className={styles.subLabel}>Height</label>
                <input
                  type="text" inputMode="numeric" className={styles.numInput}
                  value={height}
                  onChange={(e) => setHeight(e.target.value.replace(/\D/g, ''))}
                  onBlur={handleNumBlur}
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          {/* Weight */}
          <div className={styles.field}>
            <div className={styles.fieldHeader}>
              <span className={styles.label}>Weight</span>
              {hasWeight && (
                <button className={styles.clearBtn} onClick={clearWeight} title="Clear weight">✕ Clear</button>
              )}
            </div>
            <div className={styles.dimRow}>
              <div className={styles.dimField}>
                <label className={styles.subLabel}>Pounds</label>
                <input
                  type="text" inputMode="numeric" className={styles.numInput}
                  value={weightLbs}
                  onChange={(e) => setWeightLbs(e.target.value.replace(/\D/g, ''))}
                  onBlur={handleNumBlur}
                  placeholder="0"
                />
              </div>
              <div className={styles.dimField}>
                <label className={styles.subLabel}>Ounces</label>
                <input
                  type="text" inputMode="numeric" className={styles.numInput}
                  value={weightOz}
                  onChange={(e) => setWeightOz(e.target.value.replace(/\D/g, ''))}
                  onBlur={handleNumBlur}
                  placeholder="0"
                />
              </div>
            </div>
          </div>

        </div>

        <div className={styles.footer}>
          <span className={saving ? styles.savingText : styles.savedText}>
            {saving ? 'Saving…' : saved ? '✓ Changes saved automatically' : 'Changes are saved automatically'}
          </span>
          <div className={styles.footerBtns}>
            {onApplyToAll && (
              <button
                className={applied ? styles.applyBtnDone : styles.applyBtn}
                disabled={listingCount === 0 || applied}
                onClick={() => {
                  onApplyToAll();
                  setApplied(true);
                  setTimeout(() => setApplied(false), 2500);
                }}
              >
                {applied ? `✓ Applied to ${listingCount} listing${listingCount !== 1 ? 's' : ''}` : `Apply to All (${listingCount})`}
              </button>
            )}
            <button className={styles.doneBtn} onClick={onClose}>Done</button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}
