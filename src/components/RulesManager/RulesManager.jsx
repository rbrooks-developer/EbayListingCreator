import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { fetchAspectsForCategory } from '../../services/ebayApi.js';
import { createRule, deleteRule, updateRule } from '../../services/rulesService.js';
import CategorySelect from '../CategorySelect/CategorySelect.jsx';
import styles from './RulesManager.module.css';

/**
 * RulesManager
 * Props:
 *  isOpen         — bool
 *  onClose        — () => void
 *  rules          — Rule[]
 *  onRulesChange  — (rules: Rule[]) => void
 *  categories     — { categoryId, categoryName, fullPath }[]
 *  accessToken    — string | null
 *  categoryTreeId — string | null
 *  sandbox        — bool
 *  aspectsCache   — useRef(Map)  shared with ListingGrid
 *  onSignInClick  — () => void
 */
export default function RulesManager({
  isOpen,
  onClose,
  rules,
  onRulesChange,
  categories = [],
  accessToken = null,
  categoryTreeId = null,
  sandbox = false,
  aspectsCache,
  onSignInClick,
}) {
  const { user } = useAuth();
  const overlayRef = useRef(null);

  const [editingRule, setEditingRule] = useState(null); // null = closed, 'new' = new, Rule = edit
  const [deleting, setDeleting] = useState(null); // id being deleted

  useEffect(() => {
    if (!isOpen) return;
    function handler(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose();
  }

  async function handleDelete(id) {
    setDeleting(id);
    try {
      await deleteRule(id);
      onRulesChange(rules.filter((r) => r.id !== id));
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeleting(null);
    }
  }

  function handleSaved(savedRule, isNew) {
    onRulesChange(
      isNew
        ? [...rules, savedRule]
        : rules.map((r) => (r.id === savedRule.id ? savedRule : r))
    );
    setEditingRule(null);
  }

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Listing Rules"
    >
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Listing Rules</h2>
            <p className={styles.subtitle}>
              Auto-fill item specifics based on category and title keywords.
              Rules also apply when importing from a spreadsheet.
            </p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            &#x2715;
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {!user ? (
            <div className={styles.authGate}>
              <p>Sign in to create and save listing rules.</p>
              <button onClick={() => { onClose(); onSignInClick(); }}>Sign In</button>
            </div>
          ) : (
            <>
              {/* Rule list */}
              {rules.length === 0 && editingRule === null && (
                <p className={styles.emptyNote}>No rules yet. Click "Add Rule" to create one.</p>
              )}

              {rules.length > 0 && (
                <div className={styles.ruleList}>
                  {rules.map((rule) => (
                    <div key={rule.id} className={styles.ruleItem}>
                      <div className={styles.ruleInfo}>
                        <div className={styles.ruleSummary}>
                          <strong>{rule.categoryName}</strong>
                          {' → '}
                          {rule.aspectName} = {rule.aspectValue}
                        </div>
                        <div className={styles.ruleKeywords}>
                          {rule.keywords?.length > 0
                            ? `Title contains: ${rule.keywords.join(', ')}`
                            : 'Applies to all titles in this category'}
                        </div>
                      </div>
                      <div className={styles.ruleActions}>
                        <button
                          className={styles.btnEdit}
                          onClick={() => setEditingRule(rule)}
                          disabled={editingRule !== null}
                        >
                          Edit
                        </button>
                        <button
                          className={styles.btnDelete}
                          onClick={() => handleDelete(rule.id)}
                          disabled={deleting === rule.id || editingRule !== null}
                        >
                          {deleting === rule.id ? '…' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Inline editor */}
              {editingRule !== null && (
                <RuleEditor
                  rule={editingRule === 'new' ? null : editingRule}
                  categories={categories}
                  accessToken={accessToken}
                  categoryTreeId={categoryTreeId}
                  sandbox={sandbox}
                  aspectsCache={aspectsCache}
                  onSave={handleSaved}
                  onCancel={() => setEditingRule(null)}
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {user && (
          <div className={styles.footer}>
            <button
              className={styles.btnAddRule}
              onClick={() => setEditingRule('new')}
              disabled={editingRule !== null}
            >
              + Add Rule
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── RuleEditor ────────────────────────────────────────────────────────────────

function RuleEditor({ rule, categories, accessToken, categoryTreeId, sandbox, aspectsCache, onSave, onCancel }) {
  const isNew = !rule;

  const [categoryId,   setCategoryId]   = useState(rule?.categoryId   ?? '');
  const [categoryName, setCategoryName] = useState(rule?.categoryName ?? '');
  const [keywords,     setKeywords]     = useState(rule?.keywords?.join(', ') ?? '');
  const [aspectName,   setAspectName]   = useState(rule?.aspectName   ?? '');
  const [aspectValue,  setAspectValue]  = useState(rule?.aspectValue  ?? '');

  const [aspectDefs,   setAspectDefs]   = useState([]);
  const [aspectStatus, setAspectStatus] = useState('idle'); // idle | loading | ready | error

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  // Fetch aspects when category is selected
  useEffect(() => {
    if (!categoryId) { setAspectDefs([]); setAspectStatus('idle'); return; }

    // Check cache
    if (aspectsCache?.current.has(categoryId)) {
      setAspectDefs(aspectsCache.current.get(categoryId));
      setAspectStatus('ready');
      return;
    }

    if (!accessToken || !categoryTreeId) {
      setAspectStatus('idle'); // will fall back to free-text
      return;
    }

    setAspectStatus('loading');
    fetchAspectsForCategory(accessToken, categoryTreeId, categoryId, sandbox)
      .then((defs) => {
        if (aspectsCache?.current) aspectsCache.current.set(categoryId, defs);
        setAspectDefs(defs);
        setAspectStatus('ready');
      })
      .catch(() => setAspectStatus('error'));
  }, [categoryId, accessToken, categoryTreeId, sandbox, aspectsCache]);

  function handleCategoryChange(id, name) {
    setCategoryId(id);
    setCategoryName(name);
    setAspectName('');
    setAspectValue('');
  }

  // Selected aspect definition (for value suggestions)
  const selectedDef = aspectDefs.find((d) => d.aspectName === aspectName);
  const hasValues   = selectedDef?.aspectValues?.length > 0;

  const canSave = categoryId && aspectName.trim() && aspectValue.trim();

  async function handleSave() {
    setError('');
    setSaving(true);
    const payload = {
      categoryId,
      categoryName,
      keywords: keywords.split(',').map((s) => s.trim()).filter(Boolean),
      aspectName:  aspectName.trim(),
      aspectValue: aspectValue.trim(),
    };
    try {
      if (isNew) {
        const saved = await createRule(payload);
        onSave(saved, true);
      } else {
        const saved = await updateRule(rule.id, payload);
        onSave(saved, false);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.editor}>
      <div className={styles.editorTitle}>{isNew ? 'New Rule' : 'Edit Rule'}</div>

      {/* Category */}
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Category *</label>
        <CategorySelect
          categories={categories}
          value={categoryId}
          onChange={handleCategoryChange}
        />
      </div>

      {/* Item Specific (aspect name) */}
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Item Specific *</label>
        {aspectStatus === 'ready' && aspectDefs.length > 0 ? (
          <select
            className={styles.fieldSelect}
            value={aspectName}
            onChange={(e) => { setAspectName(e.target.value); setAspectValue(''); }}
          >
            <option value="">— select item specific —</option>
            {aspectDefs.map((d) => (
              <option key={d.aspectName} value={d.aspectName}>{d.aspectName}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            className={styles.fieldInput}
            value={aspectName}
            onChange={(e) => setAspectName(e.target.value)}
            placeholder={
              !categoryId         ? 'Select a category first' :
              aspectStatus === 'loading' ? 'Loading…' :
              'e.g. Type, Brand, Color'
            }
            disabled={!categoryId || aspectStatus === 'loading'}
          />
        )}
      </div>

      {/* Item Specific Value */}
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Item Specific Value *</label>
        {hasValues ? (
          <select
            className={styles.fieldSelect}
            value={aspectValue}
            onChange={(e) => setAspectValue(e.target.value)}
            disabled={!aspectName}
          >
            <option value="">— select value —</option>
            {selectedDef.aspectValues.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            className={styles.fieldInput}
            value={aspectValue}
            onChange={(e) => setAspectValue(e.target.value)}
            placeholder={!aspectName ? 'Select an item specific first' : 'e.g. Vinyl Figure'}
            disabled={!aspectName}
            list={aspectName ? 'aspect-value-suggestions' : undefined}
          />
        )}
        {/* Free-text with datalist suggestions if aspect has values but is not SELECTION_ONLY */}
        {!hasValues && selectedDef?.aspectValues?.length > 0 && (
          <datalist id="aspect-value-suggestions">
            {selectedDef.aspectValues.slice(0, 100).map((v) => <option key={v} value={v} />)}
          </datalist>
        )}
      </div>

      {/* Search Words */}
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Search Words from Title</label>
        <input
          type="text"
          className={styles.fieldInput}
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="funko, pop (comma-separated — leave blank to match all titles)"
        />
        <span className={styles.fieldHint}>
          Leave blank to apply to every listing in this category.
        </span>
      </div>

      {error && <div className={styles.editorError}>{error}</div>}

      <div className={styles.editorActions}>
        <button className={styles.btnCancel} onClick={onCancel} disabled={saving}>Cancel</button>
        <button className={styles.btnSave} onClick={handleSave} disabled={!canSave || saving}>
          {saving ? 'Saving…' : 'Save Rule'}
        </button>
      </div>
    </div>
  );
}
