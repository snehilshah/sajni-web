import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { ArrowUpRight, Bell, Check, ChevronDown, MoreVertical, Pencil, Plus, Receipt, RotateCcw, Search, Trash2 } from '@/components/ui/icons';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { DateBadge, StateChip } from '@/components/ui/state-chip';
import { cn } from '@/lib/utils';

import { finance, type FinAccount, type FinLend, type FinLendCandidate, type FinLendPerson, type FinLendRepayment, type FinLendSettlement } from '@/api';
import { confirmDialog } from '@/lib/confirm';
import { failureText } from '@/lib/errors';
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
import { useFinCategories, useFinLendPeople, useLendCandidates } from '@/queries/finance';
import { CategoryChips } from './CategoryChips';
import { AnimatedMoney } from './AnimatedMoney';
import { useFinanceFormatters } from './useFinancePrivacy';
import { ListSkeleton } from './Skeletons';
import { Stat, StatGroup } from './StatGroup';
import { partsToTxnAt, txnAtToParts, sumMoney, subMoney } from './utils';
import { Money } from './Money';
import { useEditorAutosave } from '@/hooks/use-autosave';
import { AutosaveStatus, EditActions } from '@/components/autosave';

interface Props {
  accounts: FinAccount[];
  lends: FinLend[];
  loaded: boolean;
  reload: () => void;
  onNewLend: () => void;
}

const personKey = (name: string) => name.trim().toLowerCase();
const today = () => format(new Date(), 'yyyy-MM-dd');

// Lends grouped by person. "Paid for" turns expenses (or a share of one) into
// what someone owes, "Settle" turns credits into them paying it back (oldest
// first; any extra is held for their next item), and "Forgive" writes off what
// is left as the user's spending. The transaction sheet does the same for one
// transaction at a time (Split, From a person).
export default function LendsTab({ accounts, lends, loaded, reload, onNewLend }: Props) {
  const peopleQ = useFinLendPeople();
  const people = useMemo(() => peopleQ.data ?? [], [peopleQ.data]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [showSettled, setShowSettled] = useState(false);
  const [paidFor, setPaidFor] = useState<{ borrower: string } | null>(null);
  const [settling, setSettling] = useState<FinLendPerson | null>(null);
  const [forgiving, setForgiving] = useState<FinLendPerson | null>(null);
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
    owed: sumMoney(people, (p) => p.outstanding),
    held: sumMoney(people, (p) => p.credit),
    returned: sumMoney(lends, (l) => l.repaid),
  }), [people, lends]);

  const done = () => { reload(); peopleQ.refetch(); };
  const removeLend = async (lend: FinLend) => {
    const ask = lend.origin === 'paid_for'
      ? `Unmark "${lend.description}"? It goes back to being your expense.`
      : `Delete the lend to ${lend.borrower}? Its transaction is removed too.`;
    if (!(await confirmDialog(ask))) return;
    try { await finance.deleteLend(lend.id); done(); } catch (error) { toast.error(failureText(error)); }
  };
  const removeSettlement = async (id: number, forgiven: boolean) => {
    if (!(await confirmDialog(forgiven
      ? 'Undo this forgive? They owe that amount again, and it leaves your spending.'
      : 'Unmark this settlement? The credit goes back to plain income.'))) return;
    try { await finance.deleteLendSettlement(id); done(); } catch (error) { toast.error(failureText(error)); }
  };
  const removeRepayment = async (lend: FinLend, repaymentId: number) => {
    if (!(await confirmDialog('Delete this repayment? Its transaction is removed too.'))) return;
    try { await finance.deleteLendRepayment(lend.id, repaymentId); done(); } catch (error) { toast.error(failureText(error)); }
  };

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
            onPaidFor={() => setPaidFor({ borrower: person.borrower })}
            onSettle={() => setSettling(person)}
            onForgive={() => setForgiving(person)}
            onEdit={setEditing}
            onRemoveLend={removeLend}
            onRemoveSettlement={removeSettlement}
            onRemoveRepayment={removeRepayment}
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
        {/* Same height and shape, so the pair reads as one group whose
            last edge sits on the content edge. */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onNewLend}><ArrowUpRight className="size-4" /> Lend</Button>
          <Button size="sm" onClick={() => setPaidFor({ borrower: '' })}><Plus className="size-4" /> Paid for</Button>
        </div>
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
      <ForgiveDialog
        person={forgiving}
        onClose={() => setForgiving(null)}
        onDone={() => { setForgiving(null); done(); }}
      />
      <EditLendDialog lend={editing} accounts={accounts} onClose={() => setEditing(null)} onAutosaved={done} />
    </div>
  );
}

