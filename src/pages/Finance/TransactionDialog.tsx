import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { format } from 'date-fns';
import { Trash2, Sparkles } from '@/components/ui/icons';

import { toast } from 'sonner';
import { finance, type FinAccount, type FinCategory, type FinPocket, type FinTransaction, type TxnKind, type TxnPatch } from '@/api';
import { confirmDialog } from '@/lib/confirm';
import { msg } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { TimePicker } from '@/components/ui/time-picker';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { M3CookieLoader } from '@/components/ui/shapes';
import { txnAtToParts, partsToTxnAt } from './utils';

// The add/edit form for personal-ledger transactions. Extracted from
// TransactionsTab so the pocket detail page can open it with the pocket
// preselected. Echo rows (mirrors of shared-pocket entries) lock their
// money fields — those are managed by the shared pocket.

const fixedField: CSSProperties & { fieldSizing: 'fixed' } = { fieldSizing: 'fixed' };

function editKind(kind: FinTransaction['type']): TxnKind {
  if (kind === 'income') return 'income';
  if (kind === 'transfer_in' || kind === 'transfer_out') return 'transfer';
  return 'expense';
}

export default function TransactionDialog({
  open, txn, accounts, categories, pockets, activePocketId, defaultPocketId, onClose, onSaved,
}: {
  open: boolean;
  txn: FinTransaction | null;
  accounts: FinAccount[];
  categories: FinCategory[];
  pockets: FinPocket[];
  activePocketId: number | null;
  /** Preselect this pocket for new txns (pocket detail page). */
  defaultPocketId?: number;
  onClose: () => void;
  onSaved: (patch?: { id: number } & Partial<FinTransaction>) => void;
}) {
  const [type, setType] = useState<'expense' | 'income' | 'transfer'>('expense');
  const [accountId, setAccountId] = useState('');
  const [linkedId, setLinkedId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [note, setNote] = useState('');
  // Pocket the txn files under; '0' = General. New txns default to the
  // user's active pocket (server would do the same if we omitted it).
  const [pocketId, setPocketId] = useState('0');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [inferring, setInferring] = useState(false);
  const clearError = (key: string) => setErrors((e) => (e[key] ? { ...e, [key]: '' } : e));
  // Once the user picks a category by hand we stop auto-overwriting it,
  // even if they keep editing the title afterward.
  const userPickedCategoryRef = useRef(false);
  // Render-time mirror of the ref. The ref stays the source of truth for the
  // async infer guards below (they need the synchronous latest value mid-flight);
  // this state exists only because the React Compiler forbids reading a ref
  // during render (the "auto" hint at the Category field reads it).
  const [userPickedCategory, setUserPickedCategory] = useState(false);
  const inferTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Amount/description/date live on the shared pocket for echo rows.
  const echoLocked = !!txn && (txn.shared_expense_id !== null || txn.settlement_id !== null);

  useEffect(() => {
    setErrors({});
    if (txn) {
      setType(editKind(txn.type));
      setAccountId(String(txn.account_id));
      setLinkedId(txn.linked_account ? String(txn.linked_account) : '');
      setCategoryId(txn.category_id ? String(txn.category_id) : '');
      setAmount(String(txn.amount));
      setDescription(txn.description);
      setNote(txn.note || '');
      setPocketId(String(txn.pocket_id ?? 0));
      { const p = txnAtToParts(txn.txn_at); setDate(p.date); setTime(p.time); }
      userPickedCategoryRef.current = true; // editing — treat existing pick as user's
      setUserPickedCategory(true);
    } else {
      setType('expense');
      setAccountId(accounts[0] ? String(accounts[0].id) : '');
      setLinkedId('');
      setCategoryId('');
      setAmount('');
      setDescription('');
      setNote('');
      setPocketId(String(defaultPocketId ?? activePocketId ?? 0));
      { const p = txnAtToParts(new Date().toISOString()); setDate(p.date); setTime(p.time); }
      userPickedCategoryRef.current = false;
      setUserPickedCategory(false);
    }
  }, [txn, open, accounts, activePocketId, defaultPocketId]);

  const filteredCats = categories.filter((c) => c.kind === (type === 'income' ? 'income' : 'expense'));
  const othersCategory = filteredCats.find((c) => ['other', 'others'].includes(c.name.trim().toLowerCase()));

  // Salary accounts are the natural landing spot for income — when the user
  // flips a fresh entry to "income", default the deposit-to account to a
  // salary account if one exists. They can still pick another.
  useEffect(() => {
    if (txn || type !== 'income') return;
    const sal = accounts.find((a) => a.type === 'salary');
    if (sal) setAccountId(String(sal.id));
  }, [type, txn, accounts]);

  // Debounced AI category inference. Fires when the user types a title
  // on a NEW transaction (not edit), as long as they haven't picked a
  // category by hand. Cheap (~50 tok) but still rate-limited server-side
  // by the shared AI budget.
  useEffect(() => {
    if (txn) return;                              // edit mode — don't auto-pick
    if (type === 'transfer') return;              // transfers have no category
    if (userPickedCategoryRef.current) return;    // user took the wheel
    const title = description.trim();
    if (title.length < 3) {                       // avoid noise / 1-letter spam
      setInferring(false);
      return;
    }
    if (inferTimer.current) clearTimeout(inferTimer.current);
    // Adaptive debounce: short strings settle fast, long sentences wait
    // longer so we don't fire a categorize call for every keystroke mid-word.
    const delay = Math.min(1600, 500 + title.length * 30);
    inferTimer.current = setTimeout(async () => {
      setInferring(true);
      try {
        const res = await finance.categorizeTransaction({
          title,
          kind: type === 'income' ? 'income' : 'expense',
        });
        // Don't clobber if the user picked something during the in-flight
        // request, or if the model bailed to "Others" with no match.
        if (!userPickedCategoryRef.current && res.category_id != null) {
          setCategoryId(String(res.category_id));
        }
      } catch {
        // Silent fail — limiter 429s or network blips shouldn't block the form.
      } finally {
        setInferring(false);
      }
    }, delay);
    return () => { if (inferTimer.current) clearTimeout(inferTimer.current); };
  }, [description, type, txn]);

  // Collect per-field validation messages so the user sees exactly what's
  // missing instead of the Add button silently doing nothing.
  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!accountId) e.account = 'Select an account.';
    const amt = parseFloat(amount);
    if (!amount.trim()) e.amount = 'Enter an amount.';
    else if (isNaN(amt) || amt <= 0) e.amount = 'Amount must be greater than 0.';
    if (type === 'transfer' && !txn) {
      if (!linkedId) e.linked = 'Choose a destination account.';
      else if (linkedId === accountId) e.linked = 'Destination must differ from the source.';
    }
    return e;
  };

  const save = async () => {
    if (saving) return;
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    const amt = parseFloat(amount);
    const txnAt = partsToTxnAt(date, time);
    const selectedCategoryId = categoryId || (othersCategory ? String(othersCategory.id) : '');

    setSaving(true);
    try {
      if (txn) {
        // Edit — type stays locked, but account is now editable. Balances are
        // computed from account_id server-side, so moving the txn rebalances
        // both accounts automatically (the backend also syncs a transfer pair).
        const acctId = parseInt(accountId);
        const catId = selectedCategoryId ? parseInt(selectedCategoryId) : null;
        const isXfer = type === 'transfer';
        const patch: TxnPatch = echoLocked
          // Echo rows: only the user's private fields are editable.
          ? { account_id: acctId, note, category_id: catId }
          : {
            account_id: acctId,
            amount: amt,
            description,
            note,
            txn_at: txnAt,
            category_id: catId,
            // Transfers never carry a pocket; 0 = General for the rest.
            ...(isXfer ? {} : { pocket_id: parseInt(pocketId) || 0 }),
          };
        await finance.updateTransaction(txn.id, patch);
        // Hand the parent an optimistic patch so the row reflects the new
        // account/category/amount instantly (no reload flash, no raw id).
        const cat = categories.find((c) => c.id === catId);
        const pid = isXfer ? null : parseInt(pocketId) || 0;
        onSaved({
          id: txn.id,
          account_id: acctId,
          account_name: accounts.find((a) => a.id === acctId)?.name || '',
          note,
          category_id: catId,
          category_name: cat?.name ?? null,
          category_color: cat?.color ?? null,
          ...(echoLocked ? {} : {
            amount: amt,
            description,
            txn_at: txnAt,
            ...(isXfer ? {} : {
              pocket_id: pid || null,
              pocket_name: pid ? pockets.find((p) => p.id === pid)?.name ?? null : null,
            }),
          }),
        });
        return;
      } else if (type === 'transfer') {
        await finance.createTransaction({
          account_id: parseInt(accountId),
          type: 'transfer',
          amount: amt,
          description,
          note,
          txn_at: txnAt,
          linked_account: parseInt(linkedId),
        });
      } else {
        await finance.createTransaction({
          account_id: parseInt(accountId),
          type,
          amount: amt,
          description,
          note,
          txn_at: txnAt,
          category_id: selectedCategoryId ? parseInt(selectedCategoryId) : null,
          pocket_id: parseInt(pocketId) || 0,
        });
      }
      onSaved();
    } catch (e) {
      // Surface the failure instead of silently leaving the dialog open.
      toast.error('Could not save transaction: ' + msg(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!txn) return;
    if (!(await confirmDialog('Delete this transaction?'))) return;
    try {
      await finance.deleteTransaction(txn.id);
      onSaved();
    } catch (e) {
      toast.error(msg(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{txn ? 'Edit transaction' : 'New transaction'}</DialogTitle>
        </DialogHeader>
        {echoLocked && (
          <p className="rounded-xl bg-[hsl(var(--secondary-container)/0.5)] px-3 py-2 text-xs text-muted-foreground">
            This entry mirrors a shared pocket. Amount, title and date are managed
            there — only your account, category and note can change here.
          </p>
        )}
        {!txn && (
          <div className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
            {(['expense', 'income', 'transfer'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`py-1.5 text-xs font-medium rounded transition-colors capitalize ${
                  type === t ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Title" className="col-span-2">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={type === 'transfer' ? 'e.g. Move to savings' : type === 'income' ? 'e.g. October salary' : 'e.g. Lunch at Cafe X'}
              maxLength={120}
              autoFocus={!txn}
              disabled={echoLocked}
            />
          </Field>
          <Field label={type === 'transfer' ? 'From account' : 'Account'} className="col-span-2" error={errors.account}>
            <Select value={accountId || undefined} onValueChange={(v) => { setAccountId(v ?? ''); clearError('account'); }}
              items={accounts.map((a) => ({ value: String(a.id), label: a.name }))}>
              <SelectTrigger aria-invalid={!!errors.account}>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {type === 'transfer' && !txn && (
            <Field label="To account" className="col-span-2" error={errors.linked}>
              <Select value={linkedId || undefined} onValueChange={(v) => { setLinkedId(v ?? ''); clearError('linked'); }}
                items={accounts.filter((a) => String(a.id) !== accountId).map((a) => ({ value: String(a.id), label: a.name }))}>
                <SelectTrigger aria-invalid={!!errors.linked}>
                  <SelectValue placeholder="Select destination" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.filter((a) => String(a.id) !== accountId).map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          {type !== 'transfer' && (
            <Field
              label="Category"
              className="col-span-2"
              hint={inferring ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground normal-case tracking-normal">
                  <M3CookieLoader size="xs" tone="primary" />
                  Sajni is picking…
                </span>
              ) : categoryId && !userPickedCategory && !txn ? (
                <span className="inline-flex items-center gap-1 text-xs text-primary normal-case tracking-normal">
                  <Sparkles className="size-3" /> auto · change anytime
                </span>
              ) : undefined}
            >
              <Select
                value={categoryId || (othersCategory ? String(othersCategory.id) : undefined)}
                onValueChange={(v) => {
                  userPickedCategoryRef.current = true;
                  setUserPickedCategory(true);
                  setCategoryId(v || '');
                }}
                items={filteredCats.map((c) => ({ value: String(c.id), label: c.name }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Others" />
                </SelectTrigger>
                <SelectContent>
                  {filteredCats.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          {type !== 'transfer' && !echoLocked && (
            <Field
              label="Pocket"
              className="col-span-2"
              hint={
                activePocketId !== null && String(activePocketId) === pocketId && !txn ? (
                  <span className="text-xs text-muted-foreground normal-case tracking-normal">
                    active pocket
                  </span>
                ) : undefined
              }
            >
              <Select
                value={pocketId}
                onValueChange={(v) => setPocketId(v ?? '0')}
                items={[
                  { value: '0', label: 'General' },
                  ...pockets.filter((p) => !p.archived).map((p) => ({ value: String(p.id), label: p.name })),
                ]}
              >
                <SelectTrigger>
                  <SelectValue placeholder="General" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">General</SelectItem>
                  {pockets.filter((p) => !p.archived).map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Amount" className="col-span-2" error={errors.amount}>
            <Input
              type="number"
              inputMode="decimal"
              value={amount}
              aria-invalid={!!errors.amount}
              onChange={(e) => { setAmount(e.target.value); clearError('amount'); }}
              disabled={echoLocked}
            />
          </Field>
          <Field label="Date">
            <DatePicker value={date} onChange={setDate} disabled={echoLocked} />
          </Field>
          <Field label="Time">
            <TimePicker value={time} onChange={setTime} disabled={echoLocked} />
          </Field>
          <Field label="Note" className="col-span-2">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note — context, who it was with. Use #tags to file it."
              rows={3}
              maxLength={1000}
              // Fixed height (field-sizing:fixed) — auto-growing inside the
              // modal's scroll container caused a layout-thrash freeze.
              className="resize-none overflow-y-auto !min-h-0 h-[76px]"
              style={fixedField}
            />
          </Field>
        </div>
        <DialogFooter className="sm:justify-between">
          {txn && !echoLocked ? (
            <Button variant="ghost" className="text-destructive" onClick={remove}>
              <Trash2 className="size-4 mr-1" /> Delete
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="gap-1.5">
              {saving && <M3CookieLoader size="xs" tone="primary" className="!text-primary-foreground" />}
              {txn ? 'Save' : 'Add'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Field({ label, className = '', children, hint, error }: { label: string; className?: string; children: React.ReactNode; hint?: React.ReactNode; error?: string }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center justify-between gap-2 min-h-[14px]">
        <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
        {hint}
      </div>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
