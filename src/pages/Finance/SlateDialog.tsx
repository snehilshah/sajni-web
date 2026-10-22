import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { finance, type FinSlate } from '@/api';
import { failureText } from '@/lib/errors';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ACCOUNT_COLORS } from './utils';
import { cn } from '@/lib/utils';
import { useEditorDraft } from '@/hooks/use-editor-draft';
import { EditActions } from '@/components/editor-actions';

// Create/edit form for a slate (name + color). Plain never reaches here —
// it can't be renamed, so SlatesTab offers no edit action for it.

export default function SlateDialog({ open, slate, onClose, onSaved }: {
  open: boolean;
  slate: FinSlate | null;
  onClose: () => void;
  /** Receives the new slate's id on create, so a caller mid-sweep can move the
   *  selected transactions into it without waiting for a slates refetch. */
  onSaved: (createdId?: number) => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(ACCOUNT_COLORS[0]);
  const [saving, setSaving] = useState(false);

  // Nothing saves until Save; a new slate is created explicitly.
  const editor = useEditorDraft({
    editing: !!(open && slate),
    value: { name, color },
    invalid: name.trim() ? null : 'a slate needs a name.',
    save: async (v) => {
      if (!slate) return;
      await finance.updateSlate(slate.id, { name: v.name.trim(), color: v.color });
    },
  });
  const loadDraft = editor.load;
  const requestClose = () => editor.close(onClose);

  useEffect(() => {
    if (!open) return;
    const v = { name: slate?.name ?? '', color: slate?.color || ACCOUNT_COLORS[0] };
    setName(v.name);
    setColor(v.color);
    loadDraft(v);
  }, [open, slate, loadDraft]);

  const save = async () => {
    if (slate) { await editor.save(onSaved); return; }
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const created = await finance.createSlate({ name: name.trim(), color });
      onSaved(created.id);
    } catch (e) {
      toast.error(failureText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && requestClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-sm">
        <DialogHeader className="flex-row items-baseline justify-between gap-3">
          <DialogTitle>{slate ? 'Edit slate' : 'New slate'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="font-mono text-xs label-kicker text-muted-foreground">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Goa Trip"
              maxLength={60}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="font-mono text-xs label-kicker text-muted-foreground">Color</Label>
            <div className="flex flex-wrap gap-2">
              {ACCOUNT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  className={cn(
                    'size-8 rounded-full transition-transform outline-none',
                    'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[hsl(var(--primary))]',
                    color === c ? 'ring-2 ring-offset-2 ring-[hsl(var(--primary))] scale-110' : 'fine-hover-scale-110',
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          {!slate && (
            <p className="text-xs text-muted-foreground">
              A slate holds spending that isn't your normal life, a trip, a
              wedding, a one-off purchase. Whatever you move into it stops
              counting against your ordinary budgets.
            </p>
          )}
        </div>
        <DialogFooter>
          <EditActions draft={editor} onCancel={onClose} onSave={save} saveLabel={slate ? 'Save' : 'Create'} disabled={!slate && (saving || !name.trim())} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
