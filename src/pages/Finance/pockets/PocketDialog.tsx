import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { finance, type FinPocket } from '@/api';
import { msg } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ACCOUNT_COLORS } from '../utils';
import { cn } from '@/lib/utils';

// Create/edit form for a personal pocket (name + color). Shared pockets are
// renamed here too — owner-only, enforced server-side.

export default function PocketDialog({ open, pocket, onClose, onSaved }: {
  open: boolean;
  pocket: FinPocket | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(ACCOUNT_COLORS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(pocket?.name ?? '');
    setColor(pocket?.color || ACCOUNT_COLORS[0]);
  }, [open, pocket]);

  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      if (pocket) await finance.updatePocket(pocket.id, { name: name.trim(), color });
      else await finance.createPocket({ name: name.trim(), color });
      onSaved();
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
          <DialogTitle>{pocket ? 'Edit pocket' : 'New pocket'}</DialogTitle>
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
          {!pocket && (
            <p className="text-xs text-muted-foreground">
              A pocket is a spend context — a trip, a project, a phase. Every
              transaction lives in exactly one; anything unfiled sits in General.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : pocket ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
