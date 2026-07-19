import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import {
  ArrowLeft, Plus, Users, MoreVertical, Pencil, Trash2, Share2,
  ArrowUpRight, ArrowLeftRight, Receipt, Coins, Activity as ActivityIcon,
} from '@/components/ui/icons';

import PageShell, { PageShellTabs } from '@/components/PageShell';
import { financeTabs } from '../FinancePage';
import { Button } from '@/components/ui/button';
import { SegmentedButton } from '@/components/ui/segmented-button';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { RowsSkeleton } from '../Skeletons';
import {
  finance, type FinAccount, type FinCategory, type FinTransaction,
  type PocketDetail, type SharedExpense, type PocketSettlement,
} from '@/api';
import {
  usePocketDetail, usePocketExpenses, usePocketBalances, usePocketSettlements,
  usePocketActivity, useFinAccounts, useFinCategories, useFinPockets, useFinTransactions,
  useFinBudgets,
} from '@/queries/finance';
import { qk } from '@/queries/keys';
import { confirmDialog } from '@/lib/confirm';
import { msg } from '@/lib/errors';
import { FinancePrivacyProvider } from '../FinancePrivacyProvider';
import { useFinanceFormatters } from '../useFinancePrivacy';
import { isPrivacyMode, txnAtToParts, formatTxnTime } from '../utils';
import TransactionDialog from '../TransactionDialog';
import PocketDialog from './PocketDialog';
import SharedExpenseDialog from './SharedExpenseDialog';
import SettleDialog, { type SettlePrefill } from './SettleDialog';
import MembersSheet from './MembersSheet';
import EchoDialog, { type EchoTarget } from './EchoDialog';

// One pocket, self-contained. The page keeps the Finance secondary bar (same
// tabs, Pockets highlighted) so opening a pocket never swaps the navigation;
// everything pocket-specific — back, title, People, options, shared sub-tabs —
// lives at the top of the page content, below both bars. Personal pockets show
// their own ledger slice with direct add (no pocket picking); /general is the
// implicit pocket for unpocketed spends. Shared pockets get Expenses /
// Balances / Activity — the spliit-style split view.

type SharedTab = 'expenses' | 'balances' | 'activity';

// Pseudo-detail for the implicit General pocket (pocket_id 0 = unpocketed).
const GENERAL: PocketDetail = {
  id: 0, name: 'General', color: 'hsl(var(--outline))', kind: 'personal',
  archived: false, is_owner: true, my_member_id: 0,
};

