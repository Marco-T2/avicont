import { useEffect, useState } from 'react';

/**
 * Devuelve un valor "debounced": se actualiza recién después de `delayMs`
 * sin cambios. Útil para inputs de búsqueda — evita un request por cada
 * tecla.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [value, delayMs]);
  return debounced;
}
