import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO, differenceInDays } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Receipt, Plus, Trash2, Zap, CheckCircle2, Pencil, Archive } from '@/components/ui/icons';

import {
  finance,
  type FinAccount,
  type FinCategory,
  type FinBiller,
  type FinTransaction,
  type BillerFrequency,
  type BillerKind,
  type FinRecurringSuggestion,
} from '@/api';
import { useFinBillers, useBillerPayments } from '@/queries/finance';
import { qk } from '@/queries/keys';
import { Button } from '@/components/ui/button';
import { DateBadge } from '@/components/ui/state-chip';
import { Input } from '@/components/ui/input';
import { IntInput } from '@/components/ui/int-input';
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
import { failureText } from '@/lib/errors';
import { useFinanceFormatters } from './useFinancePrivacy';
import { formatTxnDate, sumMoney } from './utils';
import { cn } from '@/lib/utils';
import { Money } from './Money';
import { useEditorDraft } from '@/hooks/use-editor-draft';
import { EditActions } from '@/components/editor-actions';

interface Props {
  accounts: FinAccount[];
  categories: FinCategory[];
  enabled: boolean;
}

const FREQ_LABEL: Record<BillerFrequency, string> = {
  weekly: 'Weekly',
  fortnightly: 'Every 2 weeks',
  monthly: 'Monthly',
  bimonthly: 'Every 2 months',
  quarterly: 'Every 3 months',
  yearly: 'Yearly',
};

// A bill's amount is only an estimate (may be 0 = unknown); the last actual
// payment is the better guess where we have one.
const effectiveAmount = (b: FinBiller) => (b.kind === 'bill' ? (b.last_paid_amount ?? 0) || b.amount : b.amount);

