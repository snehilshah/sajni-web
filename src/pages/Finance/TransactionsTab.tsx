import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { Plus, Trash2, Search, ArrowUpRight, ArrowDownLeft, ArrowLeftRight, X, Sparkles } from 'lucide-react';

import { finance, type FinAccount, type FinCategory, type FinTransaction } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { M3CookieLoader } from '@/components/ui/shapes';
import { formatMoney } from './utils';
import { RowsSkeleton } from './Skeletons';

interface Props {
  accounts: FinAccount[];
  categories: FinCategory[];
  transactions: FinTransaction[];
  loaded: boolean;
  reload: () => void;
}

export default function TransactionsTab({ accounts, categories, transactions, loaded, reload }: Props) {
  const [editing, setEditing] = useState<FinTransaction | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');

  // Filter client-side off the parent's cached list so changes are instant.
  // (Backend filtering kicks in only when reload() is called after a mutation.)
  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (search && !t.description.toLowerCase().includes(search.toLowerCase()) &&
          !(t.category_name || '').toLowerCase().includes(search.toLowerCase())) return false;
      if (accountFilter && String(t.account_id) !== accountFilter) return false;
      if (typeFilter) {
        if (typeFilter === 'transfer_out' && t.type !== 'transfer_out') return false;
        if (typeFilter !== 'transfer_out' && t.type !== typeFilter) return false;
      }
      return true;
    });
  }, [transactions, search, accountFilter, typeFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, FinTransaction[]>();
    for (const t of filtered) {
      if (t.type === 'transfer_in') continue;
      const key = t.txn_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const load = useCallback(() => reload(), [reload]);
  useEffect(() => {}, []);

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
                    <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {format(dateObj, 'EEE, MMM d')}
                    </div>
                    {total !== 0 && (
                      <div className={`font-mono text-[11px] tabular-nums ${total > 0 ? 'text-primary' : 'text-destructive'}`}>
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
                            <div className="font-mono text-[10px] text-muted-foreground truncate">
                              {t.account_name}
                              {isTransfer && t.linked_account && ' → ' + linkedAccountName(t.linked_account)}
                              {!isTransfer && t.category_name && ' · ' + t.category_name}
                            </div>
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
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { setCreating(false); setEditing(null); load(); }}
      />
    </div>
  );
}

function TransactionDialog({ open, txn, accounts, categories, onClose, onSaved }: {
  open: boolean;
  txn: FinTransaction | null;
  accounts: FinAccount[];
  categories: FinCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<'expense' | 'income' | 'transfer'>('expense');
  const [accountId, setAccountId] = useState('');
  const [linkedId, setLinkedId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [inferring, setInferring] = useState(false);
  // Once the user picks a category by hand we stop auto-overwriting it,
  // even if they keep editing the title afterward.
  const userPickedCategoryRef = useRef(false);
  const inferTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (txn) {
      const t = txn.type === 'transfer_out' ? 'transfer' : (txn.type as any);
      setType(t);
      setAccountId(String(txn.account_id));
      setLinkedId(txn.linked_account ? String(txn.linked_account) : '');
      setCategoryId(txn.category_id ? String(txn.category_id) : '');
      setAmount(String(txn.amount));
      setDescription(txn.description);
      setDate(txn.txn_date);
      userPickedCategoryRef.current = true; // editing — treat existing pick as user's
    } else {
      setType('expense');
      setAccountId(accounts[0] ? String(accounts[0].id) : '');
      setLinkedId('');
      setCategoryId('');
      setAmount('');
      setDescription('');
      setDate(format(new Date(), 'yyyy-MM-dd'));
      userPickedCategoryRef.current = false;
    }
  }, [txn, open, accounts]);

  const filteredCats = categories.filter((c) => c.kind === (type === 'income' ? 'income' : 'expense'));

  // Debounced AI category inference. Fires when the user types a title
  // on a NEW transaction (not edit), as long as they haven't picked a
  // category by hand. Cheap (~50 tok) but still rate-limited server-side
  // by the shared AI budget.
  useEffect(() => {
    if (txn) return;                              // edit mode — don't auto-pick
    if (type === 'transfer') return;              // transfers have no category
    if (userPickedCategoryRef.current) return;    // user took the wheel
    const title = description.trim();
    if (title.length < 3) {                       // avoid noise / 1-letter spam
      setInferring(false);
      return;
    }
    if (inferTimer.current) clearTimeout(inferTimer.current);
    // Adaptive debounce: short strings settle fast, long sentences wait
    // longer so we don't fire a categorize call for every keystroke mid-word.
    const delay = Math.min(1600, 500 + title.length * 30);
    inferTimer.current = setTimeout(async () => {
      setInferring(true);
      try {
        const res = await finance.categorizeTransaction({
          title,
          kind: type === 'income' ? 'income' : 'expense',
        });
        // Don't clobber if the user picked something during the in-flight
        // request, or if the model bailed to "Others" with no match.
        if (!userPickedCategoryRef.current && res.category_id != null) {
          setCategoryId(String(res.category_id));
        }
      } catch {
        // Silent fail — limiter 429s or network blips shouldn't block the form.
      } finally {
        setInferring(false);
      }
    }, delay);
    return () => { if (inferTimer.current) clearTimeout(inferTimer.current); };
  }, [description, type, txn]);

  const save = async () => {
    if (!accountId || !amount) return;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return;

    if (txn) {
      // Edit only — don't change type/account, just amount/category/description/date
      await finance.updateTransaction(txn.id, {
        amount: amt,
        description,
        txn_date: date,
        category_id: categoryId ? parseInt(categoryId) as any : null,
      } as any);
    } else if (type === 'transfer') {
      if (!linkedId || linkedId === accountId) return;
      await finance.createTransaction({
        account_id: parseInt(accountId),
        type: 'transfer',
        amount: amt,
        description,
        txn_date: date,
        linked_account: parseInt(linkedId),
      });
    } else {
      await finance.createTransaction({
        account_id: parseInt(accountId),
        type,
        amount: amt,
        description,
        txn_date: date,
        category_id: categoryId ? parseInt(categoryId) : null,
      });
    }
    onSaved();
  };

  const remove = async () => {
    if (!txn) return;
    if (!window.confirm('Delete this transaction?')) return;
    await finance.deleteTransaction(txn.id);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{txn ? 'Edit transaction' : 'New transaction'}</DialogTitle>
        </DialogHeader>
        {!txn && (
          <div className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
            {(['expense', 'income', 'transfer'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`py-1.5 text-xs font-medium rounded transition-colors capitalize ${
                  type === t ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Title" className="col-span-2">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={type === 'transfer' ? 'e.g. Move to savings' : type === 'income' ? 'e.g. October salary' : 'e.g. Lunch at Cafe X'}
              maxLength={120}
              autoFocus={!txn}
            />
          </Field>
          <Field label={type === 'transfer' ? 'From account' : 'Account'} className="col-span-2">
            <Select value={accountId || undefined} onValueChange={(v) => setAccountId(v ?? '')} disabled={!!txn}
              items={accounts.map((a) => ({ value: String(a.id), label: a.name }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {type === 'transfer' && !txn && (
            <Field label="To account" className="col-span-2">
              <Select value={linkedId || undefined} onValueChange={(v) => setLinkedId(v ?? '')}
                items={accounts.filter((a) => String(a.id) !== accountId).map((a) => ({ value: String(a.id), label: a.name }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select destination" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.filter((a) => String(a.id) !== accountId).map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          {type !== 'transfer' && (
            <Field
              label="Category"
              className="col-span-2"
              hint={inferring ? (
                <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground normal-case tracking-normal">
                  <M3CookieLoader size="xs" tone="primary" />
                  Sajni is picking…
                </span>
              ) : categoryId && !userPickedCategoryRef.current && !txn ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-primary normal-case tracking-normal">
                  <Sparkles className="size-3" /> auto · change anytime
                </span>
              ) : undefined}
            >
              <Select
                value={categoryId || 'others'}
                onValueChange={(v) => {
                  userPickedCategoryRef.current = true;
                  setCategoryId(!v || v === 'others' ? '' : v);
                }}
                items={[{ value: 'others', label: 'Others' }, ...filteredCats.map((c) => ({ value: String(c.id), label: c.name }))]}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Others" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="others">Others</SelectItem>
                  {filteredCats.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Amount">
            <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Date">
            <DatePicker value={date} onChange={setDate} />
          </Field>
        </div>
        <DialogFooter className="sm:justify-between">
          {txn ? (
            <Button variant="ghost" className="text-destructive" onClick={remove}>
              <Trash2 className="size-4 mr-1" /> Delete
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save}>{txn ? 'Save' : 'Add'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, className = '', children, hint }: { label: string; className?: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center justify-between gap-2 min-h-[14px]">
        <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
        {hint}
      </div>
      {children}
    </div>
  );
}
