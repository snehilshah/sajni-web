import { useEffect, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { Plus, Trash2, Search, ArrowUpRight, ArrowDownLeft, ArrowLeftRight, X } from 'lucide-react';

import { finance, type FinAccount, type FinCategory, type FinTransaction } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
        <select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <option value="">All accounts</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <option value="">All types</option>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="transfer_out">Transfer</option>
        </select>
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
    } else {
      setType('expense');
      setAccountId(accounts[0] ? String(accounts[0].id) : '');
      setLinkedId('');
      setCategoryId('');
      setAmount('');
      setDescription('');
      setDate(format(new Date(), 'yyyy-MM-dd'));
    }
  }, [txn, open, accounts]);

  const filteredCats = categories.filter((c) => c.kind === (type === 'income' ? 'income' : 'expense'));

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
          <Field label={type === 'transfer' ? 'From account' : 'Account'} className="col-span-2">
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              disabled={!!txn}
            >
              <option value="">Select account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          {type === 'transfer' && !txn && (
            <Field label="To account" className="col-span-2">
              <select
                value={linkedId}
                onChange={(e) => setLinkedId(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <option value="">Select destination</option>
                {accounts.filter((a) => String(a.id) !== accountId).map((a) =>
                  <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          )}
          {type !== 'transfer' && (
            <Field label="Category" className="col-span-2">
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <option value="">Uncategorized</option>
                {filteredCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Amount">
            <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Date">
            <DatePicker value={date} onChange={setDate} />
          </Field>
          <Field label="Description" className="col-span-2">
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional notes" />
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

function Field({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