export default function BillersTab({ accounts, categories, enabled }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<FinBiller | null>(null);
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // List comes from the shared cache, so manual writes AND AI biller_ events
  // (bridged to qk.finance.all by InvalidateBridge) both refresh it.
  const { data: billers = [], isLoading } = useFinBillers(showArchived, enabled);
  const refreshBillers = () => {
    qc.invalidateQueries({ queryKey: ['finance', 'billers'] });
    qc.invalidateQueries({ queryKey: qk.finance.overview() });
  };
  // Paying a bill can create/attach a transaction and change balances,
  // budgets, slate totals, payment history and the overview.
  const refreshAfterPayment = () => qc.invalidateQueries({ queryKey: qk.finance.all });

  const detail = billers.find((b) => b.id === detailId) || null;
  // "Looks like it repeats": monthly payments that aren't items yet.
  const suggestionsQ = useQuery({
    queryKey: ['finance', 'billers', 'suggestions'],
    queryFn: () => finance.recurringSuggestions(),
    enabled,
  });
  const suggestions = suggestionsQ.data ?? [];
  const [fromSuggestion, setFromSuggestion] = useState<FinRecurringSuggestion | null>(null);
  const dismiss = async (s: FinRecurringSuggestion) => {
    try {
      await finance.dismissRecurringSuggestion(s.key);
      qc.invalidateQueries({ queryKey: ['finance', 'billers', 'suggestions'] });
    } catch (e) {
      toast.error(failureText(e));
    }
  };
  const monthlyIn = useMemo(
    () =>
      sumMoney(
        billers.filter((b) => !b.archived && b.income),
        (b) => effectiveAmount(b) / perMonthDivisor(b.frequency),
      ),
    [billers],
  );

  const monthlyOutflow = useMemo(() => {
    // Each biller's monthly share rounds to the paisa, then sums exactly.
    // Money expected in (Salary) isn't outflow.
    return sumMoney(
      billers.filter((b) => !b.archived && !b.income),
      (b) => effectiveAmount(b) / perMonthDivisor(b.frequency),
    );
  }, [billers]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        {/* The monthly outflow is the one figure this list adds up to; it
            sits beside the title as a badge instead of a sentence under it. */}
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="font-serif text-lg font-semibold">Recurring</h2>
          <DateBadge>
            <span>
              Out <Money value={monthlyOutflow} /> a month
            </span>
          </DateBadge>
          {monthlyIn > 0 && (
            <DateBadge tone="positive">
              <span>
                In <Money value={monthlyIn} /> a month
              </span>
            </DateBadge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={showArchived}
            onClick={() => setShowArchived((v) => !v)}
            className={cn('chip', showArchived && 'chip-selected')}
          >
            Archived
          </button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" /> New
          </Button>
        </div>
      </header>

      {suggestions.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">Looks like it repeats</h3>
          {suggestions.map((s) => (
            <div key={s.key} className="rounded-xl border border-dashed border-border bg-card p-3 md:p-4">
              <div className="text-sm font-medium">
                {s.title} · {s.income ? '+' : ''}
                <Money value={s.amount} /> {s.income ? 'into' : 'on'} {s.account_name}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{suggestionWhy(s)}</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => setFromSuggestion(s)}>
                  Make it recurring
                </Button>
                <Button size="sm" variant="outline" onClick={() => dismiss(s)}>
                  It doesn't repeat
                </Button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2">
        {billers.length === 0 ? (
          isLoading ? (
            <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>
          ) : (
            <p className="py-2 text-sm text-muted-foreground">Nothing recurring yet</p>
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
                  onPaid={refreshAfterPayment}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>

      <BillerDialog
        open={creating || !!editing || !!fromSuggestion}
        biller={editing}
        initial={fromSuggestion}
        accounts={accounts}
        categories={categories}
        onClose={() => {
          setCreating(false);
          setEditing(null);
          setFromSuggestion(null);
        }}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          setFromSuggestion(null);
          refreshBillers();
          qc.invalidateQueries({ queryKey: ['finance', 'billers', 'suggestions'] });
        }}
      />

      <BillerDetailSheet
        biller={detail}
        accounts={accounts}
        categories={categories}
        onClose={() => setDetailId(null)}
        onEdit={() => {
          setEditing(detail);
          setDetailId(null);
        }}
        onChanged={refreshBillers}
        onGone={() => {
          setDetailId(null);
          refreshBillers();
        }}
      />
    </div>
  );
}

// ─── Row ────────────────────────────────────────────────────────────────────

function BillerRow({
  biller,
  accounts,
  onOpen,
  onPaid,
}: {
  biller: FinBiller;
  accounts: FinAccount[];
  onOpen: () => void;
  onPaid: () => void;
}) {
  const due = parseISO(biller.next_due_date);
  const daysAway = differenceInDays(due, new Date());
  const overdue = daysAway < 0;
  const soon = daysAway >= 0 && daysAway <= biller.alert_days;
  const acct = accounts.find((a) => a.id === biller.account_id) || null;

  // Money expected in (Salary) is "expected", not "due". The server says
  // when this cycle is done (paid) or its day passed with nothing recorded.
  const word = biller.income ? 'Expected' : 'Due';
  const state = biller.state ?? (overdue ? 'not_recorded' : 'due');
  const dueLabel =
    state === 'paid'
      ? `${biller.income ? 'Came' : 'Paid'} ✓ · ${format(parseISO(biller.state_date || biller.next_due_date), 'd MMM')}`
      : state === 'not_recorded'
        ? `Not recorded · ${format(due, 'd MMM')}`
        : daysAway === 0
          ? `${word} today`
          : daysAway === 1
            ? `${word} tomorrow`
            : `${word} in ${daysAway}d · ${format(due, 'd MMM')}`;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, transform: 'translateY(4px)' }}
      animate={{ opacity: 1, transform: 'translateY(0)' }}
      exit={{ opacity: 0, transform: 'translateY(-4px)' }}
      className={cn(
        'flex items-center gap-3 rounded-xl bg-card p-3 transition-colors md:p-4',
        biller.archived && 'opacity-60',
      )}
    >
      {/* Main body opens the detail sheet */}
      <button
        type="button"
        onClick={onOpen}
        className="tap-highlight-none flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
      >
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-md text-white"
          style={{ background: biller.color }}
        >
          <Receipt className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium">{biller.name}</span>
            {biller.auto_renew ? (
              <DateBadge tone="accent" icon={<Zap />}>
                Auto
              </DateBadge>
            ) : null}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {FREQ_LABEL[biller.frequency]}
            {acct ? ` · ${biller.income ? 'into' : 'from'} ${acct.name}` : ''} ·{' '}
            {biller.kind === 'bill' ? 'varies' : 'fixed'}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold whitespace-nowrap tabular-nums">
            {biller.kind === 'bill' && !(biller.amount > 0) ? (
              biller.last_paid_amount != null ? (
                <>
                  ~<Money value={biller.last_paid_amount} />
                </>
              ) : (
                '–'
              )
            ) : (
              <>
                {biller.income ? '+' : ''}
                <Money value={biller.amount} />
              </>
            )}
          </div>
          <DateBadge
            className="mt-0.5"
            tone={state === 'paid' ? 'positive' : state === 'not_recorded' ? 'alert' : soon ? 'accent' : 'neutral'}
          >
            {dueLabel}
          </DateBadge>
        </div>
      </button>

      {!biller.archived && <PayPopover biller={biller} onPaid={onPaid} />}
    </motion.li>
  );
}

function KindBadge({ kind }: { kind: BillerKind }) {
  return <DateBadge>{kind === 'subscription' ? 'Fixed' : 'Varies'}</DateBadge>;
}

// How many of a frequency make a month (weekly ≈ 4.33 a month).
function perMonthDivisor(f: BillerFrequency): number {
  return f === 'weekly'
    ? 1 / 4.33
    : f === 'fortnightly'
      ? 1 / 2.17
      : f === 'bimonthly'
        ? 2
        : f === 'quarterly'
          ? 3
          : f === 'yearly'
            ? 12
            : 1;
}

// "Paid around the 23rd in October and November, the same amount each time."
function suggestionWhy(s: FinRecurringSuggestion): string {
  const months = s.months.map((m) => format(parseISO(m + '-01'), 'MMMM'));
  const list =
    months.length <= 2 ? months.join(' and ') : `${months.slice(0, -1).join(', ')} and ${months[months.length - 1]}`;
  return `${s.income ? 'Came' : 'Paid'} around the ${ordinal(s.day)} in ${list}.`;
}

function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
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
    finance
      .listTransactions({ type: biller.income ? 'income' : 'expense', limit: 20 })
      .then(setRecent)
      .catch(() => setRecent([]));
  }, [open, biller]);

  const done = (r: { already_paid: boolean }) => {
    if (r.already_paid) toast.info('This cycle was already recorded. The due date rolled forward.');
    else toast.success(`${biller.name} marked paid`);
    setOpen(false);
    onPaid();
  };

  const record = async () => {
    const amt = parseFloat(amount);
    if (biller.kind === 'bill' && !(amt > 0)) {
      toast.error('Enter the actual amount');
      return;
    }
    setBusy(true);
    try {
      done(
        await finance.payBiller(biller.id, {
          paid_date: paidDate,
          due_date: biller.next_due_date,
          ...(amt > 0 ? { amount: amt } : {}),
        }),
      );
    } catch (e) {
      toast.error(failureText(e));
    } finally {
      setBusy(false);
    }
  };

  const attach = async () => {
    if (picked.size === 0) return;
    setBusy(true);
    try {
      done(
        await finance.payBiller(biller.id, {
          paid_date: paidDate,
          due_date: biller.next_due_date,
          attach_txn_ids: Array.from(picked),
        }),
      );
    } catch (e) {
      toast.error(failureText(e));
    } finally {
      setBusy(false);
    }
  };

  const pickedSum = recent
    ? sumMoney(
        recent.filter((t) => picked.has(t.id)),
        (t) => t.amount,
      )
    : 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        title="Mark this cycle as paid"
        aria-label={`Mark ${biller.name} paid`}
        className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-[hsl(var(--on-surface)/0.08)] hover:text-primary focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
      >
        <CheckCircle2 className="size-4.5" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Mark “{biller.name}” paid</span>
          <span className="font-mono text-xs text-muted-foreground">
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
              <Label className="label-kicker font-mono text-xs text-muted-foreground">
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
              <Label className="label-kicker font-mono text-xs text-muted-foreground">Paid on</Label>
              <DatePicker value={paidDate} onChange={(d) => d && setPaidDate(d)} />
            </div>
            <p className="text-xs text-muted-foreground">
              {biller.account_id
                ? 'Posts an expense from the linked account.'
                : 'No linked account. Pick one on the biller to post a transaction.'}
            </p>
            <Button onClick={record} disabled={busy || !biller.account_id} className="w-full">
              {busy ? 'Saving…' : 'Record payment'}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {recent === null ? (
              <div className="py-4 text-center text-xs text-muted-foreground">Loading recent expenses…</div>
            ) : recent.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">No recent expenses to attach.</div>
            ) : (
              <div className="-mx-1 flex max-h-56 flex-col overflow-y-auto px-1">
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
                          if (c === true) next.add(t.id);
                          else next.delete(t.id);
                          return next;
                        });
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{t.description || t.category_name || 'Expense'}</span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {formatTxnDate(t.txn_at)} · {t.account_name}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums">
                      <Money value={t.amount} />
                    </span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Links transactions you already logged. Nothing new is posted.
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
  biller,
  accounts,
  categories,
  onClose,
  onEdit,
  onChanged,
  onGone,
}: {
  biller: FinBiller | null;
  accounts: FinAccount[];
  categories: FinCategory[];
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => void;
  onGone: () => void;
}) {
  const open = biller !== null;
  const { data: payments = [], isLoading } = useBillerPayments(biller?.id ?? 0, open);
  const qc = useQueryClient();
  // Undo a cycle Sajni (or a tap) recorded on the wrong item: due again,
  // its transactions untouched.
  const unlink = async (paymentId: number) => {
    if (!biller) return;
    if (!(await confirmDialog('Undo this cycle? It becomes due again; its transactions stay as they are.'))) return;
    try {
      await finance.unlinkBillerPayment(biller.id, paymentId);
      qc.invalidateQueries({ queryKey: qk.finance.billerPayments(biller.id) });
      onChanged();
    } catch (e) {
      toast.error(failureText(e));
    }
  };

  const acct = biller ? accounts.find((a) => a.id === biller.account_id) : null;
  const cat = biller ? categories.find((c) => c.id === biller.category_id) : null;

  const archive = async () => {
    if (!biller) return;
    try {
      await finance.updateBiller(biller.id, { archived: !biller.archived });
      onChanged();
    } catch (e) {
      toast.error(failureText(e));
    }
  };

  const remove = async () => {
    if (!biller) return;
    if (!(await confirmDialog('Delete this recurring item? Its transactions stay.'))) return;
    try {
      await finance.deleteBiller(biller.id);
      onGone();
    } catch (e) {
      toast.error(failureText(e));
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full !max-w-md flex-col gap-0 p-0">
        {biller && (
          <>
            <SheetHeader className="border-b border-border px-5 py-4">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-lg text-white"
                  style={{ background: biller.color }}
                >
                  <Receipt className="size-5" />
                </span>
                <div className="min-w-0">
                  <SheetTitle className="truncate text-left">{biller.name}</SheetTitle>
                  <div className="mt-1 flex items-center gap-2">
                    {biller.income ? <DateBadge>Income</DateBadge> : <KindBadge kind={biller.kind} />}
                    {biller.auto_renew && (
                      <DateBadge tone="accent" icon={<Zap />}>
                        Auto-renews
                      </DateBadge>
                    )}
                    {biller.archived && <DateBadge>Archived</DateBadge>}
                  </div>
                </div>
              </div>
            </SheetHeader>

            <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
              {/* Amount + next due */}
              <div>
                <div className="font-serif text-2xl font-semibold tabular-nums">
                  {biller.kind === 'bill' && !(biller.amount > 0) ? (
                    biller.last_paid_amount != null ? (
                      <>
                        ~<Money value={biller.last_paid_amount} />
                      </>
                    ) : (
                      '–'
                    )
                  ) : (
                    <>
                      {biller.income ? '+' : ''}
                      <Money value={biller.amount} />
                    </>
                  )}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {FREQ_LABEL[biller.frequency]} · {biller.income ? 'expected' : 'due'}{' '}
                  {format(parseISO(biller.next_due_date), 'd MMM yyyy')}
                </div>
              </div>

              {/* Details */}
              <section>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">Details</h3>
                <dl className="flex flex-col gap-0.5 overflow-hidden rounded-xl text-sm">
                  <DetailRow label={biller.income ? 'Into' : 'Paid from'} value={acct?.name || '–'} />
                  <DetailRow label="Category" value={cat?.name || '–'} />
                  <DetailRow label="Make a task" value={biller.remind_task ? 'On' : 'Off'} />
                  {!biller.income && (
                    <DetailRow
                      label="Heads-up"
                      value={
                        biller.alert_days === 0
                          ? 'The morning of'
                          : `${biller.alert_days} day${biller.alert_days === 1 ? '' : 's'} before`
                      }
                    />
                  )}
                  {biller.notes && <DetailRow label="Notes" value={biller.notes} />}
                </dl>
              </section>

              {/* Payment history */}
              <section>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">Cycles</h3>
                {isLoading ? (
                  <div className="py-4 text-center text-xs text-muted-foreground">Loading…</div>
                ) : payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None yet</p>
                ) : (
                  <ul className="flex flex-col gap-0.5 overflow-hidden rounded-xl">
                    {payments.map((p) => (
                      <li key={p.id} className="rounded-md bg-card px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm">
                            {format(parseISO(p.paid_date), 'd MMM yyyy')}
                            {p.auto && (
                              <DateBadge className="ml-2" tone="accent" icon={<Zap />}>
                                Auto
                              </DateBadge>
                            )}
                          </span>
                          <span className="text-sm whitespace-nowrap tabular-nums">
                            <Money value={p.amount} />
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>For {format(parseISO(p.due_date), 'd MMM')}</span>
                          <button
                            type="button"
                            onClick={() => unlink(p.id)}
                            className="rounded px-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
                          >
                            Unlink
                          </button>
                        </div>
                        {p.txns.length > 0 && (
                          <ul className="mt-1.5 flex flex-col gap-1">
                            {p.txns.map((t) => (
                              <li
                                key={t.id}
                                className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
                              >
                                <span className="truncate">
                                  ↳ {t.description || 'Transaction'}
                                  {t.account_name ? ` · ${t.account_name}` : ''}
                                </span>
                                <span className="shrink-0 font-mono tabular-nums">
                                  <Money value={t.amount} />
                                </span>
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

            <div className="flex items-center justify-between gap-2 px-5 py-3">
              <Button variant="destructive-quiet" onClick={remove}>
                <Trash2 className="mr-1 size-4" /> Delete
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={archive}>
                  <Archive className="mr-1 size-4" /> {biller.archived ? 'Unarchive' : 'Archive'}
                </Button>
                <Button onClick={onEdit}>
                  <Pencil className="mr-1 size-4" /> Edit
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
    <div className="flex items-start justify-between gap-3 rounded-md bg-card px-3 py-2.5">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-sm break-words">{value}</dd>
    </div>
  );
}

// ─── Create / edit dialog ───────────────────────────────────────────────────

// The biller editor's fields as one value: the editor compares it to tell what's unsaved.
interface BillerValues {
  name: string;
  kind: BillerKind;
  amount: string;
  frequency: BillerFrequency;
  nextDueDate: string;
  accountID: number | null;
  categoryID: number | null;
  autoRenew: boolean;
  remindTask: boolean;
  alertDays: number;
  notes: string;
  income: boolean;
}

function billerValues(b: FinBiller): BillerValues {
  return {
    name: b.name,
    kind: b.kind,
    amount: b.amount > 0 ? String(b.amount) : '',
    frequency: b.frequency,
    nextDueDate: b.next_due_date,
    accountID: b.account_id,
    categoryID: b.category_id,
    autoRenew: b.auto_renew,
    remindTask: b.remind_task,
    alertDays: b.alert_days,
    notes: b.notes,
    income: !!b.income,
  };
}

function billerPayload(v: BillerValues): Partial<FinBiller> {
  return {
    name: v.name.trim(),
    kind: v.kind,
    amount: parseFloat(v.amount) || 0,
    frequency: v.frequency,
    next_due_date: v.nextDueDate,
    account_id: v.accountID,
    category_id: v.categoryID,
    // Bills never auto-renew (amount is unknown until paid).
    auto_renew: v.kind === 'subscription' && v.autoRenew,
    // Auto-renew self-pays, so a manual bill-pay reminder is moot there.
    remind_task: v.remindTask && !(v.kind === 'subscription' && v.autoRenew),
    alert_days: v.alertDays,
    notes: v.notes,
    income: v.income,
  };
}

function BillerDialog({
  open,
  biller,
  initial,
  accounts,
  categories,
  onClose,
  onSaved,
}: {
  open: boolean;
  biller: FinBiller | null;
  /** A "make it recurring" suggestion to start from. */
  initial?: FinRecurringSuggestion | null;
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
  const [income, setIncome] = useState(false);
  const [saving, setSaving] = useState(false);

  const values: BillerValues = {
    name,
    kind,
    amount,
    frequency,
    nextDueDate,
    accountID,
    categoryID,
    autoRenew,
    remindTask,
    alertDays,
    notes,
    income,
  };
  const apply = (v: BillerValues) => {
    setName(v.name);
    setKind(v.kind);
    setAmount(v.amount);
    setFrequency(v.frequency);
    setNextDueDate(v.nextDueDate);
    setAccountID(v.accountID);
    setCategoryID(v.categoryID);
    setAutoRenew(v.autoRenew);
    setRemindTask(v.remindTask);
    setAlertDays(v.alertDays);
    setNotes(v.notes);
    setIncome(v.income);
  };
  const invalid = !name.trim()
    ? 'it needs a name.'
    : kind === 'subscription' && !(parseFloat(amount) > 0)
      ? 'a fixed amount is needed (or pick Varies).'
      : null;
  // Nothing saves until Save; a new biller is created explicitly.
  const editor = useEditorDraft({
    open: open,
    editing: !!(open && biller),
    value: values,
    invalid,
    save: async (v) => {
      if (!biller) return;
      await finance.updateBiller(biller.id, billerPayload(v));
    },
  });
  const loadDraft = editor.load;
  const requestClose = () => editor.close(onClose);

  useEffect(() => {
    if (!open) return;
    const v: BillerValues = biller
      ? billerValues(biller)
      : initial
        ? {
            name: initial.title,
            kind: 'subscription',
            amount: String(initial.amount),
            frequency: 'monthly',
            nextDueDate: initial.next_due_date,
            accountID: initial.account_id,
            categoryID: initial.category_id,
            autoRenew: false,
            remindTask: false,
            alertDays: initial.income ? 0 : 3,
            notes: '',
            income: initial.income,
          }
        : {
            name: '',
            kind: 'subscription',
            amount: '',
            frequency: 'monthly',
            nextDueDate: format(new Date(), 'yyyy-MM-dd'),
            accountID: null,
            categoryID: null,
            autoRenew: false,
            remindTask: false,
            alertDays: 3,
            notes: '',
            income: false,
          };
    apply(v);
    loadDraft(v);
    // Keyed on the dialog opening; the setters are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, biller, initial]);

  const canSubmit = !invalid;

  const submit = async () => {
    if (biller) {
      await editor.save(onSaved);
      return;
    }
    if (!canSubmit) return;
    setSaving(true);
    try {
      await finance.createBiller(billerPayload(values));
      onSaved();
    } catch (e) {
      console.error(e);
      toast.error(failureText(e, 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && requestClose()}>
      <DialogContent showCloseButton={false} className="max-w-lg">
        <DialogHeader className="flex-row items-baseline justify-between gap-3">
          <DialogTitle>{biller ? 'Edit recurring item' : 'New recurring item'}</DialogTitle>
        </DialogHeader>

        {/* Tall form — cap height and scroll the fields so the modal never
            runs off-screen; header + footer stay pinned. */}
        <div className="-mx-1 mt-2 flex max-h-[62vh] flex-col gap-3 overflow-y-auto overscroll-contain px-1">
          <SegmentedButton
            value={income ? 'in' : 'out'}
            onChange={(v) => {
              setIncome(v === 'in');
              setCategoryID(null);
            }}
            stretch
            className="shrink-0"
            aria-label="Direction"
            options={[
              { value: 'out', label: 'Money out' },
              { value: 'in', label: 'Money in' },
            ]}
          />

          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={income ? 'Salary' : kind === 'subscription' ? 'Netflix' : 'Electricity'}
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={kind === 'subscription' ? 'Amount' : 'About (optional)'}>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="0"
              />
            </Field>
            <Field label="Frequency">
              <Select
                value={frequency}
                onValueChange={(v) => setFrequency(v as BillerFrequency)}
                items={(Object.keys(FREQ_LABEL) as BillerFrequency[]).map((f) => ({ value: f, label: FREQ_LABEL[f] }))}
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FREQ_LABEL) as BillerFrequency[]).map((f) => (
                    <SelectItem key={f} value={f}>
                      {FREQ_LABEL[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <SegmentedButton
            value={kind}
            onChange={(k) => setKind(k)}
            stretch
            className="shrink-0"
            size="sm"
            aria-label="Amount"
            options={[
              { value: 'subscription', label: 'Fixed' },
              { value: 'bill', label: 'Varies' },
            ]}
          />
          <p className="-mt-1.5 text-xs text-muted-foreground">
            {kind === 'subscription'
              ? 'The same amount every time: Netflix, rent, Home Contrib.'
              : 'The amount is a guess (electricity, Salary with a bonus); the real payment is what counts.'}
          </p>

          <Field label="Next due date">
            <DatePicker value={nextDueDate} onChange={(d) => d && setNextDueDate(d)} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={income ? 'Into' : 'Paid from'}>
              <Select
                value={accountID == null ? 'none' : String(accountID)}
                onValueChange={(v) => setAccountID(v === 'none' ? null : Number(v))}
                items={[
                  { value: 'none', label: '–' },
                  ...accounts.map((a) => ({ value: String(a.id), label: a.name })),
                ]}
              >
                <SelectTrigger size="sm">
                  <SelectValue placeholder="–" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">–</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Category">
              <Select
                value={categoryID == null ? 'none' : String(categoryID)}
                onValueChange={(v) => setCategoryID(v === 'none' ? null : Number(v))}
                items={[
                  { value: 'none', label: '–' },
                  ...categories
                    .filter((c) => c.kind === (income ? 'income' : 'expense'))
                    .map((c) => ({ value: String(c.id), label: c.name })),
                ]}
              >
                <SelectTrigger size="sm">
                  <SelectValue placeholder="–" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">–</SelectItem>
                  {categories
                    .filter((c) => c.kind === (income ? 'income' : 'expense'))
                    .map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="divide-y divide-border rounded-xl border border-border">
            {kind === 'subscription' && (
              <CheckRow
                label="Sajni adds it itself"
                desc="Only for payments that send no message (cash). Otherwise Sajni waits for the real payment, ticks it, and nudges at 8 pm on the due day if nothing came."
                checked={autoRenew}
                onChange={setAutoRenew}
                disabled={accountID == null}
                disabledReason="pick an account first"
              />
            )}
            <CheckRow
              label="Make a task"
              desc="Each cycle, create a 'Pay …' task + email near the due date."
              checked={remindTask && !(kind === 'subscription' && autoRenew)}
              onChange={setRemindTask}
              disabled={kind === 'subscription' && autoRenew}
              disabledReason="auto-pay handles this"
            />
          </div>

          <Field label="Heads-up · days before (0 = the morning of)" className="max-w-[260px]">
            <IntInput min={0} max={30} value={alertDays} onChange={setAlertDays} />
          </Field>

          <Field label="Notes">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </Field>
        </div>

        <DialogFooter className="mt-3">
          <EditActions
            draft={editor}
            onCancel={onClose}
            onSave={submit}
            saveLabel={biller ? 'Save' : saving ? 'Saving…' : 'Create'}
            disabled={!biller && (saving || !canSubmit)}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={'flex flex-col gap-1 ' + (className || '')}>
      <Label className="label-kicker font-mono text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

// A labelled toggle row with a description and, when disabled, an inline reason
// so it's obvious WHY the option can't be picked.
function CheckRow({
  label,
  desc,
  checked,
  onChange,
  disabled,
  disabledReason,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <label className={'flex items-start gap-3 p-3 ' + (disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer')}>
      <Checkbox
        checked={checked}
        onCheckedChange={(c) => {
          if (!disabled) onChange(c === true);
        }}
        disabled={disabled}
        className="mt-0.5"
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-sm leading-none font-medium">
          {label}
          {disabled && disabledReason ? (
            <span className="label-kicker font-mono text-xs text-[hsl(var(--tertiary))]">· {disabledReason}</span>
          ) : null}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{desc}</div>
      </div>
    </label>
  );
}
