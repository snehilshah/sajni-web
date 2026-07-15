import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO, differenceInDays } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import {
  Receipt, Plus, Trash2, Zap, CalendarClock, CheckCircle2, Pencil, Archive,
} from '@/components/ui/icons';

import {
  finance,
  type FinAccount, type FinCategory, type FinBiller, type FinTransaction,
  type BillerFrequency, type BillerKind,
} from '@/api';
import { useFinBillers, useBillerPayments } from '@/queries/finance';
import { qk } from '@/queries/keys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SegmentedButton } from '@/components/ui/segmented-button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { confirmDialog } from '@/lib/confirm';
import { msg } from '@/lib/errors';
import { useFinanceFormatters } from './useFinancePrivacy';
import { formatTxnDate } from './utils';
import { cn } from '@/lib/utils';

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

// A bill's amount is only an estimate (may be 0 = unknown); the last actual
// payment is the better guess where we have one.
const effectiveAmount = (b: FinBiller) =>
  b.kind === 'bill' ? (b.last_paid_amount ?? 0) || b.amount : b.amount;

export default function BillersTab({ accounts, categories }: Props) {
  const { formatMoney } = useFinanceFormatters();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<FinBiller | null>(null);
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // List comes from the shared cache, so manual writes AND AI biller_ events
  // (bridged to qk.finance.all by InvalidateBridge) both refresh it.
  const { data: billers = [], isLoading } = useFinBillers(showArchived);
  const refresh = () => qc.invalidateQueries({ queryKey: qk.finance.all });

  const detail = billers.find((b) => b.id === detailId) || null;

  const monthlyOutflow = useMemo(() => {
    return billers.reduce((sum, b) => {
      if (b.archived) return sum;
      const amt = effectiveAmount(b);
      const f = b.frequency;
      const monthly =
        f === 'weekly' ? amt * 4.33 :
        f === 'fortnightly' ? amt * 2.17 :
        f === 'bimonthly' ? amt / 2 :
        amt;
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

      <section className="flex flex-col gap-2">
        {billers.length === 0 ? (
          isLoading ? (
            <div className="text-xs text-muted-foreground text-center py-8">Loading…</div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
              Nothing tracked yet. Add subscriptions (Netflix, rent — fixed amount)
              and bills (electricity — amount varies) to see them here.
            </div>
          )
        ) : (
          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {billers.map((b) => (
                <BillerRow
                  key={b.id}
                  biller={b}
                  accounts={accounts}
                  onOpen={() => setDetailId(b.id)}
                  onPaid={refresh}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>

      <BillerDialog
        open={creating || !!editing}
        biller={editing}
        accounts={accounts}
        categories={categories}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { setCreating(false); setEditing(null); refresh(); }}
      />

      <BillerDetailSheet
        biller={detail}
        accounts={accounts}
        categories={categories}
        onClose={() => setDetailId(null)}
        onEdit={() => { setEditing(detail); setDetailId(null); }}
        onChanged={refresh}
        onGone={() => { setDetailId(null); refresh(); }}
      />
    </div>
  );
}

// ─── Row ────────────────────────────────────────────────────────────────────

function BillerRow({
  biller, accounts, onOpen, onPaid,
}: {
  biller: FinBiller;
  accounts: FinAccount[];
  onOpen: () => void;
  onPaid: () => void;
}) {
  const { formatMoney } = useFinanceFormatters();
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

  return (
    <motion.li
      layout
      initial={{ opacity: 0, transform: 'translateY(4px)' }}
      animate={{ opacity: 1, transform: 'translateY(0)' }}
      exit={{ opacity: 0, transform: 'translateY(-4px)' }}
      className={cn(
        'rounded-xl border border-border bg-card flex items-center gap-3 p-3 md:p-4 transition-colors',
        biller.archived && 'opacity-60',
      )}
    >
      {/* Main body opens the detail sheet */}
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-1 min-w-0 items-center gap-3 text-left outline-none rounded-lg focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] tap-highlight-none"
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
            <KindBadge kind={biller.kind} />
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
          <div className="font-mono font-semibold tabular-nums text-sm">
            {biller.kind === 'bill' && !(biller.amount > 0)
              ? (biller.last_paid_amount != null ? `~${formatMoney(biller.last_paid_amount)}` : '—')
              : formatMoney(biller.amount)}
          </div>
          <div
            className={`text-xs font-mono tabular-nums mt-0.5 inline-flex items-center gap-1 ${
              overdue ? 'text-destructive' : soon ? 'text-[hsl(var(--tertiary))]' : 'text-muted-foreground'
            }`}
          >
            <CalendarClock className="size-3" />
            {dueLabel} · {format(due, 'd MMM')}
          </div>
        </div>
      </button>

      {!biller.archived && <PayPopover biller={biller} onPaid={onPaid} />}
    </motion.li>
  );
}

function KindBadge({ kind }: { kind: BillerKind }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider',
        kind === 'subscription'
          ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]'
          : 'bg-[hsl(var(--surface-container-highest))] text-muted-foreground',
      )}
    >
      {kind === 'subscription' ? 'sub' : 'bill'}
    </span>
  );
}

// ─── Pay popover: record a payment OR attach existing transactions ─────────

function PayPopover({ biller, onPaid }: { biller: FinBiller; onPaid: () => void }) {
  const { formatMoney } = useFinanceFormatters();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'record' | 'attach'>('record');
  const [amount, setAmount] = useState('');
  const [paidDate, setPaidDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [busy, setBusy] = useState(false);

  // Attach mode: recent expenses, fetched on first open.
  const [recent, setRecent] = useState<FinTransaction[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) return;
    setMode('record');
    // Bills ask for the actual amount (best guess = last paid, else estimate);
    // subscriptions prefill the fixed amount.
    const guess = biller.kind === 'bill' ? (biller.last_paid_amount ?? 0) || biller.amount : biller.amount;
    setAmount(guess > 0 ? String(guess) : '');
    setPaidDate(format(new Date(), 'yyyy-MM-dd'));
    setPicked(new Set());
    finance.listTransactions({ type: 'expense', limit: 20 })
      .then(setRecent)
      .catch(() => setRecent([]));
  }, [open, biller]);

  const done = (r: { already_paid: boolean }) => {
    if (r.already_paid) toast.info('This cycle was already recorded — due date rolled forward.');
    else toast.success(`${biller.name} marked paid`);
    setOpen(false);
    onPaid();
  };

  const record = async () => {
    const amt = parseFloat(amount);
    if (biller.kind === 'bill' && !(amt > 0)) { toast.error('Enter the actual amount'); return; }
    setBusy(true);
    try {
      done(await finance.payBiller(biller.id, {
        paid_date: paidDate,
        ...(amt > 0 ? { amount: amt } : {}),
      }));
    } catch (e) { toast.error(msg(e)); } finally { setBusy(false); }
  };

  const attach = async () => {
    if (picked.size === 0) return;
    setBusy(true);
    try {
      done(await finance.payBiller(biller.id, {
        paid_date: paidDate,
        attach_txn_ids: Array.from(picked),
      }));
    } catch (e) { toast.error(msg(e)); } finally { setBusy(false); }
  };

  const pickedSum = recent
    ? recent.filter((t) => picked.has(t.id)).reduce((s, t) => s + t.amount, 0)
    : 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        title="Mark this cycle as paid"
        aria-label={`Mark ${biller.name} paid`}
        className="size-11 shrink-0 grid place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-[hsl(var(--on-surface)/0.08)] hover:text-primary focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
      >
        <CheckCircle2 className="size-4.5" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Mark “{biller.name}” paid</span>
          <span className="text-xs text-muted-foreground font-mono">
            cycle due {format(parseISO(biller.next_due_date), 'd MMM')}
          </span>
        </div>

        <SegmentedButton
          value={mode}
          onChange={setMode}
          stretch
          size="sm"
          aria-label="Payment recording mode"
          options={[
            { value: 'record', label: 'Record payment' },
            { value: 'attach', label: 'Attach existing' },
          ]}
        />

        {mode === 'record' ? (
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                {biller.kind === 'bill' ? 'Actual amount' : 'Amount'}
              </Label>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="0"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Paid on</Label>
              <DatePicker value={paidDate} onChange={(d) => d && setPaidDate(d)} />
            </div>
            <p className="text-xs text-muted-foreground">
              {biller.account_id
                ? 'Posts an expense from the linked account.'
                : 'No linked account — pick one on the biller to post a transaction.'}
            </p>
            <Button onClick={record} disabled={busy || !biller.account_id} className="w-full">
              {busy ? 'Saving…' : 'Record payment'}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {recent === null ? (
              <div className="text-xs text-muted-foreground py-4 text-center">Loading recent expenses…</div>
            ) : recent.length === 0 ? (
              <div className="text-xs text-muted-foreground py-4 text-center">No recent expenses to attach.</div>
            ) : (
              <div className="max-h-56 overflow-y-auto -mx-1 px-1 flex flex-col">
                {recent.map((t) => (
                  <label
                    key={t.id}
                    className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-[hsl(var(--on-surface)/0.06)]"
                  >
                    <Checkbox
                      checked={picked.has(t.id)}
                      onCheckedChange={(c) => {
                        setPicked((prev) => {
                          const next = new Set(prev);
                          if (c === true) next.add(t.id); else next.delete(t.id);
                          return next;
                        });
                      }}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate text-sm">{t.description || t.category_name || 'Expense'}</span>
                      <span className="block font-mono text-xs text-muted-foreground truncate">
                        {formatTxnDate(t.txn_at)} · {t.account_name}
                      </span>
                    </span>
                    <span className="font-mono text-xs tabular-nums shrink-0">{formatMoney(t.amount)}</span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Links transactions you already logged — nothing new is posted.
            </p>
            <Button onClick={attach} disabled={busy || picked.size === 0} className="w-full">
              {busy ? 'Saving…' : picked.size === 0 ? 'Attach' : `Attach ${picked.size} · ${formatMoney(pickedSum)}`}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── Detail sheet: full biller + payment history ────────────────────────────

function BillerDetailSheet({
  biller, accounts, categories, onClose, onEdit, onChanged, onGone,
}: {
  biller: FinBiller | null;
  accounts: FinAccount[];
  categories: FinCategory[];
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => void;
  onGone: () => void;
}) {
  const { formatMoney } = useFinanceFormatters();
  const open = biller !== null;
  const { data: payments = [], isLoading } = useBillerPayments(biller?.id ?? 0, open);

  const acct = biller ? accounts.find((a) => a.id === biller.account_id) : null;
  const cat = biller ? categories.find((c) => c.id === biller.category_id) : null;

  const archive = async () => {
    if (!biller) return;
    try {
      await finance.updateBiller(biller.id, { archived: !biller.archived });
      onChanged();
    } catch (e) { toast.error(msg(e)); }
  };

  const remove = async () => {
    if (!biller) return;
    if (!(await confirmDialog('Delete this biller? Its payment history and posted transactions stay.'))) return;
    try {
      await finance.deleteBiller(biller.id);
      onGone();
    } catch (e) { toast.error(msg(e)); }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="!max-w-md w-full flex flex-col p-0 gap-0">
        {biller && (
          <>
            <SheetHeader className="border-b border-border px-5 py-4">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="size-10 rounded-lg shrink-0 grid place-items-center text-white"
                  style={{ background: biller.color }}
                >
                  <Receipt className="size-5" />
                </span>
                <div className="min-w-0">
                  <SheetTitle className="truncate text-left">{biller.name}</SheetTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <KindBadge kind={biller.kind} />
                    {biller.auto_renew && (
                      <span className="inline-flex items-center gap-0.5 text-xs font-mono uppercase tracking-wider text-primary">
                        <Zap className="size-3" /> auto-renews
                      </span>
                    )}
                    {biller.archived && (
                      <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">archived</span>
                    )}
                  </div>
                </div>
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
              {/* Amount + next due */}
              <div className="rounded-xl border border-border bg-[hsl(var(--surface-container-low))] p-4">
                <div className="font-serif text-2xl font-semibold tabular-nums">
                  {biller.kind === 'bill' && !(biller.amount > 0)
                    ? (biller.last_paid_amount != null ? `~${formatMoney(biller.last_paid_amount)}` : '—')
                    : formatMoney(biller.amount)}
                  {biller.kind === 'bill' && (
                    <span className="ml-2 align-middle text-xs font-sans font-normal text-muted-foreground">
                      varies each cycle
                    </span>
                  )}
                </div>
                <div className="font-mono text-xs text-muted-foreground mt-1">
                  {FREQ_LABEL[biller.frequency]} · next due {format(parseISO(biller.next_due_date), 'd MMM yyyy')}
                </div>
              </div>

              {/* Details */}
              <section>
                <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">Details</h3>
                <dl className="rounded-xl border border-border divide-y divide-border text-sm">
                  <DetailRow label="Paid from" value={acct?.name || '—'} />
                  <DetailRow label="Category" value={cat?.name || '—'} />
                  <DetailRow label="Reminder task" value={biller.remind_task ? 'On' : 'Off'} />
                  <DetailRow label="Alert" value={`${biller.alert_days}d before due`} />
                  {biller.notes && <DetailRow label="Notes" value={biller.notes} />}
                </dl>
              </section>

              {/* Payment history */}
              <section>
                <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">
                  Payment history
                </h3>
                {isLoading ? (
                  <div className="text-xs text-muted-foreground py-4 text-center">Loading…</div>
                ) : payments.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    No payments recorded yet.
                  </div>
                ) : (
                  <ul className="rounded-xl border border-border divide-y divide-border">
                    {payments.map((p) => (
                      <li key={p.id} className="px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm">
                            {format(parseISO(p.paid_date), 'd MMM yyyy')}
                            {p.auto && (
                              <span className="ml-2 inline-flex items-center gap-0.5 text-xs font-mono uppercase tracking-wider text-primary">
                                <Zap className="size-3" /> auto
                              </span>
                            )}
                          </span>
                          <span className="font-mono text-sm tabular-nums">{formatMoney(p.amount)}</span>
                        </div>
                        <div className="font-mono text-xs text-muted-foreground mt-0.5">
                          cycle due {format(parseISO(p.due_date), 'd MMM')}
                        </div>
                        {p.txns.length > 0 && (
                          <ul className="mt-1.5 flex flex-col gap-1">
                            {p.txns.map((t) => (
                              <li key={t.id} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                <span className="truncate">
                                  ↳ {t.description || 'Transaction'}{t.account_name ? ` · ${t.account_name}` : ''}
                                </span>
                                <span className="font-mono tabular-nums shrink-0">{formatMoney(t.amount)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <div className="border-t border-border px-5 py-3 flex items-center justify-between gap-2">
              <Button variant="ghost" className="text-destructive" onClick={remove}>
                <Trash2 className="size-4 mr-1" /> Delete
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={archive}>
                  <Archive className="size-4 mr-1" /> {biller.archived ? 'Unarchive' : 'Archive'}
                </Button>
                <Button onClick={onEdit}>
                  <Pencil className="size-4 mr-1" /> Edit
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2.5">
      <dt className="text-xs font-mono uppercase tracking-wider text-muted-foreground shrink-0 pt-0.5">{label}</dt>
      <dd className="text-sm text-right min-w-0 break-words">{value}</dd>
    </div>
  );
}

// ─── Create / edit dialog ───────────────────────────────────────────────────

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
  const [kind, setKind] = useState<BillerKind>('subscription');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<BillerFrequency>('monthly');
  const [nextDueDate, setNextDueDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [accountID, setAccountID] = useState<number | null>(null);
  const [categoryID, setCategoryID] = useState<number | null>(null);
  const [autoRenew, setAutoRenew] = useState(false);
  const [remindTask, setRemindTask] = useState(false);
  const [alertDays, setAlertDays] = useState(3);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (biller) {
      setName(biller.name);
      setKind(biller.kind);
      setAmount(biller.amount > 0 ? String(biller.amount) : '');
      setFrequency(biller.frequency);
      setNextDueDate(biller.next_due_date);
      setAccountID(biller.account_id);
      setCategoryID(biller.category_id);
      setAutoRenew(biller.auto_renew);
      setRemindTask(biller.remind_task);
      setAlertDays(biller.alert_days);
      setNotes(biller.notes);
    } else {
      setName('');
      setKind('subscription');
      setAmount('');
      setFrequency('monthly');
      setNextDueDate(format(new Date(), 'yyyy-MM-dd'));
      setAccountID(null);
      setCategoryID(null);
      setAutoRenew(false);
      setRemindTask(false);
      setAlertDays(3);
      setNotes('');
    }
  }, [open, biller]);

  const canSubmit = name.trim() !== '' && (kind === 'bill' || parseFloat(amount) > 0);

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const payload: Partial<FinBiller> = {
        name: name.trim(),
        kind,
        amount: parseFloat(amount) || 0,
        frequency,
        next_due_date: nextDueDate,
        account_id: accountID,
        category_id: categoryID,
        // Bills never auto-renew (amount is unknown until paid).
        auto_renew: kind === 'subscription' && autoRenew,
        // Auto-renew self-pays, so a manual bill-pay reminder is moot there.
        remind_task: remindTask && !(kind === 'subscription' && autoRenew),
        alert_days: alertDays,
        notes,
      };
      if (biller) await finance.updateBiller(biller.id, payload);
      else await finance.createBiller(payload);
      onSaved();
    } catch (e) {
      console.error(e);
      toast.error(msg(e) || 'Save failed');
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
          <SegmentedButton
            value={kind}
            onChange={(k) => setKind(k)}
            stretch
            aria-label="Biller kind"
            options={[
              { value: 'subscription', label: 'Subscription' },
              { value: 'bill', label: 'Bill' },
            ]}
          />
          <p className="text-xs text-muted-foreground -mt-1">
            {kind === 'subscription'
              ? 'Fixed amount each cycle — Netflix, rent, EMI. Can auto-pay itself.'
              : 'Amount varies each cycle — electricity, water. You enter the actual when you pay.'}
          </p>

          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === 'subscription' ? 'Netflix' : 'Electricity'}
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={kind === 'subscription' ? 'Amount' : 'Estimate (optional)'}>
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
          {kind === 'bill' && (
            <p className="text-xs text-muted-foreground -mt-1.5">
              Used for the monthly-outflow estimate until a real payment sets the baseline.
            </p>
          )}

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
            {kind === 'subscription' && (
              <CheckRow
                label="Auto-pay"
                desc="Post the expense automatically each cycle — renews on its own, no manual pay."
                checked={autoRenew}
                onChange={setAutoRenew}
                disabled={accountID == null}
                disabledReason="pick an account first"
              />
            )}
            <CheckRow
              label="Remind me to pay"
              desc="Each cycle, create a 'Pay …' task + email near the due date."
              checked={remindTask && !(kind === 'subscription' && autoRenew)}
              onChange={setRemindTask}
              disabled={kind === 'subscription' && autoRenew}
              disabledReason="auto-pay handles this"
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
          <Button onClick={submit} disabled={saving || !canSubmit}>
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
// so it's obvious WHY the option can't be picked.
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
            <span className="text-xs font-mono uppercase tracking-wider text-[hsl(var(--tertiary))]">
              · {disabledReason}
            </span>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground mt-1">{desc}</div>
      </div>
    </label>
  );
}
