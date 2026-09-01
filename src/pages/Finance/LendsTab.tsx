import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { Bell, Check, Coins, Pencil, Plus, Trash2 } from '@/components/ui/icons';

import { finance, type FinAccount, type FinLend } from '@/api';
import { confirmDialog } from '@/lib/confirm';
import { msg } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AnimatedMoney } from './AnimatedMoney';
import { useFinanceFormatters } from './useFinancePrivacy';
import { ListSkeleton } from './Skeletons';

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
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Summary label="Money lent" value={totals.outstanding} tone="primary" />
        <Summary label="Returned" value={totals.repaid} />
        <Summary label="Lifetime principal" value={totals.principal} className="col-span-2 md:col-span-1" />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg font-semibold">Lends</h2>
          <p className="text-xs text-muted-foreground">Outstanding principal is an asset, separate from money in accounts.</p>
        </div>
        <Button size="sm" onClick={onNewLend}>
          <Plus className="size-4 mr-1" /> New lend
        </Button>
      </div>

      {!loaded && lends.length === 0 ? (
        <ListSkeleton rows={4} />
      ) : lends.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No lends yet. Choose Lend when adding a transaction to track money someone owes you.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {lends.map((lend) => {
            const overdue = lend.status === 'open' && !!lend.due_date && lend.due_date < format(new Date(), 'yyyy-MM-dd');
            return (
              <article key={lend.id} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Coins className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{lend.borrower}</div>
                    <div className="font-mono text-xs text-muted-foreground truncate">
                      {lend.source_account}{lend.description ? ` · ${lend.description}` : ''}
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 font-mono text-xs ${lend.status === 'settled' ? 'bg-primary/10 text-primary' : overdue ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-secondary-foreground'}`}>
                    {lend.status === 'settled' ? 'settled' : overdue ? 'overdue' : 'open'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-3">
                  <Figure label="Principal" value={formatMoney(lend.principal)} />
                  <Figure label="Returned" value={formatMoney(lend.repaid)} />
                  <Figure label="Outstanding" value={formatMoney(lend.outstanding)} strong />
                </div>

                <div className="flex min-h-5 items-center gap-2 text-xs text-muted-foreground">
                  <span>Lent {format(parseISO(lend.lent_at), 'd MMM yyyy')}</span>
                  {lend.due_date && <><span>·</span><span className={overdue ? 'text-destructive' : ''}>Due {format(parseISO(lend.due_date), 'd MMM yyyy')}</span></>}
                  {lend.remind && <Bell className="size-3" aria-label="Reminder on" />}
                </div>

                {lend.repayments.length > 0 && (
                  <div className="border-t border-border pt-2 flex flex-col gap-1">
                    {lend.repayments.map((repayment) => (
                      <div key={repayment.id} className="flex items-center gap-2 text-xs">
                        <Check className="size-3 text-primary" />
                        <span className="flex-1 truncate">{format(parseISO(repayment.repaid_at), 'd MMM yyyy')} · {repayment.destination_account}</span>
                        <span className="font-mono tabular-nums">{formatMoney(repayment.amount)}</span>
                        <button type="button" onClick={() => removeRepayment(lend, repayment.id)} className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive" aria-label="Delete repayment">
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-end gap-1 border-t border-border pt-2">
                  <Button variant="ghost" size="sm" onClick={() => remove(lend)} aria-label={`Delete lend to ${lend.borrower}`}><Trash2 className="size-3.5" /></Button>
                  <Button variant="outline" size="sm" onClick={() => setEditing(lend)}><Pencil className="size-3.5 mr-1" /> Edit</Button>
                  {lend.status === 'open' && <Button size="sm" onClick={() => setRepaying(lend)}>Record repayment</Button>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <EditLendDialog lend={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      <RepaymentDialog lend={repaying} accounts={accounts} onClose={() => setRepaying(null)} onSaved={() => { setRepaying(null); reload(); }} />
    </div>
  );
}

function Summary({ label, value, tone = 'default', className = '' }: { label: string; value: number; tone?: 'default' | 'primary'; className?: string }) {
  return <div className={`rounded-xl border border-border bg-card p-3 ${className}`}>
    <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className={`font-serif text-lg font-semibold tabular-nums ${tone === 'primary' ? 'text-primary' : ''}`}><AnimatedMoney value={value} /></div>
  </div>;
}

function Figure({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="min-w-0">
    <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground truncate">{label}</div>
    <div className={`font-mono text-xs tabular-nums truncate ${strong ? 'font-semibold text-primary' : ''}`}>{value}</div>
  </div>;
}

function EditLendDialog({ lend, onClose, onSaved }: { lend: FinLend | null; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [borrower, setBorrower] = useState('');
  const [description, setDescription] = useState('');
  const [note, setNote] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [remind, setRemind] = useState(false);

  const open = !!lend;
  useEffect(() => {
    if (!lend) return;
    setBorrower(lend.borrower); setDescription(lend.description); setNote(lend.note);
    setDueDate(lend.due_date ?? ''); setRemind(lend.remind);
  }, [lend]);
  const save = async () => {
    if (!lend || !borrower.trim() || saving) return;
    setSaving(true);
    try {
      await finance.updateLend(lend.id, { borrower: borrower.trim(), description, note, due_date: dueDate, remind: remind && !!dueDate });
      onSaved();
    } catch (error) { toast.error(msg(error)); } finally { setSaving(false); }
  };
  return <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>Edit lend</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <Field label="Borrower"><Input value={borrower} onChange={(e) => setBorrower(e.target.value)} /></Field>
        <Field label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label="Due date"><DatePicker value={dueDate} onChange={setDueDate} /></Field>
        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
          <div><Label>Due reminder</Label><p className="text-xs text-muted-foreground">One notification when due.</p></div>
          <Switch checked={remind && !!dueDate} disabled={!dueDate} onCheckedChange={setRemind} />
        </div>
        <Field label="Note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} /></Field>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving || !borrower.trim()}>{saving ? 'Saving…' : 'Save'}</Button></DialogFooter>
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
        <Field label="Note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Optional — record interest separately as income." /></Field>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Record repayment'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>{children}</div>;
}
