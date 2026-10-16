import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { ArrowUpRight, Bell, Check, ChevronDown, Receipt, RotateCcw, Trash2 } from '@/components/ui/icons';
import { DateBadge } from '@/components/ui/state-chip';
import { cn } from '@/lib/utils';

import { finance, type FinAccount, type FinTransaction, type FinLend, type FinLendPerson, type FinLendSettlement } from '@/api';
import { confirmDialog } from '@/lib/confirm';
import { failureText } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { TimePicker } from '@/components/ui/time-picker';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFinCategories, useFinLendPeople } from '@/queries/finance';
import { CategoryChips } from './CategoryChips';
import { AnimatedMoney } from './AnimatedMoney';
import { ListSkeleton } from './Skeletons';
import { Stat, StatGroup } from './StatGroup';
import { partsToTxnAt, txnAtToParts, sumMoney, subMoney } from './utils';
import { Money } from './Money';
import { TowardPicker } from './TransactionDialog';
import { useEditorAutosave } from '@/hooks/use-autosave';
import { AutosaveStatus, EditActions } from '@/components/autosave';

interface Props {
  accounts: FinAccount[];
  lends: FinLend[];
  loaded: boolean;
  reload: () => void;
  /** Opens the transaction sheet: Expense → Split → All. */
  onNewLend: () => void;
  /** Opens the transaction sheet: Income → Settles a lend, for this person. */
  onSettle: (borrower: string) => void;
}

const personKey = (name: string) => name.trim().toLowerCase();
const today = () => format(new Date(), 'yyyy-MM-dd');

