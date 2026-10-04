import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { Bell, ChevronDown, Plus, Search, Trash2 } from '@/components/ui/icons';
import { DateBadge, StateChip } from '@/components/ui/state-chip';
import { cn } from '@/lib/utils';

import { finance, type FinAccount, type FinLend, type FinLendCandidate, type FinLendPerson } from '@/api';
import { confirmDialog } from '@/lib/confirm';
import { msg } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { TimePicker } from '@/components/ui/time-picker';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { SegmentedButton } from '@/components/ui/segmented-button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFinLendPeople, useLendCandidates } from '@/queries/finance';
import { AnimatedMoney } from './AnimatedMoney';
import { useFinanceFormatters } from './useFinancePrivacy';
import { ListSkeleton } from './Skeletons';
import { Stat, StatGroup } from './StatGroup';
import { partsToTxnAt, txnAtToParts } from './utils';

interface Props {
  accounts: FinAccount[];
  lends: FinLend[];
  loaded: boolean;
  reload: () => void;
  onNewLend: () => void;
}

const personKey = (name: string) => name.trim().toLowerCase();
const today = () => format(new Date(), 'yyyy-MM-dd');

// Lends grouped by person. Money moves as whole transactions picked from the
// ledger: "Paid for" turns expenses into what someone owes, "Settle" turns
// credits into them paying it back (oldest first; any extra is held for
// their next item). Transaction rows themselves carry no lend controls.
export default function LendsTab({ accounts, lends, loaded, reload, onNewLend }: Props) {
  const { formatMoney } = useFinanceFormatters();
  const peopleQ = useFinLendPeople();
  const people = useMemo(() => peopleQ.data ?? [], [peopleQ.data]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [paidFor, setPaidFor] = useState<{ borrower: string } | null>(null);
  const [settling, setSettling] = useState<FinLendPerson | null>(null);
  const [editing, setEditing] = useState<FinLend | null>(null);

  const lendsByPerson = useMemo(() => {
    const map = new Map<string, FinLend[]>();
    for (const lend of lends) {
      const key = personKey(lend.borrower);
      map.set(key, [...(map.get(key) ?? []), lend]);
    }
    return map;
  }, [lends]);
  const totals = useMemo(() => ({
    owed: people.reduce((sum, p) => sum + p.outstanding, 0),
    held: people.reduce((sum, p) => sum + p.credit, 0),
    returned: lends.reduce((sum, l) => sum + l.repaid, 0),
  }), [people, lends]);

  const done = () => { reload(); peopleQ.refetch(); };
  const removeLend = async (lend: FinLend) => {
    const ask = lend.origin === 'paid_for'
      ? `Unmark "${lend.description}"? It goes back to being your expense.`
      : `Delete the lend to ${lend.borrower}? Its transaction is removed too.`;
    if (!(await confirmDialog(ask))) return;
    try { await finance.deleteLend(lend.id); done(); } catch (error) { toast.error(msg(error)); }
  };
  const removeSettlement = async (id: number) => {
    if (!(await confirmDialog('Unmark this settlement? The credit goes back to plain income.'))) return;
    try { await finance.deleteLendSettlement(id); done(); } catch (error) { toast.error(msg(error)); }
  };
  const removeRepayment = async (lend: FinLend, repaymentId: number) => {
    if (!(await confirmDialog('Delete this repayment? Its transaction is removed too.'))) return;
    try { await finance.deleteLendRepayment(lend.id, repaymentId); done(); } catch (error) { toast.error(msg(error)); }
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
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onNewLend}>Lend money</Button>
          <Button size="sm" onClick={() => setPaidFor({ borrower: '' })}>
            <Plus className="size-4 mr-1" /> Paid for
          </Button>
        </div>
      </div>

      {(!loaded || peopleQ.isLoading) && people.length === 0 ? (
        <ListSkeleton rows={4} />
      ) : people.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">Nobody owes you anything</p>
      ) : (
        <div className="flex flex-col gap-0.5 overflow-hidden rounded-xl">
          {people.map((person) => {
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
                      {person.credit > 0 && <DateBadge tone="positive">{formatMoney(person.credit)} held</DateBadge>}
                    </span>
                  </span>
                  {person.outstanding > 0 ? (
                    <span className="whitespace-nowrap font-serif text-xl font-semibold tabular-nums text-primary">{formatMoney(person.outstanding)}</span>
                  ) : (
                    <DateBadge tone="positive">Settled</DateBadge>
                  )}
                  <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
                </button>

                {open && (
                  <PersonDetail
                    person={person}
                    lends={items}
                    onPaidFor={() => setPaidFor({ borrower: person.borrower })}
                    onSettle={() => setSettling(person)}
                    onEdit={setEditing}
                    onRemoveLend={removeLend}
                    onRemoveSettlement={removeSettlement}
                    onRemoveRepayment={removeRepayment}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <PaidForDialog
        request={paidFor}
        people={people}
        accounts={accounts}
        onClose={() => setPaidFor(null)}
        onDone={() => { setPaidFor(null); done(); }}
      />
      <SettleDialog
        person={settling}
        accounts={accounts}
        onClose={() => setSettling(null)}
        onDone={() => { setSettling(null); done(); }}
      />
      <EditLendDialog lend={editing} accounts={accounts} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); done(); }} />
    </div>
  );
}

// What a person owes and has paid, newest first. Rows share the header's
// grid: text from the name column, the amount ending where the header amount
// ends, and the one row action (delete / unmark) in the chevron's column.
// Tapping a lend opens its editor.
const ROW = 'grid grid-cols-[minmax(0,1fr)_auto_1rem] items-center gap-x-3';

function PersonDetail({ person, lends, onPaidFor, onSettle, onEdit, onRemoveLend, onRemoveSettlement, onRemoveRepayment }: {
  person: FinLendPerson;
  lends: FinLend[];
  onPaidFor: () => void;
  onSettle: () => void;
  onEdit: (lend: FinLend) => void;
  onRemoveLend: (lend: FinLend) => void;
  onRemoveSettlement: (id: number) => void;
  onRemoveRepayment: (lend: FinLend, repaymentId: number) => void;
}) {
  const { formatMoney } = useFinanceFormatters();
  const rows = useMemo(() => [
    ...lends.map((lend) => ({ kind: 'lend' as const, at: lend.lent_at, lend })),
    ...person.settlements.map((settlement) => ({ kind: 'settlement' as const, at: settlement.txn_at, settlement })),
  ].sort((a, b) => b.at.localeCompare(a.at)), [lends, person.settlements]);

  return (
    <div className="flex flex-col pb-3 pl-16 pr-4">
      {rows.map((row) => row.kind === 'lend' ? (
        <div key={'l' + row.lend.id}>
          <div className={cn(ROW, 'min-h-14')}>
            <button type="button" onClick={() => onEdit(row.lend)} className="col-span-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-md py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{row.lend.description || 'Lent'}</span>
                <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="truncate">{format(parseISO(row.lend.lent_at), 'd MMM')} · {row.lend.source_account}</span>
                  {row.lend.status === 'open' && row.lend.due_date && (
                    <DateBadge tone={row.lend.due_date < today() ? 'alert' : 'neutral'} icon={row.lend.remind ? <Bell aria-label="Reminder on" /> : undefined}>
                      Due {format(parseISO(row.lend.due_date), 'd MMM')}
                    </DateBadge>
                  )}
                </span>
              </span>
              <span className="text-right tabular-nums">
                <span className="block whitespace-nowrap text-sm">{formatMoney(row.lend.principal)}</span>
                {row.lend.status === 'settled' ? (
                  <span className="block text-xs text-[hsl(var(--color-complete))]">Settled</span>
                ) : row.lend.repaid > 0 ? (
                  <span className="block whitespace-nowrap text-xs text-muted-foreground">{formatMoney(row.lend.outstanding)} left</span>
                ) : null}
              </span>
            </button>
            <RowAction label={row.lend.origin === 'paid_for' ? 'Unmark' : 'Delete'} onClick={() => onRemoveLend(row.lend)} />
          </div>
          {/* Repayments recorded straight against this lend (older flow). */}
          {row.lend.repayments.filter((r) => !r.settled).map((repayment) => (
            <div key={repayment.id} className={cn(ROW, 'min-h-9 text-xs text-muted-foreground')}>
              <span className="truncate">Returned {format(parseISO(repayment.repaid_at), 'd MMM')} · {repayment.destination_account}</span>
              <span className="whitespace-nowrap tabular-nums text-[hsl(var(--color-complete))]">+{formatMoney(repayment.amount)}</span>
              <RowAction label="Delete repayment" onClick={() => onRemoveRepayment(row.lend, repayment.id)} />
            </div>
          ))}
        </div>
      ) : (
        <div key={'s' + row.settlement.id} className={cn(ROW, 'min-h-14')}>
          <span className="min-w-0 py-2">
            <span className="block truncate text-sm font-medium">{row.settlement.description || 'Received'}</span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {format(parseISO(row.settlement.txn_at), 'd MMM')} · {row.settlement.account}
            </span>
          </span>
          <span className="whitespace-nowrap text-right text-sm tabular-nums text-[hsl(var(--color-complete))]">+{formatMoney(row.settlement.amount)}</span>
          <RowAction label="Unmark settlement" onClick={() => onRemoveSettlement(row.settlement.id)} />
        </div>
      ))}
      <div className="flex items-center gap-2 pt-2">
        {person.outstanding > 0 && <Button variant="tonal" size="sm" onClick={onSettle}>Settle</Button>}
        <Button variant="outline" size="sm" onClick={onPaidFor}><Plus className="size-4 mr-1" /> Paid for</Button>
      </div>
    </div>
  );
}

// Delete glyph centred in the 1rem chevron column; the 32px hit area
// overhangs the column evenly so the glyph, not the box, sits on the edge.
function RowAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="destructive-ghost" size="icon-xs" className="-mx-1.5 size-7" onClick={onClick} aria-label={label} title={label}>
      <Trash2 />
    </Button>
  );
}

// Shared picker body: account filter + search over keyset-paged candidates,
// selection kept across pages and searches.
function CandidatePicker({ kind, accounts, selected, onToggle, highlight }: {
  kind: 'paid_for' | 'settle';
  accounts: FinAccount[];
  selected: Map<number, FinLendCandidate>;
  onToggle: (c: FinLendCandidate) => void;
  highlight?: number;
}) {
  const { formatMoney } = useFinanceFormatters();
  const [accountId, setAccountId] = useState('0');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const query = useLendCandidates(kind, debounced, Number(accountId), true);
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const accountItems = [{ value: '0', label: 'All accounts' }, ...accounts.map((a) => ({ value: String(a.id), label: a.name }))];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="pl-10" />
        </div>
        <Select value={accountId} onValueChange={(value) => setAccountId(value ?? '0')} items={accountItems}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{accountItems.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="-mx-2 min-h-40 flex-1 overflow-y-auto overscroll-contain pb-4 [mask-image:linear-gradient(to_bottom,black_calc(100%-24px),transparent)]">
        {query.isLoading ? (
          <ListSkeleton rows={4} />
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No {kind === 'settle' ? 'credits' : 'expenses'} found</p>
        ) : (
          <div className="flex flex-col">
            {items.map((c) => {
              const checked = selected.has(c.id);
              return (
                <label key={c.id} className={cn('flex min-h-14 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-[hsl(var(--on-surface)/0.06)]', checked && 'bg-[hsl(var(--secondary-container)/0.6)] hover:bg-[hsl(var(--secondary-container)/0.75)]')}>
                  <Checkbox checked={checked} onCheckedChange={() => onToggle(c)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{c.description || c.category_name || 'Untitled'}</span>
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="shrink-0 tabular-nums">{format(parseISO(c.txn_at), 'd MMM')}</span>
                      <span aria-hidden>·</span>
                      <span className="truncate">{c.account}</span>
                      {highlight !== undefined && Math.abs(c.amount - highlight) < 0.005 && <DateBadge tone="accent">Matches</DateBadge>}
                    </span>
                  </span>
                  <span className="whitespace-nowrap pr-1 text-sm tabular-nums">{formatMoney(c.amount)}</span>
                </label>
              );
            })}
            {query.hasNextPage && (
              <Button variant="ghost" size="sm" className="mt-1 self-center" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
                {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Header, body and footer stay inside the viewport; only the list scrolls.
const PICKER_DIALOG = 'sm:max-w-lg max-h-[min(90dvh,820px)] grid-rows-[auto_minmax(0,1fr)_auto]';

function useSelection() {
  const [selected, setSelected] = useState<Map<number, FinLendCandidate>>(new Map());
  const toggle = (c: FinLendCandidate) => setSelected((prev) => {
    const next = new Map(prev);
    if (next.has(c.id)) next.delete(c.id); else next.set(c.id, c);
    return next;
  });
  const total = [...selected.values()].reduce((sum, c) => sum + c.amount, 0);
  return { selected, toggle, total, reset: () => setSelected(new Map()) };
}

function PaidForDialog({ request, people, accounts, onClose, onDone }: {
  request: { borrower: string } | null;
  people: FinLendPerson[];
  accounts: FinAccount[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { formatMoney } = useFinanceFormatters();
  const [borrower, setBorrower] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const { selected, toggle, total, reset } = useSelection();
  useEffect(() => {
    if (!request) return;
    setBorrower(request.borrower); setDueDate(''); reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);
  const save = async () => {
    if (!borrower.trim() || selected.size === 0 || saving) return;
    setSaving(true);
    try {
      await finance.markPaidFor({ borrower: borrower.trim(), transaction_ids: [...selected.keys()], ...(dueDate ? { due_date: dueDate } : {}) });
      onDone();
    } catch (error) { toast.error(msg(error)); } finally { setSaving(false); }
  };
  return <Dialog open={!!request} onOpenChange={(next) => { if (!next) onClose(); }}>
    <DialogContent className={PICKER_DIALOG}>
      <DialogHeader><DialogTitle>Paid for</DialogTitle></DialogHeader>
      <div className="flex min-h-0 flex-col gap-3">
        <Field label="Person">
          <Input value={borrower} onChange={(e) => setBorrower(e.target.value)} placeholder="Dad" />
        </Field>
        {people.length > 0 && !request?.borrower && (
          <div className="-mt-1 flex flex-wrap gap-1.5">
            {people.slice(0, 8).map((p) => (
              <StateChip
                key={p.borrower}
                selected={personKey(p.borrower) === personKey(borrower)}
                onClick={() => setBorrower(p.borrower)}
                // Neutral chips are surface-container-high, the dialog's own tone.
                className={personKey(p.borrower) === personKey(borrower) ? undefined : 'bg-[hsl(var(--surface-container-highest))]'}
              >
                {p.borrower}
              </StateChip>
            ))}
          </div>
        )}
        {request && <CandidatePicker kind="paid_for" accounts={accounts} selected={selected} onToggle={toggle} />}
        <Field label="Due date">
          <DatePicker value={dueDate} onChange={setDueDate} placeholder="Card bill due date" />
        </Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={saving || !borrower.trim() || selected.size === 0}>
          {saving ? 'Saving…' : selected.size ? `Mark ${selected.size} · ${formatMoney(total)}` : 'Mark'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

function SettleDialog({ person, accounts, onClose, onDone }: {
  person: FinLendPerson | null;
  accounts: FinAccount[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { formatMoney } = useFinanceFormatters();
  const [mode, setMode] = useState<'pick' | 'record'>('pick');
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const { selected, toggle, total, reset } = useSelection();
  useEffect(() => {
    if (!person) return;
    const receiving = accounts.find((a) => a.type === 'salary') ?? accounts.find((a) => a.type === 'savings') ?? accounts.find((a) => a.type !== 'credit_card');
    setMode('pick'); reset(); setNote(''); setDate(today());
    setAccountId(receiving ? String(receiving.id) : ''); setAmount(String(person.outstanding));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person]);
  const paying = mode === 'pick' ? total : Number(amount) || 0;
  const owed = person?.outstanding ?? 0;
  const save = async () => {
    if (!person || saving) return;
    if (mode === 'pick' && selected.size === 0) return;
    if (mode === 'record' && (!accountId || paying <= 0)) return;
    setSaving(true);
    try {
      await finance.settleLends(mode === 'pick'
        ? { borrower: person.borrower, transaction_ids: [...selected.keys()] }
        : { borrower: person.borrower, account_id: Number(accountId), amount: paying, received_at: date, note });
      onDone();
    } catch (error) { toast.error(msg(error)); } finally { setSaving(false); }
  };
  const receiving = accounts.filter((a) => a.type !== 'credit_card');
  return <Dialog open={!!person} onOpenChange={(next) => { if (!next) onClose(); }}>
    <DialogContent className={PICKER_DIALOG}>
      <DialogHeader><DialogTitle>Settle with {person?.borrower}</DialogTitle></DialogHeader>
      <div className="flex min-h-0 flex-col gap-3">
        <SegmentedButton
          stretch
          value={mode}
          onChange={setMode}
          options={[{ value: 'pick', label: 'From transactions' }, { value: 'record', label: 'Record received' }]}
        />
        {/* Owes → paying → what remains, as figures. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <DateBadge>Owes {formatMoney(owed)}</DateBadge>
          {paying > 0 && (paying < owed
            ? <DateBadge>{formatMoney(owed - paying)} left</DateBadge>
            : paying > owed
              ? <DateBadge tone="positive">{formatMoney(paying - owed)} held</DateBadge>
              : <DateBadge tone="positive">Settled</DateBadge>)}
        </div>
        {person && mode === 'pick' && (
          <CandidatePicker kind="settle" accounts={receiving} selected={selected} onToggle={toggle} highlight={owed} />
        )}
        {mode === 'record' && <>
          <Field label="Into account">
            <Select value={accountId} onValueChange={(value) => setAccountId(value ?? '')} items={receiving.map((a) => ({ value: String(a.id), label: a.name }))}>
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>{receiving.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Amount"><Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Date"><DatePicker value={date} onChange={setDate} /></Field>
          <Field label="Note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></Field>
        </>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={saving || paying <= 0}>{saving ? 'Saving…' : 'Settle'}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

export function EditLendDialog({ lend, accounts, onClose, onSaved }: { lend: FinLend | null; accounts: FinAccount[]; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
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
  useEffect(() => {
    if (!lend) return;
    const lentAt = txnAtToParts(lend.lent_at);
    setSourceAccountId(String(lend.source_account_id)); setAmount(String(lend.principal));
    setBorrower(lend.borrower); setDescription(lend.description); setNote(lend.note);
    setLentDate(lentAt.date); setLentTime(lentAt.time);
    setDueDate(lend.due_date ?? ''); setRemind(lend.remind);
  }, [lend]);
  const save = async () => {
    const parsedAmount = Number(amount);
    if (!lend || !sourceAccountId || !borrower.trim() || !lentDate || !lentTime || saving) return;
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error('Enter a valid principal amount.');
      return;
    }
    if (parsedAmount < lend.repaid) {
      toast.error(`Principal cannot be below the amount already returned (${lend.repaid.toFixed(2)}).`);
      return;
    }
    setSaving(true);
    try {
      await finance.updateLend(lend.id, {
        source_account_id: Number(sourceAccountId), amount: parsedAmount,
        borrower: borrower.trim(), description, note,
        lent_at: partsToTxnAt(lentDate, lentTime),
        due_date: dueDate, remind: remind && !!dueDate,
      });
      onSaved();
    } catch (error) { toast.error(msg(error)); } finally { setSaving(false); }
  };
  return <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>Edit Lend</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <Field label="From account">
          <Select value={sourceAccountId} onValueChange={(value) => setSourceAccountId(value ?? '')} items={accounts.map((a) => ({ value: String(a.id), label: a.name }))}>
            <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
            <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Principal"><Input type="number" inputMode="decimal" min={lend?.repaid || 0} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        {!!lend?.repaid && <p className="-mt-2 text-xs text-muted-foreground">{lend.repaid.toFixed(2)} has already been returned, so principal cannot be lower than that.</p>}
        <Field label="Borrower"><Input value={borrower} onChange={(e) => setBorrower(e.target.value)} /></Field>
        <Field label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
          <Field label="Lent date"><DatePicker value={lentDate} onChange={setLentDate} /></Field>
          <Field label="Time"><TimePicker value={lentTime} onChange={setLentTime} /></Field>
        </div>
        <Field label="Due date"><DatePicker value={dueDate} onChange={setDueDate} /></Field>
        <div className="flex items-center justify-between rounded-lg px-3 py-2">
          <div><Label>Due reminder</Label><p className="text-xs text-muted-foreground">One notification when due.</p></div>
          <Switch checked={remind && !!dueDate} disabled={!dueDate} onCheckedChange={setRemind} />
        </div>
        <Field label="Note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} /></Field>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving || !sourceAccountId || !borrower.trim() || !amount || !lentDate || !lentTime}>{saving ? 'Saving…' : 'Save'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="font-mono text-xs label-kicker text-muted-foreground">{label}</Label>{children}</div>;
}