// A person's history as a timeline, oldest first, so it reads down to where
// things stand now. Rows share the header's grid: the node sits under the
// avatar, text in the name column, the amount ends where the header amount
// ends, and the row menu (edit / unmark / delete) sits in the chevron's
// column. Tapping a lend opens its editor.
const ROW = 'grid grid-cols-[2.25rem_minmax(0,1fr)_auto_1rem] items-center gap-x-3';

type Event =
  | { kind: 'lend'; at: string; lend: FinLend }
  | { kind: 'repayment'; at: string; lend: FinLend; repayment: FinLendRepayment }
  | { kind: 'settlement'; at: string; settlement: FinLendSettlement };

function PersonDetail({ person, lends, onPaidFor, onSettle, onForgive, onEdit, onRemoveLend, onRemoveSettlement, onRemoveRepayment }: {
  person: FinLendPerson;
  lends: FinLend[];
  onPaidFor: () => void;
  onSettle: () => void;
  onForgive: () => void;
  onEdit: (lend: FinLend) => void;
  onRemoveLend: (lend: FinLend) => void;
  onRemoveSettlement: (id: number, forgiven: boolean) => void;
  onRemoveRepayment: (lend: FinLend, repaymentId: number) => void;
}) {
  const events = useMemo<Event[]>(() => [
    ...lends.map((lend) => ({ kind: 'lend' as const, at: lend.lent_at, lend })),
    // Repayments recorded straight against a lend (older flow).
    ...lends.flatMap((lend) => lend.repayments.filter((r) => !r.settled)
      .map((repayment) => ({ kind: 'repayment' as const, at: repayment.repaid_at, lend, repayment }))),
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
            <div key={'l' + lend.id} className={cn(ROW, 'min-h-14')}>
              <TimelineNode {...rail} tone={lend.status === 'settled' ? 'positive' : overdue ? 'alert' : 'neutral'}>
                {lend.status === 'settled' ? <Check className="!size-3" /> : lend.origin === 'paid_for' ? <Receipt /> : <ArrowUpRight />}
              </TimelineNode>
              <button type="button" onClick={() => onEdit(lend)} className="col-span-2 grid grid-cols-subgrid items-center rounded-md py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{lend.description || 'Lent'}</span>
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
                  {lend.status === 'open' && lend.repaid > 0 && (
                    <span className="block whitespace-nowrap text-xs text-muted-foreground"><Money value={lend.outstanding} /> left</span>
                  )}
                </span>
              </button>
              <RowMenu label={lend.description || 'lend'}>
                <DropdownMenuItem onClick={() => onEdit(lend)}><Pencil /> Edit</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => onRemoveLend(lend)}>
                  {lend.origin === 'paid_for' ? <><RotateCcw /> Unmark paid for</> : <><Trash2 /> Delete lend</>}
                </DropdownMenuItem>
              </RowMenu>
            </div>
          );
        }
        // A forgive closes debt like a payment but brings no money in: a
        // neutral ✓ node, no green, no account.
        const forgiven = event.kind === 'settlement' && event.settlement.forgiven;
        const received = event.kind === 'settlement'
          ? { id: 's' + event.settlement.id, title: forgiven ? 'Forgiven' : event.settlement.description || 'Received', account: event.settlement.account, amount: event.settlement.amount, held: event.settlement.amount - event.settlement.applied }
          : { id: 'r' + event.repayment.id, title: 'Returned', account: event.repayment.destination_account, amount: event.repayment.amount, held: 0 };
        return (
          <div key={received.id} className={cn(ROW, 'min-h-14')}>
            <TimelineNode {...rail} tone={forgiven ? 'neutral' : 'positive'}>{forgiven ? <Check className="!size-3" /> : <ArrowUpRight className="rotate-180" />}</TimelineNode>
            <span className="min-w-0 py-2">
              <span className="block truncate text-sm font-medium">{received.title}</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{format(parseISO(event.at), 'd MMM')}{forgiven ? '' : ' · ' + received.account}</span>
            </span>
            <span className="text-right tabular-nums">
              {forgiven
                ? <span className="block whitespace-nowrap text-sm"><Money value={received.amount} /></span>
                : <span className="block whitespace-nowrap text-sm text-[hsl(var(--color-complete))]">+<Money value={received.amount} /></span>}
              {received.held > 0.005 && <span className="block whitespace-nowrap text-xs text-muted-foreground"><Money value={received.held} /> held</span>}
            </span>
            <RowMenu label={received.title}>
              {event.kind === 'settlement' ? (
                <DropdownMenuItem variant="destructive" onClick={() => onRemoveSettlement(event.settlement.id, forgiven)}><RotateCcw /> {forgiven ? 'Undo forgive' : 'Unmark settlement'}</DropdownMenuItem>
              ) : (
                <DropdownMenuItem variant="destructive" onClick={() => onRemoveRepayment(event.lend, event.repayment.id)}><Trash2 /> Delete repayment</DropdownMenuItem>
              )}
            </RowMenu>
          </div>
        );
      })}
      <div className={cn(ROW, 'pt-2')}>
        <div className="col-start-2 col-span-3 flex items-center gap-2">
          {person.outstanding > 0 && <Button variant="tonal" size="sm" onClick={onSettle}><ArrowUpRight className="size-4 rotate-180" /> Settle</Button>}
          <Button variant="outline" size="sm" onClick={onPaidFor}><Plus className="size-4" /> Paid for</Button>
          {person.outstanding > 0 && <Button variant="outline" size="sm" onClick={onForgive}>Forgive</Button>}
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

