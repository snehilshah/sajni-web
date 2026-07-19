import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus, MoreVertical, Pencil, Trash2, Check, Archive,
  Users, Mail, Share2, ChevronRight,
} from '@/components/ui/icons';

import { finance, type FinPocket, type FinPocketsResponse, type SharedPocketSummary, type PocketInviteSummary } from '@/api';
import { qk } from '@/queries/keys';
import { confirmDialog } from '@/lib/confirm';
import { msg } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useFinanceFormatters } from '../useFinancePrivacy';
import { RowsSkeleton } from '../Skeletons';
import PocketDialog from './PocketDialog';

// The Pockets tab: pending shared-pocket invites, your personal pockets
// (spend contexts) and the shared pockets you split expenses in. Every row
// opens the pocket's own page — General included — so the tab is fully
// self-contained; nothing bounces you to the transaction list.

interface Props {
  pockets: FinPocketsResponse;
  loaded: boolean;
}

export default function PocketsTab({ pockets, loaded }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { formatMoney } = useFinanceFormatters();
  const [editing, setEditing] = useState<FinPocket | null>(null);
  const [creating, setCreating] = useState(false);
  // Ignored invites just disappear locally; the server keeps them pending
  // until they expire, so a reload brings them back — no destructive action.
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [accepting, setAccepting] = useState<number | null>(null);

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
      refresh();
    } catch (e) { toast.error(msg(e)); }
  };

  const remove = async (p: FinPocket) => {
    const n = p.txn_count;
    const move = n === 0 ? '' : n === 1 ? ' Its 1 transaction moves to General.' : ` Its ${n} transactions move to General.`;
    if (!(await confirmDialog(`Delete "${p.name}"?${move} Budgets filtering on it stop counting it.`))) return;
    try {
      await finance.deletePocket(p.id);
      refresh();
    } catch (e) { toast.error(msg(e)); }
  };

  const share = async (p: FinPocket) => {
    const ok = await confirmDialog({
      title: `Share "${p.name}"?`,
      description:
        "This can't be undone — it becomes a shared pocket you split with others. " +
        'Its expenses turn into split entries paid and owed by you (no debts created), income entries move to General, ' +
        'and your ledger totals stay exactly the same.',
      confirmText: 'Share',
      destructive: false,
    });
    if (!ok) return;
    try {
      await finance.sharePocket(p.id);
      refresh();
      navigate(`/finance/pockets/${p.id}`);
    } catch (e) { toast.error(msg(e)); }
  };

  const accept = async (inv: PocketInviteSummary) => {
    setAccepting(inv.id);
    try {
      const res = await finance.acceptPocketInvite({ invite_id: inv.id });
      refresh();
      navigate(`/finance/pockets/${res.pocket_id}`);
    } catch (e) {
      toast.error(msg(e));
    } finally {
      setAccepting(null);
    }
  };

  if (!loaded) return <RowsSkeleton rows={4} />;

  const personal = pockets.items.filter((p) => !p.archived);
  const invites = pockets.invites.filter((i) => !dismissed.has(i.id));
  const shared = pockets.shared.filter((s) => !s.archived);

  return (
    <div className="flex flex-col gap-6">
      {/* Pending invites */}
      {invites.length > 0 && (
        <div className="flex flex-col gap-2">
          {invites.map((inv) => (
            <div
              key={inv.id}
              className="flex flex-wrap items-center gap-3 rounded-xl bg-[hsl(var(--secondary-container))] px-4 py-3 text-[hsl(var(--on-secondary-container))]"
            >
              <Mail className="size-5 shrink-0 opacity-80" />
              <div className="flex-1 min-w-[180px]">
                <div className="text-sm font-medium">
                  {inv.inviter_name} invited you to “{inv.pocket_name}”
                </div>
                <div className="text-xs opacity-80">Split expenses together. Nothing is shared until you accept.</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => accept(inv)} disabled={accepting === inv.id}>
                  {accepting === inv.id ? 'Joining…' : 'Accept'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDismissed((prev) => new Set(prev).add(inv.id))}
                >
                  Ignore
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Personal pockets */}
      <section aria-label="Your pockets" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Your pockets</h2>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4 mr-1" /> New pocket
          </Button>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* General — the implicit pocket for unfiled spends. */}
          <button
            type="button"
            onClick={() => navigate('/finance/pockets/general')}
            className="flex w-full items-center gap-3 border-b border-border px-3 md:px-4 py-3 text-left outline-none transition-colors hover:bg-accent/40 active:bg-accent/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--primary))] tap-highlight-none"
          >
            <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-[hsl(var(--outline))]" />
            <div className="flex-1 min-w-0">
              <div className="truncate text-sm font-medium">General</div>
              <div className="font-mono text-xs text-muted-foreground">unpocketed spends</div>
            </div>
            <span className="font-mono text-sm tabular-nums">{formatMoney(pockets.general_spend)}</span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </button>

          {personal.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 border-b border-border last:border-0 px-3 md:px-4 py-2.5 transition-colors hover:bg-accent/40"
            >
              <button
                type="button"
                onClick={() => navigate(`/finance/pockets/${p.id}`)}
                className="flex flex-1 min-w-0 items-center gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--primary))] tap-highlight-none"
              >
                <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate text-sm font-medium">{p.name}</span>
                    {p.is_active && (
                      <span className="shrink-0 rounded-full bg-[hsl(var(--secondary-container))] px-2 py-0.5 font-mono text-xs text-[hsl(var(--on-secondary-container))]">
                        active
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {p.txn_count === 1 ? '1 txn' : `${p.txn_count} txns`} · this month
                  </div>
                </div>
                <span className="font-mono text-sm tabular-nums shrink-0">{formatMoney(p.month_spend)}</span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={`Options for ${p.name}`}
                  className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-[hsl(var(--on-surface)/0.08)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
                >
                  <MoreVertical className="size-4" />
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
                  <DropdownMenuItem onClick={() => share(p)}>
                    <Share2 /> Share…
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
            </div>
          ))}
        </div>

        {personal.length === 0 && (
          <p className="text-sm text-muted-foreground">
            A pocket is a spend context — a trip, a project, a phase. File
            transactions into it, share it to split expenses with others, or
            point a custom budget at it so only its spends count against the cap.
          </p>
        )}
      </section>

      {/* Shared pockets */}
      <section aria-label="Shared pockets" className="flex flex-col gap-3">
        <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Shared</h2>
        {shared.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <Users className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">No shared pockets</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Share a pocket to split its expenses — everyone sees who paid and
              who owes whom, while your accounts stay private.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {shared.map((s) => (
              <SharedRow key={s.id} pocket={s} onOpen={() => navigate(`/finance/pockets/${s.id}`)} />
            ))}
          </div>
        )}
      </section>

      <PocketDialog
        open={creating || editing !== null}
        pocket={editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { setCreating(false); setEditing(null); refresh(); }}
      />
    </div>
  );
}

function SharedRow({ pocket: s, onOpen }: { pocket: SharedPocketSummary; onOpen: () => void }) {
  const { formatMoney } = useFinanceFormatters();
  const balance =
    s.my_balance > 0 ? (
      <span className="font-medium text-primary">you're owed {formatMoney(s.my_balance)}</span>
    ) : s.my_balance < 0 ? (
      <span className="font-medium text-destructive">you owe {formatMoney(-s.my_balance)}</span>
    ) : (
      <span className="text-muted-foreground">settled up</span>
    );
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 border-b border-border last:border-0 px-3 md:px-4 py-3 text-left outline-none transition-colors hover:bg-accent/40 active:bg-accent/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--primary))] tap-highlight-none"
    >
      <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
      <div className="flex-1 min-w-0">
        <div className="truncate text-sm font-medium">{s.name}</div>
        <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
          <Users className="size-3.5" />
          {s.member_count} {s.member_count === 1 ? 'member' : 'members'}
          <span aria-hidden>·</span>
          {s.is_owner ? 'yours' : `by ${s.owner_name}`}
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 text-sm">
        {balance}
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {formatMoney(s.month_spend)} this month
        </span>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
