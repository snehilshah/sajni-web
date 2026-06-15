import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO, differenceInDays } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import {
  Receipt, Plus, Trash2, Zap, CalendarClock, CheckCircle2, Pencil,
} from '@/components/ui/icons';

import {
  finance,
  type FinAccount, type FinCategory, type FinBiller, type BillerFrequency,
} from '@/api';
import { useFinBillers } from '@/queries/finance';
import { qk } from '@/queries/keys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { confirmDialog } from '@/lib/confirm';
import { formatMoney } from './utils';

interface Props {
  accounts: FinAccount[];
  categories: FinCategory[];
}

const FREQ_LABEL: Record<BillerFrequency, string> = {
  weekly: 'Weekly',
  fortnightly: 'Every 2 weeks',
  monthly: 'Monthly',
  bimonthly: 'Every 2 months',
};

export default function BillersTab({ accounts, categories }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<FinBiller | null>(null);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // List comes from the shared cache, so manual writes AND AI biller_ events
  // (bridged to qk.finance.all by InvalidateBridge) both refresh it.
  const { data: billers = [], isLoading } = useFinBillers(showArchived);
  const refresh = () => qc.invalidateQueries({ queryKey: qk.finance.all });

  const monthlyOutflow = useMemo(() => {
    return billers.reduce((sum, b) => {
      const f = b.frequency;
      const monthly =
        f === 'weekly' ? b.amount * 4.33 :
        f === 'fortnightly' ? b.amount * 2.17 :
        f === 'bimonthly' ? b.amount / 2 :
        b.amount;
      return sum + monthly;
    }, 0);
  }, [billers]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="serif text-lg font-semibold">Billers</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Estimated monthly outflow{' '}
            <span className="text-foreground font-mono tabular-nums">{formatMoney(monthlyOutflow)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            {showArchived ? 'Hide archived' : 'Show archived'}
          </button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" /> New
          </Button>
        </div>
      </header>

      <Section
        title="Bills"
        icon={Receipt}
        items={billers}
        accounts={accounts}
        onEdit={setEditing}
        onPaid={refresh}
        onChanged={refresh}
        emptyHint="Nothing tracked yet. Add rent, utilities, EMIs, subscriptions and any recurring charge."
      />

      {isLoading && billers.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-8">Loading…</div>
      ) : null}

      <BillerDialog
        open={creating || !!editing}
        biller={editing}
        accounts={accounts}
        categories={categories}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { setCreating(false); setEditing(null); refresh(); }}
      />
    </div>
  );
}

