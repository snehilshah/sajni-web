import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { format } from 'date-fns';
import { Trash2, Sparkles, Plus, X } from '@/components/ui/icons';

import { toast } from 'sonner';
import { finance, type FinAccount, type FinCategory, type FinSlate, type FinTransaction, type TxnDraft, type TxnKind, type TxnPatch } from '@/api';
import { confirmDialog } from '@/lib/confirm';
import { failureText } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useEditorAutosave } from '@/hooks/use-autosave';
import { AutosaveStatus, EditActions } from '@/components/autosave';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { TimePicker } from '@/components/ui/time-picker';
import { Label } from '@/components/ui/label';
import { DateBadge, StateChip } from '@/components/ui/state-chip';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { M3CookieLoader } from '@/components/ui/shapes';
import { useFinLendPeople, useLendCandidates } from '@/queries/finance';
import { CategoryChips } from './CategoryChips';
import { Money } from './Money';
import { txnAtToParts, partsToTxnAt, subMoney } from './utils';

// The add/edit sheet for personal-ledger transactions. Five things are always
// there (kind, amount, title, account + date, category); everything optional
// is an add-on chip under them that opens in place and folds back into a
// summary pill:
//   expense → Split (someone owes part or all of it), Slate, Note
//   income  → From a person (they're paying you back), Refund, Slate, Note
// "Lend" is not a kind: lending cash is an expense split with someone for
// all of it.

const fixedField: CSSProperties & { fieldSizing: 'fixed' } = { fieldSizing: 'fixed' };

type Addon = 'split' | 'settle' | 'refund' | 'slate' | 'note';
type ShareMode = 'half' | 'custom' | 'all';

const personKey = (name: string) => name.trim().toLowerCase();
const round2 = (n: number) => Math.round(n * 100) / 100;

function shareOf(total: number, mode: ShareMode, custom: string) {
  if (!(total > 0)) return 0;
  if (mode === 'all') return round2(total);
  if (mode === 'half') return round2(total / 2);
  const v = parseFloat(custom);
  return Number.isFinite(v) ? round2(v) : 0;
}

// The editable fields of an existing transaction, as the form holds them.
// Autosave diffs this shape, so the loader and the form must build it alike.
// On a split bill `amount` is the whole bill and `share` the other person's
// part; the server stores the user's part (amount − share).
interface EditValues {
  accountId: string; categoryId: string; amount: string; description: string;
  note: string; slateId: string; date: string; time: string;
  share: string; refundOf: string;
  /** A credit read as money back on a purchase (income ↔ refund). */
  refund: boolean;
}

function editValues(txn: FinTransaction): EditValues {
  const p = txnAtToParts(txn.txn_at);
  const share = txn.split?.share ?? 0;
  return {
    accountId: String(txn.account_id),
    categoryId: txn.category_id ? String(txn.category_id) : '',
    amount: String(round2(txn.amount + share)),
    description: txn.description,
    note: txn.note || '',
    slateId: String(txn.slate_id ?? 0),
    date: p.date,
    time: p.time,
    share: txn.split ? String(share) : '',
    refundOf: txn.refund_of ? String(txn.refund_of) : '',
    refund: txn.type === 'refund',
  };
}

