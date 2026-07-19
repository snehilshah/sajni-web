import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Trash2 } from '@/components/ui/icons';

import {
  finance, type FinAccount, type FinCategory, type PocketMember, type SharedExpense,
} from '@/api';
import { confirmDialog } from '@/lib/confirm';
import { msg } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SegmentedButton } from '@/components/ui/segmented-button';
import { useFinanceFormatters } from '../useFinancePrivacy';
import { txnAtToParts, partsToTxnAt } from '../utils';
import { Field } from '../TransactionDialog';

// Add/edit a shared-pocket expense: who paid, who's in, how it splits.
// The "Your ledger" section (payer only, create only) files the full amount
// into the payer's own transactions — account/category never leave this
// browser except toward the payer's own ledger.

interface Props {
  open: boolean;
  pocketId: number;
  expense: SharedExpense | null;
  members: PocketMember[];
  myMemberId: number;
  accounts: FinAccount[];
  categories: FinCategory[];
  onClose: () => void;
  onSaved: () => void;
}

export default function SharedExpenseDialog({
  open, pocketId, expense, members, myMemberId, accounts, categories, onClose, onSaved,
}: Props) {
  const { formatMoney } = useFinanceFormatters();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [split, setSplit] = useState<'equal' | 'exact'>('equal');
  const [participants, setParticipants] = useState<Set<number>>(new Set());
  const [exact, setExact] = useState<Record<number, string>>({});
  const [echoAccount, setEchoAccount] = useState('0');
  const [echoCategory, setEchoCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const active = members.filter((m) => !m.left);
  // Members who left stay pickable only if the expense being edited already
  // involves them — their history is immutable, new debt is not.
  const pickable = useMemo(() => {
    if (!expense) return active;
    const inShares = new Set(expense.shares.map((s) => s.member_id));
    return members.filter((m) => !m.left || inShares.has(m.id) || m.id === expense.paid_by);
  }, [members, expense]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (expense) {
      setDescription(expense.description);
      setAmount(String(expense.amount));
      const p = txnAtToParts(expense.spent_at);
      setDate(p.date); setTime(p.time);
      setPaidBy(String(expense.paid_by));
      setSplit(expense.split);
      setParticipants(new Set(expense.shares.map((s) => s.member_id)));
      setExact(Object.fromEntries(expense.shares.map((s) => [s.member_id, String(s.amount)])));
    } else {
      setDescription('');
      setAmount('');
      const p = txnAtToParts(new Date().toISOString());
      setDate(p.date); setTime(p.time);
      setPaidBy(String(myMemberId));
      setSplit('equal');
      setParticipants(new Set(members.filter((m) => !m.left).map((m) => m.id)));
      setExact({});
      setEchoAccount(accounts[0] ? String(accounts[0].id) : '0');
      setEchoCategory('');
    }
  }, [open, expense, members, myMemberId, accounts]);

  const clearError = (key: string) => setErrors((e) => (e[key] ? { ...e, [key]: '' } : e));
  const toggle = (id: number) =>
    setParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const amt = parseFloat(amount) || 0;
  const picked = pickable.filter((m) => participants.has(m.id));
  // Paise math mirrors the server: exact shares must sum to the total.
  const exactSumPaise = picked.reduce((s, m) => s + Math.round((parseFloat(exact[m.id] || '') || 0) * 100), 0);
  const remainderPaise = Math.round(amt * 100) - exactSumPaise;

  const iAmPayer = paidBy === String(myMemberId);
  const showEcho = !expense && iAmPayer && accounts.length > 0;
  const expenseCats = categories.filter((c) => c.kind === 'expense');

  const save = async () => {
    if (saving) return;
    const e: Record<string, string> = {};
    if (!description.trim()) e.description = 'Give it a title.';
    if (!amount.trim() || isNaN(amt) || amt <= 0) e.amount = 'Amount must be greater than 0.';
    if (!paidBy) e.paidBy = 'Pick who paid.';
    if (picked.length === 0) e.participants = 'Pick at least one person.';
    if (split === 'exact' && remainderPaise !== 0) e.participants = 'Exact amounts must add up to the total.';
    if (Object.keys(e).length) { setErrors(e); return; }

    const draft = {
      amount: amt,
      description: description.trim(),
      spent_at: partsToTxnAt(date, time),
      paid_by: parseInt(paidBy),
      split,
      shares: picked.map((m) => (split === 'exact'
        ? { member_id: m.id, amount: parseFloat(exact[m.id] || '0') }
        : { member_id: m.id })),
      ...(showEcho && echoAccount !== '0'
        ? { echo: { account_id: parseInt(echoAccount), category_id: echoCategory ? parseInt(echoCategory) : null } }
        : {}),
    };

    setSaving(true);
    try {
      if (expense) await finance.updatePocketExpense(pocketId, expense.id, draft);
      else await finance.createPocketExpense(pocketId, draft);
      onSaved();
    } catch (err) {
      toast.error(msg(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!expense) return;
    if (!(await confirmDialog('Delete this expense? Balances recompute and the payer’s ledger copy is removed.'))) return;
    try {
      await finance.deletePocketExpense(pocketId, expense.id);
      onSaved();
    } catch (err) {
      toast.error(msg(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{expense ? 'Edit expense' : 'New expense'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Title" className="col-span-2" error={errors.description}>
            <Input
              value={description}
              onChange={(e) => { setDescription(e.target.value); clearError('description'); }}
              placeholder="e.g. Dinner at Leopold"
              maxLength={120}
              autoFocus={!expense}
              aria-invalid={!!errors.description}
            />
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
          <Field label="Paid by" className="col-span-2" error={errors.paidBy}>
            <Select
              value={paidBy || undefined}
              onValueChange={(v) => { setPaidBy(v ?? ''); clearError('paidBy'); }}
              items={pickable.map((m) => ({ value: String(m.id), label: m.is_me ? `${m.display_name} (you)` : m.display_name }))}
            >
              <SelectTrigger aria-invalid={!!errors.paidBy}>
                <SelectValue placeholder="Who paid?" />
              </SelectTrigger>
              <SelectContent>
                {pickable.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.is_me ? `${m.display_name} (you)` : m.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Split" className="col-span-2" error={errors.participants}>
            <div className="flex flex-col gap-2">
              <SegmentedButton
                aria-label="Split mode"
                value={split}
                stretch
                options={[
                  { value: 'equal', label: 'Equally' },
                  { value: 'exact', label: 'Exact amounts' },
                ]}
                onChange={(v) => { setSplit(v); clearError('participants'); }}
              />
              <div className="flex flex-col rounded-xl bg-[hsl(var(--surface-container-low))] p-1">
                {pickable.map((m) => {
                  const on = participants.has(m.id);
                  return (
                    <label
                      key={m.id}
                      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-1.5 transition-colors hover:bg-[hsl(var(--on-surface)/0.06)]"
                    >
                      <Checkbox
                        checked={on}
                        onCheckedChange={() => { toggle(m.id); clearError('participants'); }}
                      />
                      <span className="flex-1 truncate text-sm">
                        {m.display_name}
                        {m.is_me && <span className="text-muted-foreground"> (you)</span>}
                        {m.left && <span className="text-muted-foreground"> · left</span>}
                      </span>
                      {split === 'exact' ? (
                        on && (
                          <Input
                            type="number"
                            inputMode="decimal"
                            className="h-9 w-24 text-right"
                            value={exact[m.id] ?? ''}
                            placeholder="0"
                            onClick={(e) => e.preventDefault()}
                            onChange={(e) => { setExact((prev) => ({ ...prev, [m.id]: e.target.value })); clearError('participants'); }}
                          />
                        )
                      ) : (
                        on && amt > 0 && picked.length > 0 && (
                          <span className="font-mono text-xs tabular-nums text-muted-foreground">
                            ~{formatMoney(amt / picked.length)}
                          </span>
                        )
                      )}
                    </label>
                  );
                })}
              </div>
              {split === 'exact' && amt > 0 && (
                <p className={`text-xs ${remainderPaise === 0 ? 'text-muted-foreground' : 'text-destructive'}`}>
                  {remainderPaise === 0
                    ? 'Adds up — nice.'
                    : remainderPaise > 0
                      ? `${formatMoney(remainderPaise / 100)} left to assign.`
                      : `${formatMoney(-remainderPaise / 100)} over the total.`}
                </p>
              )}
            </div>
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
                  items={expenseCats.map((c) => ({ value: String(c.id), label: c.name }))}
                >
                  <SelectTrigger disabled={echoAccount === '0'}>
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {expenseCats.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Files the full {amt > 0 ? formatMoney(amt) : 'amount'} you paid into your own transactions.
              </p>
            </Field>
          )}
        </div>
        <DialogFooter className="sm:justify-between">
          {expense ? (
            <Button variant="ghost" className="text-destructive" onClick={remove}>
              <Trash2 className="size-4 mr-1" /> Delete
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : expense ? 'Save' : 'Add'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
