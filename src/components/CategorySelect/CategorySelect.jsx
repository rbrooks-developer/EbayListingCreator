import React, { useEffect, useMemo, useRef, useState } from 'react';
import styles from './CategorySelect.module.css';

const MAX_RESULTS = 100;

/**
 * Category selector — opens a search modal similar to Item Specifics.
 * Props:
 *  categories: { categoryId, categoryName, fullPath }[]
 *  value: categoryId string ('' = none selected)
 *  onChange(categoryId, categoryName) => void
 *  disabled: bool
 */
export default function CategorySelect({ categories, value, onChange, disabled }) {
  const [open, setOpen] = useState(false);

  const selectedCategory = useMemo(
    () => (value ? categories.find((c) => c.categoryId === value) : null),
    [value, categories]
  );

  function handleClear(e) {
    e.stopPropagation();
    onChange('', '');
  }

  function handleSelect(cat) {
    onChange(cat.categoryId, cat.categoryName);
    setOpen(false);
  }

  return (
    <>
      {/* Trigger button in the table cell */}
      <button
        type="button"
        className={`${styles.trigger} ${disabled ? styles.triggerDisabled : ''} ${!value ? styles.triggerEmpty : ''}`}
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
        title={selectedCategory?.fullPath ?? 'Select a category'}
      >
        <span className={styles.triggerText}>
          {selectedCategory ? selectedCategory.fullPath : 'Select category…'}
        </span>
        <span className={styles.triggerIcons}>
          {value && !disabled && (
            <span
              className={styles.clearBtn}
              role="button"
              aria-label="Clear category"
              onClick={handleClear}
              onKeyDown={(e) => e.key === 'Enter' && handleClear(e)}
              tabIndex={0}
            >
              &#x2715;
            </span>
          )}
          <span className={styles.chevron} aria-hidden="true">&#8964;</span>
        </span>
      </button>

      {/* Modal */}
      {open && (
        <CategoryModal
          categories={categories}
          selectedId={value}
          onSelect={handleSelect}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ── CategoryModal ─────────────────────────────────────────────────────────────

function CategoryModal({ categories, selectedId, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const overlayRef = useRef(null);

  // Focus search input on open
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handler(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Filter results
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return categories
      .filter((c) => c.fullPath.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS);
  }, [query, categories]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      listRef.current.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      onSelect(results[activeIndex]);
    }
  }

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose();
  }

  // Highlight matched query text in the path
  function highlight(text) {
    const q = query.trim();
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className={styles.mark}>{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  }

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Select Category"
    >
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>Select Category</h2>
            <p className={styles.modalSubtitle}>
              Search across {categories.length.toLocaleString()} eBay categories
            </p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">&#x2715;</button>
        </div>

        {/* Search */}
        <div className={styles.searchBar}>
          <span className={styles.searchIcon} aria-hidden="true">&#128269;</span>
          <input
            ref={inputRef}
            type="text"
            className={styles.searchInput}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(-1); }}
            onKeyDown={handleKeyDown}
            placeholder={'Search categories e.g. "video games", "sneakers", "cameras"…'}
            aria-label="Search categories"
            autoComplete="off"
          />
          {query && (
            <button className={styles.clearSearch} onClick={() => { setQuery(''); setActiveIndex(-1); inputRef.current?.focus(); }} aria-label="Clear search">
              &#x2715;
            </button>
          )}
        </div>

        {/* Results */}
        <div className={styles.resultsArea}>
          {query.trim() === '' ? (
            <div className={styles.emptyPrompt}>
              <span className={styles.emptyIcon} aria-hidden="true">&#128193;</span>
              <p>Start typing to search categories</p>
            </div>
          ) : results.length === 0 ? (
            <div className={styles.emptyPrompt}>
              <span className={styles.emptyIcon} aria-hidden="true">&#128269;</span>
              <p>No categories found for "<strong>{query}</strong>"</p>
            </div>
          ) : (
            <>
              <ul ref={listRef} className={styles.resultList} role="listbox">
                {results.map((cat, i) => (
                  <li
                    key={cat.categoryId}
                    role="option"
                    aria-selected={cat.categoryId === selectedId}
                    className={`${styles.resultItem} ${i === activeIndex ? styles.resultActive : ''} ${cat.categoryId === selectedId ? styles.resultSelected : ''}`}
                    onMouseDown={() => onSelect(cat)}
                    onMouseEnter={() => setActiveIndex(i)}
                  >
                    <span className={styles.resultPath}>{highlight(cat.fullPath)}</span>
                    <span className={styles.resultId}>#{cat.categoryId}</span>
                  </li>
                ))}
              </ul>
              {results.length === MAX_RESULTS && (
                <p className={styles.resultFooter}>
                  Showing first {MAX_RESULTS} results — refine your search to narrow down
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
