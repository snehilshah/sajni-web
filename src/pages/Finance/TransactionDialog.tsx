import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { format } from 'date-fns';
import { Trash2, Sparkles } from '@/components/ui/icons';

import { toast } from 'sonner';
import { finance, type FinAccount, type FinCategory, type FinSlate, type FinTransaction, type TxnKind, type TxnPatch } from '@/api';
import { confirmDialog } from '@/lib/confirm';
import { failureText } from '@/lib/errors';
import { useEditorAutosave } from '@/hooks/use-autosave';
import { AutosaveStatus, EditActions } from '@/components/autosave';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { Switch } from '@/components/ui/switch';
import { TimePicker } from '@/components/ui/time-picker';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { M3CookieLoader } from '@/components/ui/shapes';
import { CategoryChips } from './CategoryChips';
import { txnAtToParts, partsToTxnAt } from './utils';

// The add/edit form for personal-ledger transactions. Extracted from
// TransactionsTab so other screens can open it with a slate preselected.

const fixedField: CSSProperties & { fieldSizing: 'fixed' } = { fieldSizing: 'fixed' };

// The editable fields of an existing transaction, as the form holds them.
// Autosave diffs this shape, so the loader and the form must build it alike.
interface EditValues {
  accountId: string; categoryId: string; amount: string; description: string;
  note: string; slateId: string; date: string; time: string;
}

function editValues(txn: FinTransaction): EditValues {
  const p = txnAtToParts(txn.txn_at);
  return {
    accountId: String(txn.account_id),
    categoryId: txn.category_id ? String(txn.category_id) : '',
    amount: String(txn.amount),
    description: txn.description,
    note: txn.note || '',
    slateId: String(txn.slate_id ?? 0),
    date: p.date,
    time: p.time,
  };
}

function editKind(kind: FinTransaction['type']): TxnKind {
  if (kind === 'income') return 'income';
  if (kind === 'transfer_in' || kind === 'transfer_out') return 'transfer';
  return 'expense';
}

