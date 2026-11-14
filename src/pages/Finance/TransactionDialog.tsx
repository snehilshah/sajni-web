import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { format, parseISO } from 'date-fns';
import { Bell, Trash2, Sparkles, Plus, X } from '@/components/ui/icons';

import { toast } from 'sonner';
import { finance, type FinAccount, type FinCategory, type FinSlate, type FinTitleSuggestion, type FinTransaction, type TxnDraft, type TxnKind, type TxnPatch } from '@/api';
import { Autocomplete } from '@base-ui/react/autocomplete';
import { confirmDialog } from '@/lib/confirm';
import { failureText } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useEditorDraft } from '@/hooks/use-editor-draft';
import { EditActions, UnsavedNotice } from '@/components/editor-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { TimePicker } from '@/components/ui/time-picker';
import { Label } from '@/components/ui/label';
import { DateBadge } from '@/components/ui/state-chip';
import { HuePill } from '@/components/ui/hue-pill';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { M3CookieLoader } from '@/components/ui/shapes';
import { useFinInvestments, useFinLendPeople, useFinLends, useLendCandidates } from '@/queries/finance';
import { CategoryChips, CategoryPill } from './CategoryChips';
import { Money } from './Money';
import { formatMoney, txnAtToParts, partsToTxnAt, subMoney, sumMoney } from './utils';
import { SplitFields, computeSplit, emptySplit, isAllTheirs, splitNames, type SplitState } from './SplitFields';

// The add/edit sheet for personal-ledger transactions. Five things are always
// there (kind, amount, title, account + date, category); everything optional
// is a "+" chip under them that, once tapped, becomes one more section of the
// form (its label on the leading edge, a × on the trailing edge):
//   expense → Split (people who owe part or all of it), Pays back (money the
//             user owed someone; not spending), Slate, Note
//   income  → Settles a lend (it pays someone's lends back), To pay back
//             (money the user owes back; not income), Refund, Slate, Note
// "Lend" is not a kind: lending cash is an expense split with someone for
// all of it. This sheet is the one place a lend or a payment back is made;
// the People tab's buttons open it pre-filled.

const fixedField: CSSProperties & { fieldSizing: 'fixed' } = { fieldSizing: 'fixed' };

type Addon = 'split' | 'payback' | 'settle' | 'owe' | 'refund' | 'transfer' | 'slate' | 'note';

export const personKey = (name: string) => name.trim().toLowerCase();
// Money typed or pasted ("₹1,200.50") down to a plain decimal string.
export const decimalOnly = (v: string) => {
  const [int, ...rest] = v.replace(/[^\d.]/g, '').split('.');
  return rest.length ? `${int}.${rest.join('').slice(0, 2)}` : int;
};
export const round2 = (n: number) => Math.round(n * 100) / 100;
// Amount can be a sum: "552.91+6.38" (one bill paid two ways) is 559.29.
export const sumOnly = (v: string) => v.replace(/[^\d.+-]/g, '').replace(/([+-])[+-]+/g, '$1');
export const isSum = (v: string) => /\d\s*[+-]\s*\.?\d/.test(v);
export const amountOf = (v: string): number => {
  let t = 0;
  for (const part of v.match(/[+-]?[^+-]+/g) ?? []) {
    const n = parseFloat(part);
    if (!isNaN(n)) t += n;
  }
  return round2(t);
};

// The editable fields of an existing transaction, as the form holds them.
// Autosave diffs this shape, so the loader and the form must build it alike.
// On a split bill `amount` is the whole bill; the server stores the user's
// part (amount − everyone's shares).
interface EditValues {
  accountId: string; categoryId: string; amount: string; description: string;
  note: string; slateId: string; date: string; time: string;
  refundOf: string;
  /** A credit read as money back on a purchase (income ↔ refund). */
  refund: boolean;
}

/** The people a saved bill is shared with (older servers send one). */
export const txnSplits = (txn: FinTransaction | null | undefined) =>
  txn?.splits?.length ? txn.splits : txn?.split ? [txn.split] : [];

function editValues(txn: FinTransaction): EditValues {
  const p = txnAtToParts(txn.txn_at);
  const shared = sumMoney(txnSplits(txn), (s) => s.share);
  return {
    accountId: String(txn.account_id),
    categoryId: txn.category_id ? String(txn.category_id) : '',
    amount: String(round2(txn.amount + shared)),
    description: txn.description,
    note: txn.note || '',
    slateId: String(txn.slate_id ?? 0),
    date: p.date,
    time: p.time,
    refundOf: txn.refund_of ? String(txn.refund_of) : '',
    refund: txn.type === 'refund',
  };
}

function editKind(kind: FinTransaction['type']): TxnKind {
  if (kind === 'income' || kind === 'refund' || kind === 'borrow') return 'income';
  if (kind === 'transfer_in' || kind === 'transfer_out') return 'transfer';
  return 'expense';
}