export default function PocketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isGeneral = id === 'general';
  const pid = isGeneral ? 0 : Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const detailQ = usePocketDetail(pid, !isGeneral && Number.isFinite(pid) && pid > 0);
  const pocket = isGeneral ? GENERAL : detailQ.data ?? null;
  const shared = pocket?.kind === 'shared';

  // Which budgets count this pocket (custom budgets with a pocket filter).
  // Derived client-side; surfaces the pockets↔budgets link on the pocket side.
  const budgetsQ = useFinBudgets();
  const inBudgets = (budgetsQ.data ?? []).filter((b) => b.pocket_ids.includes(pid));

  const accountsQ = useFinAccounts();
  const categoriesQ = useFinCategories();
  const accounts = accountsQ.data ?? [];
  const categories = categoriesQ.data ?? [];

  const [tab, setTab] = useState<SharedTab>('expenses');
  const [membersOpen, setMembersOpen] = useState(false);
  const [editingPocket, setEditingPocket] = useState(false);
  // Privacy follows the flag set on the Finance page; static here is fine —
  // figures re-render on navigation and the reveal timer lives with the flag.
  const [privacy] = useState<boolean>(isPrivacyMode());

  const refresh = () => qc.invalidateQueries({ queryKey: qk.finance.all });

  const back = () => navigate('/finance/pockets');

  const removePocket = async () => {
    if (!pocket) return;
    const note = shared
      ? 'Everyone loses access; expenses and balances are gone, but each person keeps their own ledger entries.'
      : 'Its transactions move to General.';
    if (!(await confirmDialog(`Delete "${pocket.name}"? ${note}`))) return;
    try {
      await finance.deletePocket(pocket.id);
      refresh();
      back();
    } catch (e) { toast.error(msg(e)); }
  };

  const sharePocket = async () => {
    if (!pocket) return;
    const ok = await confirmDialog({
      title: `Share "${pocket.name}"?`,
      description:
        "This can't be undone — its expenses turn into split entries paid and owed by you, " +
        'income entries move to General, and your ledger totals stay the same.',
      confirmText: 'Share',
      destructive: false,
    });
    if (!ok) return;
    try {
      await finance.sharePocket(pocket.id);
      refresh();
    } catch (e) { toast.error(msg(e)); }
  };

  // Same secondary bar as FinancePage: opening a pocket keeps the Finance
  // tabs in place (Pockets stays highlighted) instead of swapping them out.
  const financeNav = (
    <PageShellTabs
      bare
      ariaLabel="Finance sections"
      value="pockets"
      options={financeTabs.map((t) => ({ value: t.id, label: t.label, icon: t.icon }))}
      onChange={(t) => navigate(t === 'overview' ? '/finance' : '/finance/' + t, { replace: true })}
    />
  );

  if (detailQ.isError) {
    return (
      <PageShell title="Finance" navigation={financeNav}>
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium">Pocket not found</p>
          <p className="mt-1 text-sm text-muted-foreground">It may have been deleted, or you're not a member.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={back}>
            <ArrowLeft className="size-4 mr-1" /> All pockets
          </Button>
        </div>
      </PageShell>
    );
  }
  if (!pocket) {
    return <PageShell title="Finance" navigation={financeNav}><RowsSkeleton rows={5} /></PageShell>;
  }

  return (
    <FinancePrivacyProvider value={privacy}>
      <PageShell
        title="Finance"
        hideScrollbar
        contentClassName="max-w-3xl w-full mx-auto px-3 md:px-8 py-5 pb-20 flex flex-col gap-4"
        navigation={financeNav}
      >
        {/* Pocket header — in content, below both bars, scrolls naturally. */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={back}
            className="grid size-10 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-[hsl(var(--on-surface)/0.08)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/45"
            aria-label="Back to pockets"
          >
            <ArrowLeft className="size-4" />
          </button>
          <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: pocket.color }} />
          <h2 className="min-w-0 flex-1 truncate font-serif text-lg font-semibold">{pocket.name}</h2>
          <div className="flex items-center gap-2">
            {shared && (
              <Button variant="outline" size="sm" onClick={() => setMembersOpen(true)} className="gap-1.5">
                <Users className="size-4" />
                <span className="hidden sm:inline">People</span>
                {pocket.members && <span className="font-mono text-xs">{pocket.members.filter((m) => !m.left).length}</span>}
              </Button>
            )}
            {!isGeneral && (pocket.is_owner || !shared) && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Pocket options"
                  className="grid size-10 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-[hsl(var(--on-surface)/0.08)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
                >
                  <MoreVertical className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setEditingPocket(true)}>
                    <Pencil /> Edit
                  </DropdownMenuItem>
                  {!shared && (
                    <DropdownMenuItem onClick={sharePocket}>
                      <Share2 /> Share…
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={removePocket}>
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Which custom budgets count this pocket — the budgets↔pockets link. */}
        {inBudgets.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">counted in</span>
            {inBudgets.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => navigate('/finance/budgets')}
                className="rounded-full bg-[hsl(var(--secondary-container))] px-2.5 py-1 text-xs font-medium text-[hsl(var(--on-secondary-container))] outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
              >
                {b.name}
              </button>
            ))}
          </div>
        )}

        {shared && (
          <SegmentedButton
            aria-label="Pocket sections"
            value={tab}
            onChange={setTab}
            stretch
            options={[
              { value: 'expenses', label: 'Expenses', icon: Receipt },
              { value: 'balances', label: 'Balances', icon: Coins },
              { value: 'activity', label: 'Activity', icon: ActivityIcon },
            ]}
          />
        )}

        {shared ? (
          <SharedPocketBody
            pocket={pocket}
            tab={tab}
            accounts={accounts}
            categories={categories}
            refresh={refresh}
          />
        ) : (
          <PersonalPocketBody pocket={pocket} accounts={accounts} categories={categories} refresh={refresh} />
        )}

        <PocketDialog
          open={editingPocket}
          pocket={{
            id: pocket.id, name: pocket.name, color: pocket.color,
            is_active: false, archived: pocket.archived, month_spend: 0, txn_count: 0,
          }}
          onClose={() => setEditingPocket(false)}
          onSaved={() => { setEditingPocket(false); refresh(); }}
        />
        {shared && (
          <MembersSheet
            open={membersOpen}
            pocket={pocket}
            onClose={() => setMembersOpen(false)}
            onChanged={refresh}
            onLeft={() => { refresh(); back(); }}
          />
        )}
      </PageShell>
    </FinancePrivacyProvider>
  );
}

