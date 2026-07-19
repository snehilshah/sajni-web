import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';

import { finance, type FinAccount, type FinCategory, type PocketMember } from '@/api';
import { msg } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { txnAtToParts, partsToTxnAt } from '../utils';
import { Field } from '../TransactionDialog';

// Record a settle-up: who paid whom, how much. If I'm one of the two
// parties, my leg can echo into my own ledger (account picked here, private).
// The other party gets an "add to my ledger" affordance on the row instead —
// nothing is ever written into someone else's ledger.

export interface SettlePrefill {
  from_member: number;
  to_member: number;
  amount: number;
}

interface Props {
  open: boolean;
  pocketId: number;
  members: PocketMember[];
  myMemberId: number;
  accounts: FinAccount[];
  categories: FinCategory[];
  prefill: SettlePrefill | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function SettleDialog({
  open, pocketId, members, myMemberId, accounts, categories, prefill, onClose, onSaved,
}: Props) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState('');
  const [echoAccount, setEchoAccount] = useState('0');
  const [echoCategory, setEchoCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const active = members.filter((m) => !m.left);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setFrom(prefill ? String(prefill.from_member) : String(myMemberId));
    setTo(prefill ? String(prefill.to_member) : '');
    setAmount(prefill ? String(prefill.amount) : '');
    const p = txnAtToParts(new Date().toISOString());
    setDate(p.date); setTime(p.time);
    setEchoAccount(accounts[0] ? String(accounts[0].id) : '0');
    setEchoCategory('');
  }, [open, prefill, myMemberId, accounts]);

  const clearError = (key: string) => setErrors((e) => (e[key] ? { ...e, [key]: '' } : e));
  const amt = parseFloat(amount) || 0;
  const iAmParty = from === String(myMemberId) || to === String(myMemberId);
  const iPay = from === String(myMemberId);
  const showEcho = iAmParty && accounts.length > 0;
  // My leg: paying = expense, receiving = income.
  const echoCats = categories.filter((c) => c.kind === (iPay ? 'expense' : 'income'));

  const memberItems = (exclude: string) =>
    active.filter((m) => String(m.id) !== exclude)
      .map((m) => ({ value: String(m.id), label: m.is_me ? `${m.display_name} (you)` : m.display_name }));

  const save = async () => {
    if (saving) return;
    const e: Record<string, string> = {};
    if (!from) e.from = 'Pick who paid.';
    if (!to) e.to = 'Pick who received.';
    if (from && from === to) e.to = 'Payer and receiver must differ.';
    if (!amount.trim() || isNaN(amt) || amt <= 0) e.amount = 'Amount must be greater than 0.';
    if (Object.keys(e).length) { setErrors(e); return; }

    setSaving(true);
    try {
      await finance.createPocketSettlement(pocketId, {
        from_member: parseInt(from),
        to_member: parseInt(to),
        amount: amt,
        settled_at: partsToTxnAt(date, time),
        ...(showEcho && echoAccount !== '0'
          ? { echo: { account_id: parseInt(echoAccount), category_id: echoCategory ? parseInt(echoCategory) : null } }
          : {}),
      });
      onSaved();
    } catch (err) {
      toast.error(msg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settle up</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Who paid" error={errors.from}>
            <Select value={from || undefined} onValueChange={(v) => { setFrom(v ?? ''); clearError('from'); }}
              items={memberItems(to)}>
              <SelectTrigger aria-invalid={!!errors.from}>
                <SelectValue placeholder="Payer" />
              </SelectTrigger>
              <SelectContent>
                {memberItems(to).map((it) => (
                  <SelectItem key={it.value} value={it.value}>{it.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="To" error={errors.to}>
            <Select value={to || undefined} onValueChange={(v) => { setTo(v ?? ''); clearError('to'); }}
              items={memberItems(from)}>
              <SelectTrigger aria-invalid={!!errors.to}>
                <SelectValue placeholder="Receiver" />
              </SelectTrigger>
              <SelectContent>
                {memberItems(from).map((it) => (
                  <SelectItem key={it.value} value={it.value}>{it.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Amount" error={errors.amount}>
            <Input
              type="number"
              inputMode="decimal"
              value={amount}
              aria-invalid={!!errors.amount}
              onChange={(e) => { setAmount(e.target.value); clearError('amount'); }}
            />
          </Field>
          <Field label="Date">
            <DatePicker value={date} onChange={setDate} />
          </Field>

          {showEcho && (
            <Field
              label="Your ledger"
              className="col-span-2"
              hint={<span className="text-xs text-muted-foreground normal-case tracking-normal">visible only to you</span>}
            >
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={echoAccount}
                  onValueChange={(v) => setEchoAccount(v ?? '0')}
                  items={[
                    { value: '0', label: "Don't add" },
                    ...accounts.map((a) => ({ value: String(a.id), label: a.name })),
                  ]}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Don't add</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={echoCategory || undefined}
                  onValueChange={(v) => setEchoCategory(v ?? '')}
                  items={echoCats.map((c) => ({ value: String(c.id), label: c.name }))}
                >
                  <SelectTrigger disabled={echoAccount === '0'}>
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {echoCats.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {iPay ? 'Records the payment as an expense in your transactions.' : 'Records the money you received as income in your transactions.'}
              </p>
            </Field>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Settle'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