function Section({
  title, icon: Icon, items, accounts, onEdit, onPaid, onChanged, emptyHint,
}: {
  title: string;
  icon: typeof Receipt;
  items: FinBiller[];
  accounts: FinAccount[];
  onEdit: (b: FinBiller) => void;
  onPaid: () => void;
  onChanged: () => void;
  emptyHint: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3" />
        <span>{title}</span>
        <span className="tabular-nums">· {items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
          {emptyHint}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {items.map((b) => (
              <BillerRow
                key={b.id}
                biller={b}
                accounts={accounts}
                onEdit={() => onEdit(b)}
                onPaid={onPaid}
                onChanged={onChanged}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

function BillerRow({
  biller, accounts, onEdit, onPaid, onChanged,
}: {
  biller: FinBiller;
  accounts: FinAccount[];
  onEdit: () => void;
  onPaid: () => void;
  onChanged: () => void;
}) {
  const due = parseISO(biller.next_due_date);
  const daysAway = differenceInDays(due, new Date());
  const overdue = daysAway < 0;
  const soon = daysAway >= 0 && daysAway <= biller.alert_days;
  const acct = accounts.find((a) => a.id === biller.account_id) || null;

  const dueLabel =
    overdue ? `Overdue · ${Math.abs(daysAway)}d` :
    daysAway === 0 ? 'Due today' :
    daysAway === 1 ? 'Due tomorrow' :
    `Due in ${daysAway}d`;

  const pay = async () => {
    try {
      await finance.payBiller(biller.id);
      onPaid();
    } catch (e) {
      console.error(e);
    }
  };

  const remove = async () => {
    if (!(await confirmDialog('Delete this biller? Existing payment history stays.'))) return;
    try {
      await finance.deleteBiller(biller.id);
      onChanged();
    } catch (e) { console.error(e); }
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="rounded-xl border border-border bg-card flex items-center gap-3 p-3 md:p-4"
    >
      <span
        aria-hidden
        className="size-9 rounded-md shrink-0 grid place-items-center text-white"
        style={{ background: biller.color }}
      >
        <Receipt className="size-4" />
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-sm truncate">{biller.name}</span>
          {biller.auto_renew ? (
            <span className="inline-flex items-center gap-0.5 text-xs font-mono uppercase tracking-wider text-primary">
              <Zap className="size-3" /> auto
            </span>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground font-mono mt-0.5 flex items-center gap-2 flex-wrap">
          <span>{FREQ_LABEL[biller.frequency]}</span>
          <span>·</span>
          <span>{acct ? acct.name : 'No account'}</span>
        </div>
      </div>

      <div className="text-right shrink-0">
        <div className="font-mono font-semibold tabular-nums text-sm">{formatMoney(biller.amount)}</div>
        <div
          className={`text-xs font-mono tabular-nums mt-0.5 inline-flex items-center gap-1 ${
            overdue ? 'text-destructive' : soon ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
          }`}
        >
          <CalendarClock className="size-3" />
          {dueLabel} · {format(due, 'd MMM')}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={pay}
          disabled={biller.auto_renew}
          title={biller.auto_renew ? 'Auto-renew is enabled' : 'Mark this cycle as paid'}
          className="size-8 grid place-items-center rounded-md hover:bg-accent text-muted-foreground hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <CheckCircle2 className="size-4" />
        </button>
        <button onClick={onEdit} className="size-8 grid place-items-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground">
          <Pencil className="size-4" />
        </button>
        <button onClick={remove} className="size-8 grid place-items-center rounded-md hover:bg-accent text-muted-foreground hover:text-destructive">
          <Trash2 className="size-4" />
        </button>
      </div>
    </motion.li>
  );
}

function BillerDialog({
  open, biller, accounts, categories, onClose, onSaved,
}: {
  open: boolean;
  biller: FinBiller | null;
  accounts: FinAccount[];
  categories: FinCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<BillerFrequency>('monthly');
  const [nextDueDate, setNextDueDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [accountID, setAccountID] = useState<number | null>(null);
  const [categoryID, setCategoryID] = useState<number | null>(null);
  const [autoRenew, setAutoRenew] = useState(false);
  const [remindTask, setRemindTask] = useState(false);
  const [variable, setVariable] = useState(false);
  const [alertDays, setAlertDays] = useState(3);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (biller) {
      setName(biller.name);
      setAmount(String(biller.amount));
      setFrequency(biller.frequency);
      setNextDueDate(biller.next_due_date);
      setAccountID(biller.account_id);
      setCategoryID(biller.category_id);
      setAutoRenew(biller.auto_renew);
      setRemindTask(biller.remind_task);
      setVariable(biller.variable);
      setAlertDays(biller.alert_days);
      setNotes(biller.notes);
    } else {
      setName('');
      setAmount('');
      setFrequency('monthly');
      setNextDueDate(format(new Date(), 'yyyy-MM-dd'));
      setAccountID(null);
      setCategoryID(null);
      setAutoRenew(false);
      setRemindTask(false);
      setVariable(false);
      setAlertDays(3);
      setNotes('');
    }
  }, [open, biller]);

  const submit = async () => {
    if (!name.trim() || !amount) return;
    setSaving(true);
    try {
      const payload: Partial<FinBiller> = {
        name: name.trim(),
        amount: Number(amount),
        frequency,
        next_due_date: nextDueDate,
        account_id: accountID,
        category_id: categoryID,
        auto_renew: autoRenew,
        // Auto-renew self-pays, so a manual bill-pay reminder is moot there.
        remind_task: remindTask && !autoRenew,
        variable,
        alert_days: alertDays,
        notes,
      };
      if (biller) await finance.updateBiller(biller.id, payload);
      else await finance.createBiller(payload);
      onSaved();
    } catch (e) {
      console.error(e);
      toast.error((e as Error).message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{biller ? 'Edit biller' : 'New biller'}</DialogTitle>
        </DialogHeader>

        {/* Tall form — cap height and scroll the fields so the modal never
            runs off-screen; header + footer stay pinned. */}
        <div className="flex flex-col gap-3 mt-2 max-h-[62vh] overflow-y-auto overscroll-contain -mx-1 px-1">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Electricity" autoFocus />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount">
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="0"
              />
            </Field>
            <Field label="Frequency">
              <Select value={frequency} onValueChange={(v) => setFrequency(v as BillerFrequency)}
                items={(Object.keys(FREQ_LABEL) as BillerFrequency[]).map((f) => ({ value: f, label: FREQ_LABEL[f] }))}>
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FREQ_LABEL) as BillerFrequency[]).map((f) => (
                    <SelectItem key={f} value={f}>{FREQ_LABEL[f]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Next due date">
            <DatePicker
              value={nextDueDate}
              onChange={(d) => d && setNextDueDate(d)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Paid from">
              <Select
                value={accountID == null ? 'none' : String(accountID)}
                onValueChange={(v) => setAccountID(v === 'none' ? null : Number(v))}
                items={[{ value: 'none', label: '—' }, ...accounts.map((a) => ({ value: String(a.id), label: a.name }))]}
              >
                <SelectTrigger size="sm">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Category">
              <Select
                value={categoryID == null ? 'none' : String(categoryID)}
                onValueChange={(v) => setCategoryID(v === 'none' ? null : Number(v))}
                items={[{ value: 'none', label: '—' }, ...categories.filter((c) => c.kind === 'expense').map((c) => ({ value: String(c.id), label: c.name }))]}
              >
                <SelectTrigger size="sm">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {categories.filter((c) => c.kind === 'expense').map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="rounded-xl border border-border divide-y divide-border">
            <CheckRow
              label="Auto-renew"
              desc="Auto-post the expense each cycle (works like a subscription — renews on its own, no manual pay)."
              checked={autoRenew}
              onChange={setAutoRenew}
              disabled={accountID == null}
              disabledReason="pick an account first"
            />
            <CheckRow
              label="Remind me to pay"
              desc="Each cycle, create a 'Pay …' task + email near the due date."
              checked={remindTask && !autoRenew}
              onChange={setRemindTask}
              disabled={autoRenew}
              disabledReason="auto-renew handles this"
            />
            <CheckRow
              label="Variable amount"
              desc="Amount isn't fixed (e.g. electricity). Auto-renew uses the last paid amount and flags it."
              checked={variable}
              onChange={setVariable}
            />
          </div>

          <Field label="Alert days · days before due to notify" className="max-w-[260px]">
            <Input
              type="number"
              min={0}
              max={30}
              value={alertDays}
              onChange={(e) => setAlertDays(Number(e.target.value) || 0)}
            />
          </Field>

          <Field label="Notes">
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
            />
          </Field>
        </div>

        <DialogFooter className="mt-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !name.trim() || !amount}>
            {saving ? 'Saving…' : biller ? 'Save changes' : 'Create biller'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={'flex flex-col gap-1 ' + (className || '')}>
      <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

// A labelled toggle row with a description and, when disabled, an inline reason
// so it's obvious WHY the option can't be picked (the prior layout just dimmed
// it with no explanation).
function CheckRow({
  label, desc, checked, onChange, disabled, disabledReason,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <label className={'flex items-start gap-3 p-3 ' + (disabled ? 'opacity-55 cursor-not-allowed' : 'cursor-pointer')}>
      <Checkbox
        checked={checked}
        onCheckedChange={(c) => { if (!disabled) onChange(c === true); }}
        disabled={disabled}
        className="mt-0.5"
      />
      <div className="min-w-0">
        <div className="text-sm font-medium leading-none flex items-center gap-2 flex-wrap">
          {label}
          {disabled && disabledReason ? (
            <span className="text-xs font-mono uppercase tracking-wider text-amber-600 dark:text-amber-400">
              · {disabledReason}
            </span>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground mt-1">{desc}</div>
      </div>
    </label>
  );
}
