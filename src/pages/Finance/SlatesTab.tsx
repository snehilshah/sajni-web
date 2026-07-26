import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Plus, MoreVertical, Pencil, Trash2, Archive, ArchiveRestore, ChevronRight,
} from '@/components/ui/icons';

import { finance, type FinSlate } from '@/api';
import { qk } from '@/queries/keys';
import { confirmDialog } from '@/lib/confirm';
import { msg } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cardClass, CardAccent } from '@/components/ui/card';
import { useFinanceFormatters } from './useFinancePrivacy';
import { CardsSkeleton } from './Skeletons';
import SlateDialog from './SlateDialog';
import { cn } from '@/lib/utils';

// A slate answers one question: is this normal life, or not? Plain is normal
// life and can't be touched; every other slate is an outlier the user named.
//
// Slates are containers, and there are only ever a handful, so they read as
// tiles rather than a list: each one carries a colour identity and one number
// worth knowing. The whole tile opens the ledger filtered to it — that is the
// only "contents" view, so there is no second transaction list to maintain.
//
// Budgets ignore slates they don't name, so moving a transaction in or out of
// one silently rewrites what the baseline budgets count — hence the loud
// delete confirm.

interface Props {
  slates: FinSlate[];
  loaded: boolean;
  onOpenSlate: (id: number) => void;
}