export default function TransactionDialog({
  open, txn, accounts, categories, slates, defaultSlateId, initialType = 'expense', initialPerson = '', onClose, onSaved, onEditLend,
}: {
  open: boolean;
  txn: FinTransaction | null;
  accounts: FinAccount[];
  categories: FinCategory[];
  slates: FinSlate[];
  /** Preselect this slate for new txns. */
  defaultSlateId?: number;
  /** 'lend' opens an expense already split with someone for all of it;
   *  'settle' an income that settles a lend; 'borrow' an income owed back;
   *  'payback' an expense paying someone back. */
  initialType?: TxnKind | 'lend' | 'settle' | 'borrow' | 'payback';
  /** With 'lend' / 'settle' / 'borrow' / 'payback': who it's with. */
  initialPerson?: string;
  /** A split bill's lends (who, their share, due) are edited in Edit lend. */
  onEditLend?: (lendId: number) => void;
  onClose: () => void;
  onSaved: (patch?: { id: number } & Partial<FinTransaction>) => void;
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
  // Add-ons that are on; the one just added takes focus.
  const [addons, setAddons] = useState<Set<Addon>>(new Set());
  const [justAdded, setJustAdded] = useState<Addon | null>(null);
  // Settles a lend: who is paying back.
  const [person, setPerson] = useState('');
  const [split, setSplit] = useState<SplitState>(() => emptySplit());
  // Settles a lend: toward one of their lends ('' = their overall total).
  const [towardLendId, setTowardLendId] = useState('');
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
  // A transfer can go into an investment too (an RD instalment, a SIP).
  const investments = useFinInvestments(open).data ?? [];
  const people = peopleQ.data ?? [];
  const isRefund = type === 'income' && addons.has('refund');
  const existingSplits = txnSplits(txn);
  const sharedOut = sumMoney(existingSplits, (s) => s.share);
  const splitOn = type === 'expense' && addons.has('split') && existingSplits.length === 0;
  const total = amountOf(amount);
  const splitResult = splitOn ? computeSplit(total, split) : null;
  const allTheirs = splitOn && isAllTheirs(split);
  const account = accounts.find((a) => String(a.id) === accountId);
  // A new transfer can start from an investment ("inv:N" in From): money
  // coming back, e.g. an RD maturing. The account it lands in is the To.
  const fromInv = type === 'transfer' && !txn && accountId.startsWith('inv:')
    ? investments.find((i) => `inv:${i.id}` === accountId) : undefined;
  const fromInvSplit = fromInv ? splitReturn(fromInv.invested_amount, total) : null;
  // Slates worth offering: the live ones, plus whatever this txn already sits
  // in. Plain is not a choice; removing the add-on is.
  const pickableSlates = slates.filter((p) => !p.is_plain && (!p.archived || String(p.id) === slateId));

  const values: EditValues = { accountId, categoryId, amount, description, note, slateId, date, time, refundOf, refund: isRefund };
  const applyValues = (v: EditValues) => {
    setAccountId(v.accountId); setCategoryId(v.categoryId); setAmount(v.amount);
    setDescription(v.description); setNote(v.note); setSlateId(v.slateId);
    setDate(v.date); setTime(v.time); setRefundOf(v.refundOf);
    setAddons((prev) => {
      const next = new Set(prev);
      if (v.refund) next.add('refund'); else next.delete('refund');
      return next;
    });
  };
  const editErrors = (v: EditValues): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!v.accountId) e.account = 'Select an account.';
    const amt = amountOf(v.amount);
    if (!v.amount.trim()) e.amount = 'Enter an amount.';
    else if (isNaN(amt) || amt <= 0) e.amount = 'Amount must be greater than 0.';
    else if (existingSplits.length === 1 && round2(amt) <= sharedOut) e.amount = 'The bill has to be more than their share. Change their share in Edit lend.';
    else if (existingSplits.length > 1 && round2(amt) < sharedOut) e.amount = 'The bill can\'t be less than everyone\'s shares. Change a share in Edit lend.';
    if (!v.description.trim()) e.description = 'Add a title.';
    return e;
  };
  // A split or a settlement filled in on a saved transaction but not yet
  // applied. The footer's Save becomes this action. (Explicit: a half-typed
  // name would settle someone.)
  const pendingLabel = !txn ? null
    : splitOn && splitResult && !splitResult.error ? 'Split this bill'
      : addons.has('transfer') && linkedId ? 'Make it a transfer'
      : type === 'income' && addons.has('settle') && person.trim() ? 'Mark as paid back'
        : type === 'income' && addons.has('owe') && person.trim() ? 'Mark as owed back'
          : type === 'expense' && addons.has('payback') && person.trim() ? 'Mark as paying back'
            : null;
  // Nothing saves until Save (or Add). A new one starts with defaults filled
  // in (account, category guess), so only what was typed counts as unsaved;
  // a split or settlement waiting to be applied is unsaved too.
  const savedPatch = useRef<({ id: number } & Partial<FinTransaction>) | undefined>(undefined);
  const editor = useEditorDraft({
    open: open,
    editing: !!(open && txn),
    value: values,
    dirty: !txn ? !!(amount.trim() || description.trim() || note.trim() || person.trim() || splitNames(split).length)
      : pendingLabel ? true : undefined,
    invalid: Object.values(editErrors(values))[0]?.toLowerCase() ?? null,
    save: async (v) => {
      if (!txn) return;
      savedPatch.current = await persistEdit(txn, v);
    },
  });
  const loadDraft = editor.load;

  // Edit → PUT; returns the optimistic row patch for the list.
  const persistEdit = async (t: FinTransaction, v: EditValues) => {
    const credit = t.type === 'income' || t.type === 'refund';
    const others = categories.find((c) => c.kind === (credit && !v.refund ? 'income' : 'expense')
      && ['other', 'others'].includes(c.name.trim().toLowerCase()));
    const selectedCategoryId = v.categoryId || (others ? String(others.id) : '');
    const acctId = parseInt(v.accountId);
    const catId = selectedCategoryId ? parseInt(selectedCategoryId) : null;
    const billTotal = amountOf(v.amount);
    const txnAt = partsToTxnAt(v.date, v.time);
    const sid = parseInt(v.slateId) || 0;
    // On a split bill the server holds the user's part; the shares stay as
    // they are (Edit lend moves them), so the bill total moves the user's part.
    const mine = round2(billTotal - sumMoney(txnSplits(t), (s) => s.share));
    // Money owed or paid back has no category and keeps its kind.
    const owedRow = !!t.owed;
    const patch: TxnPatch = {
      account_id: acctId, amount: mine, description: v.description.trim(), note: v.note,
      txn_at: txnAt, ...(owedRow ? {} : { category_id: catId }), slate_id: sid,
      ...(credit ? { type: v.refund ? 'refund' as const : 'income' as const } : {}),
      ...(credit && v.refund ? { refund_of: v.refundOf ? parseInt(v.refundOf) : 0 } : {}),
    };
    await finance.updateTransaction(t.id, patch);
    // Optimistic row patch so the list reflects it instantly (no raw ids).
    const cat = categories.find((c) => c.id === catId);
    return {
      id: t.id,
      ...(credit ? { type: v.refund ? 'refund' as const : 'income' as const } : {}),
      account_id: acctId,
      account_name: accounts.find((a) => a.id === acctId)?.name || '',
      note: v.note,
      ...(owedRow ? {} : {
        category_id: catId,
        category_name: cat?.name ?? null,
        category_color: cat?.color ?? null,
      }),
      amount: mine,
      description: v.description.trim(),
      txn_at: txnAt,
      ...(sid ? { slate_id: sid, slate_name: slates.find((p) => p.id === sid)?.name ?? '' } : {}),
    };
  };

  // Every close path (Esc, backdrop, ×, Cancel): with changes, warn first.
  const requestClose = () => editor.close(onClose);

  useEffect(() => {
    setErrors({});
    setJustAdded(null);
    setPerson('');
    setSplit(emptySplit());
    setDueDate('');
    setRemind(false);
    setTowardLendId('');
    if (txn) {
      const v = editValues(txn);
      setType(editKind(txn.type));
      setLinkedId(txn.linked_account ? String(txn.linked_account) : '');
      applyValues(v);
      loadDraft(v);
      const on = new Set<Addon>();
      if (txnSplits(txn).length) on.add('split');
      if (txn.type === 'refund') on.add('refund');
      if (txn.note) on.add('note');
      if (slates.find((p) => p.id === txn.slate_id && !p.is_plain)) on.add('slate');
      setAddons(on);
      userPickedCategoryRef.current = true; // editing — treat existing pick as user's
      setUserPickedCategory(true);
    } else {
      const lend = initialType === 'lend';
      const settle = initialType === 'settle';
      const owe = initialType === 'borrow';
      const payback = initialType === 'payback';
      setType(lend || payback ? 'expense' : settle || owe ? 'income' : initialType);
      setAccountId(accounts[0] ? String(accounts[0].id) : '');
      setLinkedId('');
      setCategoryId('');
      setAmount('');
      setDescription('');
      setNote('');
      setRefundOf('');
      const slate = defaultSlateId ?? slates.find((p) => p.is_plain)?.id ?? 0;
      setSlateId(String(slate));
      setAddons(new Set<Addon>([
        ...(lend ? ['split' as const] : []),
        ...(settle ? ['settle' as const] : []),
        ...(owe ? ['owe' as const] : []),
        ...(payback ? ['payback' as const] : []),
        ...(slates.find((p) => p.id === slate && !p.is_plain) ? ['slate' as const] : []),
      ]));
      // Lending: one person, all of it theirs.
      if (lend) { setSplit(emptySplit(initialPerson.trim() ? [initialPerson.trim()] : [], false)); setJustAdded(initialPerson ? null : 'split'); }
      if (settle) { setJustAdded(initialPerson ? null : 'settle'); setPerson(initialPerson); }
      if (owe || payback) { setJustAdded(initialPerson ? null : owe ? 'owe' : 'payback'); setPerson(initialPerson); }
      if (owe && !initialPerson) setDescription('');
      if (payback && initialPerson) setDescription('Paid back ' + initialPerson.trim());
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
  }, [txn, open, defaultSlateId, initialType, initialPerson, loadDraft]);

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
    setAddons((prev) => new Set([...prev].filter((a) => a === 'slate' || a === 'note')));
  };
  const addAddon = (a: Addon) => {
    setAddons((prev) => {
      const next = new Set(prev);
      next.add(a);
      // Settling, owing back and refunding are different stories about the
      // same credit; splitting and paying back about the same expense.
      const apart: Partial<Record<Addon, Addon[]>> = {
        settle: ['refund', 'owe', 'transfer'], refund: ['settle', 'owe', 'transfer'], owe: ['settle', 'refund', 'transfer'],
        split: ['payback', 'transfer'], payback: ['split', 'transfer'],
        transfer: ['split', 'payback', 'settle', 'owe', 'refund'],
      };
      for (const other of apart[a] ?? []) next.delete(other);
      return next;
    });
    if (a === 'refund' || (a === 'settle' && addons.has('refund'))) setCategoryId('');
    if (a === 'split') setSplit(emptySplit());
    if (a === 'transfer') setLinkedId('');
    if (a === 'settle' || a === 'owe' || a === 'payback') { setPerson(''); setTowardLendId(''); setDueDate(''); }
    // A slate add-on with one slate to offer picks it.
    if (a === 'slate' && pickableSlates.length === 1) setSlateId(String(pickableSlates[0].id));
    setJustAdded(a);
  };
  // An add-on just switched on slides into view in the side column instead
  // of growing the sheet.
  const sideRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!justAdded) return;
    const el = sideRef.current?.querySelector(`[data-addon="${justAdded}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [justAdded]);
  const removeAddon = (a: Addon) => {
    setAddons((prev) => { const next = new Set(prev); next.delete(a); return next; });
    if (a === 'slate') setSlateId(String(slates.find((p) => p.is_plain)?.id ?? 0));
    if (a === 'note') setNote('');
    if (a === 'refund') { setRefundOf(''); setCategoryId(''); }
    if (a === 'transfer') setLinkedId('');
  };

  // Collect per-field validation messages so the user sees exactly what's
  // missing instead of the Add button silently doing nothing.
  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!accountId || (accountId.startsWith('inv:') && !fromInv)) e.account = 'Select an account.';
    const amt = amountOf(amount);
    if (!amount.trim()) e.amount = 'Enter an amount.';
    else if (isNaN(amt) || amt <= 0) e.amount = 'Amount must be greater than 0.';
    if (!description.trim()) e.description = 'Add a title.';
    if (type === 'transfer' && !txn) {
      if (!linkedId) e.linked = 'Choose where it goes.';
      else if (linkedId === accountId) e.linked = 'Destination must differ from the source.';
      else if (accountId.startsWith('inv:') && linkedId.startsWith('inv:')) e.linked = 'Pick the account the money came into.';
    }
    if (splitResult?.error) Object.assign(e, splitResult.error);
    if (type === 'income' && addons.has('settle') && !person.trim()) e.person = 'Enter who is paying you back.';
    if (type === 'income' && addons.has('owe') && !person.trim()) e.person = 'Enter who you owe it to.';
    if (type === 'expense' && addons.has('payback') && !person.trim()) e.person = 'Enter who you are paying back.';
    return e;
  };

  const save = async () => {
    if (txn) { if (pendingLabel) void applyToExisting(); else await editor.save(() => onSaved(savedPatch.current)); return; }
    if (saving) return;
    const e = validate();
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    setErrors({});
    const amt = amountOf(amount);
    const txnAt = partsToTxnAt(date, time);
    const selectedCategoryId = categoryId || (othersCategory ? String(othersCategory.id) : '');

    setSaving(true);
    try {
      if (type === 'transfer') {
        // "inv:N" is an investment; anything else an account.
        if (accountId.startsWith('inv:')) {
          await finance.createTransaction({
            account_id: parseInt(linkedId), type: 'transfer', amount: amt, description: description.trim(), note,
            txn_at: txnAt, from_investment_id: parseInt(accountId.slice(4)),
          });
        } else {
          const into = linkedId.startsWith('inv:') ? { investment_id: parseInt(linkedId.slice(4)) } : { linked_account: parseInt(linkedId) };
          await finance.createTransaction({
            account_id: parseInt(accountId), type: 'transfer', amount: amt, description: description.trim(), note,
            txn_at: txnAt, ...into,
          });
        }
      } else if (allTheirs && splitResult) {
        // All of it is theirs: money lent, not spent.
        await finance.createLend({
          source_account_id: parseInt(accountId), borrower: splitResult.shares[0].borrower, amount: amt,
          description: description.trim(), note, lent_at: txnAt, due_date: dueDate || null, remind: remind && !!dueDate,
        });
      } else {
        const draft: TxnDraft = {
          account_id: parseInt(accountId),
          type: isRefund ? 'refund' : type,
          amount: amt, description: description.trim(), note, txn_at: txnAt,
          // A linked refund with no category picked takes the purchase's.
          category_id: isRefund && refundOf && !categoryId ? null : selectedCategoryId ? parseInt(selectedCategoryId) : null,
          slate_id: parseInt(slateId) || 0,
          ...(isRefund && refundOf ? { refund_of: parseInt(refundOf) } : {}),
          ...(splitResult ? splitDraft(splitResult.shares, remind, dueDate) : {}),
          ...(type === 'income' && addons.has('settle') ? { settle_with: person.trim(), ...(towardLendId ? { settle_lend_id: Number(towardLendId) } : {}) } : {}),
          ...(type === 'income' && addons.has('owe') ? { owe_to: person.trim(), ...(dueDate ? { owe_due_date: dueDate } : {}) } : {}),
          ...(type === 'expense' && addons.has('payback') ? { pay_back_to: person.trim() } : {}),
        };
        // Owed or paid back: not income or spending, so no category.
        if (draft.owe_to || draft.pay_back_to) draft.category_id = null;
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
  // a deliberate step.
  const applyToExisting = async () => {
    if (!txn || saving) return;
    if (addons.has('transfer')) {
      if (!linkedId) { setErrors({ linked: 'Choose the other account.' }); return; }
    } else if (type === 'expense' && splitResult?.error) { setErrors(splitResult.error); return; }
    if (!addons.has('transfer') && (type !== 'expense' || addons.has('payback')) && !person.trim()) { setErrors({ person: 'Enter who it\'s with.' }); return; }
    if (!description.trim()) { setErrors({ description: 'Add a title.' }); return; }
    setSaving(true);
    try {
      // Land any pending field edits first, then make the structural change.
      if (editor.changed) await editor.commit(values);
      if (addons.has('transfer')) {
        await finance.makeTransfer(txn.id, Number(linkedId));
      } else if (type === 'income' && addons.has('owe')) {
        await finance.markBorrow({ transaction_id: txn.id, person: person.trim(), ...(dueDate ? { due_date: dueDate } : {}) });
      } else if (type === 'expense' && addons.has('payback')) {
        await finance.markPayBack({ transaction_id: txn.id, person: person.trim() });
      } else if (type === 'expense' && splitResult) {
        const sh = splitResult.shares;
        await finance.markPaidFor({
          // One person keeps the one-person form older servers know.
          ...(sh.length === 1 ? { borrower: sh[0].borrower, share: sh[0].share } : { shares: sh }),
          transaction_ids: [txn.id], remind,
          ...(dueDate ? { due_date: dueDate } : {}),
        });
      } else {
        await finance.settleLends({ borrower: person.trim(), transaction_ids: [txn.id], ...(towardLendId ? { lend_id: Number(towardLendId) } : {}) });
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
    editor.cancel();
    try {
      await finance.deleteTransaction(txn.id);
      onSaved();
    } catch (e) {
      toast.error(failureText(e));
    }
  };

  // Add-ons on offer for this kind, in a fixed order so the form never
  // shuffles. Slate only when there is a slate to pick.
  // Money owed or paid back that's already saved is undone, not re-filed.
  const savedOwed = txn?.owed ?? null;
  const oweAnyone = people.some((p) => (p.you_owe ?? 0) > 0);
  // A saved plain expense or income can turn out to be money between the
  // user's own accounts.
  const canTransfer = !!txn && (txn.type === 'expense' || txn.type === 'income') && !existingSplits.length && !savedOwed;
  const offered: Addon[] = (type === 'expense' ? ['split', 'payback', 'transfer', 'slate', 'note'] as Addon[]
    : type === 'income' ? ['settle', 'owe', 'refund', 'transfer', 'slate', 'note'] as Addon[]
      : ['note'] as Addon[])
    .filter((a) => a !== 'transfer' || canTransfer)
    .filter((a) => a !== 'slate' || pickableSlates.length > 0 || addons.has('slate'))
    .filter((a) => a !== 'payback' || oweAnyone || addons.has('payback'))
    .filter((a) => !savedOwed || a === 'slate' || a === 'note');
  const owed = people.find((p) => personKey(p.borrower) === personKey(person));
  const addLabel: Record<Addon, string> = {
    split: 'Split', payback: 'Pays back', settle: 'Settles a lend', owe: 'To pay back', refund: 'Refund', transfer: 'Transfer', slate: 'Slate', note: 'Note',
  };
  const undoOwed = async () => {
    if (!savedOwed) return;
    try {
      await finance.deleteOwed(savedOwed.id);
      editor.cancel();
      onSaved();
    } catch (e) {
      toast.error(failureText(e));
    }
  };

  const section = (a: Addon) => {
    // A saved split's lends have one editor each: Edit lend (who, share, due, undo).
    if (a === 'split' && existingSplits.length) return (
      <section key={a} className="flex flex-col gap-2 pt-1">
        <Label className="font-mono text-xs label-kicker text-muted-foreground">Split with {existingSplits.map((s) => s.borrower).join(', ')}</Label>
        {total > 0 && subMoney(total, sharedOut) > 0 && <SummaryRow><DateBadge>You <Money value={subMoney(total, sharedOut)} /></DateBadge></SummaryRow>}
        {existingSplits.map((s) => (
          <SummaryRow key={s.lend_id} action={onEditLend && <Button variant="tonal" size="sm" onClick={() => editor.close(() => onEditLend(s.lend_id))}>Edit lend</Button>}>
            <DateBadge tone="accent">{s.borrower} owes <Money value={s.share} /></DateBadge>
          </SummaryRow>
        ))}
      </section>
    );
    if (a === 'split') return (
      <AddonSection key={a} label="Split with" onRemove={() => removeAddon('split')}>
        <SplitFields value={split} onChange={(next) => { setSplit(next); clearError('person'); clearError('share'); }} total={total}
          suggestions={people.map((p) => p.borrower)} errors={errors} autoFocus={justAdded === 'split'}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <DatePicker value={dueDate} onChange={setDueDate} prefix="Due" placeholder={account?.type === 'credit_card' ? 'With the card bill' : 'Anytime'} />
          <button
            type="button"
            aria-pressed={remind}
            onClick={() => setRemind((r) => !r)}
            className={cn(
              'inline-flex h-11 items-center gap-1.5 rounded-xl px-3.5 text-sm outline-none transition-colors focus-visible:shadow-[inset_0_0_0_2px_hsl(var(--primary))]',
              remind
                ? 'bg-[hsl(var(--secondary-container))] font-semibold text-[hsl(var(--on-secondary-container))]'
                : 'bg-[hsl(var(--surface-container-highest))] font-semibold text-muted-foreground hover:text-foreground',
            )}
          >
            <Bell className="size-4" /> Remind
          </button>
        </div>
        </SplitFields>
      </AddonSection>
    );
    if (a === 'owe') return (
      <AddonSection key={a} label="To pay back" onRemove={() => removeAddon('owe')}>
        <PersonField value={person} onChange={(v) => { setPerson(v); clearError('person'); }} error={errors.person}
          suggestions={people.map((p) => p.borrower)} placeholder="Who do you owe it to?" autoFocus={justAdded === 'owe'} />
        <DatePicker value={dueDate} onChange={setDueDate} prefix="Pay back by" placeholder="Anytime" />
        <SummaryRow>
          {owed && (owed.you_owe ?? 0) > 0 && <DateBadge>You owe <Money value={owed.you_owe ?? 0} /></DateBadge>}
          {total > 0 && <DateBadge tone="accent">Not income</DateBadge>}
        </SummaryRow>
      </AddonSection>
    );
    if (a === 'payback') return (
      <AddonSection key={a} label="Pays back" onRemove={() => removeAddon('payback')}>
        <PersonField value={person} onChange={(v) => { setPerson(v); clearError('person'); }} error={errors.person}
          suggestions={people.filter((p) => (p.you_owe ?? 0) > 0).map((p) => p.borrower)} placeholder="Who are you paying back?" autoFocus={justAdded === 'payback'} />
        <SummaryRow>
          {owed && (owed.you_owe ?? 0) > 0 && (<>
            <DateBadge>You owe <Money value={owed.you_owe ?? 0} /></DateBadge>
            {total > 0 && (() => {
              const left = subMoney(owed.you_owe ?? 0, total);
              return left > 0 ? <DateBadge><Money value={left} /> left</DateBadge>
                : left < 0 ? <DateBadge tone="alert">More than you owe</DateBadge>
                  : <DateBadge tone="positive">Paid back</DateBadge>;
            })()}
          </>)}
          {total > 0 && <DateBadge tone="accent">Not spending</DateBadge>}
        </SummaryRow>
      </AddonSection>
    );
    if (a === 'settle') return (
      <AddonSection key={a} label="Settles a lend" onRemove={() => removeAddon('settle')}>
        <PersonField value={person} onChange={(v) => { setPerson(v); setTowardLendId(''); clearError('person'); }} error={errors.person}
          suggestions={people.filter((p) => p.outstanding > 0).map((p) => p.borrower)} placeholder="Who is paying you back?" autoFocus={justAdded === 'settle'} />
        {owed && <TowardPicker person={owed.borrower} value={towardLendId} onChange={setTowardLendId} />}
        <SummaryRow>
          {owed && (<>
            <DateBadge>Owes <Money value={owed.outstanding} /></DateBadge>
            {total > 0 && (() => {
              const left = subMoney(owed.outstanding, total);
              return left > 0 ? <DateBadge><Money value={left} /> left</DateBadge>
                : left < 0 ? <DateBadge tone="positive"><Money value={-left} /> held</DateBadge>
                  : <DateBadge tone="positive">Settled</DateBadge>;
            })()}
          </>)}
        </SummaryRow>
      </AddonSection>
    );
    if (a === 'refund') return (
      <AddonSection key={a} label="Refund of" onRemove={() => removeAddon('refund')}>
        <RefundPicker accountId={Number(accountId)} value={refundOf} onChange={(id, categoryName) => {
          setRefundOf(id);
          // Follow the purchase's category unless one was picked by hand.
          const cat = categories.find((c) => c.kind === 'expense' && c.name === categoryName);
          if (cat && !userPickedCategoryRef.current) setCategoryId(String(cat.id));
        }} />
      </AddonSection>
    );
    if (a === 'transfer') return (
      <AddonSection key={a} label={type === 'income' ? 'Transfer from' : 'Transfer to'} onRemove={() => removeAddon('transfer')}>
        <Field label={type === 'income' ? 'From' : 'To'} error={errors.linked}>
          <Select value={linkedId || undefined} onValueChange={(v) => { setLinkedId(v ?? ''); clearError('linked'); }}
            items={accounts.filter((x) => String(x.id) !== accountId).map((x) => ({ value: String(x.id), label: x.name }))}>
            <SelectTrigger aria-invalid={!!errors.linked}><SelectValue placeholder="Select account" /></SelectTrigger>
            <SelectContent>
              {accounts.filter((x) => String(x.id) !== accountId).map((x) => (
                <SelectItem key={x.id} value={String(x.id)}>{x.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <p className="text-xs text-muted-foreground">
          Money that only moved between your accounts: {type === 'income' ? 'not income' : 'not spending'}.
        </p>
      </AddonSection>
    );
    if (a === 'slate') return (
      <AddonSection key={a} label="Slate" onRemove={() => removeAddon('slate')}>
        <div role="radiogroup" className="flex flex-wrap gap-1.5">
          {pickableSlates.map((p) => (
            <HuePill key={p.id} selected={String(p.id) === slateId} onClick={() => setSlateId(String(p.id))} className="h-8">{p.name}</HuePill>
          ))}
        </div>
        {pickableSlates.some((p) => String(p.id) === slateId) && (
          <p className="text-xs text-muted-foreground">Kept out of your ordinary budgets.</p>
        )}
      </AddonSection>
    );
    return (
      <AddonSection key={a} label="Note" onRemove={() => removeAddon('note')}>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Context, who it was with. Use #tags to file it."
          rows={3}
          maxLength={1000}
          autoFocus={justAdded === 'note'}
          // Fixed height (field-sizing:fixed) — auto-growing inside the
          // modal's scroll container caused a layout-thrash freeze.
          className="resize-none overflow-y-auto !min-h-0 h-[76px]"
          style={fixedField}
        />
      </AddonSection>
    );
  };

  // What a new payment does to its account: "Salary ₹50,236.48 → ₹49,683.57
  // after this". Cards owe in negatives, as on Accounts.
  const balanceLine = !txn && account && total > 0 && !fromInv ? (() => {
    const after = subMoney(account.balance, type === 'income' ? -total : total);
    return <>{account.name} <span className="font-medium text-foreground"><Money value={account.balance} /></span> → <span className="font-medium text-foreground"><Money value={after} /></span> after this</>;
  })() : null;

  // A credit that pays someone back becomes a repayment: no category.
  const showCategory = type !== 'transfer' && !allTheirs && !addons.has('transfer') && !(type === 'income' && addons.has('settle'))
    && !savedOwed && !(type === 'income' && addons.has('owe')) && !(type === 'expense' && addons.has('payback'));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && requestClose()}>
      {/* Sized in rem so density (Compact/Cozy) scales the sheet with its
          type; the title and footer stay put while the form scrolls. From
          md up it's two columns at a fixed height, as tall as the left side
          needs: what you type on the left, category and add-ons on a tinted
          pane to the right (it scrolls), so adding a Split or a Note never
          resizes the sheet. */}
      <DialogContent showCloseButton={false} className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-xl md:h-[min(35rem,90dvh)] md:max-w-4xl">
        <DialogHeader>
          <div className="flex items-baseline justify-between gap-3">
            <DialogTitle>{txn ? (isRefund ? 'Edit refund' : 'Edit transaction') : 'New transaction'}</DialogTitle>
          </div>
        </DialogHeader>
        {/* The fade sits inside the 8px padding, so at rest it touches no content. */}
        <div className="-mx-6 -my-2 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-2 [mask-image:linear-gradient(to_bottom,transparent,black_8px,black_calc(100%-8px),transparent)] md:grid md:grid-cols-2 md:gap-6 md:overflow-hidden md:[mask-image:none]">
          <div className="flex flex-col gap-3 md:-mx-1 md:min-h-0 md:overflow-x-hidden md:overflow-y-auto md:px-1 md:py-1">
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
            <Field label={existingSplits.length || splitOn ? 'Bill' : 'Amount'} error={errors.amount}
              hint={isSum(amount) ? <span className="text-xs tabular-nums text-muted-foreground">= <Money value={amountOf(amount)} /></span> : undefined}>
              <Input
                inputMode="decimal"
                value={amount}
                aria-invalid={!!errors.amount}
                onChange={(e) => { setAmount(sumOnly(e.target.value)); clearError('amount'); }}
                // A sum settles into its total when you move on.
                onBlur={() => { if (isSum(amount)) setAmount(String(amountOf(amount))); }}
                placeholder="0.00"
                className="h-12 text-2xl font-semibold tabular-nums"
                autoFocus={!txn}
              />
            </Field>
            <Field label="Title" error={errors.description}>
              <TitleField
                value={description}
                kind={type === 'income' && !isRefund ? 'income' : 'expense'}
                enabled={type !== 'transfer' && !allTheirs}
                invalid={!!errors.description}
                accounts={accounts}
                categories={categories}
                placeholder={type === 'transfer' ? 'e.g. Move to savings' : isRefund ? 'e.g. Amazon refund' : type === 'income' ? 'e.g. October salary' : allTheirs ? 'e.g. Cash for Aman' : 'e.g. Lunch at Cafe X'}
                onChange={(v) => { setDescription(v); clearError('description'); }}
                onPick={(sug) => {
                  // A new one takes the title's usual account and category;
                  // an edit only takes the title.
                  if (txn) return;
                  if (sug.account_id && accounts.some((a) => a.id === sug.account_id)) setAccountId(String(sug.account_id));
                  if (sug.category_id && filteredCats.some((c) => c.id === sug.category_id)) {
                    userPickedCategoryRef.current = true;
                    setUserPickedCategory(true);
                    setCategoryId(String(sug.category_id));
                  }
                }}
              />
            </Field>
              <Field label={type === 'transfer' ? 'From' : 'Account'} error={errors.account}>
                <Select value={accountId || undefined}
                  onValueChange={(v) => {
                    setAccountId(v ?? ''); clearError('account');
                    // Money back from an investment lands in its account by default.
                    const inv = v?.startsWith('inv:') ? investments.find((i) => `inv:${i.id}` === v) : undefined;
                    if (inv) {
                      if ((!linkedId || linkedId.startsWith('inv:')) && inv.account_id) setLinkedId(String(inv.account_id));
                      if (!description.trim()) setDescription(`${inv.name} matured`);
                    }
                  }}
                  items={[
                    ...accounts.map((a) => ({ value: String(a.id), label: a.name })),
                    ...(type === 'transfer' && !txn ? investments.map((i) => ({ value: `inv:${i.id}`, label: i.name })) : []),
                  ]}>
                  <SelectTrigger aria-invalid={!!errors.account}>
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {type === 'transfer' && !txn && investments.length > 0 && <SelectLabel>Accounts</SelectLabel>}
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                      ))}
                    </SelectGroup>
                    {type === 'transfer' && !txn && investments.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Investments</SelectLabel>
                        {investments.map((i) => (
                          <SelectItem key={i.id} value={`inv:${i.id}`}>{i.name}</SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
              </Field>
            {/* Date and time get a row of their own: room for "Fri, 13 Nov
                2026" and "9:26 PM" without truncating. */}
            <div className="grid grid-cols-[minmax(0,1fr)_8.75rem] gap-2 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <Field label="Date"><DatePicker value={date} onChange={setDate} withYear /></Field>
              <Field label="Time"><TimePicker value={time} onChange={setTime} /></Field>
            </div>
            {type === 'transfer' && !txn && (
              <Field label="To" error={errors.linked}>
                {/* Another account, or an investment: an RD instalment is
                    just a transfer into the RD, never spending. */}
                <Select value={linkedId || undefined}
                  onValueChange={(v) => {
                    setLinkedId(v ?? ''); clearError('linked');
                    // An untitled payment into an investment takes its name.
                    const inv = v?.startsWith('inv:') ? investments.find((i) => `inv:${i.id}` === v) : undefined;
                    if (inv && !description.trim()) setDescription(inv.name);
                  }}
                  items={[
                    ...accounts.filter((a) => String(a.id) !== accountId).map((a) => ({ value: String(a.id), label: a.name })),
                    ...(fromInv ? [] : investments.map((i) => ({ value: `inv:${i.id}`, label: i.name }))),
                  ]}>
                  <SelectTrigger aria-invalid={!!errors.linked}>
                    <SelectValue placeholder="Select destination" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {investments.length > 0 && <SelectLabel>Accounts</SelectLabel>}
                      {accounts.filter((a) => String(a.id) !== accountId).map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                      ))}
                    </SelectGroup>
                    {investments.length > 0 && !fromInv && (
                      <SelectGroup>
                        <SelectLabel>Investments</SelectLabel>
                        {investments.map((i) => (
                          <SelectItem key={i.id} value={`inv:${i.id}`}>{i.name}</SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {balanceLine && <p className="mt-auto hidden pt-2 text-xs text-muted-foreground md:block">{balanceLine}</p>}
            {fromInv && fromInvSplit && total > 0 && (
              <div className="flex flex-col gap-1 rounded-xl bg-[hsl(var(--surface-container))] px-4 py-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span>Your money back <span className="text-xs text-muted-foreground">· transfer</span></span>
                  <Money value={fromInvSplit.principal} />
                </div>
                {fromInvSplit.gain > 0 && (
                  <div className="flex justify-between gap-3 border-t border-[hsl(var(--outline-variant)/0.5)] pt-1">
                    <span>Interest <span className="text-xs text-muted-foreground">· income</span></span>
                    <span className="text-[hsl(var(--color-complete))]"><Money value={fromInvSplit.gain} /></span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  You have <Money value={fromInv.invested_amount} /> in {fromInv.name}, so up to that much is your own money coming back.
                  {fromInvSplit.gain > 0 ? ' The rest is filed under Interest.' : ''}
                  {fromInvSplit.principal >= fromInv.invested_amount - 0.005 ? ` ${fromInv.name} shows as closed afterwards.` : ''}
                </p>
              </div>
            )}
          </div>
          <div ref={sideRef} className="flex flex-col gap-3 md:-mr-6 md:min-h-0 md:overflow-x-hidden md:overflow-y-auto md:rounded-l-[20px] md:bg-[hsl(var(--surface-container-low))] md:py-4 md:pl-5 md:pr-6">
            {showCategory && (
              <Field
                label={splitOn || existingSplits.length ? 'Category of your part' : 'Category'}
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
                  rowOnPhone
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

            {/* Add-ons that are on are sections of the form; the rest wait
                as quiet "+" chips under them. */}
            {savedOwed && (
              <section className="flex flex-col gap-2 pt-1">
                <Label className="font-mono text-xs label-kicker text-muted-foreground">
                  {savedOwed.kind === 'debt' ? 'To pay back' : 'Pays back'}
                </Label>
                <SummaryRow action={<Button variant="tonal" size="sm" onClick={() => void undoOwed()}>Undo</Button>}>
                  <DateBadge tone="accent">
                    {savedOwed.kind === 'debt' ? `You owe ${savedOwed.person}` : `Paying ${savedOwed.person} back`}
                  </DateBadge>
                  {savedOwed.due_date && <DateBadge>By {format(parseISO(savedOwed.due_date), 'd MMM')}</DateBadge>}
                </SummaryRow>
              </section>
            )}
            {offered.filter((a) => addons.has(a)).map((a) => <div key={a} data-addon={a}>{section(a)}</div>)}
            {offered.some((a) => !addons.has(a)) && (
              <div className="flex flex-wrap gap-1.5">
                {offered.filter((a) => !addons.has(a)).map((a) => (
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
            )}
            {txn?.seen_via && (
              <p className="text-xs text-muted-foreground">Captured from {txn.seen_via}</p>
            )}
            {balanceLine && <p className="text-xs text-muted-foreground md:hidden">{balanceLine}</p>}
          </div>
        </div>
        <DialogFooter className="flex-row items-center justify-between">
          {txn ? (
            <Button variant="destructive-quiet" onClick={remove}>
              <Trash2 className="size-4 mr-1" /> Delete
            </Button>
          ) : <span />}
          {txn ? (
            <div className="flex gap-2">
              <EditActions draft={editor} onCancel={onClose} onSave={() => void save()}
                saveLabel={pendingLabel ?? 'Save'} disabled={saving} />
            </div>
          ) : (
            <div className="flex gap-2">
              <UnsavedNotice draft={editor} />
              <Button variant="outline" className={cn(editor.warning && 'text-destructive')} onClick={requestClose} disabled={saving}>
                {editor.warning ? 'Discard' : 'Cancel'}
              </Button>
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

// An add-on as a form section: label on the leading edge, a neutral ×
// whose glyph ends on the trailing edge.
export function AddonSection({ label, onRemove, children }: { label: string; onRemove: () => void; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 pt-1">
      <div className="flex min-h-[14px] items-center justify-between gap-2">
        <Label className="font-mono text-xs label-kicker text-muted-foreground">{label}</Label>
        <button type="button" aria-label={`Remove ${label.toLowerCase()}`} onClick={onRemove}
          className="-my-2 -mr-[7px] grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground outline-none hover:bg-[hsl(var(--on-surface)/0.08)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/45">
          <X className="size-3.5" />
        </button>
      </div>
      {children}
    </section>
  );
}

// An add-on's last line: what it adds up to (badges) on the leading edge and,
// on a saved transaction, the button that commits it on the trailing edge,
// both on one centre line.
export function SummaryRow({ action, children }: { action?: ReactNode; children?: ReactNode }) {
  if (!action && !children) return null;
  return (
    <div className="flex min-h-10 flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap gap-1.5">{children}</div>
      {action}
    </div>
  );
}

// A money field with its meaning written in front, so it still reads once
// the placeholder is gone.
export function PrefixedInput({ prefix, value, onChange, invalid }: { prefix: string; value: string; onChange: (v: string) => void; invalid?: boolean }) {
  return (
    <label className={cn(
      'flex h-11 min-w-0 cursor-text items-center gap-1.5 rounded-xl border border-transparent bg-[hsl(var(--surface-container-highest))] pl-3.5 text-sm',
      'transition-[box-shadow,border-color] duration-150 ease-[cubic-bezier(0.2,0,0,1)] focus-within:shadow-[inset_0_0_0_2px_hsl(var(--primary))]',
      invalid && 'border-destructive focus-within:border-transparent focus-within:shadow-[inset_0_0_0_2px_hsl(var(--destructive))]',
    )}>
      <span className="shrink-0 text-muted-foreground">{prefix}</span>
      <Input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // ½ / All fill it in; typing over that should replace, not append.
        onFocus={(e) => e.currentTarget.select()}
        placeholder="0.00"
        aria-invalid={invalid}
        aria-label={prefix}
        className="h-full min-w-0 rounded-none bg-transparent pl-0 tabular-nums focus-visible:shadow-none aria-invalid:border-transparent aria-invalid:focus-visible:shadow-none"
      />
    </label>
  );
}

/** The create body's split: one person keeps the one-person form older
 *  servers know; several go as splits. */
export function splitDraft(shares: { borrower: string; share: number }[], remind = false, dueDate = ''): Pick<TxnDraft, 'split' | 'splits' | 'split_due_date' | 'split_remind'> {
  if (shares.length === 1) return { split: { borrower: shares[0].borrower, share: shares[0].share, remind, ...(dueDate ? { due_date: dueDate } : {}) } };
  return { splits: shares, split_remind: remind, ...(dueDate ? { split_due_date: dueDate } : {}) };
}

export function PersonField({ value, onChange, suggestions, placeholder, error, autoFocus }: {
  value: string; onChange: (v: string) => void; suggestions: string[]; placeholder: string; error?: string; autoFocus?: boolean;
}) {
  const picked = suggestions.find((s) => personKey(s) === personKey(value));
  return (
    <div className="flex flex-col gap-2">
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-invalid={!!error} autoFocus={autoFocus} />
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.slice(0, 6).map((s) => (
            <HuePill key={s} selected={s === picked} onClick={() => onChange(s)} className="h-8">{s}</HuePill>
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

// Which of a person's lends a payment counts toward. "Overall" lowers their
// total without marking any one lend as paid.
export function TowardPicker({ person, value, onChange }: { person: string; value: string; onChange: (lendId: string) => void }) {
  const lendsQ = useFinLends(!!person);
  const theirs = (lendsQ.data ?? []).filter((l) => personKey(l.borrower) === personKey(person)
    && (l.outstanding > 0 || String(l.id) === value));
  const options = [{ value: '', label: 'Overall' }, ...theirs.map((l) => ({
    value: String(l.id),
    // Amounts are what people remember a lend by: "₹398 · Order 1 · 3 Oct".
    label: `${formatMoney(l.principal)} · ${l.description} · ${format(new Date(l.lent_at), 'd MMM')}`,
  }))];
  return (
    <Field label="Toward">
      <Select value={value} onValueChange={(v) => onChange(v ?? '')} items={options}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.value || 'overall'} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  );
}

// Title with suggestions from earlier titles ("Sew" → Sewri · Smoke ·
// RuPay). Picking one fills the title; the sheet decides what else to take.
function TitleField({ value, kind, enabled, invalid, placeholder, accounts, categories, onChange, onPick }: {
  value: string; kind: 'expense' | 'income'; enabled: boolean; invalid: boolean; placeholder: string;
  accounts: FinAccount[]; categories: FinCategory[];
  onChange: (v: string) => void; onPick: (s: FinTitleSuggestion) => void;
}) {
  const [found, setItems] = useState<FinTitleSuggestion[]>([]);
  const asking = enabled && value.trim().length >= 2;
  const items = asking ? found : [];
  useEffect(() => {
    const q = value.trim();
    if (!enabled || q.length < 2) return;
    const ac = new AbortController();
    const t = setTimeout(() => {
      finance.suggestTitles(q, kind, ac.signal)
        // Nothing to offer when the only match is what's typed already.
        .then((res) => { if (!ac.signal.aborted) setItems(res.filter((r) => r.title.toLowerCase() !== q.toLowerCase() || res.length > 1)); })
        .catch(() => {});
    }, 180);
    return () => { clearTimeout(t); ac.abort(); };
  }, [value, kind, enabled]);
  const accountName = (id: number | null) => accounts.find((a) => a.id === id)?.name;
  const category = (id: number | null) => categories.find((c) => c.id === id);
  return (
    <Autocomplete.Root
      items={items}
      value={value}
      filter={null}
      itemToStringValue={(s: FinTitleSuggestion) => s.title}
      onValueChange={(v, details) => {
        onChange(v);
        if (details.reason === 'item-press') {
          const hit = items.find((s) => s.title === v);
          if (hit) onPick(hit);
        }
      }}
    >
      <Autocomplete.Input
        render={<Input aria-invalid={invalid} placeholder={placeholder} maxLength={120} />}
      />
      <Autocomplete.Portal>
        <Autocomplete.Positioner sideOffset={6} align="start" className="z-[60] w-[var(--anchor-width)] outline-none">
          <Autocomplete.Popup className="max-h-72 overflow-y-auto rounded-2xl bg-[hsl(var(--surface-container-high))] p-1.5 shadow-[var(--m3-elev-3)] outline-none data-[empty]:hidden">
            <Autocomplete.List>
              {(s: FinTitleSuggestion) => {
                const cat = category(s.category_id);
                return (
                  <Autocomplete.Item
                    key={s.title}
                    value={s}
                    className="flex cursor-default items-center gap-2 rounded-xl px-3 py-2 text-sm outline-none select-none data-[highlighted]:bg-[hsl(var(--secondary-container))] data-[highlighted]:text-[hsl(var(--on-secondary-container))]"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{s.title}</span>
                    {cat && <CategoryPill name={cat.name} color={cat.color} />}
                    {accountName(s.account_id) && <span className="shrink-0 text-xs text-muted-foreground">{accountName(s.account_id)}</span>}
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground"><Money value={s.amount} /></span>
                  </Autocomplete.Item>
                );
              }}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
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

/** Money back from an investment: up to what's invested is the user's own
 *  money, the rest a gain (mirrors db.SplitReturn). */
function splitReturn(invested: number, amount: number): { principal: number; gain: number } {
  const principal = Math.round(Math.min(Math.max(invested, 0), amount) * 100) / 100;
  return { principal, gain: Math.round((amount - principal) * 100) / 100 };
}
