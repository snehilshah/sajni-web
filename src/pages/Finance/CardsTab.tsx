import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { format, parseISO, differenceInDays } from 'date-fns';
import { CreditCard, Plus, Check, AlertCircle, Trash2 } from '@/components/ui/icons';

import { finance, type FinAccount, type FinStatement, type StmtDraft, type StmtPatch } from '@/api';
import { confirmDialog } from '@/lib/confirm';
import { Button } from '@/components/ui/button';
import { DateBadge } from '@/components/ui/state-chip';
import { cardClass, CardAccent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFinanceFormatters } from './useFinancePrivacy';
import { CardsSkeleton } from './Skeletons';
import { sumMoney, subMoney } from './utils';

interface Props {
  accounts: FinAccount[];
  statements: FinStatement[];
  loaded: boolean;
  reload: () => void;
}

export default function CardsTab({ accounts, statements, loaded, reload }: Props) {
  const { formatMoney, formatPercent } = useFinanceFormatters();
  const [creating, setCreating] = useState<FinAccount | null>(null);
  const [paying, setPaying] = useState<FinStatement | null>(null);
  const ccAccounts = useMemo(() => accounts.filter((a) => a.type === 'credit_card'), [accounts]);
  // Accounts that can pay a card bill: anything with cash, not the card itself.
  const payFrom = useMemo(
    () => accounts.filter((a) => a.type !== 'credit_card' && !a.archived),
    [accounts],
  );
  const load = () => reload();
  useEffect(() => {}, []);

  if (!loaded && statements.length === 0 && ccAccounts.length === 0) {
    return <CardsSkeleton count={2} />;
  }
  if (ccAccounts.length === 0) {
    return (
      <p className="py-2 text-sm text-muted-foreground">No credit cards yet</p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {ccAccounts.map((card) => {
        const cardStmts = statements.filter((s) => s.account_id === card.id);
        const unpaid = cardStmts.filter((s) => !s.paid);
        const totalUnpaid = sumMoney(unpaid, (st) => st.amount_due);
        const totalCashback = sumMoney(cardStmts, (st) => st.cashback_earned);
        const owed = card.balance < 0 ? -card.balance : 0;

        return (
          <motion.div
            key={card.id}
            layout
            initial={{ opacity: 0, transform: 'translateY(4px)' }}
            animate={{ opacity: 1, transform: 'translateY(0)' }}
            className={cardClass({ accent: card.color }, 'p-4 md:p-5')}
          >
            <CardAccent color={card.color} />
            {/* Same face as the card's tile on Accounts: identity colour as a
                wash and an icon tile, the figure on the leading edge. */}
            <div className="flex items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-md" style={{ backgroundColor: card.color + '20', color: card.color }}>
                <CreditCard className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="truncate font-medium">{card.name}</div>
                <div className="truncate text-xs text-muted-foreground">{card.institution || 'Credit card'}</div>
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="whitespace-nowrap font-serif text-3xl font-semibold tabular-nums">{formatMoney(owed)}</span>
              <span className="text-xs text-muted-foreground">owed</span>
            </div>
            {card.credit_limit ? (() => {
              const used = (owed / card.credit_limit) * 100;
              return (
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[hsl(var(--surface-container-highest))]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: Math.min(used, 100) + '%', backgroundColor: used > 80 ? 'hsl(var(--destructive))' : card.color }}
                    />
                  </div>
                  <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                    {formatPercent(used)} of {formatMoney(card.credit_limit)}
                  </span>
                </div>
              );
            })() : null}

            <div className="mt-4 flex flex-col gap-3">
              {/* Figures start on the card's leading edge, like every
                  other stat; the billing cycle is a badge, not a fraction. */}
              <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
                <Stat label="Unpaid" value={formatMoney(totalUnpaid)} tone={totalUnpaid > 0 ? 'destructive' : 'default'} />
                <Stat label="Cashback" value={formatMoney(totalCashback)} tone="primary" />
                {card.statement_day && card.due_day ? (
                  <DateBadge className="mb-1">Bills on {card.statement_day} · due {card.due_day}</DateBadge>
                ) : null}
              </div>

              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">Statements</h3>
                <Button size="sm" variant="ghost" className="-mr-2" onClick={() => setCreating(card)}>
                  <Plus className="size-3.5 mr-1" /> Add
                </Button>
              </div>

              {cardStmts.length === 0 ? (
                <p className="text-xs text-muted-foreground">No statements yet</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {cardStmts.slice(0, 6).map((s) => (
                    <StatementRow
                      key={s.id}
                      statement={s}
                      onUpdate={async (data) => { await finance.updateStatement(s.id, data); load(); }}
                      onPay={() => setPaying(s)}
                      onDelete={async () => {
                        if (!(await confirmDialog('Delete this statement?'))) return;
                        await finance.deleteStatement(s.id);
                        load();
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        );
      })}

      <StatementDialog
        card={creating}
        onClose={() => setCreating(null)}
        onSaved={() => { setCreating(null); load(); }}
      />
      <PayStatementDialog
        statement={paying}
        accounts={payFrom}
        onClose={() => setPaying(null)}
        onPaid={() => { setPaying(null); load(); }}
      />
    </div>
  );
}

// PayStatementDialog records a card payment: it marks the statement paid and
// posts a transfer from the chosen bank account to the card, reducing what's
// owed. Surfaced when the user taps "Mark paid".
function PayStatementDialog({ statement, accounts, onClose, onPaid }: {
  statement: FinStatement | null;
  accounts: FinAccount[];
  onClose: () => void;
  onPaid: () => void;
}) {
  const { formatMoney } = useFinanceFormatters();
  const [accountId, setAccountId] = useState('');
  useEffect(() => {
    if (statement) setAccountId(accounts[0] ? String(accounts[0].id) : '');
  }, [statement, accounts]);

  if (!statement) return null;

  const pay = async () => {
    await finance.updateStatement(statement.id, {
      paid: true,
      ...(accountId ? { paid_from_account: parseInt(accountId) } : {}),
    });
    onPaid();
  };

  return (
    <Dialog open={!!statement} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay {formatMoney(statement.amount_due)}</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground -mt-2">
          We'll post a transfer from the selected account to the card and mark this statement paid.
        </div>
        <Field label="Pay from">
          <Select
            value={accountId}
            onValueChange={(v) => setAccountId(v ?? '')}
            items={accounts.map((a) => ({ value: String(a.id), label: a.name }))}
          >
            <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {accounts.length === 0 && (
          <div className="text-xs text-muted-foreground">
            No account to pay from. We'll just mark it paid without posting a transfer.
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={pay}>Confirm payment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone = 'default' }: {
  label: string; value: string;
  tone?: 'primary' | 'destructive' | 'default';
}) {
  const tones: Record<string, string> = {
    primary: 'text-primary',
    destructive: 'text-destructive',
    default: 'text-foreground',
  };
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`whitespace-nowrap font-serif text-lg font-semibold tabular-nums ${tones[tone]}`}>
        {value}
      </div>
    </div>
  );
}

function StatementRow({ statement, onUpdate, onPay, onDelete }: {
  statement: FinStatement;
  onUpdate: (data: StmtPatch) => Promise<void>;
  onPay: () => void;
  onDelete: () => Promise<void>;
}) {
  const { formatMoney } = useFinanceFormatters();
  const dueDate = parseISO(statement.due_date);
  const daysUntil = differenceInDays(dueDate, new Date());
  const overdue = !statement.paid && daysUntil < 0;
  const dueSoon = !statement.paid && daysUntil >= 0 && daysUntil <= 5;
  const isCredit = statement.amount_due <= 0; // overpaid → nothing to pay

  return (
    <div className="py-1">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium tabular-nums">
            {isCredit ? formatMoney(-statement.amount_due) + ' credit' : formatMoney(statement.amount_due)}
          </div>
          <div className="text-xs text-muted-foreground">
            {format(parseISO(statement.statement_date), 'd MMM')}
            {statement.cashback_earned > 0 && ' · ' + formatMoney(statement.cashback_earned) + ' back'}
          </div>
        </div>
        {statement.paid ? (
          <DateBadge tone="positive" icon={<Check className="size-3" />}>Paid</DateBadge>
        ) : isCredit ? (
          <DateBadge tone="positive">In credit</DateBadge>
        ) : overdue ? (
          <DateBadge tone="alert" icon={<AlertCircle className="size-3" />}>{-daysUntil}d overdue</DateBadge>
        ) : (
          <DateBadge tone={dueSoon ? 'accent' : 'neutral'}>{daysUntil === 0 ? 'Due today' : `Due ${format(dueDate, 'd MMM')}`}</DateBadge>
        )}
      </div>

      {/* Breakdown: previous balance carried in + this cycle's new charges. */}
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums text-muted-foreground">
        <span>Prev {formatMoney(statement.previous_balance)}</span>
        <span>Personal {formatMoney(Math.max(subMoney(statement.new_charges, statement.lend_charges), 0))}</span>
        {statement.lend_charges > 0 && <span className="text-foreground">Lent {formatMoney(statement.lend_charges)}</span>}
      </div>

      <div className="-mr-2 mt-1 flex items-center justify-end gap-1">
        {statement.paid ? (
          <Button size="sm" variant="ghost" onClick={() => onUpdate({ paid: false })}>
            Undo
          </Button>
        ) : !isCredit ? (
          <Button size="sm" variant="outline" onClick={onPay}>
            Mark paid
          </Button>
        ) : null}
        <Button variant="destructive-ghost" size="icon-sm" onClick={onDelete}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function StatementDialog({ card, onClose, onSaved }: {
  card: FinAccount | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { formatMoney } = useFinanceFormatters();
  const [stmtDate, setStmtDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dueDate, setDueDate] = useState('');
  const [amountOverride, setAmountOverride] = useState('');
  const [cashbackOverride, setCashbackOverride] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const [cashbackTouched, setCashbackTouched] = useState(false);
  const [preview, setPreview] = useState<{
    amount_due: number;
    new_charges: number;
    previous_balance: number;
    cashback_earned: number;
    payments: number;
    lend_charges: number;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (card) {
      const today = new Date();
      const stmtDay = card.statement_day || today.getDate();
      const dueDay = card.due_day || stmtDay + 15;
      const sd = new Date(today.getFullYear(), today.getMonth(), Math.min(stmtDay, 28));
      const dd = new Date(today.getFullYear(), today.getMonth() + (dueDay < stmtDay ? 1 : 0), Math.min(dueDay, 28));
      setStmtDate(format(sd, 'yyyy-MM-dd'));
      setDueDate(format(dd, 'yyyy-MM-dd'));
      setAmountOverride('');
      setCashbackOverride('');
      setAmountTouched(false);
      setCashbackTouched(false);
      setPreview(null);
    }
  }, [card]);

  useEffect(() => {
    if (!card || !stmtDate) return;
    let alive = true;
    setPreviewLoading(true);
    finance.previewStatement(card.id, { statement_date: stmtDate })
      .then((res) => {
        if (!alive) return;
        setPreview(res);
        setDueDate((current) => current || res.due_date);
      })
      .catch(() => {
        if (alive) setPreview(null);
      })
      .finally(() => {
        if (alive) setPreviewLoading(false);
      });
    return () => { alive = false; };
  }, [card, stmtDate]);

  if (!card) return null;

  const amountValue = amountTouched ? amountOverride : formatInputAmount(preview?.amount_due);
  const cashbackValue = cashbackTouched ? cashbackOverride : formatInputAmount(preview?.cashback_earned);

  const save = async () => {
    if (!stmtDate || !dueDate) return;
    const data: StmtDraft = { statement_date: stmtDate, due_date: dueDate };
    if (amountValue) data.amount_due = parseFloat(amountValue);
    if (cashbackValue) data.cashback_earned = parseFloat(cashbackValue);
    await finance.createStatement(card.id, data);
    onSaved();
  };

  return (
    <Dialog open={!!card} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Statement · {card.name}</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground -mt-2">
          Calculated from previous balance, this cycle's charges, payments, and card cashback. Edit the fields if the bank statement differs.
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Statement date">
            <DatePicker value={stmtDate} onChange={setStmtDate} />
          </Field>
          <Field label="Due date">
            <DatePicker value={dueDate} onChange={setDueDate} />
          </Field>
          <Field label="Amount due">
            <Input
              type="number"
              inputMode="decimal"
              value={amountValue}
              onChange={(e) => { setAmountTouched(true); setAmountOverride(e.target.value); }}
              placeholder="0"
            />
          </Field>
          <Field label="Cashback">
            <Input
              type="number"
              inputMode="decimal"
              value={cashbackValue}
              onChange={(e) => { setCashbackTouched(true); setCashbackOverride(e.target.value); }}
              placeholder="0"
            />
          </Field>
        </div>
        <div className="rounded-lg bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
          {previewLoading && !preview ? (
            <span>Calculating…</span>
          ) : preview ? (
            <>
              <span>Prev {formatMoney(preview.previous_balance)}</span>
              <span>Personal {formatMoney(Math.max(subMoney(preview.new_charges, preview.lend_charges), 0))}</span>
              {preview.lend_charges > 0 && <span className="text-foreground">Lent {formatMoney(preview.lend_charges)}</span>}
              <span>Payments {formatMoney(preview.payments)}</span>
            </>
          ) : (
            <span>Preview unavailable. Generate will still calculate from server records.</span>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Generate</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatInputAmount(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return '';
  return String(Math.round(value * 100) / 100);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="font-mono text-xs label-kicker text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
