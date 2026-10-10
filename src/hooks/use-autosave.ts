import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { failureText } from '@/lib/errors';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface Latest<T> {
  key: string | number | null;
  value: T;
  valid: boolean;
  save: (value: T) => Promise<void>;
}

/**
 * Editors of existing items save themselves. `delay` ms after the last change
 * (default 3s), when the item is closed, when the editor switches to another
 * item (`key` changes), and when the app is hidden. The flush always uses the
 * save closure and value of the item that was edited, never the next one's.
 *
 * Call `reset(value)` once the editor has loaded an item. That is the baseline
 * nothing is saved against. `key` null disables autosave (create mode).
 * Invalid values (`valid` false) wait until they're fixed.
 */
export function useAutosave<T>({ key, value, valid, save, delay = 3000 }: {
  key: string | number | null;
  value: T;
  valid: boolean;
  save: (value: T) => Promise<void>;
  delay?: number;
}) {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [baseline, setBaseline] = useState<string | null>(null);
  const baselineRef = useRef<string | null>(null);
  const latest = useRef<Latest<T>>({ key, value, valid, save });
  const timer = useRef<number | undefined>(undefined);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const snapshot = JSON.stringify(value);

  const setBase = useCallback((next: string | null) => {
    baselineRef.current = next;
    setBaseline(next);
  }, []);

  // Save `target` (the item it belongs to travels with it) if it differs from
  // the baseline. Saves run one at a time, in order.
  const run = useCallback((target: Latest<T>, sameItem: boolean): Promise<void> => {
    window.clearTimeout(timer.current);
    if (target.key === null || baselineRef.current === null || !target.valid) return chain.current;
    const snap = JSON.stringify(target.value);
    const before = baselineRef.current;
    if (snap === before) return chain.current;
    if (sameItem) setBase(snap);
    setStatus('saving');
    chain.current = chain.current
      .then(() => target.save(target.value))
      .then(
        () => { if (sameItem) setStatus('saved'); },
        (err: unknown) => {
          // Put the old baseline back so the next change (or close) retries.
          if (sameItem && baselineRef.current === snap) setBase(before);
          setStatus('error');
          toast.error(failureText(err, "Couldn't save your changes"));
        },
      );
    return chain.current;
  }, [setBase]);

  // Switching items: flush the previous one with its own value and closure
  // before the new item's are adopted.
  useLayoutEffect(() => {
    const prev = latest.current;
    if (prev.key !== key) {
      void run(prev, false);
      baselineRef.current = null;
    }
    latest.current = { key, value, valid, save };
  });

  const flush = useCallback(() => run(latest.current, true), [run]);

  /** Adopt `next` as saved (just loaded, or just written elsewhere). */
  const reset = useCallback((next: T) => {
    window.clearTimeout(timer.current);
    setBase(JSON.stringify(next));
    setStatus('idle');
  }, [setBase]);

  /** Drop a pending save (the item is being deleted). */
  const cancel = useCallback(() => {
    window.clearTimeout(timer.current);
    setBase(null);
  }, [setBase]);

  /** Save `next` right away (undo, one-tap actions), bypassing the delay. */
  const commit = useCallback((next: T) => run({ ...latest.current, value: next }, true), [run]);

  useEffect(() => {
    if (key === null || baseline === null || snapshot === baseline || !valid) return;
    timer.current = window.setTimeout(() => { void run(latest.current, true); }, delay);
    return () => window.clearTimeout(timer.current);
  }, [baseline, delay, key, run, snapshot, valid]);

  // Backgrounding the app (phone home button, tab switch) counts as leaving.
  useEffect(() => {
    if (key === null) return;
    const onHide = () => { if (document.visibilityState === 'hidden') void run(latest.current, true); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [key, run]);

  const dirty = key !== null && baseline !== null && snapshot !== baseline;
  return { status: dirty ? 'idle' as const : status, dirty, flush, reset, cancel, commit };
}
