import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { Plus, Search, ArrowUpRight, ArrowDownLeft, ArrowLeftRight, X, Tags, Hash } from '@/components/ui/icons';

import { type FinAccount, type FinCategory, type FinPocket, type FinTransaction } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFinanceFormatters } from './useFinancePrivacy';
import { txnAtToParts, formatTxnTime } from './utils';
import { RowsSkeleton } from './Skeletons';
import CategoryManager from './CategoryManager';
import TransactionDialog from './TransactionDialog';

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

interface Props {
  accounts: FinAccount[];
  categories: FinCategory[];
  pockets: FinPocket[];
  activePocketId: number | null;
  transactions: FinTransaction[];
  loaded: boolean;
  /** Server-side pocket filter: null off, 0 General, N pocket. */
  pocketFilter: number | null;
  onPocketFilter: (id: number | null) => void;
  reload: () => void;
  reloadCategories: () => void;
}

export default function TransactionsTab({
  accounts, categories, pockets, activePocketId, transactions, loaded,
  pocketFilter, onPocketFilter, reload, reloadCategories,
}: Props) {
  const { formatMoney } = useFinanceFormatters();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<FinTransaction | null>(null);
  const [creating, setCreating] = useState(false);
  const [manageCats, setManageCats] = useState(false);
  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');

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

  const grouped = useMemo(() => {
    const map = new Map<string, FinTransaction[]>();
    for (const t of filtered) {
      if (t.type === 'transfer_in') continue;
      const key = txnAtToParts(t.txn_at).date; // group by IST calendar day
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const linkedAccountName = (id: number | null) => accounts.find((a) => a.id === id)?.name || '';

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search description" value={search} onChange={(e) => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          )}
        </div>
        <Select value={accountFilter || 'all'} onValueChange={(v) => setAccountFilter(!v || v === 'all' ? '' : v)}
          items={[{ value: 'all', label: 'All accounts' }, ...accounts.map((a) => ({ value: String(a.id), label: a.name }))]}>
          <SelectTrigger size="sm" className="w-[160px]">
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
          items={[{ value: 'all', label: 'All types' }, { value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }, { value: 'transfer_out', label: 'Transfer' }]}>
          <SelectTrigger size="sm" className="w-[140px]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
            <SelectItem value="income">Income</SelectItem>
            <SelectItem value="transfer_out">Transfer</SelectItem>
          </SelectContent>
        </Select>
        {/* Server-side pocket filter (params-keyed query in FinancePage). */}
        <Select
          value={pocketFilter === null ? 'all' : String(pocketFilter)}
          onValueChange={(v) => onPocketFilter(!v || v === 'all' ? null : parseInt(v))}
          items={[
            { value: 'all', label: 'All pockets' },
            { value: '0', label: 'General' },
            ...pockets.filter((p) => !p.archived).map((p) => ({ value: String(p.id), label: p.name })),
          ]}
        >
          <SelectTrigger size="sm" className="w-[150px]">
            <SelectValue placeholder="All pockets" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All pockets</SelectItem>
            <SelectItem value="0">General</SelectItem>
            {pockets.filter((p) => !p.archived).map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => setManageCats(true)} title="Add / edit categories">
          <Tags className="size-4 mr-1" /> Categories
        </Button>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4 mr-1" /> Add
        </Button>
      </div>

      {/* List */}
      {!loaded && transactions.length === 0 ? (
        <RowsSkeleton rows={6} />
      ) : grouped.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {transactions.length === 0
            ? 'No transactions yet. Tap Add to record your first.'
            : 'No matches for the current filters.'}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <AnimatePresence initial={false}>
            {grouped.map(([date, items]) => {
              const dateObj = parseISO(date);
              const total = items.reduce((s, t) => s + (t.type === 'expense' ? -t.amount : t.type === 'income' ? t.amount : 0), 0);
              return (
                <motion.div
                  key={date}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="px-3 md:px-4 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
                    <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      {format(dateObj, 'EEE, MMM d')}
                    </div>
                    {total !== 0 && (
                      <div className={`font-mono text-xs tabular-nums ${total > 0 ? 'text-primary' : 'text-destructive'}`}>
                        {total > 0 ? '+' : ''}{formatMoney(total)}
                      </div>
                    )}
                  </div>
                  <div>
                    {items.map((t) => {
                      const isTransfer = t.type === 'transfer_out';
                      const isExpense = t.type === 'expense';
                      const Icon = isTransfer ? ArrowLeftRight : isExpense ? ArrowUpRight : ArrowDownLeft;
                      return (
                        <button
                          key={t.id}
                          onClick={() => setEditing(t)}
                          className="w-full flex items-center gap-3 px-3 md:px-4 py-3 border-b border-border last:border-0 hover:bg-accent/40 active:bg-accent/60 transition-colors text-left tap-highlight-none"
                        >
                          <div
                            className="size-8 rounded-md flex items-center justify-center shrink-0"
                            style={{
                              backgroundColor: (t.category_color || (isTransfer ? '#6B7280' : isExpense ? '#A14B4F' : '#2D5A4F')) + '20',
                              color: t.category_color || (isTransfer ? '#6B7280' : isExpense ? '#A14B4F' : '#2D5A4F'),
                            }}
                          >
                            <Icon className="size-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">
                              {t.description || (isTransfer ? 'Transfer' : t.category_name || (isExpense ? 'Expense' : 'Income'))}
                            </div>
                            <div className="font-mono text-xs text-muted-foreground truncate">
                              {accountNameById(t.account_id) || t.account_name}
                              {isTransfer && t.linked_account && ' → ' + linkedAccountName(t.linked_account)}
                              {!isTransfer && t.category_name && ' · ' + t.category_name}
                              {' · ' + formatTxnTime(t.txn_at)}
                            </div>
                            {(() => {
                              const tags = extractHashtags(t.note);
                              if (!tags.length && !t.pocket_name) return null;
                              return (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {t.pocket_name && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--secondary-container)/0.6)] px-1.5 py-0.5 font-mono text-xs text-foreground/80">
                                      <span aria-hidden className="size-1.5 rounded-full bg-[hsl(var(--primary))]" />
                                      {t.pocket_name}
                                    </span>
                                  )}
                                  {tags.map((tag) => (
                                    <span
                                      key={tag}
                                      role="link"
                                      onClick={(e) => { e.stopPropagation(); navigate(`/tags/${encodeURIComponent(tag)}`); }}
                                      className="inline-flex items-center gap-0.5 rounded-full bg-secondary/40 hover:bg-secondary/70 px-1.5 py-0.5 font-mono text-xs text-foreground/80 transition-colors"
                                    >
                                      <Hash className="size-2.5 opacity-70" strokeWidth={2.5} />{tag}
                                    </span>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                          <div className={`font-mono text-sm tabular-nums shrink-0 ${
                            isExpense ? 'text-destructive' :
                            !isTransfer ? 'text-primary' :
                            'text-muted-foreground'
                          }`}>
                            {isExpense ? '−' : !isTransfer ? '+' : ''}{formatMoney(t.amount)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <TransactionDialog
        open={creating || editing !== null}
        txn={editing}
        accounts={accounts}
        categories={categories}
        pockets={pockets}
        activePocketId={activePocketId}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={(patch) => {
          setCreating(false);
          setEditing(null);
          // Optimistic: show the edit immediately, reconcile on reload.
          if (patch) setOverrides((prev) => ({ ...prev, [patch.id]: { ...prev[patch.id], ...patch } }));
          reload();
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
