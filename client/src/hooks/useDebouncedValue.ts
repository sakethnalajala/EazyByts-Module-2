import { useEffect, useState } from 'react';

/**
 * Debounces a rapidly-changing value.
 *
 * Typing "RELIANCE" into a search box produces eight renders. Without this,
 * that means eight network requests for one intent.
 *
 * The `setState` call happens inside a `setTimeout` callback - asynchronously,
 * after the effect has already finished - so it does not cause the cascading
 * render that a synchronous `setState` in an effect would.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
