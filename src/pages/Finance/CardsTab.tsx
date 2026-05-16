import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { format, parseISO, differenceInDays } from 'date-fns';
import { CreditCard, Plus, Check, AlertCircle, Trash2, Gift } from 'lucide-react';

import { finance, type FinAccount, type FinStatement } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatMoney } from './utils';
import { CardsSkeleton } from './Skeletons';

interface Props {
  accounts: FinAccount[];
  statements: FinStatement[];
  loaded: boolean;
  reload: () => void;
}

export default function CardsTab({ accounts, statements, loaded, reload }: Props) {
  const [creating, setCreating] = useState<FinAccount | null>(null);
  const ccAccounts = useMemo(() => accounts.filter((a) => a.type === 'credit_card'), [accounts]);
  const load = () => reload();
  useEffect(() => {}, []);

  if (!loaded && statements.length === 0 && ccAccounts.length === 0) {
    return <CardsSkeleton count={2} />;
  }
  if (ccAccounts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No credit cards yet. Add an account with type "Credit Card" to start tracking statements and cashback.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {ccAccounts.map((card) => {
        const cardStmts = statements.filter((s) => s.account_id === card.id);
        const unpaid = cardStmts.filter((s) => !s.paid);
        const totalUnpaid = unpaid.reduce((s, st) => s + st.amount_due, 0);
        const totalCashback = cardStmts.reduce((s, st) => s + st.cashback_earned, 0);
        const owed = card.balance < 0 ? -card.balance : 0;

        return (
          <motion.div
            key={card.id}
            layout
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-border bg-card overflow-hidden"
          >
            {/* Card header */}
            <div
              className="p-4 md:p-5 text-white"
              style={{ background: `linear-gradient(135deg, ${card.color} 0%, ${card.color}dd 100%)` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono text-[10px] uppercase tracking-wider opacity-80">
                    {card.institution || 'Credit card'}
                  </div>
                  <div className="font-medium truncate text-lg mt-0.5">{card.name}</div>
                </div>
                <CreditCard className="size-5 opacity-80 shrink-0" />
              </div>
              <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-wider opacity-80">Outstanding</div>
                  <div className="font-serif text-2xl md:text-3xl font-semibold tabular-nums">
                    {formatMoney(owed)}
                  </div>
                </div>
                {card.credit_limit ? (
                  <div className="text-right">
                    <div className="font-mono text-[9px] uppercase tracking-wider opacity-80">Limit</div>
                    <div className="font-mono text-sm tabular-nums">{formatMoney(card.credit_limit)}</div>
                    <div className="font-mono text-[10px] tabular-nums opacity-80">
                      {((owed / card.credit_limit) * 100).toFixed(0)}% used
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Body */}
            <div className="p-4 md:p-5 flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Unpaid" value={formatMoney(totalUnpaid)} tone={totalUnpaid > 0 ? 'destructive' : 'default'} />
                <Stat label="Cashback" value={formatMoney(totalCashback)} icon={Gift} tone="primary" />
                <Stat
                  label="Cycle"
                  value={card.statement_day && card.due_day ? `${card.statement_day} / ${card.due_day}` : '—'}
                  small
                />
              </div>

              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">Statements</h3>
                <Button size="sm" variant="outline" onClick={() => setCreating(card)}>
                  <Plus className="size-3.5 mr-1" /> Add
                </Button>
              </div>

              {cardStmts.length === 0 ? (
                <div className="text-xs text-muted-foreground italic py-2">
                  No statements yet. Generate one when your billing cycle closes.
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {cardStmts.slice(0, 6).map((s) => (
                    <StatementRow
                      key={s.id}
                      statement={s}
                      onUpdate={async (data) => { await finance.updateStatement(s.id, data); load(); }}
                      onDelete={async () => {
                        if (!window.confirm('Delete this statement?')) return;
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
    </div>
  );
}

function Stat({ label, value, tone = 'default', icon: Icon, small }: {
  label: string; value: string;
  tone?: 'primary' | 'destructive' | 'default';
  icon?: typeof Gift;
  small?: boolean;
}) {
  const tones: Record<string, string> = {
    primary: 'text-primary',
    destructive: 'text-destructive',
    default: 'text-foreground',
  };
  return (
    <div className="rounded-lg bg-muted/40 p-2.5">
      <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
        {Icon && <Icon className="size-2.5" />}
        {label}
      </div>
      <div className={`${small ? 'text-sm' : 'text-base md:text-lg'} font-serif font-semibold tabular-nums ${tones[tone]}`}>
        {value}
      </div>
    </div>
  );
}

function StatementRow({ statement, onUpdate, onDelete }: {
  statement: FinStatement;
  onUpdate: (data: any) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const dueDate = parseISO(statement.due_date);
  const daysUntil = differenceInDays(dueDate, new Date());
  const overdue = !statement.paid && daysUntil < 0;
  const dueSoon = !statement.paid && daysUntil >= 0 && daysUntil <= 5;

  return (
    <div className={`rounded-md border p-2.5 ${
      overdue ? 'border-destructive/40 bg-destructive/5' :
      dueSoon ? 'border-yellow-500/40 bg-yellow-500/5' :
      'border-border'
    }`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium tabular-nums">
            {formatMoney(statement.amount_due)}
          </div>
          <div className="font-mono text-[10px] text-muted-foreground">
            {format(parseISO(statement.statement_date), 'MMM d')} · due {format(dueDate, 'MMM d')}
            {statement.cashback_earned > 0 && ' · ' + formatMoney(statement.cashback_earned) + ' cashback'}
          </div>
        </div>
        {statement.paid ? (
          <span className="font-mono text-[10px] text-primary inline-flex items-center gap-1 shrink-0">
            <Check className="size-3" />
            Paid
          </span>
        ) : (
          <span className={`font-mono text-[10px] inline-flex items-center gap-1 shrink-0 ${
            overdue ? 'text-destructive' : dueSoon ? 'text-yellow-600' : 'text-muted-foreground'
          }`}>
            {(overdue || dueSoon) && <AlertCircle className="size-3" />}
            {overdue ? `${-daysUntil}d overdue` : daysUntil === 0 ? 'Due today' : `${daysUntil}d`}
          </span>
        )}
      </div>
      <div className="flex items-center justify-end gap-1 mt-1.5">
        {!statement.paid ? (
          <Button size="sm" variant="outline" onClick={() => onUpdate({ paid: true })}>
            Mark paid
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => onUpdate({ paid: false })}>
            Undo
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" onClick={onDelete}>
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
  const [stmtDate, setStmtDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dueDate, setDueDate] = useState('');
  const [amountOverride, setAmountOverride] = useState('');
  const [cashbackOverride, setCashbackOverride] = useState('');

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
    }
  }, [card]);

  if (!card) return null;

  const save = async () => {
    if (!stmtDate || !dueDate) return;
    const data: any = { statement_date: stmtDate, due_date: dueDate };
    if (amountOverride) data.amount_due = parseFloat(amountOverride);
    if (cashbackOverride) data.cashback_earned = parseFloat(cashbackOverride);
    await finance.createStatement(card.id, data);
    onSaved();
  };

  return (
    <Dialog open={!!card} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New statement · {card.name}</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground -mt-2">
          We'll auto-compute the amount and cashback from this card's transactions. Override below if needed.
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Statement date">
            <DatePicker value={stmtDate} onChange={setStmtDate} />
          </Field>
          <Field label="Due date">
            <DatePicker value={dueDate} onChange={setDueDate} />
          </Field>
          <Field label="Amount (optional)">
            <Input type="number" inputMode="decimal" value={amountOverride} onChange={(e) => setAmountOverride(e.target.value)} placeholder="Auto-compute" />
          </Field>
          <Field label="Cashback (optional)">
            <Input type="number" inputMode="decimal" value={cashbackOverride} onChange={(e) => setCashbackOverride(e.target.value)} placeholder="Auto-compute" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Generate</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
