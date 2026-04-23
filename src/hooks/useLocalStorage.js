import { useState, useEffect, useRef } from 'react';

/**
 * useState that persists its value in localStorage.
 * Writes are debounced (300 ms) so rapid successive updates — e.g. many image
 * upload completions in quick succession — don't block the main thread with
 * repeated large JSON.stringify + setItem calls.
 */
export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const timerRef = useRef(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // localStorage full or unavailable — fail silently
      }
    }, 300);

    return () => clearTimeout(timerRef.current);
  }, [key, value]);

  const clear = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    localStorage.removeItem(key);
    setValue(initialValue);
  };

  return [value, setValue, clear];
}