// ---------------------------------------------------------------- personal

function PersonalPocketBody({ pocket, accounts, categories, refresh }: {
  pocket: PocketDetail;
  accounts: FinAccount[];
  categories: FinCategory[];
  refresh: () => void;
}) {
  const { formatMoney } = useFinanceFormatters();
  const txnsQ = useFinTransactions({ limit: 200, pocket_id: pocket.id });
  const txns = txnsQ.data ?? [];
  const pocketsQ = useFinPockets();
  const pockets = pocketsQ.data?.items ?? [];
  const [editing, setEditing] = useState<FinTransaction | null>(null);
  const [creating, setCreating] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, FinTransaction[]>();
    for (const t of txns) {
      if (t.type === 'transfer_in') continue;
      const key = txnAtToParts(t.txn_at).date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries());
  }, [txns]);

  const total = txns.reduce((s, t) => s + (t.type === 'expense' ? t.amount : 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {txns.length === 1 ? '1 transaction' : `${txns.length} transactions`}
          {total > 0 && <> · <span className="font-mono tabular-nums">{formatMoney(total)}</span> spent</>}
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4 mr-1" /> Add
        </Button>
      </div>

      {!txnsQ.isSuccess && txns.length === 0 ? (
        <RowsSkeleton rows={5} />
      ) : txns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium">Nothing in this pocket yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Add a transaction — it files straight in here.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {grouped.map(([date, items]) => (
            <div key={date}>
              <div className="px-3 md:px-4 py-2 border-b border-border bg-muted/30 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                {format(parseISO(date), 'EEE, MMM d')}
              </div>
              {items.map((t) => {
                const isExpense = t.type === 'expense';
                const Icon = t.type === 'transfer_out' ? ArrowLeftRight : ArrowUpRight;
                return (
                  <button
                    key={t.id}
                    onClick={() => setEditing(t)}
                    className="w-full flex items-center gap-3 px-3 md:px-4 py-3 border-b border-border last:border-0 hover:bg-accent/40 active:bg-accent/60 transition-colors text-left tap-highlight-none"
                  >
                    <div
                      className="size-8 rounded-md flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: (t.category_color || (isExpense ? '#A14B4F' : '#2D5A4F')) + '20',
                        color: t.category_color || (isExpense ? '#A14B4F' : '#2D5A4F'),
                      }}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{t.description || t.category_name || 'Transaction'}</div>
                      <div className="font-mono text-xs text-muted-foreground truncate">
                        {t.category_name ? t.category_name + ' · ' : ''}{formatTxnTime(t.txn_at)}
                      </div>
                    </div>
                    <div className={`font-mono text-sm tabular-nums shrink-0 ${isExpense ? 'text-destructive' : 'text-primary'}`}>
                      {isExpense ? '−' : '+'}{formatMoney(t.amount)}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <TransactionDialog
        open={creating || editing !== null}
        txn={editing}
        accounts={accounts}
        categories={categories}
        pockets={pockets}
        activePocketId={pocketsQ.data?.active_pocket_id ?? null}
        defaultPocketId={pocket.id}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { setCreating(false); setEditing(null); refresh(); }}
      />
    </div>
  );
}

// ------------------------------------------------------------------ shared

function SharedPocketBody({ pocket, tab, accounts, categories, refresh }: {
  pocket: PocketDetail;
  tab: SharedTab;
  accounts: FinAccount[];
  categories: FinCategory[];
  refresh: () => void;
}) {
  const pid = pocket.id;
  const members = pocket.members ?? [];
  const myMemberId = pocket.my_member_id;

  const expensesQ = usePocketExpenses(pid);
  const settlementsQ = usePocketSettlements(pid, tab === 'expenses' || tab === 'balances');
  const balancesQ = usePocketBalances(pid, tab === 'balances');
  const activityQ = usePocketActivity(pid, tab === 'activity');

  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<SharedExpense | null>(null);
  const [settlePrefill, setSettlePrefill] = useState<SettlePrefill | null>(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const [echoTarget, setEchoTarget] = useState<EchoTarget | null>(null);

  const onSaved = () => {
    setExpenseOpen(false);
    setEditingExpense(null);
    setSettleOpen(false);
    setSettlePrefill(null);
    setEchoTarget(null);
    refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      {tab === 'expenses' && (
        <ExpensesFeed
          pocketId={pid}
          myMemberId={myMemberId}
          expenses={expensesQ.data ?? []}
          settlements={settlementsQ.data ?? []}
          loaded={expensesQ.isSuccess}
          onAdd={() => setExpenseOpen(true)}
          onSettle={() => { setSettlePrefill(null); setSettleOpen(true); }}
          onEdit={(e) => setEditingExpense(e)}
          onEcho={setEchoTarget}
          refresh={refresh}
        />
      )}
      {tab === 'balances' && (
        <BalancesView
          loaded={balancesQ.isSuccess}
          balances={balancesQ.data ?? { members: [], suggestions: [] }}
          myMemberId={myMemberId}
          onSettleSuggestion={(s) => { setSettlePrefill(s); setSettleOpen(true); }}
        />
      )}
      {tab === 'activity' && (
        <ActivityFeed loaded={activityQ.isSuccess} items={activityQ.data ?? []} />
      )}

      <SharedExpenseDialog
        open={expenseOpen || editingExpense !== null}
        pocketId={pid}
        expense={editingExpense}
        members={members}
        myMemberId={myMemberId}
        accounts={accounts}
        categories={categories}
        onClose={() => { setExpenseOpen(false); setEditingExpense(null); }}
        onSaved={onSaved}
      />
      <SettleDialog
        open={settleOpen}
        pocketId={pid}
        members={members}
        myMemberId={myMemberId}
        accounts={accounts}
        categories={categories}
        prefill={settlePrefill}
        onClose={() => { setSettleOpen(false); setSettlePrefill(null); }}
        onSaved={onSaved}
      />
      <EchoDialog
        target={echoTarget}
        accounts={accounts}
        categories={categories}
        onClose={() => setEchoTarget(null)}
        onSaved={onSaved}
      />
    </div>
  );
}

type FeedItem =
  | { kind: 'expense'; at: string; expense: SharedExpense }
  | { kind: 'settlement'; at: string; settlement: PocketSettlement };

function ExpensesFeed({
  pocketId, myMemberId, expenses, settlements, loaded, onAdd, onSettle, onEdit, onEcho, refresh,
}: {
  pocketId: number;
  myMemberId: number;
  expenses: SharedExpense[];
  settlements: PocketSettlement[];
  loaded: boolean;
  onAdd: () => void;
  onSettle: () => void;
  onEdit: (e: SharedExpense) => void;
  onEcho: (t: EchoTarget) => void;
  refresh: () => void;
}) {
  const grouped = useMemo(() => {
    const items: FeedItem[] = [
      ...expenses.map((e) => ({ kind: 'expense' as const, at: e.spent_at, expense: e })),
      ...settlements.map((s) => ({ kind: 'settlement' as const, at: s.settled_at, settlement: s })),
    ].sort((a, b) => (a.at < b.at ? 1 : -1));
    const map = new Map<string, FeedItem[]>();
    for (const it of items) {
      const key = txnAtToParts(it.at).date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return Array.from(map.entries());
  }, [expenses, settlements]);

  const removeSettlement = async (s: PocketSettlement) => {
    if (!(await confirmDialog(`Delete this settlement (${s.from_name} → ${s.to_name})? Balances recompute.`))) return;
    try {
      await finance.deletePocketSettlement(pocketId, s.id);
      refresh();
    } catch (e) { toast.error(msg(e)); }
  };

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onSettle}>
          <Coins className="size-4 mr-1" /> Settle up
        </Button>
        <Button onClick={onAdd}>
          <Plus className="size-4 mr-1" /> Add expense
        </Button>
      </div>

      {!loaded ? (
        <RowsSkeleton rows={5} />
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <Receipt className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">No expenses yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add the first one — pick who paid and how it splits, and balances take care of themselves.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {grouped.map(([date, items]) => (
            <div key={date}>
              <div className="px-3 md:px-4 py-2 border-b border-border bg-muted/30 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                {format(parseISO(date), 'EEE, MMM d')}
              </div>
              {items.map((it) => it.kind === 'expense' ? (
                <ExpenseRow
                  key={`e${it.expense.id}`}
                  expense={it.expense}
                  myMemberId={myMemberId}
                  onEdit={() => onEdit(it.expense)}
                  onEcho={() => onEcho({
                    title: it.expense.description || 'Shared expense',
                    amount: it.expense.amount,
                    kind: 'expense',
                    attach: (echo) => finance.attachExpenseEcho(pocketId, it.expense.id, echo),
                  })}
                />
              ) : (
                <SettlementRow
                  key={`s${it.settlement.id}`}
                  settlement={it.settlement}
                  myMemberId={myMemberId}
                  onDelete={() => removeSettlement(it.settlement)}
                  onEcho={() => onEcho({
                    title: `Settlement ${it.settlement.from_name} → ${it.settlement.to_name}`,
                    amount: it.settlement.amount,
                    kind: it.settlement.from_member === myMemberId ? 'expense' : 'income',
                    attach: (echo) => finance.attachSettlementEcho(pocketId, it.settlement.id, echo),
                  })}
                />
              ))}
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Anyone in the pocket can add or edit entries. Ledger copies stay private to each person.
      </p>
    </>
  );
}

function ExpenseRow({ expense: e, myMemberId, onEdit, onEcho }: {
  expense: SharedExpense;
  myMemberId: number;
  onEdit: () => void;
  onEcho: () => void;
}) {
  const { formatMoney } = useFinanceFormatters();
  const myShare = e.shares.find((s) => s.member_id === myMemberId)?.amount ?? 0;
  const iPaid = e.paid_by === myMemberId;
  const needsEcho = iPaid && e.my_echo_txn_id === null;
  return (
    <div className="flex items-center gap-3 border-b border-border last:border-0 px-3 md:px-4 py-3 hover:bg-accent/40 transition-colors">
      <button onClick={onEdit} className="flex flex-1 min-w-0 items-center gap-3 text-left tap-highlight-none outline-none">
        <div className="size-8 rounded-md bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))] flex items-center justify-center shrink-0">
          <Receipt className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{e.description || 'Expense'}</div>
          <div className="font-mono text-xs text-muted-foreground truncate">
            paid by {iPaid ? 'you' : e.paid_by_name} · split {e.shares.length} {e.shares.length === 1 ? 'way' : 'ways'}
            {myShare > 0 && <> · your share {formatMoney(myShare)}</>}
          </div>
        </div>
        <div className="font-mono text-sm tabular-nums shrink-0">{formatMoney(e.amount)}</div>
      </button>
      {needsEcho && (
        <Button size="sm" variant="tonal" className="shrink-0" onClick={onEcho}>
          Add to my ledger
        </Button>
      )}
    </div>
  );
}

function SettlementRow({ settlement: s, myMemberId, onDelete, onEcho }: {
  settlement: PocketSettlement;
  myMemberId: number;
  onDelete: () => void;
  onEcho: () => void;
}) {
  const { formatMoney } = useFinanceFormatters();
  const iAmParty = s.from_member === myMemberId || s.to_member === myMemberId;
  const needsEcho = iAmParty && s.my_echo_txn_id === null;
  return (
    <div className="flex items-center gap-3 border-b border-border last:border-0 px-3 md:px-4 py-3">
      <div className="size-8 rounded-md bg-[hsl(var(--tertiary-container))] text-[hsl(var(--on-tertiary-container))] flex items-center justify-center shrink-0">
        <Coins className="size-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {s.from_member === myMemberId ? 'You' : s.from_name} paid {s.to_member === myMemberId ? 'you' : s.to_name}
        </div>
        <div className="font-mono text-xs text-muted-foreground">settlement</div>
      </div>
      <div className="font-mono text-sm tabular-nums shrink-0">{formatMoney(s.amount)}</div>
      {needsEcho && (
        <Button size="sm" variant="tonal" className="shrink-0" onClick={onEcho}>
          Add to my ledger
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Settlement options"
          className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-[hsl(var(--on-surface)/0.08)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
        >
          <MoreVertical className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function BalancesView({ loaded, balances, myMemberId, onSettleSuggestion }: {
  loaded: boolean;
  balances: { members: { member_id: number; display_name: string; is_me: boolean; left: boolean; paid: number; share: number; net: number }[]; suggestions: { from_member: number; to_member: number; amount: number }[] };
  myMemberId: number;
  onSettleSuggestion: (s: SettlePrefill) => void;
}) {
  const { formatMoney } = useFinanceFormatters();
  if (!loaded) return <RowsSkeleton rows={4} />;
  const nameOf = (id: number) => balances.members.find((m) => m.member_id === id)?.display_name ?? '—';
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {balances.members.map((m) => (
          <div key={m.member_id} className="flex items-center gap-3 border-b border-border last:border-0 px-3 md:px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {m.display_name}
                {m.is_me && <span className="text-muted-foreground"> (you)</span>}
                {m.left && <span className="text-muted-foreground"> · left</span>}
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                paid {formatMoney(m.paid)} · share {formatMoney(m.share)}
              </div>
            </div>
            <div className={`font-mono text-sm tabular-nums shrink-0 ${m.net > 0 ? 'text-primary' : m.net < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
              {m.net > 0 ? `gets ${formatMoney(m.net)}` : m.net < 0 ? `owes ${formatMoney(-m.net)}` : 'settled'}
            </div>
          </div>
        ))}
        {balances.members.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">No balances yet — add an expense first.</div>
        )}
      </div>

      {balances.suggestions.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Suggested settle-ups</h3>
          {balances.suggestions.map((s, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl bg-[hsl(var(--surface-container-low))] px-4 py-2.5">
              <span className="flex-1 min-w-0 truncate text-sm">
                {s.from_member === myMemberId ? 'You' : nameOf(s.from_member)} → {s.to_member === myMemberId ? 'you' : nameOf(s.to_member)}
              </span>
              <span className="font-mono text-sm tabular-nums">{formatMoney(s.amount)}</span>
              <Button size="sm" variant="tonal" onClick={() => onSettleSuggestion(s)}>Settle</Button>
            </div>
          ))}
        </div>
      )}
      {balances.suggestions.length === 0 && balances.members.length > 0 && (
        <p className="text-sm text-muted-foreground">Everyone's settled up. 🎉</p>
      )}
    </div>
  );
}

function ActivityFeed({ loaded, items }: { loaded: boolean; items: { id: number; actor_name: string; kind: string; detail: Record<string, unknown>; created_at: string }[] }) {
  const { formatMoney } = useFinanceFormatters();
  if (!loaded) return <RowsSkeleton rows={5} />;
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center">
        <ActivityIcon className="mx-auto size-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">No activity yet</p>
        <p className="mt-1 text-sm text-muted-foreground">Expenses, settlements and member changes show up here.</p>
      </div>
    );
  }
  const line = (it: { actor_name: string; kind: string; detail: Record<string, unknown> }) => {
    const d = it.detail;
    const amount = typeof d.amount === 'number' ? formatMoney(d.amount) : '';
    const desc = typeof d.description === 'string' && d.description ? `“${d.description}”` : '';
    switch (it.kind) {
      case 'expense_added': return `added ${desc || 'an expense'}${amount ? ` — ${amount}` : ''}`;
      case 'expense_updated': return `updated ${desc || 'an expense'}${amount ? ` — ${amount}` : ''}`;
      case 'expense_deleted': return `deleted ${desc || 'an expense'}${amount ? ` — ${amount}` : ''}`;
      case 'settlement_added': return `recorded a settlement${amount ? ` of ${amount}` : ''} (${d.from ?? '?'} → ${d.to ?? '?'})`;
      case 'settlement_deleted': return `deleted a settlement${amount ? ` of ${amount}` : ''}`;
      case 'member_added': return `added ${d.name ?? 'someone'}`;
      case 'member_joined': return 'joined the pocket';
      case 'member_left': return 'left the pocket';
      case 'member_removed': return `removed ${d.name ?? 'someone'}`;
      case 'pocket_shared': return 'shared this pocket';
      case 'pocket_renamed': return 'renamed the pocket';
      default: return it.kind.replace(/_/g, ' ');
    }
  };
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {items.map((it) => (
        <div key={it.id} className="flex items-start gap-3 border-b border-border last:border-0 px-3 md:px-4 py-3">
          <div className="flex-1 min-w-0 text-sm">
            <span className="font-medium">{it.actor_name || 'Someone'}</span>{' '}
            <span className="text-foreground/80">{line(it)}</span>
          </div>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {format(parseISO(it.created_at), 'MMM d, HH:mm')}
          </span>
        </div>
      ))}
    </div>
  );
}
