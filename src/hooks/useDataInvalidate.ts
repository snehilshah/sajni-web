import { useEffect, useRef } from 'react';

/**
 * Subscribe to the global `data:invalidate` event (dispatched by AIChat
 * after each AI tool mutation) and run `onInvalidate` when the event's
 * `kind` starts with one of `prefixes`.
 *
 * Debounced: a single AI turn can emit several tool results in quick
 * succession (e.g. categorize → update_transaction), so we coalesce the
 * burst into one refetch instead of hammering the API. The handler always
 * sees the latest `onInvalidate` via a ref, so callers can pass an inline
 * closure over fresh state without re-subscribing.
 */
export function useDataInvalidate(
  prefixes: string[],
  onInvalidate: () => void,
  debounceMs = 500,
) {
  const cb = useRef(onInvalidate);
  // Keep the latest callback without re-subscribing. Assigning in an effect
  // (not during render) satisfies the React Compiler's no-ref-write-in-render
  // rule; the handler only reads cb.current later, at event time.
  useEffect(() => {
    cb.current = onInvalidate;
  });
  const key = prefixes.join('|');

  useEffect(() => {
    const list = key ? key.split('|') : [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handler = (e: Event) => {
      const kind = (e as CustomEvent).detail?.kind as string | undefined;
      if (!kind || !list.some((p) => kind.startsWith(p))) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        cb.current();
      }, debounceMs);
    };
    window.addEventListener('data:invalidate', handler);
    return () => {
      window.removeEventListener('data:invalidate', handler);
      if (timer) clearTimeout(timer);
    };
  }, [key, debounceMs]);
}
