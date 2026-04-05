import React, { useEffect, useMemo, useRef, useState } from 'react';
import styles from './CategorySelect.module.css';

const MAX_RESULTS = 80;

/**
 * Searchable category combobox.
 * Props:
 *  categories: { categoryId, categoryName, fullPath }[]
 *  value: categoryId string ('' = none selected)
 *  onChange(categoryId, categoryName) => void
 *  disabled: bool
 */
export default function CategorySelect({ categories, value, onChange, disabled }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const wrapperRef = useRef(null);

  // Display the selected category's path when closed
  const selectedCategory = useMemo(
    () => (value ? categories.find((c) => c.categoryId === value) : null),
    [value, categories]
  );

  // Filter results as user types
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return categories
      .filter((c) => c.fullPath.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS);
  }, [query, categories]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (!wrapperRef.current?.contains(e.target)) {
        setOpen(false);
        setQuery('');
        setActiveIndex(-1);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex];
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  function openDropdown() {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    setActiveIndex(-1);
    setTimeout(() => inputRef.current?.focus(), 10);
  }

  function handleSelect(cat) {
    onChange(cat.categoryId, cat.categoryName);
    setOpen(false);
    setQuery('');
    setActiveIndex(-1);
  }

  function handleClear(e) {
    e.stopPropagation();
    onChange('', '');
  }

  function handleKeyDown(e) {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(results[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  }

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      {/* Trigger — shows selected value or placeholder */}
      {!open && (
        <button
          type="button"
          className={`${styles.trigger} ${disabled ? styles.triggerDisabled : ''} ${!value ? styles.triggerEmpty : ''}`}
          onClick={openDropdown}
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
      )}

      {/* Search input — shown when open */}
      {open && (
        <div className={styles.searchWrapper}>
          <input
            ref={inputRef}
            type="text"
            className={styles.searchInput}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(-1); }}
            onKeyDown={handleKeyDown}
            placeholder="Type to search categories…"
            aria-label="Search categories"
            aria-expanded={true}
            aria-autocomplete="list"
          />
        </div>
      )}

      {/* Dropdown results */}
      {open && (
        <div className={styles.dropdown}>
          {query.trim() === '' ? (
            <div className={styles.hint}>Start typing to search {categories.length.toLocaleString()} categories</div>
          ) : results.length === 0 ? (
            <div className={styles.hint}>No categories found for "{query}"</div>
          ) : (
            <>
              <ul ref={listRef} className={styles.list} role="listbox">
                {results.map((cat, i) => (
                  <li
                    key={cat.categoryId}
                    role="option"
                    aria-selected={cat.categoryId === value}
                    className={`${styles.option} ${i === activeIndex ? styles.optionActive : ''} ${cat.categoryId === value ? styles.optionSelected : ''}`}
                    onMouseDown={() => handleSelect(cat)}
                    onMouseEnter={() => setActiveIndex(i)}
                  >
                    <span className={styles.optionPath}>{cat.fullPath}</span>
                    <span className={styles.optionId}>#{cat.categoryId}</span>
                  </li>
                ))}
              </ul>
              {results.length === MAX_RESULTS && (
                <div className={styles.hint}>Showing first {MAX_RESULTS} results — refine your search</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
