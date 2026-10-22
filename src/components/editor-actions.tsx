import { Button } from '@/components/ui/button';
import type { EditorDraft } from '@/hooks/use-editor-draft';
import { cn } from '@/lib/utils';

/** "Unsaved changes. Close again to discard.", nudged in when it appears. */
export function UnsavedNotice({ draft, className }: { draft: Pick<EditorDraft, 'warning'>; className?: string }) {
  if (!draft.warning) return null;
  return (
    <span role="status" className={cn('animate-nudge self-center text-sm text-destructive', className)}>
      Unsaved changes. Close again to discard.
    </span>
  );
}

/**
 * An editor's footer: Cancel · Save. Cancel goes through the draft's close,
 * so with changes it warns first and then reads "Discard".
 */
export function EditActions({ draft, onCancel, onSave, saveLabel = 'Save', disabled = false }: {
  draft: Pick<EditorDraft, 'warning' | 'saving' | 'close'>;
  onCancel: () => void;
  onSave: () => void;
  /** Says what Save does when it's more than saving the fields. */
  saveLabel?: string;
  disabled?: boolean;
}) {
  return (
    <>
      <UnsavedNotice draft={draft} />
      <Button
        variant="outline"
        className={cn(draft.warning && 'text-destructive')}
        onClick={() => draft.close(onCancel)}
      >
        {draft.warning ? 'Discard' : 'Cancel'}
      </Button>
      <Button onClick={onSave} disabled={disabled || draft.saving}>{draft.saving ? 'Saving…' : saveLabel}</Button>
    </>
  );
}
