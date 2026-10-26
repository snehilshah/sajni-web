import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { failureText } from '@/lib/errors';

/** How long "Unsaved changes" stays up; a second close inside it discards. */
const WARN_MS = 3000;

/**
 * An editor's draft. Nothing saves until Save. The fields (one object,
 * `value`) are compared with the item as it was loaded (`load`), and every
 * way out (Esc, backdrop, ×, Cancel) goes through `close`: with changes, the
 * first try shows "Unsaved changes" and the second discards.
 *
 *   load(v)       once the item (or a blank form) is in the fields
 *   close(then)   every close path
 *   save(then)    write an edit, then `then` (usually: close)
 *   commit(v)     write `v` now (a one-tap action inside the editor)
 *
 * `open` is whether the editor is showing. A closed one has nothing unsaved,
 * even when its fields still hold what was typed (after Add, or a discard).
 * `editing` false means create: the dialog has its own Add, `save` is unused.
 * `dirty` overrides what counts as unsaved (fields that fill in defaults).
 */
export function useEditorDraft<T>({ open, editing, value, invalid = null, save, dirty }: {
  open: boolean;
  editing: boolean;
  value: T;
  /** Why `value` can't be saved right now ("a name is required"), if it can't. */
  invalid?: string | null;
  save?: (value: T) => Promise<void>;
  dirty?: boolean;
}) {
  const [baseline, setBaseline] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const snapshot = JSON.stringify(value);
  const changed = open && (dirty ?? (baseline !== null && snapshot !== baseline));
  // Nothing unsaved, nothing to warn about.
  const warning = armed && changed;

  const load = useCallback((loaded: T) => {
    setBaseline(JSON.stringify(loaded));
    setArmed(false);
  }, []);

  // The warning fades on its own.
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), WARN_MS);
    return () => window.clearTimeout(t);
  }, [armed]);

  // Closing the tab or reloading with unsaved changes asks the browser's question.
  useEffect(() => {
    if (!changed) return;
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [changed]);

  // Close paths are handed to dialogs as callbacks; they read the latest state.
  const latest = useRef({ changed, warning });
  useLayoutEffect(() => { latest.current = { changed, warning }; });

  const close = useCallback((then: () => void) => {
    const { changed: c, warning: w } = latest.current;
    if (!c || w) { setArmed(false); then(); return; }
    setArmed(true);
  }, []);

  const saveDraft = async (then?: () => void) => {
    if (!editing || saving) return;
    if (!changed) { then?.(); return; }
    if (invalid) { toast.error(`Can't save: ${invalid}`); return; }
    setSaving(true);
    try {
      await save?.(value);
      setBaseline(snapshot);
      setArmed(false);
      then?.();
    } catch (err) {
      toast.error(failureText(err, "Couldn't save your changes"));
    } finally {
      setSaving(false);
    }
  };

  const commit = async (next: T) => {
    await save?.(next);
    setBaseline(JSON.stringify(next));
  };

  /** The item is going (deleted): nothing left to keep. */
  const cancel = useCallback(() => { setBaseline(null); setArmed(false); }, []);

  return { changed, warning, saving, load, close, save: saveDraft, commit, cancel };
}

export type EditorDraft = ReturnType<typeof useEditorDraft>;
