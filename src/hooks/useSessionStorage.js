import { useState, useEffect } from 'react';

/**
 * useState that persists its value in sessionStorage.
 * Data is cleared when the browser tab closes — appropriate for OAuth tokens.
 */
export function useSessionStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = sessionStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // sessionStorage full or unavailable — fail silently
    }
  }, [key, value]);

  const clear = () => {
    sessionStorage.removeItem(key);
    setValue(initialValue);
  };

  return [value, setValue, clear];
}
