import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, MoreVertical, Pencil, Trash2, Check, Archive } from '@/components/ui/icons';

import { finance, type FinPocket, type FinPocketsResponse } from '@/api';
import { qk } from '@/queries/keys';
import { confirmDialog } from '@/lib/confirm';
import { msg } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { ACCOUNT_COLORS, formatMoney } from './utils';
import { cn } from '@/lib/utils';

// Pocket chip bar — the spend-context strip above the finance tabs.
//
// Each chip = one pocket: color dot, name, this month's spend. "General" is
// the implicit pocket (txns with no pocket). Tap a chip to filter the
// transaction list to it; tap again to clear. The ACTIVE pocket (filled chip)
// is where new transactions file by default — set/cleared from the chip menu.
//
// Spend figures flow through formatMoney, so this component must render
// inside FinancePage's privacy-keyed subtree.

interface Props {
  pockets: FinPocketsResponse;
  loaded: boolean;
  /** null = no filter, 0 = General, N = pocket id. */
  filter: number | null;
  onFilter: (id: number | null) => void;
}

export default function PocketBar({ pockets, loaded, filter, onFilter }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<FinPocket | null>(null);
  const [creating, setCreating] = useState(false);

  // Pocket writes ripple into txn rows (names), budgets (filters) and the
  // bar itself, so refresh the whole finance root.
  const refresh = () => qc.invalidateQueries({ queryKey: qk.finance.all });

  const setActive = async (id: number | null) => {
    try {
      await finance.setActivePocket(id);
      refresh();
    } catch (e) { toast.error(msg(e)); }
  };

  const archive = async (p: FinPocket) => {
    try {
      await finance.updatePocket(p.id, { archived: true });
      if (filter === p.id) onFilter(null);
      refresh();
    } catch (e) { toast.error(msg(e)); }
  };

  const remove = async (p: FinPocket) => {
    const n = p.txn_count;
    const move = n === 0 ? '' : n === 1 ? ' Its 1 transaction moves to General.' : ` Its ${n} transactions move to General.`;
    if (!(await confirmDialog(`Delete "${p.name}"?${move} Budgets filtering on it stop counting it.`))) return;
    try {
      await finance.deletePocket(p.id);
      if (filter === p.id) onFilter(null);
      refresh();
    } catch (e) { toast.error(msg(e)); }
  };

  return (
    <section aria-label="Pockets" className="mb-4">
      <div className="flex items-center gap-2 overflow-x-auto overflow-y-hidden no-scrollbar -mx-1 px-1 py-0.5">
        {!loaded ? (
          <>
            <span className="h-11 w-36 shrink-0 rounded-full bg-muted animate-pulse" />
            <span className="h-11 w-28 shrink-0 rounded-full bg-muted animate-pulse" />
          </>
        ) : (
          <>
            <Chip
              label="General"
              spend={pockets.general_spend}
              color="hsl(var(--outline))"
              selected={filter === 0}
              onClick={() => onFilter(filter === 0 ? null : 0)}
            />
            {pockets.items.filter((p) => !p.archived).map((p) => (
              <Chip
                key={p.id}
                label={p.name}
                spend={p.month_spend}
                color={p.color}
                active={p.is_active}
                selected={filter === p.id}
                onClick={() => onFilter(filter === p.id ? null : p.id)}
                menu={
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={`Options for ${p.name}`}
                      className="grid h-full w-8 shrink-0 place-items-center rounded-r-full text-current/70 outline-none transition-colors hover:bg-[hsl(var(--on-surface)/0.08)] hover:text-current focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
                    >
                      <MoreVertical className="size-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {p.is_active ? (
                        <DropdownMenuItem onClick={() => setActive(null)}>
                          <Check /> Clear active
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => setActive(p.id)}>
                          <Check /> Set active
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => setEditing(p)}>
                        <Pencil /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => archive(p)}>
                        <Archive /> Archive
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => remove(p)}>
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                }
              />
            ))}
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-[hsl(var(--outline))] px-4 text-sm font-medium text-muted-foreground outline-none transition-colors hover:border-[hsl(var(--primary))] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] active:bg-[hsl(var(--on-surface)/0.08)]"
            >
              <Plus className="size-4" /> Pocket
            </button>
          </>
        )}
      </div>

      <PocketDialog
        open={creating || editing !== null}
        pocket={editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { setCreating(false); setEditing(null); refresh(); }}
      />
    </section>
  );
}

function Chip({
  label, spend, color, active = false, selected, onClick, menu,
}: {
  label: string;
  spend: number;
  color: string;
  active?: boolean;
  selected: boolean;
  onClick: () => void;
  menu?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'inline-flex h-11 shrink-0 items-stretch overflow-hidden rounded-full border transition-colors',
        active
          ? 'border-transparent bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]'
          : 'border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-low))] text-foreground',
        selected && 'border-[hsl(var(--primary))] ring-1 ring-inset ring-[hsl(var(--primary))]',
      )}
    >
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        title={
          (active ? `${label} — active pocket, new spends file here. ` : '') +
          (selected ? 'Showing only these transactions. Tap to clear.' : `Show ${label} transactions`)
        }
        className={cn(
          'flex items-center gap-2 pl-3.5 text-sm font-medium outline-none transition-colors',
          menu ? 'pr-1' : 'pr-3.5 rounded-full',
          'hover:bg-[hsl(var(--on-surface)/0.06)] active:bg-[hsl(var(--on-surface)/0.1)]',
          'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--primary))]',
        )}
      >
        <span aria-hidden className="relative grid place-items-center">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
          {active && (
            <span className="absolute -right-1 -top-1 size-1.5 rounded-full bg-[hsl(var(--primary))] motion-safe:animate-pulse" />
          )}
        </span>
        <span className="whitespace-nowrap">{label}</span>
        <span className="font-mono text-xs tabular-nums opacity-70 whitespace-nowrap">
          {formatMoney(spend)}
        </span>
      </button>
      {menu}
    </div>
  );
}

function PocketDialog({ open, pocket, onClose, onSaved }: {
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
      <DialogContent className="sm:max-w-sm">
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
                    color === c ? 'ring-2 ring-offset-2 ring-[hsl(var(--primary))] scale-110' : 'hover:scale-110',
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
