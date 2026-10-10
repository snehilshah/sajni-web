import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Landmark, CreditCard, TrendingUp, Coins, Wallet,
  Plus, Pencil, Trash2, Target, ArrowDownToLine,
} from '@/components/ui/icons';
import { toast } from 'sonner';

import { finance, type AccountDraft, type FinAccount, type FinSaving, type FinCategory } from '@/api';
import { confirmDialog } from '@/lib/confirm';
import { Button } from '@/components/ui/button';
import { cardClass, CardAccent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AnimatedMoney } from './AnimatedMoney';
import { useFinanceFormatters } from './useFinancePrivacy';
import { ACCOUNT_TYPES, ACCOUNT_COLORS, sumMoney, subMoney } from './utils';
import { ListSkeleton } from './Skeletons';
import { Stat, StatGroup } from './StatGroup';
import { DateBadge } from '@/components/ui/state-chip';
import { Money } from './Money';
import { useEditorAutosave } from '@/hooks/use-autosave';
import { AutosaveStatus, EditActions } from '@/components/autosave';

const typeIcon = (type: string) => {
  switch (type) {
    case 'credit_card': return CreditCard;
    case 'investment': return TrendingUp;
    case 'cash': return Coins;
    case 'salary': return Wallet;
    case 'savings':
    default: return Landmark;
  }
};

type AcctType = FinAccount['type'];
type CashType = FinAccount['cashback_type'];

interface Props {
  accounts: FinAccount[];
  categories: FinCategory[];
  savings: FinSaving[];
  loaded: boolean;
  reload: () => void;
}

