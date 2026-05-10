import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Landmark, CreditCard, TrendingUp, Coins,
  Plus, Pencil, Trash2, Target,
} from 'lucide-react';

import { finance, type FinAccount, type FinSaving } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ACCOUNT_TYPES, ACCOUNT_COLORS, formatMoney } from './utils';
import { ListSkeleton } from './Skeletons';

const typeIcon = (type: string) => {
  switch (type) {
    case 'credit_card': return CreditCard;
    case 'investment': return TrendingUp;
    case 'cash': return Coins;
    case 'savings':
    case 'checking':
    default: return Landmark;
  }
};

interface Props {
  accounts: FinAccount[];
  savings: FinSaving[];
  loaded: boolean;
  reload: () => void;
}

export default function AccountsTab({ accounts, savings: parentSavings, loaded, reload }: Props) {
  const [editingAcct, setEditingAcct] = useState<FinAccount | null>(null);
  const [creating, setCreating] = useState(false);
  // Local copy so the bucket dialog can mutate without round-tripping every keystroke.
  const [savings, setSavings] = useState<FinSaving[]>(parentSavings);
  useEffect(() => { setSavings(parentSavings); }, [parentSavings]);

  const [savingsAcct, setSavingsAcct] = useState<FinAccount | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const visible = useMemo(
    () => accounts.filter((a) => showArchived || !a.archived),
    [accounts, showArchived],
  );

  const totalAssets = visible
    .filter((a) => a.type !== 'credit_card' || a.balance >= 0)
    .reduce((s, a) => s + Math.max(a.balance, 0), 0);
  const totalLiab = visible
    .filter((a) => a.balance < 0)
    .reduce((s, a) => s + -a.balance, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <SummaryCard label="Assets" value={formatMoney(totalAssets)} tone="primary" />
        <SummaryCard label="Liabilities" value={formatMoney(totalLiab)} tone="destructive" />
        <SummaryCard label="Net" value={formatMoney(totalAssets - totalLiab)} tone="default" className="col-span-2 md:col-span-1" />
      </div>

      <div className="flex items-center justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold">Accounts</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            {showArchived ? 'Hide archived' : 'Show archived'}
          </button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4 mr-1" /> Add account
          </Button>
        </div>
      </div>

      {!loaded && accounts.length === 0 ? (
        <ListSkeleton rows={4} />
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No accounts yet. Add your first to start tracking.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visible.map((a) => {
            const Icon = typeIcon(a.type);
            const acctSavings = savings.filter((s) => s.account_id === a.id);
            const reservedTotal = acctSavings.reduce((s, b) => s + b.current_amount, 0);
            const isCC = a.type === 'credit_card';
            const owed = isCC && a.balance < 0 ? -a.balance : 0;
            const utilization = isCC && a.credit_limit ? (owed / a.credit_limit) * 100 : 0;

            return (
              <motion.div
                key={a.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-xl border bg-card p-4 hover:border-primary/30 hover:shadow-sm transition-all ${a.archived ? 'opacity-60' : ''}`}
                style={{ borderLeftColor: a.color, borderLeftWidth: 4 }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="size-9 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: a.color + '20', color: a.color }}>
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{a.name}</div>
                      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {ACCOUNT_TYPES.find((t) => t.value === a.type)?.label}
                        {a.institution && ' · ' + a.institution}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditingAcct(a)}>
                      <Pencil className="size-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="mt-3">
                  {isCC ? (
                    <>
                      <div className="font-serif text-2xl font-semibold tabular-nums">
                        {formatMoney(owed)}
                      </div>
                      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        Outstanding {a.credit_limit ? '· limit ' + formatMoney(a.credit_limit) : ''}
                      </div>
                      {a.credit_limit ? (
                        <div className="mt-2">
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full transition-all"
                              style={{
                                width: Math.min(utilization, 100) + '%',
                                backgroundColor: utilization > 80 ? 'hsl(var(--destructive))' : a.color,
                              }}
                            />
                          </div>
                          <div className="font-mono text-[9px] text-muted-foreground mt-1">
                            {utilization.toFixed(0)}% used
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <div className={`font-serif text-2xl font-semibold tabular-nums ${a.balance < 0 ? 'text-destructive' : ''}`}>
                        {formatMoney(a.balance)}
                      </div>
                      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        Balance
                      </div>
                    </>
                  )}
                </div>

                {/* Virtual savings on this account */}
                {!isCC && (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
                        <Target className="size-3" />
                        Reserved
                        {reservedTotal > 0 && ' · ' + formatMoney(reservedTotal)}
                      </span>
                      <button
                        onClick={() => setSavingsAcct(a)}
                        className="font-mono text-[10px] text-primary hover:underline"
                      >
                        Manage
                      </button>
                    </div>
                    {acctSavings.length === 0 ? (
                      <div className="text-[11px] text-muted-foreground">No buckets — add savings goals like emergency fund, vacation, etc.</div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {acctSavings.slice(0, 3).map((s) => {
                          const pct = s.target_amount > 0 ? (s.current_amount / s.target_amount) * 100 : 0;
                          return (
                            <div key={s.id} className="flex items-center gap-2">
                              <div className="size-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                              <span className="text-xs flex-1 truncate">{s.name}</span>
                              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                                {formatMoney(s.current_amount)}
                                {s.target_amount > 0 && ' / ' + formatMoney(s.target_amount)}
                              </span>
                              {s.target_amount > 0 && (
                                <span className="font-mono text-[9px] tabular-nums text-muted-foreground w-8 text-right">
                                  {pct.toFixed(0)}%
                                </span>
                              )}
                            </div>
                          );
                        })}
                        {acctSavings.length > 3 && (
                          <div className="font-mono text-[10px] text-muted-foreground">
                            +{acctSavings.length - 3} more
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      <AccountDialog
        open={creating || editingAcct !== null}
        account={editingAcct}
        onClose={() => { setCreating(false); setEditingAcct(null); }}
        onSaved={() => { reload(); setCreating(false); setEditingAcct(null); }}
      />
      <SavingsDialog
        account={savingsAcct}
        savings={savings.filter((s) => savingsAcct && s.account_id === savingsAcct.id)}
        onClose={() => { setSavingsAcct(null); finance.listSavings().then(setSavings).catch(() => {}); }}
      />
    </div>
  );
}

function SummaryCard({ label, value, tone, className = '' }: { label: string; value: string; tone: 'primary' | 'destructive' | 'default'; className?: string }) {
  const tones: Record<string, string> = {
    primary: 'text-primary',
    destructive: 'text-destructive',
    default: 'text-foreground',
  };
  return (
    <div className={`rounded-xl border border-border bg-card p-4 ${className}`}>
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-serif text-2xl font-semibold tabular-nums mt-1 ${tones[tone]}`}>{value}</div>
    </div>
  );
}

function AccountDialog({ open, account, onClose, onSaved }: {
  open: boolean;
  account: FinAccount | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState('savings');
  const [institution, setInstitution] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [creditLimit, setCreditLimit] = useState('');
  const [statementDay, setStatementDay] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [cashbackType, setCashbackType] = useState('none');
  const [cashbackValue, setCashbackValue] = useState('0');
  const [color, setColor] = useState(ACCOUNT_COLORS[0]);
  const [archived, setArchived] = useState(false);

  useEffect(() => {
    if (account) {
      setName(account.name);
      setType(account.type);
      setInstitution(account.institution);
      setOpeningBalance(String(account.opening_balance));
      setCreditLimit(account.credit_limit != null ? String(account.credit_limit) : '');
      setStatementDay(account.statement_day != null ? String(account.statement_day) : '');
      setDueDay(account.due_day != null ? String(account.due_day) : '');
      setCashbackType(account.cashback_type);
      setCashbackValue(String(account.cashback_value));
      setColor(account.color);
      setArchived(account.archived);
    } else {
      setName(''); setType('savings'); setInstitution(''); setOpeningBalance('0');
      setCreditLimit(''); setStatementDay(''); setDueDay('');
      setCashbackType('none'); setCashbackValue('0');
      setColor(ACCOUNT_COLORS[0]); setArchived(false);
    }
  }, [account, open]);

  const save = async () => {
    if (!name.trim()) return;
    const data: any = {
      name: name.trim(),
      type,
      institution: institution.trim(),
      opening_balance: parseFloat(openingBalance) || 0,
      cashback_type: type === 'credit_card' ? cashbackType : 'none',
      cashback_value: parseFloat(cashbackValue) || 0,
      color,
    };
    if (type === 'credit_card') {
      data.credit_limit = creditLimit ? parseFloat(creditLimit) : 0;
      data.statement_day = statementDay ? parseInt(statementDay) : null;
      data.due_day = dueDay ? parseInt(dueDay) : null;
    }
    if (account) {
      data.archived = archived;
      await finance.updateAccount(account.id, data);
    } else {
      await finance.createAccount(data);
    }
    onSaved();
  };

  const remove = async () => {
    if (!account) return;
    if (!window.confirm('Delete this account? Transactions on it will also be removed.')) return;
    await finance.deleteAccount(account.id);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{account ? 'Edit account' : 'New account'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name" className="sm:col-span-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HDFC Savings" />
          </Field>
          <Field label="Type">
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Institution">
            <Input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="e.g. HDFC" />
          </Field>
          <Field label="Opening balance">
            <Input type="number" inputMode="decimal" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} />
          </Field>
          <Field label="Color">
            <div className="flex flex-wrap gap-1.5 pt-1">
              {ACCOUNT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`size-7 rounded-md transition-transform ${color === c ? 'ring-2 ring-ring scale-110' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </Field>

          {type === 'credit_card' && (
            <>
              <Field label="Credit limit" className="sm:col-span-2">
                <Input type="number" inputMode="decimal" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="e.g. 200000" />
              </Field>
              <Field label="Statement day">
                <Input type="number" inputMode="numeric" value={statementDay} onChange={(e) => setStatementDay(e.target.value)} placeholder="e.g. 25" />
              </Field>
              <Field label="Due day">
                <Input type="number" inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value)} placeholder="e.g. 15" />
              </Field>
              <Field label="Cashback type">
                <select
                  value={cashbackType}
                  onChange={(e) => setCashbackType(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <option value="none">None</option>
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed</option>
                </select>
              </Field>
              {cashbackType !== 'none' && (
                <Field label={cashbackType === 'percentage' ? 'Cashback %' : 'Cashback amount'}>
                  <Input type="number" inputMode="decimal" value={cashbackValue} onChange={(e) => setCashbackValue(e.target.value)} />
                </Field>
              )}
            </>
          )}
          {account && (
            <Field label="" className="sm:col-span-2">
              <label className="inline-flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="size-4 rounded border-input" />
                Archived (hide from active view)
              </label>
            </Field>
          )}
        </div>
        <DialogFooter className="sm:justify-between">
          {account ? (
            <Button variant="ghost" className="text-destructive" onClick={remove}>
              <Trash2 className="size-4 mr-1" /> Delete
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save}>{account ? 'Save' : 'Create'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>}
      {children}
    </div>
  );
}

function SavingsDialog({ account, savings, onClose }: {
  account: FinAccount | null;
  savings: FinSaving[];
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [current, setCurrent] = useState('');
  const [color, setColor] = useState(ACCOUNT_COLORS[0]);
  const [editing, setEditing] = useState<FinSaving | null>(null);
  const [list, setList] = useState<FinSaving[]>(savings);

  useEffect(() => { setList(savings); }, [savings]);

  if (!account) return null;

  const reset = () => { setName(''); setTarget(''); setCurrent(''); setEditing(null); setColor(ACCOUNT_COLORS[0]); };
  const reload = () => finance.listSavings(account.id).then(setList).catch(() => {});

  const save = async () => {
    if (!name.trim()) return;
    const data = {
      account_id: account.id,
      name: name.trim(),
      target_amount: parseFloat(target) || 0,
      current_amount: parseFloat(current) || 0,
      color,
    };
    if (editing) {
      await finance.updateSaving(editing.id, data);
    } else {
      await finance.createSaving(data);
    }
    reset();
    reload();
  };

  const remove = async (id: number) => {
    if (!window.confirm('Delete this savings bucket?')) return;
    await finance.deleteSaving(id);
    reload();
  };

  const startEdit = (s: FinSaving) => {
    setEditing(s);
    setName(s.name);
    setTarget(String(s.target_amount));
    setCurrent(String(s.current_amount));
    setColor(s.color);
  };

  const reservedTotal = list.reduce((s, b) => s + b.current_amount, 0);
  const overReserved = reservedTotal > account.balance;

  return (
    <Dialog open={!!account} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reserved on {account.name}</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground -mt-2">
          Buckets are virtual — money stays in the account. Reserved {formatMoney(reservedTotal)} of {formatMoney(account.balance)} balance.
        </div>
        {overReserved && (
          <div className="text-xs rounded-md bg-destructive/10 text-destructive px-3 py-2">
            Reserved exceeds the account balance.
          </div>
        )}

        <div className="flex flex-col gap-2">
          {list.length === 0 ? (
            <div className="text-sm text-muted-foreground italic py-2">No buckets yet.</div>
          ) : list.map((s) => {
            const pct = s.target_amount > 0 ? Math.min((s.current_amount / s.target_amount) * 100, 100) : 0;
            return (
              <div key={s.id} className="border border-border rounded-md p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="font-medium text-sm truncate">{s.name}</span>
                  </div>
                  <div className="flex gap-0.5">
                    <Button variant="ghost" size="icon-sm" onClick={() => startEdit(s)}><Pencil className="size-3.5" /></Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => remove(s.id)}><Trash2 className="size-3.5" /></Button>
                  </div>
                </div>
                <div className="font-mono text-[11px] tabular-nums text-muted-foreground mt-1">
                  {formatMoney(s.current_amount)}{s.target_amount > 0 && ' / ' + formatMoney(s.target_amount)}
                </div>
                {s.target_amount > 0 && (
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                    <div className="h-full transition-all" style={{ width: pct + '%', backgroundColor: s.color }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="border-t border-border pt-3 mt-1">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            {editing ? 'Edit bucket' : 'Add bucket'}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input className="col-span-2" placeholder="Name (e.g. Emergency)" value={name} onChange={(e) => setName(e.target.value)} />
            <Input type="number" inputMode="decimal" placeholder="Reserved" value={current} onChange={(e) => setCurrent(e.target.value)} />
            <Input type="number" inputMode="decimal" placeholder="Target (optional)" value={target} onChange={(e) => setTarget(e.target.value)} />
            <div className="col-span-2 flex flex-wrap gap-1.5">
              {ACCOUNT_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`size-6 rounded-md ${color === c ? 'ring-2 ring-ring' : ''}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
            <div className="col-span-2 flex gap-2 mt-1">
              {editing && <Button variant="outline" size="sm" onClick={reset}>Cancel</Button>}
              <Button size="sm" onClick={save} disabled={!name.trim()}>{editing ? 'Save' : 'Add'}</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
