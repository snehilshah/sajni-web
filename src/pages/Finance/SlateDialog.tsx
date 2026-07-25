import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { finance, type FinSlate } from '@/api';
import { msg } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ACCOUNT_COLORS } from './utils';
import { cn } from '@/lib/utils';

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

  useEffect(() => {
    if (!open) return;
    setName(slate?.name ?? '');
    setColor(slate?.color || ACCOUNT_COLORS[0]);
  }, [open, slate]);

  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      if (slate) {
        await finance.updateSlate(slate.id, { name: name.trim(), color });
        onSaved();
      } else {
        const created = await finance.createSlate({ name: name.trim(), color });
        onSaved(created.id);
      }
    } catch (e) {
      toast.error(msg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{slate ? 'Edit slate' : 'New slate'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Goa Trip"
              maxLength={60}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Color</Label>
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
              A slate holds spending that isn't your normal life — a trip, a
              wedding, a one-off purchase. Whatever you move into it stops
              counting against your ordinary budgets.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : slate ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