export default function TransactionDialog({
  open, txn, accounts, categories, slates, defaultSlateId, initialType = 'expense', onClose, onSaved, onAutosaved,
}: {
  open: boolean;
  txn: FinTransaction | null;
  accounts: FinAccount[];
  categories: FinCategory[];
  slates: FinSlate[];
  /** Preselect this slate for new txns. */
  defaultSlateId?: number;
  initialType?: TxnKind;
  onClose: () => void;
  onSaved: (patch?: { id: number } & Partial<FinTransaction>) => void;
  /** An edit autosaved while the dialog stays open: patch the row, keep editing. */
  onAutosaved?: (patch: { id: number } & Partial<FinTransaction>) => void;
}) {
  const [type, setType] = useState<TxnKind>('expense');
  const [accountId, setAccountId] = useState('');
  const [linkedId, setLinkedId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [note, setNote] = useState('');
  const [borrower, setBorrower] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [remind, setRemind] = useState(false);
  // Slate the txn files under; '0' = Plain. There is no active-slate mode:
  // everything is normal life until the user says otherwise.
  const [slateId, setSlateId] = useState('0');
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

  const values: EditValues = { accountId, categoryId, amount, description, note, slateId, date, time };
  const applyValues = (v: EditValues) => {
    setAccountId(v.accountId); setCategoryId(v.categoryId); setAmount(v.amount);
    setDescription(v.description); setNote(v.note); setSlateId(v.slateId);
    setDate(v.date); setTime(v.time);
  };
  const editErrors = (v: EditValues): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!v.accountId) e.account = 'Select an account.';
    const amt = parseFloat(v.amount);
    if (!v.amount.trim()) e.amount = 'Enter an amount.';
    else if (isNaN(amt) || amt <= 0) e.amount = 'Amount must be greater than 0.';
    return e;
  };
  // Edits save themselves 3s after the last change and on close. Create
  // stays an explicit Add.
  const autosave = useEditorAutosave({
    key: open && txn ? txn.id : null,
    value: values,
    apply: (v) => { applyValues(v); setErrors({}); },
    invalid: Object.values(editErrors(values))[0]?.toLowerCase() ?? null,
    save: async (v) => {
      if (!txn) return;
      const patch = await persistEdit(txn, v);
      onAutosaved?.(patch);
    },
  });
  const loadAutosave = autosave.load;

  // Edit → PUT; returns the optimistic row patch for the list.
  const persistEdit = async (t: FinTransaction, v: EditValues) => {
    const others = categories.find((c) => c.kind === (editKind(t.type) === 'income' ? 'income' : 'expense')
      && ['other', 'others'].includes(c.name.trim().toLowerCase()));
    const selectedCategoryId = v.categoryId || (others ? String(others.id) : '');
    const acctId = parseInt(v.accountId);
    const catId = selectedCategoryId ? parseInt(selectedCategoryId) : null;
    const amt = parseFloat(v.amount);
    const txnAt = partsToTxnAt(v.date, v.time);
    const sid = parseInt(v.slateId) || 0;
    // Type stays locked, account is editable: balances are computed from
    // account_id server-side, so a move rebalances both accounts (the backend
    // also syncs a transfer pair, and both legs share the slate).
    const patch: TxnPatch = {
      account_id: acctId, amount: amt, description: v.description, note: v.note,
      txn_at: txnAt, category_id: catId, slate_id: sid,
    };
    await finance.updateTransaction(t.id, patch);
    // Optimistic row patch so the list reflects it instantly (no raw ids).
    const cat = categories.find((c) => c.id === catId);
    return {
      id: t.id,
      account_id: acctId,
      account_name: accounts.find((a) => a.id === acctId)?.name || '',
      note: v.note,
      category_id: catId,
      category_name: cat?.name ?? null,
      category_color: cat?.color ?? null,
      amount: amt,
      description: v.description,
      txn_at: txnAt,
      ...(sid ? { slate_id: sid, slate_name: slates.find((p) => p.id === sid)?.name ?? '' } : {}),
    };
  };

  // Every close path (Esc, backdrop, Done) for an edit: flush, then close.
  const requestClose = () => autosave.close(onClose);

  useEffect(() => {
    setErrors({});
    if (txn) {
      const v = editValues(txn);
      setType(editKind(txn.type));
      setLinkedId(txn.linked_account ? String(txn.linked_account) : '');
      applyValues(v);
      loadAutosave(v);
      setBorrower('');
      setDueDate('');
      setRemind(false);
      userPickedCategoryRef.current = true; // editing — treat existing pick as user's
      setUserPickedCategory(true);
    } else {
      setType(initialType);
      setAccountId(accounts[0] ? String(accounts[0].id) : '');
      setLinkedId('');
      setCategoryId('');
      setAmount('');
      setDescription('');
      setNote('');
      setBorrower('');
      setDueDate('');
      setRemind(false);
      setSlateId(String(defaultSlateId ?? slates.find((p) => p.is_plain)?.id ?? 0));
      { const p = txnAtToParts(new Date().toISOString()); setDate(p.date); setTime(p.time); }
      userPickedCategoryRef.current = false;
      setUserPickedCategory(false);
    }
    // Deliberately NOT keyed on accounts/slates: they are read here only to
    // seed defaults. Both come from TanStack Query, so any background refetch
    // hands back a new array identity — and with them in the deps this effect
    // re-runs and wipes whatever the user has typed into an open dialog. The
    // reset belongs to "the dialog opened", not "the data changed".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txn, open, defaultSlateId, initialType, loadAutosave]);

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
    if (type === 'transfer' || type === 'lend') return; // neither has a category
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
    if (type === 'lend' && !borrower.trim()) e.borrower = 'Enter who borrowed the money.';
    return e;
  };

  const save = async () => {
    if (txn) { requestClose(); return; }
    if (saving) return;
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    const amt = parseFloat(amount);
    const txnAt = partsToTxnAt(date, time);
    const selectedCategoryId = categoryId || (othersCategory ? String(othersCategory.id) : '');

    setSaving(true);
    try {
      if (type === 'transfer') {
        await finance.createTransaction({
          account_id: parseInt(accountId),
          type: 'transfer',
          amount: amt,
          description,
          note,
          txn_at: txnAt,
          linked_account: parseInt(linkedId),
        });
      } else if (type === 'lend') {
        await finance.createLend({
          source_account_id: parseInt(accountId),
          borrower: borrower.trim(),
          amount: amt,
          description,
          note,
          lent_at: txnAt,
          due_date: dueDate || null,
          remind: remind && !!dueDate,
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
          slate_id: parseInt(slateId) || 0,
        });
      }
      onSaved();
    } catch (e) {
      // Surface the failure instead of silently leaving the dialog open.
      toast.error(failureText(e, 'Could not save transaction'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!txn) return;
    if (!(await confirmDialog('Delete this transaction?'))) return;
    autosave.cancel();
    try {
      await finance.deleteTransaction(txn.id);
      onSaved();
    } catch (e) {
      toast.error(failureText(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && requestClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-baseline justify-between gap-3">
            <DialogTitle>{txn ? 'Edit transaction' : 'New transaction'}</DialogTitle>
            {txn && <AutosaveStatus status={autosave.status} />}
          </div>
        </DialogHeader>
        {!txn && (
          <div className="grid grid-cols-4 gap-1 rounded-md bg-muted p-1">
            {(['expense', 'income', 'transfer', 'lend'] as const).map((t) => (
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
              placeholder={type === 'lend' ? 'e.g. Emergency help' : type === 'transfer' ? 'e.g. Move to savings' : type === 'income' ? 'e.g. October salary' : 'e.g. Lunch at Cafe X'}
              maxLength={120}
              autoFocus={!txn}
              
            />
          </Field>
          <Field label={type === 'transfer' || type === 'lend' ? 'From account' : 'Account'} className="col-span-2" error={errors.account}>
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
          {type !== 'transfer' && type !== 'lend' && (
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
              <CategoryChips
                categories={filteredCats}
                value={categoryId || (othersCategory ? String(othersCategory.id) : '')}
                onChange={(v) => {
                  userPickedCategoryRef.current = true;
                  setUserPickedCategory(true);
                  setCategoryId(v);
                }}
              />
            </Field>
          )}
          {type !== 'transfer' && type !== 'lend' && (
            <Field
              label="Slate"
              className="col-span-2"
            >
              <Select
                value={slateId}
                onValueChange={(v) => setSlateId(v ?? '0')}
                items={slates.filter((p) => !p.archived).map((p) => ({ value: String(p.id), label: p.name }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Plain" />
                </SelectTrigger>
                <SelectContent>
                  {slates.filter((p) => !p.archived).map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* '0' matches no option while the slates query is in flight; the
                  placeholder reads Plain and the server resolves 0 to Plain, so
                  the label and the outcome agree either way. */}
              {slates.find((p) => String(p.id) === slateId && !p.is_plain) && (
                <p className="text-xs text-muted-foreground">
                  Kept out of your ordinary budgets.
                </p>
              )}
            </Field>
          )}
          <Field label="Amount" className="col-span-2" error={errors.amount}>
            <Input
              type="number"
              inputMode="decimal"
              value={amount}
              aria-invalid={!!errors.amount}
              onChange={(e) => { setAmount(e.target.value); clearError('amount'); }}
              
            />
          </Field>
          {type === 'lend' && (
            <Field label="Borrower" className="col-span-2" error={errors.borrower}>
              <Input value={borrower} onChange={(e) => { setBorrower(e.target.value); clearError('borrower'); }} placeholder="Name" aria-invalid={!!errors.borrower} />
            </Field>
          )}
          <Field label="Date">
            <DatePicker value={date} onChange={setDate} />
          </Field>
          <Field label="Time">
            <TimePicker value={time} onChange={setTime} />
          </Field>
          {type === 'lend' && (
            <>
              <Field label="Due date" className="col-span-2">
                <DatePicker value={dueDate} onChange={(value) => { setDueDate(value); if (!value) setRemind(false); }} />
              </Field>
              <div className="col-span-2 flex items-center justify-between rounded-lg px-3 py-2">
                <div><Label>Due reminder</Label><p className="text-xs text-muted-foreground">One notification when repayment is due.</p></div>
                <Switch checked={remind && !!dueDate} disabled={!dueDate} onCheckedChange={setRemind} />
              </div>
            </>
          )}
          <Field label="Note" className="col-span-2">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note: context, who it was with. Use #tags to file it."
              rows={3}
              maxLength={1000}
              // Fixed height (field-sizing:fixed) — auto-growing inside the
              // modal's scroll container caused a layout-thrash freeze.
              className="resize-none overflow-y-auto !min-h-0 h-[76px]"
              style={fixedField}
            />
          </Field>
        </div>
        <DialogFooter className="flex-row items-center justify-between">
          {txn ? (
            <Button variant="destructive-quiet" onClick={remove}>
              <Trash2 className="size-4 mr-1" /> Delete
            </Button>
          ) : <span />}
          {txn ? (
            <div className="flex gap-2">
              <EditActions changed={autosave.changed} onUndo={autosave.undo} onDone={requestClose} />
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button onClick={save} disabled={saving} className="gap-1.5">
                {saving && <M3CookieLoader size="xs" tone="primary" className="!text-primary-foreground" />}
                Add
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, className = '', children, hint, error }: { label: string; className?: string; children: React.ReactNode; hint?: React.ReactNode; error?: string }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center justify-between gap-2 min-h-[14px]">
        <Label className="font-mono text-xs label-kicker text-muted-foreground">{label}</Label>
        {hint}
      </div>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
