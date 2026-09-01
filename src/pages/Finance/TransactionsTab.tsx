import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO, startOfWeek, endOfWeek, endOfMonth } from 'date-fns';
import { toast } from 'sonner';
import {
  Plus, Search, ArrowUpRight, ArrowDownLeft, ArrowLeftRight, X, Tags, Hash, Check, Wallet, Coins,
} from '@/components/ui/icons';

import { finance, type FinAccount, type FinCategory, type FinSlate, type FinTransaction, type TxnKind } from '@/api';
import { msg } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cardClass, CardAccent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useFinanceFormatters } from './useFinancePrivacy';
import { txnAtToParts, formatTxnTime } from './utils';
import { RowsSkeleton } from './Skeletons';
import CategoryManager from './CategoryManager';
import TransactionDialog from './TransactionDialog';
import SlateDialog from './SlateDialog';

// The ledger is one surface, and its job beyond "what did I spend" is to show
// which spending was NOT normal life. So: rows on a slate other than Plain
// carry a coloured spine and a name chip; Plain rows carry nothing, because
// normal is the silent case. Selecting rows and sweeping them onto a slate is
// the model's main verb — outliers are recognised after the money is gone —
// so the leading avatar doubles as the selection control (M3 list pattern).

// Mirror the server-side tag parser (links.go tagRe): #tag, first char a
// letter/number/_, then letters/numbers/_-/; trailing -/_ trimmed; lowered.
const HASHTAG_RE = /(?:^|[^\w&])#([\p{L}\p{N}_][\p{L}\p{N}_\-/]*)/gu;

function extractHashtags(s: string): string[] {
  if (!s) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of s.matchAll(HASHTAG_RE)) {
    const tag = m[1].toLowerCase().replace(/^[-/_]+|[-/_]+$/g, '');
    if (tag && !seen.has(tag)) { seen.add(tag); out.push(tag); }
  }
  return out;
}

interface Tally { spent: number; earned: number; lent: number; returned: number }
interface Bucket extends Tally { key: string }
interface DayBucket extends Bucket {
  items: FinTransaction[];
  /** Attached to the latest day of a week/month, and only once that period
   *  has closed — a part-week total invites comparison against whole ones. */
  week?: Tally;
  month?: Tally;
}
interface WeekBucket extends Bucket { days: DayBucket[] }
interface MonthBucket extends Bucket { weeks: WeekBucket[] }