// Lends grouped by person. Lends and payments back are made in the
// transaction sheet (Split, Settles a lend); the buttons here open it
// pre-filled. A payment counts toward one lend (pinned) or the person's
// overall total. "Adjust" writes off what is left as the user's spending.
// Every row opens its editor, which holds its actions.
export default function LendsTab({ accounts, lends, loaded, reload, onNewLend, onSettle }: Props) {
  const peopleQ = useFinLendPeople();
  const people = useMemo(() => peopleQ.data ?? [], [peopleQ.data]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [showSettled, setShowSettled] = useState(false);
  const [forgiving, setForgiving] = useState<FinLendPerson | null>(null);
  const [editing, setEditing] = useState<FinLend | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);

  const lendsByPerson = useMemo(() => {
    const map = new Map<string, FinLend[]>();
    for (const lend of lends) {
      const key = personKey(lend.borrower);
      map.set(key, [...(map.get(key) ?? []), lend]);
    }
    return map;
  }, [lends]);
  const totals = useMemo(() => ({
    owed: sumMoney(people, (p) => p.outstanding),
    held: sumMoney(people, (p) => p.credit),
    returned: sumMoney(people.flatMap((p) => p.settlements.filter((s) => !s.forgiven)), (s) => s.amount),
  }), [people]);

  const done = () => { reload(); peopleQ.refetch(); };

  // Anyone with nothing outstanding is settled (a held surplus included).
  const active = people.filter((p) => p.outstanding > 0.005);
  const settled = people.filter((p) => p.outstanding <= 0.005);

  const renderPerson = (person: FinLendPerson) => {
    const key = personKey(person.borrower);
    const items = lendsByPerson.get(key) ?? [];
    const open = openKey === key;
    const nextDue = items
      .filter((l) => l.status === 'open' && l.due_date)
      .map((l) => l.due_date as string)
      .sort()[0];
    const overdue = !!nextDue && nextDue < today();
    return (
      <div key={key} className="rounded-md bg-card">
        <button
          type="button"
          onClick={() => setOpenKey(open ? null : key)}
          aria-expanded={open}
          className="flex w-full items-center gap-3 rounded-md px-4 py-3 text-left outline-none hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[hsl(var(--surface-container-high))] text-sm font-semibold text-muted-foreground">
            {person.borrower.trim().charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{person.borrower}</span>
            <span className="mt-0.5 flex flex-wrap gap-1">
              {nextDue && (
                <DateBadge tone={overdue ? 'alert' : 'neutral'}>Due {format(parseISO(nextDue), 'd MMM')}</DateBadge>
              )}
              {person.credit > 0 && <DateBadge tone="positive"><Money value={person.credit} /> held</DateBadge>}
            </span>
          </span>
          {person.outstanding > 0 ? (
            <span className="whitespace-nowrap font-serif text-xl font-semibold tabular-nums text-primary"><Money value={person.outstanding} /></span>
          ) : (
            <DateBadge tone="positive">Settled</DateBadge>
          )}
          <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </button>

        {open && (
          <PersonDetail
            person={person}
            lends={items}
            onSettle={() => onSettle(person.borrower)}
            onForgive={() => setForgiving(person)}
            onEdit={setEditing}
            onPayment={(s) => setPayment(paymentFromSettlement(s, person.borrower))}
          />
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <StatGroup className={totals.held > 0 ? 'grid-cols-3' : 'grid-cols-2'}>
        <Stat label="Owed to me" value={<AnimatedMoney value={totals.owed} />} tone="primary" />
        <Stat label="Returned" value={<AnimatedMoney value={totals.returned} />} />
        {totals.held > 0 && <Stat label="Held for later" value={<AnimatedMoney value={totals.held} />} />}
      </StatGroup>

      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-lg font-semibold">People</h2>
        <Button variant="outline" size="sm" onClick={onNewLend}><ArrowUpRight className="size-4" /> Lend</Button>
      </div>

      {(!loaded || peopleQ.isLoading) && people.length === 0 ? (
        <ListSkeleton rows={4} />
      ) : people.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">Nobody owes you anything</p>
      ) : (
        <>
          {active.length > 0 ? (
            <div className="flex flex-col gap-0.5 overflow-hidden rounded-xl">{active.map(renderPerson)}</div>
          ) : (
            <p className="py-2 text-sm text-muted-foreground">Nobody owes you anything</p>
          )}
          {/* Fully settled people fold away, like completed tasks. */}
          {settled.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowSettled((v) => !v)}
                aria-expanded={showSettled}
                className="-ml-2 inline-flex h-9 items-center gap-1.5 rounded-full px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-[hsl(var(--on-surface)/0.08)] hover:text-foreground"
              >
                <ChevronDown className={cn('size-3.5 transition-transform', !showSettled && '-rotate-90')} />
                Settled ({settled.length})
              </button>
              {showSettled && (
                <div className="mt-2 flex flex-col gap-0.5 overflow-hidden rounded-xl">{settled.map(renderPerson)}</div>
              )}
            </div>
          )}
        </>
      )}

      <ForgiveDialog
        person={forgiving}
        onClose={() => setForgiving(null)}
        onDone={() => { setForgiving(null); done(); }}
      />
      <EditLendDialog lend={editing} accounts={accounts} onClose={() => setEditing(null)} onAutosaved={done} onRemoved={() => { setEditing(null); done(); }} />
      <EditRepaymentDialog
        payment={payment}
        onClose={() => setPayment(null)}
        onChanged={done}
        onRemoved={() => { setPayment(null); done(); }}
      />
    </div>
  );
}

// A person's history as a timeline, oldest first, so it reads down to where
// things stand now. Rows share the header's grid: the node sits under the
// avatar, text in the name column, the amount ends where the header amount
// ends. Tapping a row opens its editor.
const ROW = 'grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3';

type Event =
  | { kind: 'lend'; at: string; lend: FinLend }
  | { kind: 'settlement'; at: string; settlement: FinLendSettlement };

function PersonDetail({ person, lends, onSettle, onForgive, onEdit, onPayment }: {
  person: FinLendPerson;
  lends: FinLend[];
  onSettle: () => void;
  onForgive: () => void;
  onEdit: (lend: FinLend) => void;
  onPayment: (settlement: FinLendSettlement) => void;
}) {
  const events = useMemo<Event[]>(() => [
    ...lends.map((lend) => ({ kind: 'lend' as const, at: lend.lent_at, lend })),
    ...person.settlements.map((settlement) => ({ kind: 'settlement' as const, at: settlement.txn_at, settlement })),
  ].sort((a, b) => a.at.localeCompare(b.at)), [lends, person.settlements]);

  return (
    <div className="flex flex-col px-4 pb-3">
      {events.map((event, i) => {
        const rail = { first: i === 0, last: i === events.length - 1 };
        if (event.kind === 'lend') {
          const { lend } = event;
          const overdue = lend.status === 'open' && !!lend.due_date && lend.due_date < today();
          return (
            <button key={'l' + lend.id} type="button" onClick={() => onEdit(lend)}
              className={cn(ROW, 'min-h-14 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring')}>
              <TimelineNode {...rail} tone={lend.status === 'settled' ? 'positive' : overdue ? 'alert' : 'neutral'}>
                {lend.status === 'settled' ? <Check className="!size-3" /> : lend.origin === 'paid_for' ? <Receipt /> : <ArrowUpRight />}
              </TimelineNode>
              <span className="min-w-0 py-2">
                <span className="block truncate text-sm font-medium">{lend.description}</span>
                <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="truncate">{format(parseISO(lend.lent_at), 'd MMM')} · {lend.source_account}</span>
                  {lend.status === 'open' && lend.due_date && (
                    <DateBadge tone={overdue ? 'alert' : 'neutral'} icon={lend.remind ? <Bell aria-label="Reminder on" /> : undefined}>
                      Due {format(parseISO(lend.due_date), 'd MMM')}
                    </DateBadge>
                  )}
                </span>
              </span>
              <span className="text-right tabular-nums">
                <span className="block whitespace-nowrap text-sm"><Money value={lend.principal} /></span>
                {/* Only payments pinned to this lend show against it. */}
                {lend.status === 'open' && lend.repaid > 0 && (
                  <span className="block whitespace-nowrap text-xs text-muted-foreground"><Money value={lend.outstanding} /> left</span>
                )}
              </span>
            </button>
          );
        }
        // A forgive closes debt like a payment but brings no money in: a
        // neutral ✓ node, no green, no account.
        const { settlement: s } = event;
        return (
          <button key={'s' + s.id} type="button" onClick={() => onPayment(s)}
            className={cn(ROW, 'min-h-14 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring')}>
            <TimelineNode {...rail} tone={s.forgiven ? 'neutral' : 'positive'}>{s.forgiven ? <Check className="!size-3" /> : <ArrowUpRight className="rotate-180" />}</TimelineNode>
            <span className="min-w-0 py-2">
              <span className="block truncate text-sm font-medium">{s.forgiven ? 'Adjusted' : s.description}</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {format(parseISO(s.txn_at), 'd MMM')}{s.forgiven ? '' : ' · ' + s.account} · {s.toward ? `Toward ${s.toward}` : 'Overall'}
              </span>
            </span>
            <span className="text-right tabular-nums">
              {s.forgiven
                ? <span className="block whitespace-nowrap text-sm"><Money value={s.amount} /></span>
                : <span className="block whitespace-nowrap text-sm text-[hsl(var(--color-complete))]">+<Money value={s.amount} /></span>}
            </span>
          </button>
        );
      })}
      <div className={cn(ROW, 'pt-2')}>
        <div className="col-start-2 col-span-2 flex items-center gap-2">
          {person.outstanding > 0 && <Button variant="tonal" size="sm" onClick={onSettle}><ArrowUpRight className="size-4 rotate-180" /> Settle</Button>}
          {person.outstanding > 0 && <Button variant="outline" size="sm" onClick={onForgive}>Adjust</Button>}
        </div>
      </div>
    </div>
  );
}

// Opaque fills (tints mixed into the card, not alpha) so the rail never
// shows through a node.
const NODE_TONE = {
  neutral: 'bg-[hsl(var(--surface-container-highest))] text-foreground',
  positive: 'bg-[color-mix(in_oklab,hsl(var(--color-complete))_32%,hsl(var(--card)))] text-[color-mix(in_oklab,hsl(var(--color-complete))_70%,hsl(var(--on-surface)))]',
  alert: 'bg-[hsl(var(--error-container))] text-[hsl(var(--on-error-container))]',
};

// The rail runs through every node; it starts at the first node's centre
// and stops at the last one's, so a single item is just a node.
function TimelineNode({ first, last, tone, children }: { first: boolean; last: boolean; tone: keyof typeof NODE_TONE; children: React.ReactNode }) {
  return (
    <span className="relative grid self-stretch place-items-center">
      {!(first && last) && (
        <span aria-hidden className={cn('absolute left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-[hsl(var(--outline))]', first ? 'top-1/2' : 'top-0', last ? 'bottom-1/2' : 'bottom-0')} />
      )}
      <span className={cn('relative grid size-8 place-items-center rounded-full ring-[3px] ring-[hsl(var(--card))] [&>svg]:size-4', NODE_TONE[tone])}>
        {children}
      </span>
    </span>
  );
}

// Write off what a person still owes (all by default, or part). It counts as
// your spending in the chosen category on that day; no money moves.
function ForgiveDialog({ person, onClose, onDone }: {
  person: FinLendPerson | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const categoriesQ = useFinCategories(!!person);
  const expenseCats = (categoriesQ.data ?? []).filter((c) => c.kind === 'expense');
  const fallback = expenseCats.find((c) => /^gifts?\b/i.test(c.name.trim()))
    ?? expenseCats.find((c) => ['other', 'others'].includes(c.name.trim().toLowerCase()));
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [toward, setToward] = useState('');
  const [date, setDate] = useState(today());
  const [time, setTime] = useState('12:00');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!person) return;
    const now = txnAtToParts(new Date().toISOString());
    setAmount(String(person.outstanding)); setCategoryId(''); setToward(''); setDate(now.date); setTime(now.time); setNote('');
  }, [person]);
  const value = Number(amount) || 0;
  const owed = person?.outstanding ?? 0;
  const bad = value <= 0 || value > owed;
  const picked = categoryId || (fallback ? String(fallback.id) : '');
  const save = async () => {
    if (!person || saving || bad) return;
    setSaving(true);
    try {
      await finance.forgiveLends({
        borrower: person.borrower, amount: value, category_id: picked ? Number(picked) : null,
        forgiven_at: partsToTxnAt(date, time), note, ...(toward ? { lend_id: Number(toward) } : {}),
      });
      onDone();
    } catch (error) { toast.error(failureText(error)); } finally { setSaving(false); }
  };
  return <Dialog open={!!person} onOpenChange={(next) => { if (!next) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>Adjust what {person?.borrower} owes</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <Field label="Amount"><Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={bad} /></Field>
        <div className="-mt-1 flex flex-wrap gap-1.5">
          <DateBadge>Owes <Money value={owed} /></DateBadge>
          {value > 0 && value <= owed && (subMoney(owed, value) > 0
            ? <DateBadge><Money value={subMoney(owed, value)} /> still owed</DateBadge>
            : <DateBadge tone="positive">Settled</DateBadge>)}
        </div>
        {person && <TowardPicker person={person.borrower} value={toward} onChange={setToward} />}
        <Field label="Counts as">
          <CategoryChips categories={expenseCats} value={picked} onChange={setCategoryId} />
        </Field>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
          <Field label="Date"><DatePicker value={date} onChange={setDate} /></Field>
          <Field label="Time"><TimePicker value={time} onChange={setTime} /></Field>
        </div>
        <Field label="Note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={saving || bad}>{saving ? 'Saving…' : 'Adjust'}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

interface LendValues {
  sourceAccountId: string; amount: string; borrower: string; description: string; note: string;
  lentDate: string; lentTime: string; dueDate: string; remind: boolean;
}

function lendValues(lend: FinLend): LendValues {
  const lentAt = txnAtToParts(lend.lent_at);
  return {
    sourceAccountId: String(lend.source_account_id), amount: String(lend.principal), borrower: lend.borrower,
    description: lend.description, note: lend.note, lentDate: lentAt.date, lentTime: lentAt.time,
    dueDate: lend.due_date ?? '', remind: lend.remind,
  };
}

// The one editor for a lend; it is made in the transaction sheet. A split
// share keeps only who, their share and the due date here: its title,
// account, date and note are the bill's. Edits save themselves (the server
// rebalances the person after each one); undoing it lives here too.
export function EditLendDialog({ lend, accounts, onClose, onAutosaved, onRemoved }: {
  lend: FinLend | null;
  accounts: FinAccount[];
  onClose: () => void;
  /** An edit saved while the dialog stays open: refresh, keep editing. */
  onAutosaved: () => void;
  /** Deleted, or handed back as an expense. */
  onRemoved: () => void;
}) {
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [borrower, setBorrower] = useState('');
  const [description, setDescription] = useState('');
  const [note, setNote] = useState('');
  const [lentDate, setLentDate] = useState('');
  const [lentTime, setLentTime] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [remind, setRemind] = useState(false);

  const open = !!lend;
  const split = !!lend?.split;
  const values: LendValues = { sourceAccountId, amount, borrower, description, note, lentDate, lentTime, dueDate, remind };
  const apply = (v: LendValues) => {
    setSourceAccountId(v.sourceAccountId); setAmount(v.amount); setBorrower(v.borrower);
    setDescription(v.description); setNote(v.note); setLentDate(v.lentDate); setLentTime(v.lentTime);
    setDueDate(v.dueDate); setRemind(v.remind);
  };
  const principal = Number(amount);
  const invalid = !borrower.trim() ? "enter who it's for."
    : !Number.isFinite(principal) || principal <= 0 ? 'enter an amount above zero.'
      : split ? null
        : !sourceAccountId ? 'pick the account it came from.'
          : !description.trim() ? 'add a title.'
            : !lentDate || !lentTime ? 'pick when it was lent.'
              : null;
  const autosave = useEditorAutosave({
    key: lend?.id ?? null,
    value: values,
    apply,
    invalid,
    save: async (v) => {
      if (!lend) return;
      await finance.updateLend(lend.id, {
        source_account_id: Number(v.sourceAccountId), amount: Number(v.amount),
        borrower: v.borrower.trim(), description: v.description.trim(), note: v.note,
        lent_at: partsToTxnAt(v.lentDate, v.lentTime),
        due_date: v.dueDate, remind: v.remind && !!v.dueDate,
      });
      onAutosaved();
    },
  });
  const loadAutosave = autosave.load;
  const requestClose = () => autosave.close(onClose);
  useEffect(() => {
    if (!lend) return;
    const v = lendValues(lend);
    apply(v);
    loadAutosave(v);
    // Keyed on the lend being opened; the setters are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lend]);
  const remove = async () => {
    if (!lend) return;
    const ask = lend.origin === 'paid_for'
      ? split ? `Remove the split with ${lend.borrower}? The whole bill becomes your expense again.`
        : `Unmark "${lend.description}"? It goes back to being your expense.`
      : `Delete the lend to ${lend.borrower}? Its transaction is removed too.`;
    if (!(await confirmDialog(ask))) return;
    autosave.cancel();
    try { await finance.deleteLend(lend.id); onRemoved(); } catch (error) { toast.error(failureText(error)); }
  };
  return <Dialog open={open} onOpenChange={(next) => { if (!next) requestClose(); }}>
    <DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader className="flex-row items-baseline justify-between gap-3">
        <DialogTitle>Edit lend</DialogTitle>
        <AutosaveStatus status={autosave.status} />
      </DialogHeader>
      <div className="grid gap-3">
        {split ? (
          <p className="text-xs text-muted-foreground">Part of “{lend?.description}”. The bill's title, account, date and note are edited on the bill.</p>
        ) : (
          <>
            <Field label="Title"><Input value={description} onChange={(e) => setDescription(e.target.value)} aria-invalid={!description.trim()} maxLength={120} /></Field>
            <Field label="From account">
              <Select value={sourceAccountId} onValueChange={(value) => setSourceAccountId(value ?? '')} items={accounts.map((a) => ({ value: String(a.id), label: a.name }))}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </>
        )}
        <Field label={lend?.origin === 'paid_for' ? 'Their share of the bill' : 'Amount'}><Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        {lend?.origin === 'paid_for' && <p className="-mt-2 text-xs text-muted-foreground">The bill itself stays the same; the rest is your spending.</p>}
        <Field label="Borrower"><Input value={borrower} onChange={(e) => setBorrower(e.target.value)} /></Field>
        {!split && (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
            <Field label="Lent date"><DatePicker value={lentDate} onChange={setLentDate} /></Field>
            <Field label="Time"><TimePicker value={lentTime} onChange={setLentTime} /></Field>
          </div>
        )}
        <Field label="Due date"><DatePicker value={dueDate} onChange={setDueDate} /></Field>
        <div className="flex items-center justify-between rounded-lg px-3 py-2">
          <div><Label>Due reminder</Label><p className="text-xs text-muted-foreground">One notification when due.</p></div>
          <Switch checked={remind && !!dueDate} disabled={!dueDate} onCheckedChange={setRemind} />
        </div>
        {!split && <Field label="Note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} /></Field>}
      </div>
      <DialogFooter className="flex-row items-center justify-between">
        <Button variant="destructive-quiet" onClick={remove}>
          {lend?.origin === 'paid_for' ? <><RotateCcw className="size-4 mr-1" /> {split ? 'Remove split' : 'Unmark'}</> : <><Trash2 className="size-4 mr-1" /> Delete</>}
        </Button>
        <div className="flex gap-2"><EditActions changed={autosave.changed} onUndo={autosave.undo} onDone={requestClose} /></div>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

/** A payment back (or a forgive), from a transaction row or a person's timeline. */
export interface Payment {
  settlementId: number;
  transactionId: number;
  borrower: string;
  amount: number;
  account: string;
  at: string;
  description: string;
  note: string;
  lendId: number | null;
  forgiven: boolean;
  categoryId: number | null;
}

export function paymentFromTxn(txn: FinTransaction): Payment | null {
  if (!txn.settlement) return null;
  return {
    settlementId: txn.settlement.id, transactionId: txn.id, borrower: txn.settlement.borrower,
    amount: txn.amount, account: txn.account_name, at: txn.txn_at, description: txn.description,
    note: txn.note || '', lendId: txn.settlement.lend_id, forgiven: txn.type === 'writeoff', categoryId: txn.category_id,
  };
}

function paymentFromSettlement(s: FinLendSettlement, borrower: string): Payment {
  return {
    settlementId: s.id, transactionId: s.transaction_id, borrower, amount: s.amount, account: s.account,
    at: s.txn_at, description: s.description, note: s.note || '', lendId: s.lend_id, forgiven: s.forgiven,
    categoryId: s.category_id,
  };
}

// An adjustment moved no money, so its amount, category and time are the
// user's too; a payment back keeps them blank.
interface RepaymentValues { description: string; note: string; amount: string; categoryId: string; date: string; time: string }

function repaymentValues(p: Payment): RepaymentValues {
  const at = txnAtToParts(p.at);
  return { description: p.description, note: p.note, ...(p.forgiven
    ? { amount: String(p.amount), categoryId: p.categoryId ? String(p.categoryId) : '', date: at.date, time: at.time }
    : { amount: '', categoryId: '', date: '', time: '' }) };
}

// The one editor for a payment back (or an adjustment). A payment's amount,
// account and date belong to the lends it settles; its title and note are the
// user's words; Toward picks the lend it counts for. Unmarking lives here too.
export function EditRepaymentDialog({ payment, onClose, onChanged, onRemoved }: {
  payment: Payment | null;
  onClose: () => void;
  /** A title, note or Toward change saved: refresh, keep editing. */
  onChanged: () => void;
  onRemoved: () => void;
}) {
  const [description, setDescription] = useState('');
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [toward, setToward] = useState('');
  const adjusted = !!payment?.forgiven;
  const categoriesQ = useFinCategories(adjusted);
  const expenseCats = (categoriesQ.data ?? []).filter((c) => c.kind === 'expense');
  const values: RepaymentValues = { description, note, amount, categoryId, date, time };
  const apply = (v: RepaymentValues) => {
    setDescription(v.description); setNote(v.note); setAmount(v.amount); setCategoryId(v.categoryId); setDate(v.date); setTime(v.time);
  };
  const badAmount = adjusted && !(Number(amount) > 0);
  const autosave = useEditorAutosave({
    key: payment?.settlementId ?? null,
    value: values,
    apply,
    invalid: !description.trim() ? 'add a title.' : badAmount ? 'enter an amount above zero.' : null,
    save: async (v) => {
      if (!payment) return;
      await finance.updateTransaction(payment.transactionId, {
        description: v.description.trim(), note: v.note,
        ...(payment.forgiven ? {
          amount: Number(v.amount), txn_at: partsToTxnAt(v.date, v.time),
          ...(v.categoryId ? { category_id: Number(v.categoryId) } : {}),
        } : {}),
      });
      onChanged();
    },
  });
  const loadAutosave = autosave.load;
  const requestClose = () => autosave.close(onClose);
  useEffect(() => {
    if (!payment) return;
    const v = repaymentValues(payment);
    apply(v);
    loadAutosave(v);
    setToward(payment.lendId ? String(payment.lendId) : '');
    // Keyed on the payment being opened; the setters are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment]);
  // Toward is a choice, not typing: it saves the moment it changes.
  const pickToward = async (lendId: string) => {
    if (!payment) return;
    const before = toward;
    setToward(lendId);
    try { await finance.setSettlementLend(payment.settlementId, lendId ? Number(lendId) : null); onChanged(); }
    catch (error) { setToward(before); toast.error(failureText(error)); }
  };
  const unmark = async () => {
    if (!payment) return;
    if (!(await confirmDialog(payment.forgiven
      ? 'Undo this adjustment? They owe that amount again, and it leaves your spending.'
      : 'Unmark this payment? It goes back to plain income.'))) return;
    autosave.cancel();
    try { await finance.deleteLendSettlement(payment.settlementId); onRemoved(); } catch (error) { toast.error(failureText(error)); }
  };
  return <Dialog open={!!payment} onOpenChange={(next) => { if (!next) requestClose(); }}>
    <DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader className="flex-row items-baseline justify-between gap-3">
        <DialogTitle>{payment?.forgiven ? 'Edit adjustment' : 'Edit repayment'}</DialogTitle>
        <AutosaveStatus status={autosave.status} />
      </DialogHeader>
      {payment && (
        <div className="flex flex-wrap gap-1.5">
          {payment.forgiven
            ? <DateBadge tone="positive">Settles · {payment.borrower}</DateBadge>
            : <>
              <DateBadge tone="positive">Settles · {payment.borrower} <Money value={payment.amount} /></DateBadge>
              <DateBadge>{payment.account} · {format(parseISO(payment.at), 'd MMM')}</DateBadge>
            </>}
        </div>
      )}
      <div className="grid gap-3">
        <Field label="Title"><Input value={description} onChange={(e) => setDescription(e.target.value)} aria-invalid={!description.trim()} placeholder="e.g. UPI from Monica" maxLength={120} autoFocus /></Field>
        {adjusted && <Field label="Amount"><Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={badAmount} /></Field>}
        {payment && <TowardPicker person={payment.borrower} value={toward} onChange={pickToward} />}
        {adjusted && <>
          <Field label="Counts as"><CategoryChips categories={expenseCats} value={categoryId} onChange={setCategoryId} /></Field>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
            <Field label="Date"><DatePicker value={date} onChange={setDate} /></Field>
            <Field label="Time"><TimePicker value={time} onChange={setTime} /></Field>
          </div>
        </>}
        <Field label="Note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} /></Field>
      </div>
      <DialogFooter className="flex-row items-center justify-between">
        <Button variant="destructive-quiet" onClick={unmark}><RotateCcw className="size-4 mr-1" /> {payment?.forgiven ? 'Undo adjustment' : 'Unmark'}</Button>
        <div className="flex gap-2"><EditActions changed={autosave.changed} onUndo={autosave.undo} onDone={requestClose} /></div>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="font-mono text-xs label-kicker text-muted-foreground">{label}</Label>{children}</div>;
}
