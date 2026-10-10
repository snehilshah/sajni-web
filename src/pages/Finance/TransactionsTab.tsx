import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO, startOfWeek, endOfWeek, endOfMonth } from 'date-fns';
import { toast } from 'sonner';
import {
  Plus, Search, ArrowUpRight, ArrowDownLeft, ArrowLeftRight, X, Tags, Hash, Check, Wallet, Coins,
} from '@/components/ui/icons';

import { finance, type FinAccount, type FinCategory, type FinLend, type FinSlate, type FinTransaction, type TxnKind } from '@/api';
import { failureText } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cardClass, CardAccent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useFinanceFormatters } from './useFinancePrivacy';
import { Money } from './Money';
import { txnAtToParts, formatTxnTime, toPaise, fromPaise } from './utils';
import { RowsSkeleton } from './Skeletons';
import CategoryManager from './CategoryManager';
import TransactionDialog from './TransactionDialog';
import SlateDialog from './SlateDialog';
import { EditLendDialog } from './LendsTab';

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
    // Tallies accumulate in paise (exact) and convert back below.
    const paise = toPaise(t.amount);
    for (const b of [m, w, d] as Tally[]) {
      if (t.type === 'expense') b.spent += paise;
      if (t.type === 'income') b.earned += paise;
      if (t.type === 'lend') b.lent += paise;
      if (t.type === 'lend_repayment') b.returned += paise;
    }
  }

  const toRupees = (b: Tally) => {
    b.spent = fromPaise(b.spent); b.earned = fromPaise(b.earned);
    b.lent = fromPaise(b.lent); b.returned = fromPaise(b.returned);
  };
  for (const m of months.values()) {
    toRupees(m);
    for (const w of m.weeks) { toRupees(w); w.days.forEach(toRupees); }
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
  lends: FinLend[];
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
  accounts, categories, slates, transactions, lends, loaded,
  slateFilter, onSlateFilter, reload, reloadCategories,
  truncated, canLoadEarlier, onLoadEarlier,
  newLendRequest,
}: Props) {
  const { formatMoney } = useFinanceFormatters();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<FinTransaction | null>(null);
  const [editingLend, setEditingLend] = useState<FinLend | null>(null);
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

  const openTransaction = (txn: FinTransaction) => {
    if (txn.type !== 'lend' && txn.type !== 'lend_repayment') {
      setEditing(txn);
      return;
    }
    const lend = lends.find((item) => item.id === txn.lend_id);
    if (!lend) {
      toast.error('Lend details are unavailable. Refresh and try again.');
      return;
    }
    setEditingLend(lend);
  };

  const selectedTotal = useMemo(
    () => fromPaise(filtered
      .filter((t) => selected.has(t.id))
      .filter((t) => t.type === 'expense')
      .reduce((s, t) => s + toPaise(t.amount), 0)),
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
      toast.error(failureText(e));
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
        <div className={cardClass({ variant: 'filled', accent: viewing.color }, 'flex items-center gap-3 px-4 py-3')}>
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
            <Money value={viewing.total_spend} className="block text-lg font-semibold" />
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
        <p className="py-2 text-sm text-muted-foreground">
          {transactions.length === 0 ? 'No transactions yet' : 'No matches'}
        </p>
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
                {/* Week / month close out as a small stat panel on the day
                    that closes them (once per period, not banding every
                    group). The day's own total sits in the group header. */}
                {(d.week || d.month) && (
                  <div className="grid gap-0.5 overflow-hidden rounded-xl">
                    {d.month && <PeriodStats label={format(parseISO(d.key), 'MMMM')} t={d.month} />}
                    {d.week && <PeriodStats label={`Week of ${format(startOfWeek(parseISO(d.key), { weekStartsOn: 1 }), 'd MMM')}`} t={d.week} />}
                  </div>
                )}

                <div className="overflow-hidden rounded-xl bg-card">
                  {/* Scrolls away with its rows. It was sticky once; pinning it
                      inside the card meant the card had to drop
                      `overflow-hidden`, and the offset then had to be kept in
                      sync with the floating chrome island by hand. Not worth it
                      for a date the group is already sorted by. */}
                  <div className={cn(GRID, LEAD, TRAIL, 'py-2.5')}>
                    <span className="text-sm font-semibold md:col-span-2">
                      {format(parseISO(d.key), 'EEE, d MMM')}
                    </span>
                    <DayFigures t={d} />
                  </div>
                  {d.items.map((t) => (
                    <LedgerRow
                      key={t.id}
                      txn={t}
                      slate={slateById(t.slate_id)}
                      selecting={selecting}
                      checked={selected.has(t.id)}
                      onToggle={() => (t.type === 'lend' || t.type === 'lend_repayment') ? openTransaction(t) : toggle(t.id)}
                      onOpen={() => openTransaction(t)}
                      accountName={accountNameById(t.account_id) || t.account_name}
                      linkedName={linkedAccountName(t.linked_account)}
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
                <DropdownMenuGroup>
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
                </DropdownMenuGroup>
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
        onAutosaved={(patch) => {
          setOverrides((prev) => ({ ...prev, [patch.id]: { ...prev[patch.id], ...patch } }));
          reload();
        }}
      />
      <EditLendDialog
        lend={editingLend}
        accounts={accounts}
        onClose={() => setEditingLend(null)}
        onSaved={() => { setEditingLend(null); reload(); }}
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
  accountName, linkedName, onTag,
}: {
  txn: FinTransaction;
  slate?: FinSlate;
  selecting: boolean;
  checked: boolean;
  onToggle: () => void;
  onOpen: () => void;
  accountName: string;
  linkedName: string;
  onTag: (tag: string) => void;
}) {
  const isTransfer = t.type === 'transfer_out';
  const isExpense = t.type === 'expense';
  const isLend = t.type === 'lend';
  const isLendRepayment = t.type === 'lend_repayment';
  const Icon = isLend || isLendRepayment ? Coins : isTransfer ? ArrowLeftRight : isExpense ? ArrowUpRight : ArrowDownLeft;
  const isMove = isTransfer || isLend || isLendRepayment;
  const title = t.description || (isLend ? 'Lend' : isLendRepayment ? 'Lend repayment' : isTransfer ? 'Transfer' : t.category_name || (isExpense ? 'Expense' : 'Income'));
  // Identity tile, like a merchant logo: the payee's initial on a tint of
  // the category colour; moves get a neutral glyph. The corner arrow is the
  // type, so nothing on the row needs a badge.
  const hue = isMove ? null : (t.category_color || '#6B7280');
  const ink = hue ? `color-mix(in srgb, ${hue} 70%, hsl(var(--foreground)))` : undefined;
  const initial = (title.match(/[\p{L}\p{N}]/u)?.[0] ?? '•').toUpperCase();
  // Plain is silent: only an outlier earns a spine and a chip. `slate` can be
  // missing while the slates query is still in flight — treat that as silent
  // rather than guessing, so nothing flickers a wrong colour.
  const outlier = !!slate && !slate.is_plain;
  const tags = extractHashtags(t.note);

  return (
    <div
      className={`group relative flex min-h-12 items-stretch border-b border-border last:border-0 transition-colors ${
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
              className={cn(
                'relative grid size-8 place-items-center rounded-[10px] text-[13px] font-semibold transition-opacity group-hover:opacity-0',
                !hue && 'bg-[hsl(var(--surface-container-highest))] text-muted-foreground',
              )}
              style={hue ? { backgroundColor: `color-mix(in srgb, ${hue} 20%, transparent)`, color: ink } : undefined}
            >
              {isMove ? <Icon className="size-4" /> : initial}
              {!isMove && (
                <span
                  aria-label={isExpense ? 'Expense' : 'Income'}
                  className={cn(
                    // Filled in the direction's colour, ringed in the row's
                    // surface so it reads as a badge on the tile.
                    'absolute -bottom-0.5 -right-1 grid size-4 place-items-center rounded-full ring-2 ring-[hsl(var(--card))] text-white',
                    isExpense ? 'bg-destructive' : 'bg-[hsl(var(--color-complete))]',
                  )}
                >
                  {isExpense ? <ArrowUpRight className="size-2.5" strokeWidth={3.25} /> : <ArrowDownLeft className="size-2.5" strokeWidth={3.25} />}
                </span>
              )}
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
          <div className="text-sm font-medium truncate">{title}</div>
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
          <span className="flex min-w-0 items-center truncate md:justify-center">
            {!isMove && t.category_name ? (
              // Soft pill in the category's hue: the colour carries the
              // category, the darkened ink keeps the label readable.
              <span
                className="truncate rounded-full px-2 py-0.5 font-sans font-medium"
                style={{ backgroundColor: `color-mix(in srgb, ${hue} 16%, transparent)`, color: ink }}
              >
                {t.category_name}
              </span>
            ) : (isLend || isLendRepayment) && t.lend_borrower ? (
              <span className="truncate rounded-full bg-[hsl(var(--surface-container-high))] px-2 py-0.5 font-sans font-medium text-[hsl(var(--on-surface-variant))]">
                {isLend ? 'For ' : 'From '}{t.lend_borrower}
              </span>
            ) : (
              <span className="truncate">
                {isLend ? 'Lend' : isLendRepayment ? 'Lend repayment' : isTransfer ? 'Transfer' : 'Uncategorized'}
              </span>
            )}
          </span>
          <span aria-hidden className="md:hidden">·</span>
          <span className="truncate">
            {accountName}
            {isTransfer && t.linked_account && ' → ' + linkedName}
          </span>
        </div>

        <div className={`col-start-2 row-start-1 row-span-2 self-center text-right text-sm font-medium md:col-start-3 md:row-span-1 md:border-l md:border-border/60 md:pl-3 md:h-full md:flex md:items-center md:justify-end ${
          isExpense ? 'text-foreground' : isLend || isTransfer ? 'text-muted-foreground' : 'text-[hsl(var(--color-complete))]'
        }`}>
          <Money value={t.amount} sign={isExpense || isLend ? '−' : !isTransfer ? '+' : ''} />
        </div>
      </button>
    </div>
  );
}

// Day total in the group header: figures, not sentences. Spent is the
// default reading (plain), income is positive (primary); lent/returned are
// rarer and keep a one-word tag. Zero sides are dropped.
function DayFigures({ t }: { t: Tally }) {
  return (
    <span className="flex items-baseline justify-end gap-3 whitespace-nowrap text-sm tabular-nums">
      {t.earned > 0 && <Money value={t.earned} sign="+" className="text-[hsl(var(--color-complete))]" />}
      {t.spent > 0 && <Money value={t.spent} sign="−" className="text-foreground" />}
      {t.lent > 0 && <span className="text-muted-foreground"><Money value={t.lent} sign="−" /> <span className="text-xs">lent</span></span>}
      {t.returned > 0 && <span className="text-[hsl(var(--color-complete))]"><Money value={t.returned} sign="+" /> <span className="text-xs">back</span></span>}
    </span>
  );
}

// Period close-out: the period on the left, one labelled figure per non-zero
// side. `+in −out` rather than a single net — a quiet month and a heavy one
// can both net to zero, and only one of them is quiet.
function PeriodStats({ label, t }: { label: string; t: Tally }) {
  const figures = [
    { name: 'Income', tag: 'in', v: t.earned, sign: '+', cls: 'text-[hsl(var(--color-complete))]' },
    { name: 'Spent', tag: 'spent', v: t.spent, sign: '−', cls: 'text-foreground' },
    { name: 'Lent', tag: 'lent', v: t.lent, sign: '−', cls: 'text-muted-foreground' },
    { name: 'Returned', tag: 'back', v: t.returned, sign: '+', cls: 'text-[hsl(var(--color-complete))]' },
  ];
  if (figures.every((f) => f.v <= 0)) return null;
  return (
    <div className="bg-card px-4 py-3">
      {/* Phone: exact figures with a one-word tag. Figures are never
          compacted, so a busy period wraps onto a second line instead. */}
      <div className="flex items-baseline gap-3 md:hidden">
        <span className="shrink-0 text-sm font-semibold">{label}</span>
        <span className="ml-auto flex min-w-0 flex-wrap items-baseline justify-end gap-x-2.5 gap-y-0.5 text-sm tabular-nums">
          {figures.filter((f) => f.v > 0).map((f) => (
            <span key={f.name} className={cn('whitespace-nowrap', f.cls)}>
              <Money value={f.v} sign={f.sign} /> <span className="text-xs text-muted-foreground">{f.tag}</span>
            </span>
          ))}
        </span>
      </div>
      {/* Desktop: month and week share four aligned figure columns, so
          Income sits under Income; empty sides keep their (blank) column. */}
      <div className="hidden gap-x-6 md:grid md:grid-cols-[minmax(0,1fr)_repeat(4,8.5rem)] md:items-center">
        <span className="text-sm font-semibold">{label}</span>
        {figures.map((f) => f.v > 0 ? (
          <span key={f.name} className="flex flex-col items-end">
            <span className="text-xs text-muted-foreground">{f.name}</span>
            <Money value={f.v} sign={f.sign} className={cn('text-lg font-semibold leading-tight', f.cls)} />
          </span>
        ) : (
          <span key={f.name} aria-hidden />
        ))}
      </div>
    </div>
  );
}