export default function SlatesTab({ slates, loaded, onOpenSlate }: Props) {
  const qc = useQueryClient();
  const { formatMoney } = useFinanceFormatters();
  const [editing, setEditing] = useState<FinSlate | null>(null);
  const [creating, setCreating] = useState(false);
  // Purely a view preference over a list we already hold, so it stays here.
  // Lifting it to FinancePage (or into the query key) made revealing four
  // archived tiles refetch and re-render all eight finance tabs.
  const [showArchived, setShowArchived] = useState(false);

  // Renaming, recolouring or archiving touches nothing but the slate list.
  // Invalidating all of `['finance']` refetched accounts, categories, the
  // ledger and statements for a colour change.
  const refreshSlates = () => qc.invalidateQueries({ queryKey: qk.finance.slates() });
  // Deleting is the exception: its transactions land on Plain, so the ledger
  // and every slate's totals move with it.
  const refreshAfterDelete = () => {
    qc.invalidateQueries({ queryKey: qk.finance.slates() });
    qc.invalidateQueries({ queryKey: ['finance', 'transactions'] });
  };

  const setArchived = async (s: FinSlate, archived: boolean) => {
    try {
      await finance.updateSlate(s.id, { archived });
      // Archiving only hides a slate from the pickers; its transactions stay put
      // and its budgets keep counting them. Say so, because "archive" elsewhere
      // in the app usually means "out of the way and out of the numbers".
      toast.success(archived
        ? `"${s.name}" archived — its transactions stay where they are`
        : `"${s.name}" is back`);
      refreshSlates();
    } catch (e) { toast.error(msg(e)); }
  };

  const remove = async (s: FinSlate) => {
    const n = s.txn_count;
    if (n === 0) {
      if (!(await confirmDialog(`Delete "${s.name}"? It's empty, so nothing moves.`))) return;
    } else {
      const ok = await confirmDialog({
        title: `Delete "${s.name}"?`,
        description:
          `${n === 1 ? 'Its 1 transaction moves' : `All ${n} transactions move`} to Plain — ` +
          'they become part of your normal spending again. Any budget covering ' +
          'those dates will count them from now on, including past months.',
        confirmText: n === 1 ? 'Move 1 and delete' : `Move ${n} and delete`,
        destructive: true,
      });
      if (!ok) return;
    }
    try {
      await finance.deleteSlate(s.id, n > 0);
      refreshAfterDelete();
    } catch (e) { toast.error(msg(e)); }
  };

  if (!loaded) return <CardsSkeleton count={4} />;

  const plain = slates.find((s) => s.is_plain);
  const outliers = slates.filter((s) => !s.is_plain && !s.archived);
  const archived = slates.filter((s) => !s.is_plain && s.archived);

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="slates-plain" className="flex flex-col gap-2">
        <h2 id="slates-plain" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Normal life
        </h2>
        {/* Plain is the baseline everything else is measured against, so it gets
            the width and the month figure rather than a lifetime total. */}
        <SlateTile
          slate={plain}
          headline={plain ? formatMoney(plain.month_spend) : '—'}
          headlineLabel="this month"
          meta={plain
            ? `${plain.txn_count === 1 ? '1 transaction' : `${plain.txn_count} transactions`} · what your budgets count`
            : ''}
          onOpen={() => plain && onOpenSlate(plain.id)}
        />
      </section>

      <section aria-labelledby="slates-outliers" className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 id="slates-outliers" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Outliers
          </h2>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              aria-pressed={showArchived}
              onClick={() => setShowArchived((v) => !v)}
              className={cn(showArchived && 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]')}
            >
              <Archive className="size-4 md:mr-1" /> <span className="hidden md:inline">Archived</span>
            </Button>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-4 mr-1" /> New slate
            </Button>
          </div>
        </div>

        {outliers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <p className="text-sm font-medium">No slates yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              A slate holds spending that isn't your normal life — a trip, a
              wedding, a one-off purchase. Anything in one stops counting
              against your ordinary budgets, so your baseline stays honest.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {outliers.map((s) => (
              <SlateTile
                key={s.id}
                slate={s}
                headline={formatMoney(s.total_spend)}
                headlineLabel="total"
                meta={s.txn_count === 1 ? '1 transaction' : `${s.txn_count} transactions`}
                onOpen={() => onOpenSlate(s.id)}
                onEdit={() => setEditing(s)}
                onArchive={() => setArchived(s, true)}
                onDelete={() => remove(s)}
              />
            ))}
          </div>
        )}
      </section>

      {showArchived && (
        <section aria-labelledby="slates-archived" className="flex flex-col gap-2">
          <h2 id="slates-archived" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Archived
          </h2>
          {archived.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing archived. Archiving keeps a finished trip out of the
              pickers without touching its transactions or its budgets.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {archived.map((s) => (
                <SlateTile
                  key={s.id}
                  slate={s}
                  dimmed
                  headline={formatMoney(s.total_spend)}
                  headlineLabel="total"
                  meta={s.txn_count === 1 ? '1 transaction' : `${s.txn_count} transactions`}
                  onOpen={() => onOpenSlate(s.id)}
                  onEdit={() => setEditing(s)}
                  onUnarchive={() => setArchived(s, false)}
                  onDelete={() => remove(s)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      <SlateDialog
        open={creating || editing !== null}
        slate={editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { setCreating(false); setEditing(null); refreshSlates(); }}
      />
    </div>
  );
}

function SlateTile({
  slate: s, dimmed, headline, headlineLabel, meta,
  onOpen, onEdit, onArchive, onUnarchive, onDelete,
}: {
  slate?: FinSlate;
  dimmed?: boolean;
  headline: string;
  headlineLabel: string;
  meta: string;
  onOpen: () => void;
  onEdit?: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete?: () => void;
}) {
  const hasMenu = !!(onEdit || onArchive || onUnarchive || onDelete);
  // The left accent is the same 3px spine the ledger draws on this slate's rows,
  // so the colour means one thing across both surfaces. Plain has no spine in
  // the ledger and gets a neutral outline here for the same reason.
  const accent = s && !s.is_plain ? s.color : 'hsl(var(--outline-variant))';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, transform: 'translateY(4px)' }}
      animate={{ opacity: 1, transform: 'translateY(0)' }}
      whileTap={{ transform: 'scale(0.99)' }}
      role="button"
      tabIndex={0}
      aria-label={s ? `Open ${s.name} transactions` : undefined}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
      }}
      className={cardClass(
        { interactive: true, accent },
        cn(
          // Wide and short. A container holding one number doesn't need a tall
          // box — the old ~1.7:1 tile was mostly air, and 28px of radius on it
          // read as a lozenge. Two columns keeps the ratio near 3:1.
          'group flex items-center gap-3 py-3 pr-2',
          dimmed && 'opacity-65 hover:opacity-100',
        ),
      )}
    >
      <CardAccent color={accent} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{s?.name ?? 'Plain'}</span>
          <ChevronRight
            aria-hidden
            className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          />
        </div>
        <div className="font-mono text-xs text-muted-foreground truncate">{meta}</div>
      </div>

      <div className={cn('shrink-0 text-right', hasMenu && 'mr-9')}>
        <div className="font-serif text-lg font-semibold tabular-nums leading-tight">{headline}</div>
        <div className="font-mono text-xs text-muted-foreground">{headlineLabel}</div>
      </div>

      {hasMenu && (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Options for ${s?.name ?? 'slate'}`}
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0.5 top-1/2 -translate-y-1/2 grid size-11 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-[hsl(var(--on-surface)/0.08)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
          >
            <MoreVertical className="size-4" />
          </DropdownMenuTrigger>
          {/* Portaled, so item clicks never reach the tile — only the trigger
              needs to stop propagation. */}
          <DropdownMenuContent align="end">
            {onEdit && <DropdownMenuItem onClick={onEdit}><Pencil /> Rename</DropdownMenuItem>}
            {onArchive && <DropdownMenuItem onClick={onArchive}><Archive /> Archive</DropdownMenuItem>}
            {onUnarchive && <DropdownMenuItem onClick={onUnarchive}><ArchiveRestore /> Unarchive</DropdownMenuItem>}
            {onDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={onDelete}><Trash2 /> Delete</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </motion.div>
  );
}
