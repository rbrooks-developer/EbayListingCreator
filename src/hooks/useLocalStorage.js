import { useState, useEffect } from 'react';

/**
 * useState that persists its value in localStorage.
 * Data survives page refreshes and browser restarts.
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

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // localStorage full or unavailable — fail silently
    }
  }, [key, value]);

  const clear = () => {
    localStorage.removeItem(key);
    setValue(initialValue);
  };

  return [value, setValue, clear];
}