export default function AccountsTab({ accounts, categories, savings: parentSavings, loaded, reload }: Props) {
  const { formatPercent } = useFinanceFormatters();
  const [editingAcct, setEditingAcct] = useState<FinAccount | null>(null);
  const [creating, setCreating] = useState(false);
  // Local copy so the bucket dialog can mutate without round-tripping every keystroke.
  const [savings, setSavings] = useState<FinSaving[]>(parentSavings);
  useEffect(() => { setSavings(parentSavings); }, [parentSavings]);

  const [savingsAcct, setSavingsAcct] = useState<FinAccount | null>(null);
  const [crediting, setCrediting] = useState<FinAccount | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const visible = useMemo(
    () => accounts.filter((a) => showArchived || !a.archived),
    [accounts, showArchived],
  );

  const totalAssets = sumMoney(
    visible.filter((a) => a.type !== 'credit_card' || a.balance >= 0),
    (a) => Math.max(a.balance, 0),
  );
  const totalLiab = sumMoney(visible.filter((a) => a.balance < 0), (a) => -a.balance);

  return (
    <div className="flex flex-col gap-4">
      <StatGroup className="grid-cols-2 md:grid-cols-3">
        <Stat label="Assets" value={<AnimatedMoney value={totalAssets} />} tone="primary" />
        <Stat label="Liabilities" value={<AnimatedMoney value={totalLiab} />} tone="destructive" />
        <Stat label="Net" value={<AnimatedMoney value={subMoney(totalAssets, totalLiab)} />} className="col-span-2 md:col-span-1" />
      </StatGroup>

      <div className="flex items-center justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold">Accounts</h2>
        <div className="flex items-center gap-2">
          {accounts.some((a) => a.archived) && (
            <button
              type="button"
              aria-pressed={showArchived}
              onClick={() => setShowArchived((v) => !v)}
              className={`chip ${showArchived ? 'chip-selected' : ''}`}
            >
              Archived
            </button>
          )}
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4 mr-1" /> Add account
          </Button>
        </div>
      </div>

      {!loaded && accounts.length === 0 ? (
        <ListSkeleton rows={4} />
      ) : visible.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">No accounts yet</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visible.map((a) => {
            const Icon = typeIcon(a.type);
            const acctSavings = savings.filter((s) => s.account_id === a.id);
            const reservedTotal = sumMoney(acctSavings, (b) => b.current_amount);
            const isCC = a.type === 'credit_card';
            const owed = isCC && a.balance < 0 ? -a.balance : 0;
            const utilization = isCC && a.credit_limit ? (owed / a.credit_limit) * 100 : 0;

            return (
              <motion.div
                key={a.id}
                layout
                initial={{ opacity: 0, transform: 'translateY(4px)' }}
                animate={{ opacity: 1, transform: 'translateY(0)' }}
                className={cardClass({ accent: a.color }, a.archived ? 'p-4 opacity-60' : 'p-4')}
              >
                <CardAccent color={a.color} />
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="size-9 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: a.color + '20', color: a.color }}>
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{a.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {ACCOUNT_TYPES.find((t) => t.value === a.type)?.label}
                        {a.institution && ' · ' + a.institution}
                      </div>
                    </div>
                  </div>
                  {/* Actions end on the card's trailing edge, glyph-aligned. */}
                  <div className="-mr-2 -mt-1 flex shrink-0">
                    {a.type === 'salary' && (
                      <Button variant="ghost" size="icon-sm" aria-label={`Credit salary or bonus to ${a.name}`} title="Credit salary / bonus" onClick={() => setCrediting(a)}>
                        <ArrowDownToLine className="size-4" />
                      </Button>
                    )}
                    {!isCC && (
                      <Button variant="ghost" size="icon-sm" aria-label={`Buckets on ${a.name}`} title="Buckets" onClick={() => setSavingsAcct(a)}>
                        <Target className="size-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${a.name}`} title="Edit" onClick={() => setEditingAcct(a)}>
                      <Pencil className="size-4" />
                    </Button>
                  </div>
                </div>

                {/* Every account reads the same: one figure and, at most, one
                    badge beside it (limit used, reserved, monthly salary).
                    Bars, lists and buttons live behind the header actions so
                    the grid stays even. */}
                <div className="mt-3 flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className={`whitespace-nowrap font-serif text-2xl font-semibold tabular-nums ${!isCC && a.balance < 0 ? 'text-destructive' : ''}`}>
                      <Money value={isCC ? owed : a.balance} />
                    </span>
                    {isCC && <span className="text-xs text-muted-foreground">owed</span>}
                  </span>
                  {isCC && a.credit_limit ? (
                    <DateBadge tone={utilization > 80 ? 'alert' : 'neutral'}>
                      {formatPercent(utilization)} of <Money value={a.credit_limit} />
                    </DateBadge>
                  ) : a.type === 'salary' && a.salary_amount > 0 ? (
                    <DateBadge><span><Money value={a.salary_amount} />/mo{a.salary_day ? ` · day ${a.salary_day}` : ''}</span></DateBadge>
                  ) : acctSavings.length > 0 ? (
                    <button type="button" onClick={() => setSavingsAcct(a)} className="shrink-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]">
                      <DateBadge tone={reservedTotal > a.balance ? 'alert' : 'neutral'}><Money value={reservedTotal} /> reserved</DateBadge>
                    </button>
                  ) : null}
                </div>
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
        onAutosaved={reload}
      />
      {crediting && (
        <SalaryDialog account={crediting} categories={categories} onClose={() => setCrediting(null)} onDone={reload} />
      )}
      <SavingsDialog
        account={savingsAcct}
        savings={savings.filter((s) => savingsAcct && s.account_id === savingsAcct.id)}
        onClose={() => { setSavingsAcct(null); finance.listSavings().then(setSavings).catch(() => {}); }}
      />
    </div>
  );
}

// The account editor's fields as one value: autosave diffs it, Undo restores it.
interface AccountValues {
  name: string; type: AcctType; institution: string; openingBalance: string;
  creditLimit: string; statementDay: string; dueDay: string;
  cashbackType: CashType; cashbackValue: string; salaryAmount: string; salaryDay: string;
  matchHints: string; color: string; archived: boolean;
}

function accountValues(account: FinAccount): AccountValues {
  return {
    name: account.name,
    type: account.type,
    institution: account.institution,
    openingBalance: String(account.opening_balance),
    creditLimit: account.credit_limit != null ? String(account.credit_limit) : '',
    statementDay: account.statement_day != null ? String(account.statement_day) : '',
    dueDay: account.due_day != null ? String(account.due_day) : '',
    cashbackType: account.cashback_type,
    cashbackValue: String(account.cashback_value),
    salaryAmount: String(account.salary_amount ?? 0),
    salaryDay: account.salary_day != null ? String(account.salary_day) : '',
    matchHints: account.match_hints || '',
    color: account.color,
    archived: account.archived,
  };
}

function accountDraft(v: AccountValues): AccountDraft {
  const data: AccountDraft = {
    name: v.name.trim(),
    type: v.type,
    institution: v.institution.trim(),
    opening_balance: parseFloat(v.openingBalance) || 0,
    cashback_type: v.type === 'credit_card' ? v.cashbackType : 'none',
    cashback_value: parseFloat(v.cashbackValue) || 0,
    match_hints: v.matchHints.trim(),
    color: v.color,
  };
  if (v.type === 'credit_card') {
    data.credit_limit = v.creditLimit ? parseFloat(v.creditLimit) : 0;
    data.statement_day = v.statementDay ? parseInt(v.statementDay) : null;
    data.due_day = v.dueDay ? parseInt(v.dueDay) : null;
  }
  if (v.type === 'salary') {
    data.salary_amount = parseFloat(v.salaryAmount) || 0;
    if (v.salaryDay) data.salary_day = parseInt(v.salaryDay);
  }
  return data;
}

function AccountDialog({ open, account, onClose, onSaved, onAutosaved }: {
  open: boolean;
  account: FinAccount | null;
  onClose: () => void;
  onSaved: () => void;
  /** An edit saved while the dialog stays open: refresh, keep editing. */
  onAutosaved?: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<AcctType>('savings');
  const [institution, setInstitution] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [creditLimit, setCreditLimit] = useState('');
  const [statementDay, setStatementDay] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [cashbackType, setCashbackType] = useState<CashType>('none');
  const [cashbackValue, setCashbackValue] = useState('0');
  const [salaryAmount, setSalaryAmount] = useState('0');
  const [salaryDay, setSalaryDay] = useState('');
  const [matchHints, setMatchHints] = useState('');
  const [color, setColor] = useState(ACCOUNT_COLORS[0]);
  const [archived, setArchived] = useState(false);

  const values: AccountValues = {
    name, type, institution, openingBalance, creditLimit, statementDay, dueDay,
    cashbackType, cashbackValue, salaryAmount, salaryDay, matchHints, color, archived,
  };
  const apply = (v: AccountValues) => {
    setName(v.name); setType(v.type); setInstitution(v.institution); setOpeningBalance(v.openingBalance);
    setCreditLimit(v.creditLimit); setStatementDay(v.statementDay); setDueDay(v.dueDay);
    setCashbackType(v.cashbackType); setCashbackValue(v.cashbackValue);
    setSalaryAmount(v.salaryAmount); setSalaryDay(v.salaryDay); setMatchHints(v.matchHints);
    setColor(v.color); setArchived(v.archived);
  };
  // Edits save themselves; a new account is created explicitly.
  const autosave = useEditorAutosave({
    key: open && account ? account.id : null,
    value: values,
    apply,
    invalid: name.trim() ? null : 'an account needs a name.',
    save: async (v) => {
      if (!account) return;
      await finance.updateAccount(account.id, { ...accountDraft(v), archived: v.archived });
      onAutosaved?.();
    },
  });
  const loadAutosave = autosave.load;
  const requestClose = () => autosave.close(onClose);

  useEffect(() => {
    if (account) {
      const v = accountValues(account);
      apply(v);
      loadAutosave(v);
    } else {
      setName(''); setType('savings'); setInstitution(''); setOpeningBalance('0');
      setCreditLimit(''); setStatementDay(''); setDueDay('');
      setCashbackType('none'); setCashbackValue('0');
      setSalaryAmount('0'); setSalaryDay(''); setMatchHints('');
      setColor(ACCOUNT_COLORS[0]); setArchived(false);
    }
    // Keyed on the dialog opening, not on the setters (stable) or loadAutosave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, open]);

  const save = async () => {
    if (account) { requestClose(); return; }
    if (!name.trim()) return;
    await finance.createAccount(accountDraft(values));
    onSaved();
  };

  const remove = async () => {
    if (!account) return;
    if (!(await confirmDialog('Delete this account? Transactions on it will also be removed.'))) return;
    autosave.cancel();
    await finance.deleteAccount(account.id);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && requestClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex-row items-baseline justify-between gap-3">
          <DialogTitle>{account ? 'Edit account' : 'New account'}</DialogTitle>
          {account && <AutosaveStatus status={autosave.status} />}
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name" className="sm:col-span-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HDFC Savings" />
          </Field>
          <Field label="Type">
            <Select value={type} onValueChange={(v) => setType((v as AcctType) || 'savings')} items={ACCOUNT_TYPES}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              {/* Custom color — native picker, gives full freedom beyond the presets. */}
              <label
                className={`relative size-7 rounded-md cursor-pointer grid place-items-center transition-transform ${
                  ACCOUNT_COLORS.includes(color)
                    ? 'border border-dashed border-[hsl(var(--outline))]'
                    : 'ring-2 ring-ring scale-110'
                }`}
                style={!ACCOUNT_COLORS.includes(color) ? { backgroundColor: color } : undefined}
                title="Custom color"
              >
                {ACCOUNT_COLORS.includes(color) && <Plus className="size-3.5 text-muted-foreground" />}
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="absolute inset-0 size-full opacity-0 cursor-pointer"
                />
              </label>
            </div>
          </Field>

          <Field label="SMS match (for shared messages)" className="sm:col-span-2">
            <Input
              value={matchHints}
              onChange={(e) => setMatchHints(e.target.value)}
              placeholder="e.g. 7744, HDFC"
            />
            <p className="text-xs text-muted-foreground">
              Last 4 digits / bank name from this account's bank &amp; UPI SMS, comma-separated. When you share a
              transaction message, Sajni auto-selects this account if the text mentions any of these.
            </p>
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
                <Select value={cashbackType} onValueChange={(v) => setCashbackType((v as CashType) || 'none')}
                  items={[{ value: 'none', label: 'None' }, { value: 'percentage', label: 'Percentage' }, { value: 'fixed', label: 'Fixed' }]}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    <SelectItem value="fixed">Fixed</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {cashbackType !== 'none' && (
                <Field label={cashbackType === 'percentage' ? 'Cashback %' : 'Cashback amount'}>
                  <Input type="number" inputMode="decimal" value={cashbackValue} onChange={(e) => setCashbackValue(e.target.value)} />
                </Field>
              )}
            </>
          )}
          {type === 'salary' && (
            <>
              <Field label="Monthly salary">
                <Input type="number" inputMode="decimal" value={salaryAmount} onChange={(e) => setSalaryAmount(e.target.value)} placeholder="e.g. 90000" />
              </Field>
              <Field label="Salary day">
                <Input type="number" inputMode="numeric" min={1} max={31} value={salaryDay} onChange={(e) => setSalaryDay(e.target.value)} placeholder="e.g. 1" />
              </Field>
            </>
          )}
          {account && (
            <div className="sm:col-span-2 flex items-center justify-between gap-3 rounded-xl p-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">Archived</div>
                <div className="text-xs text-muted-foreground">Hide from the active view. Balance &amp; history stay intact.</div>
              </div>
              <Switch checked={archived} onCheckedChange={(c) => setArchived(c)} />
            </div>
          )}
        </div>
        <DialogFooter className="flex-row items-center justify-between">
          {account ? (
            <Button variant="destructive-quiet" onClick={remove}>
              <Trash2 className="size-4 mr-1" /> Delete
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            {account ? (
              <EditActions changed={autosave.changed} onUndo={autosave.undo} onDone={requestClose} />
            ) : (
              <>
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button onClick={save}>Create</Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && <Label className="font-mono text-xs label-kicker text-muted-foreground">{label}</Label>}
      {children}
    </div>
  );
}

// Salary accounts get one-tap inflow controls right on the card: "Credit
// salary" posts the stored monthly amount as income (categorized Salary),
// and "Bonus" posts an ad-hoc amount. Both are plain income transactions —
// no cron, deterministic, matches the manual-credit decision.
function SalaryDialog({ account, categories, onClose, onDone }: {
  account: FinAccount;
  categories: FinCategory[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { formatMoney } = useFinanceFormatters();
  const salary = account.salary_amount || 0;
  const [kind, setKind] = useState<'Salary' | 'Bonus'>(salary > 0 ? 'Salary' : 'Bonus');
  const [amount, setAmount] = useState(salary > 0 ? String(salary) : '');
  const [busy, setBusy] = useState(false);
  const salaryCat = categories.find((c) => c.kind === 'income' && c.name.toLowerCase() === 'salary');
  const value = parseFloat(amount);

  const submit = async () => {
    if (!(value > 0) || busy) return;
    setBusy(true);
    try {
      await finance.createTransaction({
        account_id: account.id,
        type: 'income',
        amount: value,
        description: kind,
        txn_at: new Date().toISOString(),
        category_id: salaryCat ? salaryCat.id : null,
      });
      toast.success(`${kind} of ${formatMoney(value)} credited`);
      onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message || 'Could not credit');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Credit {account.name}</DialogTitle></DialogHeader>
        <div className="flex gap-2">
          {(['Salary', 'Bonus'] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              className={`chip ${kind === k ? 'chip-selected' : ''}`}
              onClick={() => { setKind(k); setAmount(k === 'Salary' && salary > 0 ? String(salary) : ''); }}
            >
              {k}
            </button>
          ))}
        </div>
        <Input
          type="number"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
          placeholder="Amount"
          aria-label="Amount"
          autoFocus
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !(value > 0)}>Credit {kind.toLowerCase()}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    if (!(await confirmDialog('Delete this savings bucket?'))) return;
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

  const reservedTotal = sumMoney(list, (b) => b.current_amount);
  const overReserved = reservedTotal > account.balance;

  return (
    <Dialog open={!!account} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reserved on {account.name}</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground -mt-2">
          Buckets are virtual. Money stays in the account. Reserved <Money value={reservedTotal} /> of <Money value={account.balance} /> balance.
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
                    <Button variant="destructive-ghost" size="icon-sm" onClick={() => remove(s.id)} aria-label="Delete"><Trash2 className="size-3.5" /></Button>
                  </div>
                </div>
                <div className="font-mono text-xs tabular-nums text-muted-foreground mt-1">
                  <Money value={s.current_amount} />{s.target_amount > 0 && <> / <Money value={s.target_amount} /></>}
                </div>
                {s.target_amount > 0 && (
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                    <div className="h-full" style={{ width: pct + '%', backgroundColor: s.color }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="border-t border-border pt-3 mt-1">
          <div className="font-mono text-xs label-kicker text-muted-foreground mb-2">
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
