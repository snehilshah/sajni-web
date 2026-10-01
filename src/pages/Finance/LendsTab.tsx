import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { Bell, Check, Pencil, Plus, Trash2 } from '@/components/ui/icons';
import { DateBadge } from '@/components/ui/state-chip';
import { cn } from '@/lib/utils';

import { finance, type FinAccount, type FinLend } from '@/api';
import { confirmDialog } from '@/lib/confirm';
import { msg } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { TimePicker } from '@/components/ui/time-picker';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

export default function LendsTab({ accounts, lends, loaded, reload, onNewLend }: Props) {
  const { formatMoney } = useFinanceFormatters();
  const [editing, setEditing] = useState<FinLend | null>(null);
  const [repaying, setRepaying] = useState<FinLend | null>(null);
  const totals = useMemo(() => lends.reduce((sum, lend) => ({
    principal: sum.principal + lend.principal,
    repaid: sum.repaid + lend.repaid,
    outstanding: sum.outstanding + lend.outstanding,
  }), { principal: 0, repaid: 0, outstanding: 0 }), [lends]);

  const remove = async (lend: FinLend) => {
    const detail = lend.repayments.length
      ? ` This also removes ${lend.repayments.length} linked repayment ${lend.repayments.length === 1 ? 'entry' : 'entries'}.`
      : '';
    if (!(await confirmDialog(`Delete the lend to ${lend.borrower}?${detail}`))) return;
    try {
      await finance.deleteLend(lend.id);
      reload();
    } catch (error) {
      toast.error(msg(error));
    }
  };
  const removeRepayment = async (lend: FinLend, repaymentId: number) => {
    if (!(await confirmDialog('Delete this repayment entry? The receiving account balance and outstanding amount will both be restored.'))) return;
    try {
      await finance.deleteLendRepayment(lend.id, repaymentId);
      reload();
    } catch (error) {
      toast.error(msg(error));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <StatGroup className="grid-cols-2 md:grid-cols-3">
        <Stat label="Money lent" value={<AnimatedMoney value={totals.outstanding} />} tone="primary" />
        <Stat label="Returned" value={<AnimatedMoney value={totals.repaid} />} />
        <Stat label="Lifetime principal" value={<AnimatedMoney value={totals.principal} />} className="col-span-2 md:col-span-1" />
      </StatGroup>

      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-lg font-semibold">Lends</h2>
        <Button size="sm" onClick={onNewLend}>
          <Plus className="size-4 mr-1" /> New lend
        </Button>
      </div>

      {!loaded && lends.length === 0 ? (
        <ListSkeleton rows={4} />
      ) : lends.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">No lends yet</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {lends.map((lend) => {
            const overdue = lend.status === 'open' && !!lend.due_date && lend.due_date < format(new Date(), 'yyyy-MM-dd');
            const settled = lend.status === 'settled';
            const pct = lend.principal > 0 ? Math.min((lend.repaid / lend.principal) * 100, 100) : 0;
            return (
              <article key={lend.id} className={cn('rounded-xl bg-card p-4 flex flex-col gap-3', settled && 'opacity-70')}>
                {/* Who and how much is still out: the two things you open
                    this card for. Open is the default and gets no badge. */}
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{lend.borrower}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {lend.source_account}{lend.description ? ` · ${lend.description}` : ''}
                    </div>
                  </div>
                  {settled ? (
                    <DateBadge tone="positive">Settled</DateBadge>
                  ) : (
                    <span className="whitespace-nowrap font-serif text-xl font-semibold tabular-nums text-primary">
                      {formatMoney(lend.outstanding)}
                    </span>
                  )}
                </div>

                {/* Returned so far, as a bar against the principal. */}
                <div className="flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[hsl(var(--surface-container-highest))]">
                    <div className="h-full rounded-full bg-primary" style={{ width: pct + '%' }} />
                  </div>
                  <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                    {formatMoney(lend.repaid)} of {formatMoney(lend.principal)}
                  </span>
                </div>

                <div className="flex min-h-5 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <DateBadge>Lent {format(parseISO(lend.lent_at), 'd MMM')}</DateBadge>
                  {lend.due_date && (
                    <DateBadge tone={overdue ? 'alert' : 'neutral'} icon={lend.remind ? <Bell aria-label="Reminder on" /> : undefined}>
                      Due {format(parseISO(lend.due_date), 'd MMM')}
                    </DateBadge>
                  )}
                </div>

                {lend.repayments.length > 0 && (
                  <div className="flex flex-col gap-1">
                    {lend.repayments.map((repayment) => (
                      <div key={repayment.id} className="group flex items-center gap-2 text-xs">
                        <Check className="size-3 text-primary" />
                        <span className="flex-1 truncate">{format(parseISO(repayment.repaid_at), 'd MMM yyyy')} · {repayment.destination_account}</span>
                        <span className="tabular-nums">{formatMoney(repayment.amount)}</span>
                        <button type="button" onClick={() => removeRepayment(lend, repayment.id)} className="-mr-1.5 grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive" aria-label="Delete repayment">
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-1">
                  {!settled && (
                    <Button variant="outline" size="sm" onClick={() => setRepaying(lend)}>
                      <Check className="size-3.5 mr-1" /> Record repayment
                    </Button>
                  )}
                  <div className="-mr-2 ml-auto flex">
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditing(lend)} aria-label={`Edit lend to ${lend.borrower}`} title="Edit"><Pencil className="size-4" /></Button>
                    <Button variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" size="icon-sm" onClick={() => remove(lend)} aria-label={`Delete lend to ${lend.borrower}`} title="Delete"><Trash2 className="size-4" /></Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <EditLendDialog lend={editing} accounts={accounts} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      <RepaymentDialog lend={repaying} accounts={accounts} onClose={() => setRepaying(null)} onSaved={() => { setRepaying(null); reload(); }} />
    </div>
  );
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

function RepaymentDialog({ lend, accounts, onClose, onSaved }: { lend: FinLend | null; accounts: FinAccount[]; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [note, setNote] = useState('');
  const open = !!lend;
  useEffect(() => {
    if (!lend) return;
    const source = accounts.find((account) => account.id === lend.source_account_id);
    const receiving = source?.type === 'credit_card'
      ? accounts.find((account) => account.type === 'salary')
        ?? accounts.find((account) => account.type === 'savings')
        ?? accounts.find((account) => account.type !== 'credit_card')
      : source;
    setAccountId(receiving ? String(receiving.id) : ''); setAmount(String(lend.outstanding));
    setDate(format(new Date(), 'yyyy-MM-dd')); setNote('');
  }, [lend, accounts]);
  const save = async () => {
    const parsed = Number(amount);
    if (!lend || !accountId || parsed <= 0 || parsed > lend.outstanding || saving) return;
    setSaving(true);
    try {
      await finance.recordLendRepayment(lend.id, { destination_account_id: Number(accountId), amount: parsed, repaid_at: date, note });
      onSaved();
    } catch (error) { toast.error(msg(error)); } finally { setSaving(false); }
  };
  return <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>Repayment from {lend?.borrower}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <Field label="Into account">
          <Select value={accountId} onValueChange={(value) => setAccountId(value ?? '')} items={accounts.map((a) => ({ value: String(a.id), label: a.name }))}>
            <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
            <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label={`Principal returned · max ${lend?.outstanding.toFixed(2) ?? '0.00'}`}><Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Date"><DatePicker value={date} onChange={setDate} /></Field>
        <Field label="Note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Optional. Record interest separately as income." /></Field>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Record repayment'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="font-mono text-xs label-kicker text-muted-foreground">{label}</Label>{children}</div>;
}