// One quiet menu per row, its glyph centred in the chevron column; the
// destructive choice lives inside it, labelled, instead of a red icon per row.
function RowMenu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Options for ${label}`}
        className="-mx-2 grid size-8 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-[hsl(var(--on-surface)/0.08)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
      >
        <MoreVertical className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
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
                  <span className="whitespace-nowrap pr-1 text-sm tabular-nums"><Money value={c.amount} /></span>
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
  const total = sumMoney([...selected.values()], (c) => c.amount);
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
  // One bill can be shared: their part only; the rest stays yours.
  const [shareMode, setShareMode] = useState<'all' | 'half' | 'custom'>('all');
  const [customShare, setCustomShare] = useState('');
  const [saving, setSaving] = useState(false);
  const { selected, toggle, total, reset } = useSelection();
  useEffect(() => {
    if (!request) return;
    setBorrower(request.borrower); setDueDate(''); setShareMode('all'); setCustomShare(''); reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);
  const single = selected.size === 1;
  const share = !single || shareMode === 'all' ? total
    : shareMode === 'half' ? Math.round(total * 50) / 100
      : Math.round((parseFloat(customShare) || 0) * 100) / 100;
  const shareBad = single && (share <= 0 || share > total);
  const save = async () => {
    if (!borrower.trim() || selected.size === 0 || saving || shareBad) return;
    setSaving(true);
    try {
      await finance.markPaidFor({
        borrower: borrower.trim(), transaction_ids: [...selected.keys()],
        ...(single && share < total ? { share } : {}),
        ...(dueDate ? { due_date: dueDate } : {}),
      });
      onDone();
    } catch (error) { toast.error(failureText(error)); } finally { setSaving(false); }
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
        {single && (
          <Field label="Their share">
            <div className="flex flex-wrap items-center gap-1.5">
              {(['all', 'half', 'custom'] as const).map((m) => (
                <StateChip key={m} selected={shareMode === m} onClick={() => setShareMode(m)}
                  className={shareMode === m ? undefined : 'bg-[hsl(var(--surface-container-highest))]'}>
                  {m === 'all' ? 'All' : m === 'half' ? '½' : 'Custom'}
                </StateChip>
              ))}
              {shareMode === 'custom' && (
                <Input type="number" inputMode="decimal" value={customShare} onChange={(e) => setCustomShare(e.target.value)} placeholder="Their share" className="h-8 w-32" aria-invalid={shareBad} />
              )}
              {share > 0 && share < total && <DateBadge>You <Money value={subMoney(total, share)} /></DateBadge>}
            </div>
          </Field>
        )}
        <Field label="Due date">
          <DatePicker value={dueDate} onChange={setDueDate} placeholder="Card bill due date" />
        </Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={saving || !borrower.trim() || selected.size === 0 || shareBad}>
          {saving ? 'Saving…' : selected.size ? `Mark ${selected.size} · ${formatMoney(share)}` : 'Mark'}
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
  // Exact to the paisa, so paying the full amount reads Settled, not "₹0.00 left".
  const remaining = subMoney(owed, paying);
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
    } catch (error) { toast.error(failureText(error)); } finally { setSaving(false); }
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
          <DateBadge>Owes <Money value={owed} /></DateBadge>
          {paying > 0 && (remaining > 0
            ? <DateBadge><Money value={remaining} /> left</DateBadge>
            : remaining < 0
              ? <DateBadge tone="positive"><Money value={-remaining} /> held</DateBadge>
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
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!person) return;
    setAmount(String(person.outstanding)); setCategoryId(''); setDate(today()); setNote('');
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
        forgiven_at: partsToTxnAt(date, '12:00'), note,
      });
      onDone();
    } catch (error) { toast.error(failureText(error)); } finally { setSaving(false); }
  };
  return <Dialog open={!!person} onOpenChange={(next) => { if (!next) onClose(); }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>Forgive {person?.borrower}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <Field label="Amount"><Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={bad} /></Field>
        <div className="-mt-1 flex flex-wrap gap-1.5">
          <DateBadge>Owes <Money value={owed} /></DateBadge>
          {value > 0 && value <= owed && (subMoney(owed, value) > 0
            ? <DateBadge><Money value={subMoney(owed, value)} /> still owed</DateBadge>
            : <DateBadge tone="positive">Settled</DateBadge>)}
        </div>
        <Field label="Counts as">
          <CategoryChips categories={expenseCats} value={picked} onChange={setCategoryId} />
        </Field>
        <Field label="Date"><DatePicker value={date} onChange={setDate} /></Field>
        <Field label="Note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={saving || bad}>{saving ? 'Saving…' : 'Forgive'}</Button>
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

// Edit-only: lends are created from Paid for / Lend. Edits save themselves
// (the server rebalances the person's settlements after each one).
export function EditLendDialog({ lend, accounts, onClose, onAutosaved }: {
  lend: FinLend | null;
  accounts: FinAccount[];
  onClose: () => void;
  /** An edit saved while the dialog stays open: refresh, keep editing. */
  onAutosaved: () => void;
}) {
  const { formatMoney } = useFinanceFormatters();
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
  const values: LendValues = { sourceAccountId, amount, borrower, description, note, lentDate, lentTime, dueDate, remind };
  const apply = (v: LendValues) => {
    setSourceAccountId(v.sourceAccountId); setAmount(v.amount); setBorrower(v.borrower);
    setDescription(v.description); setNote(v.note); setLentDate(v.lentDate); setLentTime(v.lentTime);
    setDueDate(v.dueDate); setRemind(v.remind);
  };
  const principal = Number(amount);
  const invalid = !sourceAccountId ? 'pick the account it came from.'
    : !borrower.trim() ? "enter who it's for."
      : !lentDate || !lentTime ? 'pick when it was lent.'
        : !Number.isFinite(principal) || principal <= 0 ? 'enter a principal above zero.'
          : lend && principal < lend.repaid ? `principal can't be below the ${formatMoney(lend.repaid)} already returned.`
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
        borrower: v.borrower.trim(), description: v.description, note: v.note,
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
  return <Dialog open={open} onOpenChange={(next) => { if (!next) requestClose(); }}>
    <DialogContent showCloseButton={false} className="sm:max-w-md">
      <DialogHeader className="flex-row items-baseline justify-between gap-3">
        <DialogTitle>Edit lend</DialogTitle>
        <AutosaveStatus status={autosave.status} />
      </DialogHeader>
      <div className="grid gap-3">
        <Field label="From account">
          <Select value={sourceAccountId} onValueChange={(value) => setSourceAccountId(value ?? '')} items={accounts.map((a) => ({ value: String(a.id), label: a.name }))}>
            <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
            <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label={lend?.origin === 'paid_for' ? 'Their share of the bill' : 'Principal'}><Input type="number" inputMode="decimal" min={lend?.repaid || 0} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        {lend?.origin === 'paid_for' && <p className="-mt-2 text-xs text-muted-foreground">The bill itself stays the same; the rest is your spending.</p>}
        {!!lend?.repaid && <p className="-mt-2 text-xs text-muted-foreground"><Money value={lend.repaid} /> has already been returned, so principal cannot be lower than that.</p>}
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
      <DialogFooter><EditActions changed={autosave.changed} onUndo={autosave.undo} onDone={requestClose} /></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="font-mono text-xs label-kicker text-muted-foreground">{label}</Label>{children}</div>;
}
