import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Check, X } from '@/components/ui/icons';

import { finance, type FinCategory } from '@/api';
import { confirmDialog } from '@/lib/confirm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SegmentedButton } from '@/components/ui/segmented-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ACCOUNT_COLORS } from './utils';
import { CategoryPill } from './CategoryChips';

/**
 * Shared add / rename / recolor / delete UI for transaction & budget
 * categories. Backed by the existing /finance/categories CRUD. Deleting a
 * category just unlinks it (FK ON DELETE SET NULL) — history stays, those
 * rows become uncategorized.
 */
export default function CategoryManager({
  open, categories, onClose, onChanged,
}: {
  open: boolean;
  categories: FinCategory[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [list, setList] = useState<FinCategory[]>(categories);
  useEffect(() => { setList(categories); }, [categories]);

  const shown = useMemo(() => list.filter((c) => c.kind === kind), [list, kind]);

  // New-category draft.
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(ACCOUNT_COLORS[0]);
  const [busy, setBusy] = useState(false);

  // Inline edit state.
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(ACCOUNT_COLORS[0]);

  const refresh = async () => {
    try { setList(await finance.listCategories()); } catch {}
    onChanged();
  };

  const add = async () => {
    if (!newName.trim() || busy) return;
    setBusy(true);
    try {
      await finance.createCategory({ name: newName.trim(), kind, color: newColor, icon: 'circle' });
      setNewName('');
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || 'Could not add category');
    } finally { setBusy(false); }
  };

  const startEdit = (c: FinCategory) => { setEditId(c.id); setEditName(c.name); setEditColor(c.color); };
  const cancelEdit = () => { setEditId(null); setEditName(''); };

  const saveEdit = async () => {
    if (editId == null || !editName.trim()) return;
    try {
      await finance.updateCategory(editId, { name: editName.trim(), color: editColor });
      cancelEdit();
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || 'Could not save category');
    }
  };

  const remove = async (c: FinCategory) => {
    if (!(await confirmDialog(`Delete "${c.name}"? Past transactions stay but become uncategorized.`))) return;
    try {
      await finance.deleteCategory(c.id);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || 'Could not delete category');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Categories</DialogTitle>
        </DialogHeader>

        <SegmentedButton
          stretch
          value={kind}
          onChange={(k) => { setKind(k); cancelEdit(); }}
          options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]}
        />

        {/* List: plain rows on the dialog surface (no card per row); the
            row padding is pulled into the margin so pills start on the edge. */}
        <div className="-mx-2 flex flex-col">
          {shown.length === 0 ? (
            <div className="text-xs text-muted-foreground italic py-2">No {kind} categories yet.</div>
          ) : shown.map((c) => (
            <div key={c.id} className="flex min-h-12 items-center gap-2 rounded-xl px-2 py-1 hover:bg-[hsl(var(--on-surface)/0.05)]">
              {editId === c.id ? (
                <>
                  <SwatchRow color={editColor} onPick={setEditColor} />
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); } }}
                    className="h-8 flex-1"
                    autoFocus
                  />
                  <Button size="icon-sm" variant="ghost" onClick={saveEdit}><Check className="size-4 text-primary" /></Button>
                  <Button size="icon-sm" variant="ghost" onClick={cancelEdit}><X className="size-4" /></Button>
                </>
              ) : (
                <>
                  <span className="flex min-w-0 flex-1"><CategoryPill name={c.name} color={c.color} className="py-1 text-sm" /></span>
                  <Button size="icon-sm" variant="ghost" onClick={() => startEdit(c)} className="text-muted-foreground">
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button size="icon-sm" variant="destructive-ghost" onClick={() => remove(c)} aria-label="Delete category">
                    <Trash2 className="size-3.5" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Add */}
        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">
            New {kind} category
          </Label>
          <div className="flex items-center gap-2">
            <SwatchRow color={newColor} onPick={setNewColor} />
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
              placeholder="e.g. Pets"
              className="h-9 flex-1"
            />
            <Button size="sm" onClick={add} disabled={!newName.trim() || busy}>
              <Plus className="size-4 mr-1" /> Add
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// A current-color chip that opens the native color picker — gives the preset
// palette a quick pick plus full custom-color freedom in one control.
function SwatchRow({ color, onPick }: { color: string; onPick: (c: string) => void }) {
  return (
    <label
      className="relative size-7 rounded-md shrink-0 cursor-pointer ring-1 ring-border ring-offset-1 ring-offset-background"
      style={{ backgroundColor: color }}
      title="Pick color"
    >
      <input
        type="color"
        value={color}
        onChange={(e) => onPick(e.target.value)}
        className="absolute inset-0 size-full opacity-0 cursor-pointer"
      />
    </label>
  );
}
