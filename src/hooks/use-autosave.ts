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
  const loadedSinceSwitch = useRef(false);
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
      // The old item's baseline must not leak onto the new one, unless the
      // new one was already loaded (editors that load, then open).
      if (!loadedSinceSwitch.current) baselineRef.current = null;
      loadedSinceSwitch.current = false;
    }
    latest.current = { key, value, valid, save };
  });

  const flush = useCallback(() => run(latest.current, true), [run]);

  /** Adopt `next` as saved (just loaded, or just written elsewhere). */
  const reset = useCallback((next: T) => {
    window.clearTimeout(timer.current);
    loadedSinceSwitch.current = true;
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

/**
 * An edit dialog's autosave contract, on top of `useAutosave`: the item as it
 * was opened (for Undo changes), and one close path that flushes the last
 * change, or says what wasn't saved. Dialogs keep their own field state;
 * they hand over `value` (the fields as one object) and `apply` (set them all).
 *
 *   load(v)      once the item is in the fields (baseline + undo point)
 *   close(then)  every close path: Esc, backdrop, ×, Done
 *   undo()       back to the item as opened, saved at once
 */
export function useEditorAutosave<T>({ key, value, apply, invalid = null, save }: {
  /** The item's id while editing it; null when creating or closed. */
  key: string | number | null;
  value: T;
  apply: (value: T) => void;
  /** Why `value` can't be saved right now ("a name is required"), if it can't. */
  invalid?: string | null;
  save: (value: T) => Promise<void>;
}) {
  const autosave = useAutosave({ key, value, valid: !invalid, save });
  const [initial, setInitial] = useState<string | null>(null);
  const initialValue = useRef<T | null>(null);
  const { reset, flush, commit } = autosave;

  const load = useCallback((loaded: T) => {
    initialValue.current = loaded;
    setInitial(JSON.stringify(loaded));
    reset(loaded);
  }, [reset]);

  const close = (then: () => void) => {
    if (key !== null) {
      if (autosave.dirty && invalid) toast.error(`Not saved: ${invalid}`);
      void flush();
    }
    then();
  };

  const undo = () => {
    const back = initialValue.current;
    if (back === null) return;
    apply(back);
    void commit(back);
  };

  const changed = key !== null && initial !== null && JSON.stringify(value) !== initial;
  return { status: autosave.status, changed, load, close, undo, cancel: autosave.cancel, commit };
}
