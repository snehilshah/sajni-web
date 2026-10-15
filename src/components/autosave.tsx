import { Button } from '@/components/ui/button';
import type { AutosaveStatus as Status } from '@/hooks/use-autosave';

/** Quiet save state for an autosaving editor; sits in the title row. */
export function AutosaveStatus({ status }: { status: Status }) {
  return (
    <span className="shrink-0 text-xs font-normal text-muted-foreground" aria-live="polite">
      {status === 'saving' ? 'Saving…'
        : status === 'saved' ? 'Saved'
          : status === 'error' ? <span className="text-destructive">Not saved</span> : null}
    </span>
  );
}

/** Footer actions for editing an existing item: Undo changes · Done. */
export function EditActions({ changed, onUndo, onDone, doneLabel = 'Done', disabled = false }: {
  changed: boolean; onUndo: () => void; onDone: () => void;
  /** Says what Done will do when it applies more than the autosaved fields. */
  doneLabel?: string;
  disabled?: boolean;
}) {
  return (
    <>
      {changed && <Button variant="ghost" onClick={onUndo}>Undo changes</Button>}
      <Button onClick={onDone} disabled={disabled}>{doneLabel}</Button>
    </>
  );
}
