import { lazy, type ComponentType } from 'react';

// Lazy-loaded screens and heavy surfaces register here so the signed-in shell
// can fetch them all once the app is idle. After that, switching pages never
// waits on the network (no frozen-looking transition on a slow connection),
// and a running tab keeps working across a deploy because it no longer needs
// chunks that the deploy removed.
const loaders: Array<() => Promise<unknown>> = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- React.lazy's own constraint
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  loaders.push(load);
  return lazy(load);
}

let started = false;

/** Fetch every registered chunk, one at a time, when the browser is idle. */
export function prefetchPages() {
  if (started) return;
  started = true;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return;
  const idle = (fn: () => void) =>
    typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(fn, { timeout: 5000 }) : setTimeout(fn, 2000);
  idle(async () => {
    for (const load of loaders) {
      // Ignored here: opening that screen meets the same failure, and its
      // error boundary recovers (lib/chunkReload).
      try { await load(); } catch { /* ignore */ }
    }
  });
}
