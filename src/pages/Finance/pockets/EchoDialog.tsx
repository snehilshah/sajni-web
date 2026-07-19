import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { type EchoDraft, type FinAccount, type FinCategory } from '@/api';
import { msg } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFinanceFormatters } from '../useFinancePrivacy';
import { Field } from '../TransactionDialog';

// "Add to my ledger" — attach a private echo txn for a shared-pocket entry
// that already exists (an expense you paid but someone else recorded, or
// your leg of a settlement the other party entered). Account/category are
// yours alone; nothing here is visible to other members.

export interface EchoTarget {
  title: string;
  amount: number;
  /** Which side of my ledger the echo lands on. */
  kind: 'expense' | 'income';
  attach: (echo: EchoDraft) => Promise<unknown>;
}

interface Props {
  target: EchoTarget | null;
  accounts: FinAccount[];
  categories: FinCategory[];
  onClose: () => void;
  onSaved: () => void;
}

export default function EchoDialog({ target, accounts, categories, onClose, onSaved }: Props) {
  const { formatMoney } = useFinanceFormatters();
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setAccountId(accounts[0] ? String(accounts[0].id) : '');
    setCategoryId('');
  }, [target, accounts]);

  const cats = categories.filter((c) => c.kind === target?.kind);

  const save = async () => {
    if (!target || !accountId || saving) return;
    setSaving(true);
    try {
      await target.attach({
        account_id: parseInt(accountId),
        category_id: categoryId ? parseInt(categoryId) : null,
      });
      onSaved();
    } catch (err) {
      toast.error(msg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add to my ledger</DialogTitle>
        </DialogHeader>
        {target && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Files “{target.title}” — {formatMoney(target.amount)} — as{' '}
              {target.kind === 'expense' ? 'an expense' : 'income'} in your own
              transactions. Visible only to you.
            </p>
            <Field label="Account">
              <Select value={accountId || undefined} onValueChange={(v) => setAccountId(v ?? '')}
                items={accounts.map((a) => ({ value: String(a.id), label: a.name }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Category">
              <Select value={categoryId || undefined} onValueChange={(v) => setCategoryId(v ?? '')}
                items={cats.map((c) => ({ value: String(c.id), label: c.name }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {cats.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || !accountId}>{saving ? 'Adding…' : 'Add'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