function editKind(kind: FinTransaction['type']): TxnKind {
  if (kind === 'income' || kind === 'refund') return 'income';
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
  /** 'lend' opens an expense already split with someone for all of it. */
  initialType?: TxnKind | 'lend';
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
  // Slate the txn files under; '0' = Plain. There is no active-slate mode:
  // everything is normal life until the user says otherwise.
  const [slateId, setSlateId] = useState('0');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState('');
  // Add-ons: which are on, and which one is open for editing.
  const [addons, setAddons] = useState<Set<Addon>>(new Set());
  const [expanded, setExpanded] = useState<Addon | null>(null);
  const [person, setPerson] = useState('');
  const [shareMode, setShareMode] = useState<ShareMode>('half');
  const [customShare, setCustomShare] = useState('');
  const [share, setShare] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [remind, setRemind] = useState(false);
  const [refundOf, setRefundOf] = useState('');
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

  const peopleQ = useFinLendPeople(open);
  const people = peopleQ.data ?? [];
  const isRefund = type === 'income' && addons.has('refund');
  const splitOn = type === 'expense' && addons.has('split');
  const existingSplit = txn?.split ?? null;
  const total = parseFloat(amount) || 0;
  const theirShare = existingSplit ? (parseFloat(share) || 0) : splitOn ? shareOf(total, shareMode, customShare) : 0;
  const allTheirs = splitOn && !existingSplit && shareMode === 'all';
  const account = accounts.find((a) => String(a.id) === accountId);

  const values: EditValues = { accountId, categoryId, amount, description, note, slateId, date, time, share, refundOf, refund: isRefund };
  const applyValues = (v: EditValues) => {
    setAccountId(v.accountId); setCategoryId(v.categoryId); setAmount(v.amount);
    setDescription(v.description); setNote(v.note); setSlateId(v.slateId);
    setDate(v.date); setTime(v.time); setShare(v.share); setRefundOf(v.refundOf);
    setAddons((prev) => {
      const next = new Set(prev);
      if (v.refund) next.add('refund'); else next.delete('refund');
      return next;
    });
  };
  const editErrors = (v: EditValues): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!v.accountId) e.account = 'Select an account.';
    const amt = parseFloat(v.amount);
    if (!v.amount.trim()) e.amount = 'Enter an amount.';
    else if (isNaN(amt) || amt <= 0) e.amount = 'Amount must be greater than 0.';
    if (txn?.split) {
      const s = parseFloat(v.share);
      if (!(s > 0) || s > amt) e.share = 'Their share has to be above zero and at most the bill.';
    }
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
      if ('type' in patch && patch.type === 'lend') onSaved(); else onAutosaved?.(patch);
    },
  });
  const loadAutosave = autosave.load;

  // Edit → PUT; returns the optimistic row patch for the list.
  const persistEdit = async (t: FinTransaction, v: EditValues) => {
    const credit = t.type === 'income' || t.type === 'refund';
    const others = categories.find((c) => c.kind === (credit && !v.refund ? 'income' : 'expense')
      && ['other', 'others'].includes(c.name.trim().toLowerCase()));
    const selectedCategoryId = v.categoryId || (others ? String(others.id) : '');
    const acctId = parseInt(v.accountId);
    const catId = selectedCategoryId ? parseInt(selectedCategoryId) : null;
    const billTotal = round2(parseFloat(v.amount));
    const txnAt = partsToTxnAt(v.date, v.time);
    const sid = parseInt(v.slateId) || 0;
    // On a split bill the server holds the user's part; the bill total and
    // the share move separately, and the order keeps every step valid.
    const oldShare = t.split?.share ?? 0;
    const newShare = t.split ? round2(parseFloat(v.share)) : 0;
    let mine = round2(billTotal - newShare);
    let becameLend = false;
    const patch: TxnPatch = {
      account_id: acctId, amount: mine, description: v.description, note: v.note,
      txn_at: txnAt, category_id: catId, slate_id: sid,
      ...(credit ? { type: v.refund ? 'refund' as const : 'income' as const } : {}),
      ...(credit && v.refund ? { refund_of: v.refundOf ? parseInt(v.refundOf) : 0 } : {}),
    };
    if (t.split && newShare !== oldShare) {
      if (billTotal - oldShare > 0) {
        // Bill first (the old share still fits), then move the line.
        await finance.updateTransaction(t.id, { ...patch, amount: round2(billTotal - oldShare) });
        await finance.setLendShare(t.split.lend_id, newShare);
      } else {
        await finance.setLendShare(t.split.lend_id, newShare);
        await finance.updateTransaction(t.id, patch);
      }
      becameLend = newShare >= billTotal;
    } else {
      await finance.updateTransaction(t.id, patch);
    }
    if (becameLend) mine = billTotal;
    // Optimistic row patch so the list reflects it instantly (no raw ids).
    const cat = categories.find((c) => c.id === catId);
    return {
      id: t.id,
      ...(becameLend ? { type: 'lend' as const } : credit ? { type: v.refund ? 'refund' as const : 'income' as const } : {}),
      account_id: acctId,
      account_name: accounts.find((a) => a.id === acctId)?.name || '',
      note: v.note,
      category_id: catId,
      category_name: cat?.name ?? null,
      category_color: cat?.color ?? null,
      amount: mine,
      ...(t.split ? { split: { ...t.split, share: newShare } } : {}),
      description: v.description,
      txn_at: txnAt,
      ...(sid ? { slate_id: sid, slate_name: slates.find((p) => p.id === sid)?.name ?? '' } : {}),
    };
  };

  // Every close path (Esc, backdrop, Done) for an edit: flush, then close.
  const requestClose = () => autosave.close(onClose);

  useEffect(() => {
    setErrors({});
    setExpanded(null);
    setPerson('');
    setShareMode('half');
    setCustomShare('');
    setDueDate('');
    setRemind(false);
    if (txn) {
      const v = editValues(txn);
      setType(editKind(txn.type));
      setLinkedId(txn.linked_account ? String(txn.linked_account) : '');
      applyValues(v);
      loadAutosave(v);
      const on = new Set<Addon>();
      if (txn.split) { on.add('split'); setPerson(txn.split.borrower); }
      if (txn.type === 'refund') on.add('refund');
      if (txn.note) on.add('note');
      if (slates.find((p) => p.id === txn.slate_id && !p.is_plain)) on.add('slate');
      setAddons(on);
      userPickedCategoryRef.current = true; // editing — treat existing pick as user's
      setUserPickedCategory(true);
    } else {
      const lend = initialType === 'lend';
      setType(lend ? 'expense' : initialType);
      setAccountId(accounts[0] ? String(accounts[0].id) : '');
      setLinkedId('');
      setCategoryId('');
      setAmount('');
      setDescription('');
      setNote('');
      setShare('');
      setRefundOf('');
      const slate = defaultSlateId ?? slates.find((p) => p.is_plain)?.id ?? 0;
      setSlateId(String(slate));
      setAddons(new Set<Addon>([
        ...(lend ? ['split' as const] : []),
        ...(slates.find((p) => p.id === slate && !p.is_plain) ? ['slate' as const] : []),
      ]));
      if (lend) { setShareMode('all'); setExpanded('split'); }
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

  // A refund files under an expense category: it nets off that spending.
  const categoryKind = type === 'income' && !isRefund ? 'income' : 'expense';
  const filteredCats = categories.filter((c) => c.kind === categoryKind);
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
    if (type === 'transfer' || allTheirs) return; // neither has a category
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
        const res = await finance.categorizeTransaction({ title, kind: categoryKind });
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
  }, [description, type, txn, allTheirs, categoryKind]);

  // Switching kind drops add-ons that don't belong to the new kind.
  const switchType = (t: TxnKind) => {
    setType(t);
    setCategoryId('');
    setExpanded(null);
    setAddons((prev) => new Set([...prev].filter((a) => a === 'slate' || a === 'note')));
  };
  const addAddon = (a: Addon) => {
    setAddons((prev) => {
      const next = new Set(prev);
      next.add(a);
      // Settling and refunding are different stories about the same credit.
      if (a === 'settle') next.delete('refund');
      if (a === 'refund') next.delete('settle');
      return next;
    });
    if (a === 'refund' || (a === 'settle' && addons.has('refund'))) setCategoryId('');
    if (a === 'split' || a === 'settle') setPerson('');
    setExpanded(a);
  };
  const removeAddon = async (a: Addon) => {
    if (a === 'split' && txn && existingSplit) {
      if (!(await confirmDialog(`Remove the split with ${existingSplit.borrower}? The whole bill becomes your expense again.`))) return;
      autosave.cancel();
      try { await finance.deleteLend(existingSplit.lend_id); onSaved(); } catch (e) { toast.error(failureText(e)); }
      return;
    }
    setAddons((prev) => { const next = new Set(prev); next.delete(a); return next; });
    if (expanded === a) setExpanded(null);
    if (a === 'slate') setSlateId(String(slates.find((p) => p.is_plain)?.id ?? 0));
    if (a === 'note') setNote('');
    if (a === 'refund') { setRefundOf(''); setCategoryId(''); }
  };

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
    if (splitOn) {
      if (!person.trim()) e.person = 'Enter who owes this.';
      else if (!(theirShare > 0) || theirShare > amt) e.share = 'Their share has to be above zero and at most the bill.';
    }
    if (type === 'income' && addons.has('settle') && !person.trim()) e.person = 'Enter who is paying you back.';
    return e;
  };

  const save = async () => {
    if (txn) { requestClose(); return; }
    if (saving) return;
    const e = validate();
    if (Object.keys(e).length) {
      setErrors(e);
      if (e.person || e.share) setExpanded(splitOn ? 'split' : 'settle');
      return;
    }
    setErrors({});
    const amt = parseFloat(amount);
    const txnAt = partsToTxnAt(date, time);
    const selectedCategoryId = categoryId || (othersCategory ? String(othersCategory.id) : '');
    const due = dueDate ? { due_date: dueDate } : {};

    setSaving(true);
    try {
      if (type === 'transfer') {
        await finance.createTransaction({
          account_id: parseInt(accountId), type: 'transfer', amount: amt, description, note,
          txn_at: txnAt, linked_account: parseInt(linkedId),
        });
      } else if (allTheirs) {
        // All of it is theirs: money lent, not spent.
        await finance.createLend({
          source_account_id: parseInt(accountId), borrower: person.trim(), amount: amt,
          description, note, lent_at: txnAt, due_date: dueDate || null, remind: remind && !!dueDate,
        });
      } else {
        const draft: TxnDraft = {
          account_id: parseInt(accountId),
          type: isRefund ? 'refund' : type,
          amount: amt, description, note, txn_at: txnAt,
          // A linked refund with no category picked takes the purchase's.
          category_id: isRefund && refundOf && !categoryId ? null : selectedCategoryId ? parseInt(selectedCategoryId) : null,
          slate_id: parseInt(slateId) || 0,
          ...(isRefund && refundOf ? { refund_of: parseInt(refundOf) } : {}),
          ...(splitOn ? { split: { borrower: person.trim(), share: theirShare, remind, ...due } } : {}),
          ...(type === 'income' && addons.has('settle') ? { settle_with: person.trim() } : {}),
        };
        await finance.createTransaction(draft);
      }
      onSaved();
    } catch (e) {
      // Surface the failure instead of silently leaving the dialog open.
      toast.error(failureText(e, 'Could not save transaction'));
    } finally {
      setSaving(false);
    }
  };

  // Edit mode: splitting an existing bill or settling an existing credit is
  // a deliberate step, not something a half-typed name should autosave.
  const applyToExisting = async () => {
    if (!txn || saving) return;
    if (!person.trim()) { setErrors({ person: type === 'expense' ? 'Enter who owes this.' : 'Enter who is paying you back.' }); return; }
    if (type === 'expense' && (!(theirShare > 0) || theirShare > total)) { setErrors({ share: 'Their share has to be above zero and at most the bill.' }); return; }
    setSaving(true);
    try {
      // Land any pending field edits first, then make the structural change.
      if (autosave.changed) await autosave.commit(values);
      if (type === 'expense') {
        await finance.markPaidFor({
          borrower: person.trim(), transaction_ids: [txn.id], share: theirShare, remind,
          ...(dueDate ? { due_date: dueDate } : {}),
        });
      } else {
        await finance.settleLends({ borrower: person.trim(), transaction_ids: [txn.id] });
      }
      onSaved();
    } catch (e) {
      toast.error(failureText(e));
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

  // Add-ons on offer for this kind, in a fixed order so the row never shuffles.
  const offered: Addon[] = type === 'expense' ? ['split', 'slate', 'note']
    : type === 'income' ? ['settle', 'refund', 'slate', 'note']
      : ['note'];
  const plainSlate = slates.find((p) => p.is_plain);
  const slateName = slates.find((p) => String(p.id) === slateId)?.name;
  const owed = people.find((p) => personKey(p.borrower) === personKey(person));
  const pillText: Record<Addon, ReactNode> = {
    split: <>Split · {person.trim() || 'someone'} {theirShare > 0 && <Money value={theirShare} />}</>,
    settle: <>From {person.trim() || 'someone'}</>,
    refund: <>Refund</>,
    slate: <>Slate · {slateName ?? plainSlate?.name ?? 'Plain'}</>,
    note: <>Note</>,
  };
  const addLabel: Record<Addon, string> = {
    split: 'Split', settle: 'From a person', refund: 'Refund', slate: 'Slate', note: 'Note',
  };

  const panel = (a: Addon) => {
    if (a === 'split') return (
      <AddonPanel label="Split with" onDone={() => setExpanded(null)} onRemove={() => removeAddon('split')}>
        {existingSplit ? (
          <p className="text-sm font-medium">{existingSplit.borrower}</p>
        ) : (
          <PersonField value={person} onChange={(v) => { setPerson(v); clearError('person'); }} error={errors.person}
            suggestions={people.map((p) => p.borrower)} placeholder="Who owes this?" />
        )}
        {existingSplit ? (
          <Field label="Their share" error={errors.share}>
            <Input type="number" inputMode="decimal" value={share} onChange={(e) => { setShare(e.target.value); clearError('share'); }} />
          </Field>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {(['half', 'custom', 'all'] as const).map((m) => (
              <StateChip key={m} selected={shareMode === m} onClick={() => { setShareMode(m); clearError('share'); }} className={shareMode === m ? undefined : PANEL_CHIP}>
                {m === 'half' ? '½' : m === 'custom' ? 'Custom' : 'All'}
              </StateChip>
            ))}
            {shareMode === 'custom' && (
              <Input type="number" inputMode="decimal" value={customShare} onChange={(e) => { setCustomShare(e.target.value); clearError('share'); }}
                placeholder="Their share" className="h-8 w-32" aria-invalid={!!errors.share} />
            )}
          </div>
        )}
        {errors.share && <p className="text-xs text-destructive">{errors.share}</p>}
        {total > 0 && theirShare > 0 && theirShare <= total && (
          <div className="flex flex-wrap gap-1.5">
            {theirShare < total && <DateBadge>You <Money value={subMoney(total, theirShare)} /></DateBadge>}
            <DateBadge tone="accent">{person.trim() || 'They'} owe{person.trim() ? 's' : ''} <Money value={theirShare} /></DateBadge>
          </div>
        )}
        {!existingSplit && (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
            <Field label="Due">
              <DatePicker value={dueDate} onChange={setDueDate} placeholder={account?.type === 'credit_card' ? 'With the card bill' : 'No due date'} />
            </Field>
            <StateChip selected={remind} onClick={() => setRemind((r) => !r)} className={cn('h-10', remind ? undefined : PANEL_CHIP)}>Remind me</StateChip>
          </div>
        )}
        {txn && !existingSplit && (
          <Button size="sm" className="self-end" onClick={applyToExisting} disabled={saving}>Split this bill</Button>
        )}
      </AddonPanel>
    );
    if (a === 'settle') return (
      <AddonPanel label="From a person" onDone={() => setExpanded(null)} onRemove={() => removeAddon('settle')}>
        <PersonField value={person} onChange={(v) => { setPerson(v); clearError('person'); }} error={errors.person}
          suggestions={people.filter((p) => p.outstanding > 0).map((p) => p.borrower)} placeholder="Who is paying you back?" />
        {owed && (
          <div className="flex flex-wrap gap-1.5">
            <DateBadge>Owes <Money value={owed.outstanding} /></DateBadge>
            {total > 0 && (() => {
              const left = subMoney(owed.outstanding, total);
              return left > 0 ? <DateBadge><Money value={left} /> left</DateBadge>
                : left < 0 ? <DateBadge tone="positive"><Money value={-left} /> held</DateBadge>
                  : <DateBadge tone="positive">Settled</DateBadge>;
            })()}
          </div>
        )}
        {txn && <Button size="sm" className="self-end" onClick={applyToExisting} disabled={saving}>Mark as paid back</Button>}
      </AddonPanel>
    );
    if (a === 'refund') return (
      <AddonPanel label="Refund of" onDone={() => setExpanded(null)} onRemove={() => removeAddon('refund')}>
        <RefundPicker accountId={Number(accountId)} value={refundOf} onChange={(id, categoryName) => {
          setRefundOf(id);
          // Follow the purchase's category unless one was picked by hand.
          const cat = categories.find((c) => c.kind === 'expense' && c.name === categoryName);
          if (cat && !userPickedCategoryRef.current) setCategoryId(String(cat.id));
        }} />
      </AddonPanel>
    );
    if (a === 'slate') return (
      <AddonPanel label="Slate" onDone={() => setExpanded(null)} onRemove={() => removeAddon('slate')}>
        <div className="flex flex-wrap gap-1.5">
          {slates.filter((p) => !p.archived || String(p.id) === slateId).map((p) => (
            <StateChip key={p.id} selected={String(p.id) === slateId} onClick={() => setSlateId(String(p.id))}
              className={String(p.id) === slateId ? undefined : PANEL_CHIP}>{p.name}</StateChip>
          ))}
        </div>
        {slates.find((p) => String(p.id) === slateId && !p.is_plain) && (
          <p className="text-xs text-muted-foreground">Kept out of your ordinary budgets.</p>
        )}
      </AddonPanel>
    );
    return (
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Context, who it was with. Use #tags to file it."
        rows={3}
        maxLength={1000}
        autoFocus={expanded === 'note'}
        // Fixed height (field-sizing:fixed) — auto-growing inside the
        // modal's scroll container caused a layout-thrash freeze.
        className="resize-none overflow-y-auto !min-h-0 h-[76px]"
        style={fixedField}
      />
    );
  };

  // A credit that pays someone back becomes a repayment: no category.
  const showCategory = type !== 'transfer' && !allTheirs && !(type === 'income' && addons.has('settle'));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && requestClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-baseline justify-between gap-3">
            <DialogTitle>{txn ? (isRefund ? 'Edit refund' : 'Edit transaction') : 'New transaction'}</DialogTitle>
            {txn && <AutosaveStatus status={autosave.status} />}
          </div>
        </DialogHeader>
        {!txn && (
          <div className="grid grid-cols-3 gap-1 rounded-full bg-muted p-1">
            {(['expense', 'income', 'transfer'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => switchType(t)}
                className={cn('rounded-full py-1.5 text-xs font-medium capitalize transition-colors',
                  type === t ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]' : 'text-muted-foreground hover:text-foreground')}
              >
                {t}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-3">
          <Field label={existingSplit || splitOn ? 'Bill' : 'Amount'} error={errors.amount}>
            <Input
              type="number"
              inputMode="decimal"
              value={amount}
              aria-invalid={!!errors.amount}
              onChange={(e) => { setAmount(e.target.value); clearError('amount'); }}
              placeholder="0.00"
              className="h-12 text-2xl font-semibold tabular-nums"
              autoFocus={!txn}
            />
          </Field>
          <Field label="Title">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={type === 'transfer' ? 'e.g. Move to savings' : isRefund ? 'e.g. Amazon refund' : type === 'income' ? 'e.g. October salary' : allTheirs ? 'e.g. Cash for Aman' : 'e.g. Lunch at Cafe X'}
              maxLength={120}
            />
          </Field>
          <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <Field label={type === 'transfer' ? 'From' : 'Account'} error={errors.account} className="col-span-2 sm:col-span-1">
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
            <Field label="Date"><DatePicker value={date} onChange={setDate} /></Field>
            <Field label="Time"><TimePicker value={time} onChange={setTime} /></Field>
          </div>
          {type === 'transfer' && !txn && (
            <Field label="To" error={errors.linked}>
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
          {showCategory && (
            <Field
              label="Category"
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

          {/* Add-ons: configured ones read as pills, the rest as quiet "+"
              chips. One opens at a time, in place, under the row. */}
          <div className="flex flex-wrap gap-1.5">
            {offered.map((a) => addons.has(a) ? (
              expanded === a ? null : (
                <span key={a} className="inline-flex h-8 items-center rounded-full bg-[hsl(var(--secondary-container))] text-sm font-semibold text-[hsl(var(--on-secondary-container))]">
                  <button type="button" onClick={() => setExpanded(a)} className="inline-flex h-full items-center gap-1 rounded-l-full pl-3 pr-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/45">
                    {pillText[a]}
                  </button>
                  <button type="button" aria-label={`Remove ${addLabel[a]}`} onClick={() => removeAddon(a)} className="grid size-8 place-items-center rounded-r-full opacity-70 outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/45">
                    <X className="size-3.5" />
                  </button>
                </span>
              )
            ) : (
              <button
                key={a}
                type="button"
                onClick={() => addAddon(a)}
                className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-[hsl(var(--outline-variant))] px-3 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/45"
              >
                <Plus className="size-3.5" /> {addLabel[a]}
              </button>
            ))}
          </div>
          {expanded && addons.has(expanded) && panel(expanded)}
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

// Neutral chips are surface-container-high, the panel's own tone.
const PANEL_CHIP = 'bg-[hsl(var(--surface-container-highest))]';

function AddonPanel({ label, onDone, onRemove, children }: { label: string; onDone: () => void; onRemove?: () => void; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl bg-[hsl(var(--surface-container-high))] p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="font-mono text-xs label-kicker text-muted-foreground">{label}</Label>
        <div className="-mr-1.5 flex items-center">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onDone}>Done</Button>
          {onRemove && (
            <button type="button" aria-label={`Remove ${label.toLowerCase()}`} onClick={onRemove} className="grid size-7 place-items-center rounded-full text-muted-foreground outline-none hover:bg-[hsl(var(--on-surface)/0.08)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/45">
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function PersonField({ value, onChange, suggestions, placeholder, error }: {
  value: string; onChange: (v: string) => void; suggestions: string[]; placeholder: string; error?: string;
}) {
  const picked = suggestions.find((s) => personKey(s) === personKey(value));
  return (
    <div className="flex flex-col gap-1.5">
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-invalid={!!error} autoFocus />
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.slice(0, 6).map((s) => (
            <StateChip key={s} selected={s === picked} onClick={() => onChange(s)} className={s === picked ? undefined : PANEL_CHIP}>{s}</StateChip>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// Optional link to the purchase being refunded: recent plain expenses on the
// same account, newest first.
function RefundPicker({ accountId, value, onChange }: { accountId: number; value: string; onChange: (id: string, categoryName: string | null) => void }) {
  const q = useLendCandidates('paid_for', '', accountId, accountId > 0);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const options = [{ value: '', label: 'Not linked' }, ...items.map((c) => ({
    value: String(c.id),
    label: `${c.description || c.category_name || 'Untitled'} · ${format(new Date(c.txn_at), 'd MMM')}`,
  }))];
  if (value && !items.some((c) => String(c.id) === value)) options.push({ value, label: 'Linked purchase' });
  return (
    <Select value={value} onValueChange={(v) => {
      const id = v ?? '';
      onChange(id, items.find((c) => String(c.id) === id)?.category_name ?? null);
    }} items={options}>
      <SelectTrigger><SelectValue placeholder="Original purchase (optional)" /></SelectTrigger>
      <SelectContent>{options.map((o) => <SelectItem key={o.value || 'none'} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
    </Select>
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
