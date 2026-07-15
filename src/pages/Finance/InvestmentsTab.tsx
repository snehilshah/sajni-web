import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { format, parseISO, differenceInDays } from 'date-fns';
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, Repeat, Calendar } from '@/components/ui/icons';

import { finance, type FinAccount, type FinInvestment, type InvDraft } from '@/api';
import { confirmDialog } from '@/lib/confirm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AnimatedMoney } from './AnimatedMoney';
import { useFinanceFormatters } from './useFinancePrivacy';
import { INVESTMENT_TYPES } from './utils';
import { ListSkeleton } from './Skeletons';

interface Props {
  accounts: FinAccount[];
  investments: FinInvestment[];
  loaded: boolean;
  reload: () => void;
}

export default function InvestmentsTab({ accounts, investments, loaded, reload }: Props) {
  const { formatMoney, formatPercent } = useFinanceFormatters();
  const [editing, setEditing] = useState<FinInvestment | null>(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => {}, []);

  const totals = useMemo(() => {
    let invested = 0, current = 0, monthly = 0;
    for (const i of investments) {
      invested += i.invested_amount;
      current += i.current_value;
      if (i.frequency === 'monthly') monthly += i.monthly_amount;
    }
    return { invested, current, monthly, gain: current - invested, gainPct: invested > 0 ? ((current - invested) / invested) * 100 : 0 };
  }, [investments]);

  return (
    <div className="flex flex-col gap-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Invested" value={<AnimatedMoney value={totals.invested} />} />
        <SummaryCard label="Current value" value={<AnimatedMoney value={totals.current} />} tone="primary" />
        <SummaryCard
          label={totals.gain >= 0 ? 'Gain' : 'Loss'}
          value={<>{totals.gain >= 0 ? '+' : ''}<AnimatedMoney value={totals.gain} /> · {formatPercent(totals.gainPct, 1)}</>}
          tone={totals.gain >= 0 ? 'primary' : 'destructive'}
          className="col-span-2 md:col-span-1"
        />
        <SummaryCard label="Monthly outflow" value={<AnimatedMoney value={totals.monthly} />} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold">Investments</h2>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4 mr-1" /> Add investment
        </Button>
      </div>

      {!loaded && investments.length === 0 ? (
        <ListSkeleton rows={4} />
      ) : investments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No investments yet. Track SIPs, RDs, FDs, mutual funds and other manually-valued instruments here — update the current value whenever you check in.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {investments.map((inv) => {
            const gain = inv.current_value - inv.invested_amount;
            const gainPct = inv.invested_amount > 0 ? (gain / inv.invested_amount) * 100 : 0;
            const positive = gain >= 0;
            const matDays = inv.maturity_date ? differenceInDays(parseISO(inv.maturity_date), new Date()) : null;
            return (
              <motion.div
                key={inv.id}
                layout
                initial={{ opacity: 0, transform: 'translateY(4px)' }}
                animate={{ opacity: 1, transform: 'translateY(0)' }}
                whileTap={{ transform: 'scale(0.99)' }}
                onClick={() => setEditing(inv)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setEditing(inv); }}
                className="rounded-xl border border-border bg-card p-4 cursor-pointer hover:border-primary/30 hover:shadow-sm transition-[border-color,box-shadow] tap-highlight-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{inv.name}</div>
                    <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      {INVESTMENT_TYPES.find((t) => t.value === inv.type)?.label}
                      {inv.frequency === 'monthly' && inv.monthly_amount > 0 && ' · ' + formatMoney(inv.monthly_amount) + '/mo'}
                    </div>
                  </div>
                  <Pencil className="size-3.5 text-muted-foreground shrink-0 mt-1" />
                </div>

                <div className="mt-3 flex items-baseline justify-between gap-2">
                  <div className="font-serif text-2xl font-semibold tabular-nums">
                    {formatMoney(inv.current_value)}
                  </div>
                  <div className={`font-mono text-xs tabular-nums inline-flex items-center gap-1 ${positive ? 'text-primary' : 'text-destructive'}`}>
                    {positive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                    {positive ? '+' : ''}{formatMoney(gain)} ({formatPercent(gainPct, 1)})
                  </div>
                </div>
                <div className="font-mono text-xs text-muted-foreground mt-1">
                  Invested {formatMoney(inv.invested_amount)}
                  {inv.last_updated && ' · updated ' + format(parseISO(inv.last_updated), 'MMM d')}
                </div>

                {(inv.frequency !== 'lumpsum' || inv.maturity_date) && (
                  <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {inv.frequency !== 'lumpsum' && (
                      <span className={`inline-flex items-center gap-1 ${inv.auto_debit ? 'text-primary' : ''}`}>
                        <Repeat className="size-3" />
                        {inv.frequency.charAt(0).toUpperCase() + inv.frequency.slice(1)}
                        {inv.auto_debit && ' · auto'}
                      </span>
                    )}
                    {inv.auto_debit && inv.next_debit_date && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="size-3" />
                        Next debit {format(parseISO(inv.next_debit_date), 'd MMM')}
                      </span>
                    )}
                    {inv.maturity_date && matDays !== null && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="size-3" />
                        {matDays > 0 ? `${matDays}d to maturity` : matDays === 0 ? 'Matures today' : 'Matured'}
                      </span>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      <InvestmentDialog
        open={creating || editing !== null}
        investment={editing}
        accounts={accounts}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { setCreating(false); setEditing(null); reload(); }}
      />
    </div>
  );
}

function SummaryCard({ label, value, tone = 'default', className = '' }: { label: string; value: ReactNode; tone?: 'primary' | 'destructive' | 'default'; className?: string }) {
  const tones: Record<string, string> = {
    primary: 'text-primary',
    destructive: 'text-destructive',
    default: 'text-foreground',
  };
  return (
    <div className={`rounded-xl border border-border bg-card p-4 ${className}`}>
      <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-serif text-xl md:text-2xl font-semibold tabular-nums mt-1 ${tones[tone]}`}>{value}</div>
    </div>
  );
}

function InvestmentDialog({ open, investment, accounts, onClose, onSaved }: {
  open: boolean;
  investment: FinInvestment | null;
  accounts: FinAccount[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<FinInvestment['type']>('fd');
  const [accountId, setAccountId] = useState('');
  const [invested, setInvested] = useState('');
  const [current, setCurrent] = useState('');
  const [monthly, setMonthly] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [startDate, setStartDate] = useState('');
  const [maturityDate, setMaturityDate] = useState('');
  const [expectedReturn, setExpectedReturn] = useState('');
  const [notes, setNotes] = useState('');
  const [autoDebit, setAutoDebit] = useState(false);
  const [nextDebitDate, setNextDebitDate] = useState('');

  useEffect(() => {
    if (investment) {
      setName(investment.name);
      setType(investment.type);
      setAccountId(investment.account_id ? String(investment.account_id) : '');
      setInvested(String(investment.invested_amount));
      setCurrent(String(investment.current_value));
      setMonthly(String(investment.monthly_amount));
      setFrequency(investment.frequency);
      setStartDate(investment.start_date || '');
      setMaturityDate(investment.maturity_date || '');
      setExpectedReturn(String(investment.expected_return));
      setNotes(investment.notes);
      setAutoDebit(investment.auto_debit);
      setNextDebitDate(investment.next_debit_date || '');
    } else {
      setName(''); setType('sip'); setAccountId(''); setInvested(''); setCurrent('');
      setMonthly(''); setFrequency('monthly'); setStartDate(''); setMaturityDate('');
      setExpectedReturn(''); setNotes('');
      setAutoDebit(false); setNextDebitDate('');
    }
  }, [investment, open]);

  // Auto-debit needs a source account, a per-cycle amount, and a recurring
  // frequency — same validation the server enforces.
  const recurring = frequency !== 'lumpsum';
  const cycleAmt = parseFloat(monthly) || 0;
  const autoDebitBlocked = !accountId ? 'link an account first' : cycleAmt <= 0 ? 'set the per-cycle amount' : null;
  const autoDebitOn = autoDebit && recurring && !autoDebitBlocked;

  const save = async () => {
    if (!name.trim()) return;
    const data: InvDraft = {
      name: name.trim(),
      type,
      account_id: accountId ? parseInt(accountId) : null,
      invested_amount: parseFloat(invested) || 0,
      current_value: parseFloat(current) || parseFloat(invested) || 0,
      monthly_amount: cycleAmt,
      frequency,
      start_date: startDate || null,
      maturity_date: maturityDate || null,
      expected_return: parseFloat(expectedReturn) || 0,
      notes,
      auto_debit: autoDebitOn,
      next_debit_date: autoDebitOn && nextDebitDate ? nextDebitDate : null,
    };
    if (investment) {
      await finance.updateInvestment(investment.id, data);
    } else {
      await finance.createInvestment(data);
    }
    onSaved();
  };

  const remove = async () => {
    if (!investment) return;
    if (!(await confirmDialog('Delete this investment?'))) return;
    await finance.deleteInvestment(investment.id);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{investment ? 'Edit investment' : 'New investment'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" className="col-span-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nifty 50 SIP" />
          </Field>
          <Field label="Type">
            <Select value={type} onValueChange={(v) => setType((v as FinInvestment['type']) || 'sip')} items={INVESTMENT_TYPES}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVESTMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Linked account">
            <Select
              value={accountId || 'none'}
              onValueChange={(v) => setAccountId(!v || v === 'none' ? '' : v)}
              items={[{ value: 'none', label: '— none —' }, ...accounts.map((a) => ({ value: String(a.id), label: a.name }))]}
            >
              <SelectTrigger>
                <SelectValue placeholder="— none —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— none —</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Invested amount">
            <Input type="number" inputMode="decimal" value={invested} onChange={(e) => setInvested(e.target.value)} />
          </Field>
          <Field label="Current value">
            <Input type="number" inputMode="decimal" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Defaults to invested" />
          </Field>
          <Field label="Frequency">
            <Select value={frequency} onValueChange={(v) => setFrequency(v ?? 'monthly')}
              items={[{ value: 'monthly', label: 'Monthly' }, { value: 'quarterly', label: 'Quarterly' }, { value: 'yearly', label: 'Yearly' }, { value: 'lumpsum', label: 'Lumpsum' }]}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
                <SelectItem value="lumpsum">Lumpsum</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {recurring && (
            <Field label="Amount per cycle">
              <Input type="number" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="e.g. 5000" />
            </Field>
          )}
          {recurring && (
            <div className="col-span-2 rounded-xl border border-border divide-y divide-border">
              <CheckRow
                label="Automatically debit?"
                desc="Each cycle Sajni posts the contribution from the linked account and grows this investment — you'll get a notification."
                checked={autoDebit && !autoDebitBlocked}
                onChange={setAutoDebit}
                disabled={!!autoDebitBlocked}
                disabledReason={autoDebitBlocked ?? undefined}
              />
              {autoDebitOn && (
                <div className="flex flex-col gap-1.5 p-3">
                  <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Next debit date</Label>
                  <DatePicker value={nextDebitDate} onChange={setNextDebitDate} />
                  <p className="text-xs text-muted-foreground">
                    Leave blank to project it from the start date.
                  </p>
                </div>
              )}
            </div>
          )}
          <Field label="Start date">
            <DatePicker value={startDate} onChange={setStartDate} />
          </Field>
          <Field label="Maturity date">
            <DatePicker value={maturityDate} onChange={setMaturityDate} />
          </Field>
          <Field label="Expected return %">
            <Input type="number" inputMode="decimal" value={expectedReturn} onChange={(e) => setExpectedReturn(e.target.value)} placeholder="e.g. 12" />
          </Field>
          <Field label="Notes" className="col-span-2">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </Field>
        </div>
        <DialogFooter className="sm:justify-between">
          {investment ? (
            <Button variant="ghost" className="text-destructive" onClick={remove}>
              <Trash2 className="size-4 mr-1" /> Delete
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save}>{investment ? 'Save' : 'Create'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

// Labelled toggle row with an inline reason when disabled (same pattern as
// the billers dialog) so it's obvious WHY the option can't be picked yet.
function CheckRow({
  label, desc, checked, onChange, disabled, disabledReason,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <label className={'flex items-start gap-3 p-3 ' + (disabled ? 'opacity-55 cursor-not-allowed' : 'cursor-pointer')}>
      <Checkbox
        checked={checked}
        onCheckedChange={(c) => { if (!disabled) onChange(c === true); }}
        disabled={disabled}
        className="mt-0.5"
      />
      <div className="min-w-0">
        <div className="text-sm font-medium leading-none flex items-center gap-2 flex-wrap">
          {label}
          {disabled && disabledReason ? (
            <span className="text-xs font-mono uppercase tracking-wider text-[hsl(var(--tertiary))]">
              · {disabledReason}
            </span>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground mt-1">{desc}</div>
      </div>
    </label>
  );
}