// Days, newest first. Week and month totals ride on the latest day of their
// period rather than living in their own header bands — the periods nest, but
// the reader only ever needs one line of totals per day.
function buildLedger(txns: FinTransaction[], today: string): DayBucket[] {
  const months = new Map<string, MonthBucket>();

  for (const t of txns) {
    // A transfer's two legs cancel out; counting both would double every
    // total. The out-leg carries the pair.
    if (t.type === 'transfer_in') continue;
    const day = txnAtToParts(t.txn_at).date; // IST calendar day
    const monday = format(startOfWeek(parseISO(day), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const monthKey = day.slice(0, 7);

    let m = months.get(monthKey);
    if (!m) { m = { key: monthKey, spent: 0, earned: 0, lent: 0, returned: 0, weeks: [] }; months.set(monthKey, m); }
    let w = m.weeks.find((x) => x.key === monday);
    if (!w) { w = { key: monday, spent: 0, earned: 0, lent: 0, returned: 0, days: [] }; m.weeks.push(w); }
    let d = w.days.find((x) => x.key === day);
    if (!d) { d = { key: day, spent: 0, earned: 0, lent: 0, returned: 0, items: [] }; w.days.push(d); }

    d.items.push(t);
    for (const b of [m, w, d] as Tally[]) {
      if (t.type === 'expense') b.spent += t.amount;
      if (t.type === 'income') b.earned += t.amount;
      if (t.type === 'lend') b.lent += t.amount;
      if (t.type === 'lend_repayment') b.returned += t.amount;
    }
  }

  const out: DayBucket[] = [];
  for (const m of months.values()) {
    // The source list is newest-first, so only weeks straddling a month
    // boundary land out of order.
    m.weeks.sort((a, b) => b.key.localeCompare(a.key));
    const monthOver = format(endOfMonth(parseISO(m.key + '-01')), 'yyyy-MM-dd') < today;
    let firstOfMonth = true;
    for (const w of m.weeks) {
      const weekOver = format(endOfWeek(parseISO(w.key), { weekStartsOn: 1 }), 'yyyy-MM-dd') < today;
      let firstOfWeek = true;
      for (const d of w.days) {
        if (firstOfWeek && weekOver) d.week = { spent: w.spent, earned: w.earned, lent: w.lent, returned: w.returned };
        if (firstOfMonth && monthOver) d.month = { spent: m.spent, earned: m.earned, lent: m.lent, returned: m.returned };
        firstOfWeek = false;
        firstOfMonth = false;
        out.push(d);
      }
    }
  }
  return out;
}

// One column template, shared by the week/day headers and every row. This has
// to be fixed widths, not `auto`/`fr`: with `auto` each row sizes its own
// amount column to its own digits, so the columns land somewhere different on
// every line and nothing reads as a table. LEAD matches the width of the
// select control, which headers reserve as empty space so their labels start
// exactly where descriptions do.
const GRID =
  'grid grid-cols-[minmax(0,1fr)_6.5rem] md:grid-cols-[minmax(0,1fr)_19rem_7.5rem] items-center gap-x-3';
const LEAD = 'pl-[3.25rem] md:pl-[3.75rem]';
const TRAIL = 'pr-3 md:pr-4';

interface Props {
  accounts: FinAccount[];
  categories: FinCategory[];
  slates: FinSlate[];
  transactions: FinTransaction[];
  loaded: boolean;
  /** Server-side slate filter: null off, N that slate. Plain is a real row. */
  slateFilter: number | null;
  onSlateFilter: (id: number | null) => void;
  reload: () => void;
  reloadCategories: () => void;
  /** The server capped the result, so the oldest day is partial. */
  truncated: boolean;
  canLoadEarlier: boolean;
  onLoadEarlier: () => void;
  newLendRequest: number;
}

export default function TransactionsTab({
  accounts, categories, slates, transactions, loaded,
  slateFilter, onSlateFilter, reload, reloadCategories,
  truncated, canLoadEarlier, onLoadEarlier,
  newLendRequest,
}: Props) {
  const { formatMoney } = useFinanceFormatters();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<FinTransaction | null>(null);
  const [creating, setCreating] = useState(false);
  const [createKind, setCreateKind] = useState<TxnKind>('expense');
  const [manageCats, setManageCats] = useState(false);
  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [newSlate, setNewSlate] = useState(false);
  const [sweeping, setSweeping] = useState(false);

  useEffect(() => {
    if (newLendRequest <= 0) return;
    setCreateKind('lend');
    setCreating(true);
  }, [newLendRequest]);

  // Optimistic edits (esp. account switches). Keyed by txn id, layered over the
  // parent's list so a row updates the instant you save — no wait for reload,
  // no flash of a raw account id. We hold an override until the server's reload
  // reflects the same account_id, so a slow/stale reload can't revert a newer
  // change and rapid switches always settle on the latest pick.
  const [overrides, setOverrides] = useState<Record<number, Partial<FinTransaction>>>({});
  useEffect(() => {
    // Reconcile against the freshly-reloaded list: drop an override once the
    // server reflects the same account_id. Conditional + no-op when unchanged,
    // so this can't cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOverrides((prev) => {
      const ids = Object.keys(prev);
      if (!ids.length) return prev;
      let changed = false;
      const next = { ...prev };
      for (const t of transactions) {
        const ov = next[t.id];
        if (ov && ov.account_id === t.account_id) { delete next[t.id]; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [transactions]);

  const accountNameById = (id: number | null) => accounts.find((a) => a.id === id)?.name || '';
  const slateById = (id: number) => slates.find((s) => s.id === id);

  const merged = useMemo(
    () => transactions.map((t) => (overrides[t.id] ? { ...t, ...overrides[t.id] } : t)),
    [transactions, overrides],
  );

  // Filter client-side off the parent's cached list so changes are instant.
  // (Backend filtering kicks in only when reload() is called after a mutation.)
  const filtered = useMemo(() => {
    return merged.filter((t) => {
      if (search && !t.description.toLowerCase().includes(search.toLowerCase()) &&
          !(t.category_name || '').toLowerCase().includes(search.toLowerCase())) return false;
      if (accountFilter && String(t.account_id) !== accountFilter) return false;
      if (typeFilter) {
        if (typeFilter === 'transfer_out' && t.type !== 'transfer_out') return false;
        if (typeFilter !== 'transfer_out' && t.type !== typeFilter) return false;
      }
      return true;
    });
  }, [merged, search, accountFilter, typeFilter]);

  // Month > week > day, each level carrying its own net. One day tells you
  // nothing on its own — a ₹4,000 Saturday is normal or alarming depending on
  // the week it sits in — so all three totals stay on screen above every row.
  // `truncated` means the server capped the result, so the oldest day present
  // is mid-day and its totals would be wrong. Drop it rather than show a
  // figure that looks authoritative and isn't.
  const days = useMemo(() => {
    const all = buildLedger(filtered, format(new Date(), 'yyyy-MM-dd'));
    return truncated ? all.slice(0, -1) : all;
  }, [filtered, truncated]);

  // Selection is WYSIWYG: anything the filters hide is dropped, so the count in
  // the action bar always matches what the user can see and check.
  const visibleIds = useMemo(
    () => new Set(days.flatMap((d) => d.items.filter((t) => t.type !== 'lend' && t.type !== 'lend_repayment').map((t) => t.id))),
    [days],
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected((prev) => {
      if (!prev.size) return prev;
      const next = new Set([...prev].filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleIds]);

  const selecting = selected.size > 0;
  const toggle = (id: number) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const selectedTotal = useMemo(
    () => filtered
      .filter((t) => selected.has(t.id))
      .reduce((s, t) => s + (t.type === 'expense' ? t.amount : 0), 0),
    [filtered, selected],
  );

  const sweep = async (slateId: number, label: string) => {
    if (sweeping || !selected.size) return;
    setSweeping(true);
    const ids = [...selected];
    try {
      const res = await finance.moveTransactionsToSlate(ids, slateId);
      setSelected(new Set());
      // Optimistic so the spines redraw before the refetch lands.
      setOverrides((prev) => {
        const next = { ...prev };
        for (const id of ids) next[id] = { ...next[id], slate_id: res.slate_id, slate_name: res.slate_name };
        return next;
      });
      toast.success(`${res.moved === 1 ? '1 transaction' : `${res.moved} transactions`} moved to ${label}`);
      reload();
    } catch (e) {
      toast.error(msg(e));
    } finally {
      setSweeping(false);
    }
  };

  const linkedAccountName = (id: number | null) => accounts.find((a) => a.id === id)?.name || '';
  const plain = slates.find((s) => s.is_plain);
  const viewing = slateFilter === null ? null : slateById(slateFilter);
  // Archived slates stay out of the picker, except the one currently being
  // viewed — the Slates tab can open an archived slate, and a filter that is
  // active but absent from its own dropdown reads as broken.
  const activeSlates = slates.filter((s) => !s.archived || s.id === slateFilter);

  return (
    <div className="flex flex-col gap-4">
      {/* Filters. Search + write actions on the first line; lenses on the
          second, horizontally scrollable so nothing clips on a phone. */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search description" value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-1 top-1/2 -translate-y-1/2 grid size-8 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-[hsl(var(--on-surface)/0.08)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <Button variant="outline" onClick={() => setManageCats(true)} title="Add / edit categories">
            <Tags className="size-4 md:mr-1" /> <span className="hidden md:inline">Categories</span>
          </Button>
          <Button onClick={() => { setCreateKind('expense'); setCreating(true); }}>
            <Plus className="size-4 md:mr-1" /> <span className="hidden md:inline">Add</span>
          </Button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-0.5 -mb-0.5">
          <Select value={accountFilter || 'all'} onValueChange={(v) => setAccountFilter(!v || v === 'all' ? '' : v)}
            items={[{ value: 'all', label: 'All accounts' }, ...accounts.map((a) => ({ value: String(a.id), label: a.name }))]}>
            <SelectTrigger size="sm" className="w-[150px] shrink-0">
              <SelectValue placeholder="All accounts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter || 'all'} onValueChange={(v) => setTypeFilter(!v || v === 'all' ? '' : v)}
            items={[{ value: 'all', label: 'All types' }, { value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }, { value: 'transfer_out', label: 'Transfer' }, { value: 'lend', label: 'Lend' }, { value: 'lend_repayment', label: 'Lend repayment' }]}>
            <SelectTrigger size="sm" className="w-[130px] shrink-0">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="transfer_out">Transfer</SelectItem>
              <SelectItem value="lend">Lend</SelectItem>
              <SelectItem value="lend_repayment">Lend repayment</SelectItem>
            </SelectContent>
          </Select>
          {/* Server-side slate filter (params-keyed query in FinancePage). */}
          <Select
            value={slateFilter === null ? 'all' : String(slateFilter)}
            onValueChange={(v) => onSlateFilter(!v || v === 'all' ? null : parseInt(v))}
            items={[
              { value: 'all', label: 'All slates' },
              ...activeSlates.map((s) => ({ value: String(s.id), label: s.name })),
            ]}
          >
            <SelectTrigger size="sm" className="w-[150px] shrink-0">
              <SelectValue placeholder="All slates" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All slates</SelectItem>
              {activeSlates.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Filtering to a slate is how you ask "what did the trip cost" — so
          answer it, instead of leaving a bare filtered list. */}
      {viewing && (
        <div className={cardClass({ variant: 'filled', accent: viewing.color }, 'flex items-center gap-3 pr-4 py-3')}>
          <CardAccent color={viewing.color} />
          <div className="flex-1 min-w-0">
            <div className="truncate text-sm font-medium">{viewing.name}</div>
            <div className="font-mono text-xs text-muted-foreground">
              {viewing.is_plain
                ? 'normal life · what your budgets count by default'
                : "kept out of your ordinary budgets"}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-serif text-lg font-semibold tabular-nums">{formatMoney(viewing.total_spend)}</div>
            <div className="font-mono text-xs text-muted-foreground">
              {viewing.txn_count === 1 ? '1 txn' : `${viewing.txn_count} txns`} · lifetime
            </div>
          </div>
        </div>
      )}

      {/* Ledger */}
      {!loaded && transactions.length === 0 ? (
        <RowsSkeleton rows={6} />
      ) : days.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {transactions.length === 0
            ? 'No transactions yet. Tap Add to record your first.'
            : 'No matches for the current filters.'}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <AnimatePresence initial={false}>
            {days.map((d) => (
              <motion.section
                key={d.key}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col gap-1.5"
              >
                {/* Totals live outside the table, on one line. Week and month
                    only appear on the day that closes them, so a closed period
                    reports once instead of banding every group. */}
                <div className={cn(TRAIL, 'flex flex-wrap items-baseline justify-end gap-x-3 gap-y-1 pl-1')}>
                  <Totals label="Day" t={d} />
                  {d.week && <><Rule /><Totals label="Week" t={d.week} /></>}
                  {d.month && <><Rule /><Totals label="Month" t={d.month} /></>}
                </div>

                <div className="overflow-hidden rounded-xl border border-border bg-card">
                  {/* Scrolls away with its rows. It was sticky once; pinning it
                      inside the card meant the card had to drop
                      `overflow-hidden`, and the offset then had to be kept in
                      sync with the floating chrome island by hand. Not worth it
                      for a date the group is already sorted by. */}
                  <div className={cn(
                    GRID, LEAD, TRAIL,
                    'border-b border-border bg-[hsl(var(--surface-container))] py-2',
                  )}>
                    <span className="text-xs font-semibold md:col-span-2">
                      {format(parseISO(d.key), 'EEE, d MMM yyyy')}
                    </span>
                    <span className="text-right font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      {d.items.length === 1 ? '1 entry' : `${d.items.length} entries`}
                    </span>
                  </div>
                  {d.items.map((t) => (
                    <LedgerRow
                      key={t.id}
                      txn={t}
                      slate={slateById(t.slate_id)}
                      selecting={selecting}
                      checked={selected.has(t.id)}
                      onToggle={() => (t.type === 'lend' || t.type === 'lend_repayment') ? navigate('/finance/lends') : toggle(t.id)}
                      onOpen={() => (t.type === 'lend' || t.type === 'lend_repayment') ? navigate('/finance/lends') : setEditing(t)}
                      accountName={accountNameById(t.account_id) || t.account_name}
                      linkedName={linkedAccountName(t.linked_account)}
                      formatMoney={formatMoney}
                      onTag={(tag) => navigate(`/tags/${encodeURIComponent(tag)}`)}
                    />
                  ))}
                </div>
              </motion.section>
            ))}
          </AnimatePresence>

          {canLoadEarlier && (
            <Button variant="outline" onClick={onLoadEarlier} className="self-center">
              Load earlier months
            </Button>
          )}
        </div>
      )}

      {/* Contextual action bar — the sweep. Sticky so a long selection run
          never leaves the action offscreen. */}
      <AnimatePresence>
        {selecting && (
          <motion.div
            initial={{ opacity: 0, transform: 'translateY(12px)' }}
            animate={{ opacity: 1, transform: 'translateY(0)' }}
            exit={{ opacity: 0, transform: 'translateY(12px)' }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="sticky bottom-3 z-20 flex items-center gap-2 rounded-full border border-border bg-[hsl(var(--surface-container-high))] px-2 py-2 m3-elev-3"
          >
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              aria-label="Clear selection"
              className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-[hsl(var(--on-surface)/0.08)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
            >
              <X className="size-4" />
            </button>
            <div className="flex-1 min-w-0 leading-tight">
              <div className="text-sm font-medium">{selected.size} selected</div>
              {selectedTotal > 0 && (
                <div className="font-mono text-xs text-muted-foreground tabular-nums">{formatMoney(selectedTotal)} spent</div>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={sweeping}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[hsl(var(--primary))] px-4 text-sm font-medium text-[hsl(var(--primary-foreground))] outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[hsl(var(--primary))] disabled:opacity-50 tap-highlight-none"
              >
                <Wallet className="size-4" /> {sweeping ? 'Moving…' : 'Move to slate'}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top">
                <DropdownMenuLabel>Move out of the budget baseline</DropdownMenuLabel>
                {/* Never a sweep target: archiving a slate means it is finished. */}
                {slates.filter((s) => !s.archived && !s.is_plain).map((s) => (
                  <DropdownMenuItem key={s.id} onClick={() => sweep(s.id, s.name)}>
                    <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.name}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onClick={() => setNewSlate(true)}>
                  <Plus /> New slate…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => sweep(0, plain?.name ?? 'Plain')}>
                  <Check /> Back to normal life
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </motion.div>
        )}
      </AnimatePresence>

      <TransactionDialog
        open={creating || editing !== null}
        txn={editing}
        accounts={accounts}
        categories={categories}
        slates={slates}
        initialType={createKind}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={(patch) => {
          setCreating(false);
          setEditing(null);
          // Optimistic: show the edit immediately, reconcile on reload.
          if (patch) setOverrides((prev) => ({ ...prev, [patch.id]: { ...prev[patch.id], ...patch } }));
          reload();
        }}
      />
      {/* Create-then-sweep in one motion: back from a trip, select the rows,
          name the slate, done. */}
      <SlateDialog
        open={newSlate}
        slate={null}
        onClose={() => setNewSlate(false)}
        onSaved={(id) => {
          setNewSlate(false);
          reload();
          if (id) sweep(id, 'the new slate');
        }}
      />
      <CategoryManager
        open={manageCats}
        categories={categories}
        onClose={() => setManageCats(false)}
        onChanged={reloadCategories}
      />
    </div>
  );
}

function LedgerRow({
  txn: t, slate, selecting, checked, onToggle, onOpen,
  accountName, linkedName, formatMoney, onTag,
}: {
  txn: FinTransaction;
  slate?: FinSlate;
  selecting: boolean;
  checked: boolean;
  onToggle: () => void;
  onOpen: () => void;
  accountName: string;
  linkedName: string;
  formatMoney: (n: number) => string;
  onTag: (tag: string) => void;
}) {
  const isTransfer = t.type === 'transfer_out';
  const isExpense = t.type === 'expense';
  const isLend = t.type === 'lend';
  const isLendRepayment = t.type === 'lend_repayment';
  const Icon = isLend || isLendRepayment ? Coins : isTransfer ? ArrowLeftRight : isExpense ? ArrowUpRight : ArrowDownLeft;
  const tint = t.category_color || (isLend || isLendRepayment || isTransfer ? '#6B7280' : isExpense ? '#A14B4F' : '#2D5A4F');
  // Plain is silent: only an outlier earns a spine and a chip. `slate` can be
  // missing while the slates query is still in flight — treat that as silent
  // rather than guessing, so nothing flickers a wrong colour.
  const outlier = !!slate && !slate.is_plain;
  const tags = extractHashtags(t.note);

  return (
    <div
      className={`group relative flex items-stretch border-b border-border last:border-0 transition-colors ${
        checked ? 'bg-[hsl(var(--secondary-container)/0.5)]' : 'hover:bg-accent/40'
      }`}
    >
      {outlier && (
        <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: slate.color }} />
      )}
      {/* Fixed to LEAD's width so descriptions line up with the header labels. */}
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={checked}
        aria-label={checked ? `Deselect ${t.description || 'transaction'}` : `Select ${t.description || 'transaction'}`}
        className="relative grid w-[3.25rem] md:w-[3.75rem] shrink-0 place-items-center self-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] tap-highlight-none"
      >
        {checked ? (
          <span className="grid size-8 place-items-center rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
            <Check className="size-4" />
          </span>
        ) : (
          <>
            {/* Cross-fade the category glyph into an empty checkbox on hover:
                the affordance is discoverable on a pointer, and on touch the
                44px target simply selects. */}
            <span
              className="grid size-8 place-items-center rounded-md transition-opacity group-hover:opacity-0"
              style={{ backgroundColor: tint + '20', color: tint }}
            >
              <Icon className="size-4" />
            </span>
            <span className="absolute grid size-8 place-items-center rounded-md border border-[hsl(var(--outline))] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
              <Check className="size-4" />
            </span>
          </>
        )}
      </button>
      {/* Table-shaped, not a table: one grid, columns that line up down the
          page, no rules and no header row. Phones get two rows (what / where);
          from md the same cells spread into aligned columns, which is what
          kills the dead space in the middle of a wide row. Rendered once —
          the breakpoints move the cells, they don't duplicate them. */}
      <button
        type="button"
        onClick={selecting ? onToggle : onOpen}
        className={cn(GRID, TRAIL, 'flex-1 min-w-0 gap-y-0.5 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--primary))] active:bg-accent/60 tap-highlight-none')}
      >
        <div className="min-w-0 md:col-start-1">
          <div className="text-sm font-medium truncate">
            {t.description || (isLend ? 'Lend' : isLendRepayment ? 'Lend repayment' : isTransfer ? 'Transfer' : t.category_name || (isExpense ? 'Expense' : 'Income'))}
          </div>
          {(outlier || tags.length > 0) && (
            <div className="flex flex-wrap gap-1 mt-1">
              {outlier && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-xs"
                  style={{ backgroundColor: slate.color + '24', color: 'hsl(var(--foreground))' }}
                >
                  <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: slate.color }} />
                  {slate.name}
                </span>
              )}
              {tags.map((tag) => (
                <span
                  key={tag}
                  role="link"
                  onClick={(e) => { e.stopPropagation(); onTag(tag); }}
                  className="inline-flex items-center gap-0.5 rounded-full bg-secondary/40 hover:bg-secondary/70 px-1.5 py-0.5 font-mono text-xs text-foreground/80 transition-colors"
                >
                  <Hash className="size-2.5 opacity-70" strokeWidth={2.5} />{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Time · category · account. One line on a phone; three aligned
            sub-columns from md, so the eye can scan straight down each. */}
        <div className="col-start-1 row-start-2 flex min-w-0 items-center gap-1.5 font-mono text-xs text-muted-foreground md:col-start-2 md:row-start-1 md:grid md:grid-cols-[3.25rem_minmax(0,1fr)_minmax(0,1fr)] md:gap-x-3 md:gap-1.5 md:border-l md:border-border/60 md:pl-3">
          <span className="shrink-0 tabular-nums">{formatTxnTime(t.txn_at)}</span>
          <span aria-hidden className="md:hidden">·</span>
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            {t.category_color && (
              <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: t.category_color }} />
            )}
            <span className="truncate">
              {isLend ? 'Lend' : isLendRepayment ? 'Lend repayment' : isTransfer ? 'Transfer' : t.category_name || 'Uncategorized'}
            </span>
          </span>
          <span aria-hidden className="md:hidden">·</span>
          <span className="truncate">
            {accountName}
            {isTransfer && t.linked_account && ' → ' + linkedName}
          </span>
        </div>

        <div className={`col-start-2 row-start-1 row-span-2 self-center text-right font-mono text-sm tabular-nums md:col-start-3 md:row-span-1 md:border-l md:border-border/60 md:pl-3 md:h-full md:flex md:items-center md:justify-end ${
          isExpense ? 'text-destructive' : isLend || isTransfer ? 'text-muted-foreground' : 'text-primary'
        }`}>
          {isExpense || isLend ? '−' : !isTransfer ? '+' : ''}{formatMoney(t.amount)}
        </div>
      </button>
    </div>
  );
}

function Rule() {
  return <span aria-hidden className="h-3 w-px shrink-0 bg-[hsl(var(--outline-variant))]" />;
}

// `+in −out` rather than a single net: a quiet month and a month that earned
// and spent heavily both net to roughly zero, and only one of them is quiet.
// Zero sides are dropped so a normal day reads as one figure, not two.
function Totals({ label, t }: { label: string; t: Tally }) {
  const { formatMoney } = useFinanceFormatters();
  if (t.spent === 0 && t.earned === 0 && t.lent === 0 && t.returned === 0) return null;
  return (
    <span className="flex items-baseline gap-1.5 font-mono text-xs tabular-nums">
      <span className="uppercase tracking-wider text-muted-foreground">{label}</span>
      {t.earned > 0 && <span className="text-primary">+{formatMoney(t.earned)} income</span>}
      {t.spent > 0 && <span className="text-foreground">−{formatMoney(t.spent)} personal</span>}
      {t.lent > 0 && <span className="text-muted-foreground">−{formatMoney(t.lent)} lent</span>}
      {t.returned > 0 && <span className="text-primary">+{formatMoney(t.returned)} returned</span>}
    </span>
  );
}
