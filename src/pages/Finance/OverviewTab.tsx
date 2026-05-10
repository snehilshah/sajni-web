import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { TrendingUp, TrendingDown, Wallet, Camera, AlertCircle } from 'lucide-react';

import { finance, type FinAccount } from '@/api';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatMoney } from './utils';

interface OverviewData {
  net_worth: number;
  total_assets: number;
  total_liabilities: number;
  investments_total: number;
  month_income: number;
  month_expense: number;
  month_savings: number;
  month_recurring_invest: number;
  accounts: { account_id: number; name: string; type: string; balance: number; color: string }[];
  top_expense_categories: { id: number | null; name: string; color: string; amount: number }[];
  daily_trend: { date: string; income: number; expense: number }[];
  upcoming_dues: { id: number; account_name: string; due_date: string; amount_due: number; paid: boolean }[];
  investments_breakdown: { type: string; amount: number }[];
}

interface Snapshot {
  date: string;
  assets: number;
  liabilities: number;
  net_worth: number;
}

interface Props {
  accounts: FinAccount[];
}

export default function OverviewTab({ accounts }: Props) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [snapping, setSnapping] = useState(false);

  const load = () => {
    finance.overview().then(setData).catch(() => {});
    finance.networthHistory().then(setHistory).catch(() => {});
  };
  useEffect(() => { load(); }, [accounts]);

  if (!data) {
    return (
      <div className="grid gap-4">
        <div className="h-32 rounded-xl bg-muted/40 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="h-32 rounded-xl bg-muted/40 animate-pulse" />
          <div className="h-32 rounded-xl bg-muted/40 animate-pulse" />
          <div className="h-32 rounded-xl bg-muted/40 animate-pulse" />
        </div>
      </div>
    );
  }

  const takeSnapshot = async () => {
    setSnapping(true);
    try {
      await finance.takeSnapshot();
      load();
      toast.success('Net worth snapshot saved', {
        description: `${formatMoney(data.net_worth)} captured for ${format(new Date(), 'MMM d, yyyy')}.`,
      });
    } catch (e) {
      toast.error('Snapshot failed', {
        description: (e as Error)?.message || 'Try again in a moment.',
      });
    } finally {
      setSnapping(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Hero net worth */}
      <Hero data={data} history={history} onSnapshot={takeSnapshot} snapping={snapping} />

      {/* Month summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MonthCard label="Income" value={data.month_income} tone="primary" icon={TrendingUp} />
        <MonthCard label="Expense" value={data.month_expense} tone="destructive" icon={TrendingDown} />
        <MonthCard label="Saved" value={data.month_savings} tone={data.month_savings >= 0 ? 'primary' : 'destructive'} icon={Wallet} />
        <MonthCard label="Auto-invest" value={data.month_recurring_invest} tone="default" icon={TrendingUp} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Panel title="Asset distribution">
          <Distribution
            accounts={data.accounts}
            invested={data.investments_total}
          />
        </Panel>

        <Panel title="Top expenses · this month">
          {data.top_expense_categories.length === 0 ? (
            <Empty>No expenses recorded this month.</Empty>
          ) : (
            <div className="flex flex-col gap-2">
              {data.top_expense_categories.map((c) => {
                const max = data.top_expense_categories[0].amount || 1;
                const pct = (c.amount / max) * 100;
                return (
                  <div key={String(c.id)} className="flex items-center gap-2">
                    <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                    <span className="text-xs flex-1 truncate">{c.name}</span>
                    <div className="flex-1 max-w-[100px] h-1.5 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: pct + '%' }}
                        transition={{ duration: 0.4 }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                    </div>
                    <span className="font-mono text-[10px] tabular-nums w-16 text-right">{formatMoney(c.amount)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Income vs expense · 30 days" className="md:col-span-2">
          <TrendChart trend={data.daily_trend} />
        </Panel>

        <Panel title="Upcoming card dues">
          {data.upcoming_dues.length === 0 ? (
            <Empty>No unpaid statements.</Empty>
          ) : (
            <div className="flex flex-col gap-2">
              {data.upcoming_dues.map((d) => {
                const days = Math.round((new Date(d.due_date).getTime() - Date.now()) / 86400000);
                return (
                  <div key={d.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-border/40 last:border-0">
                    <div className="min-w-0">
                      <div className="text-sm truncate">{d.account_name}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        Due {format(parseISO(d.due_date), 'MMM d')} · {days < 0 ? `${-days}d overdue` : days === 0 ? 'today' : `${days}d`}
                      </div>
                    </div>
                    <div className={`font-mono text-sm tabular-nums ${days < 0 ? 'text-destructive' : 'text-foreground'}`}>
                      {formatMoney(d.amount_due)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Investments">
          {data.investments_breakdown.length === 0 ? (
            <Empty>No investments tracked yet.</Empty>
          ) : (
            <div className="flex flex-col gap-2">
              {data.investments_breakdown.map((i) => {
                const max = Math.max(...data.investments_breakdown.map((x) => x.amount), 1);
                const pct = (i.amount / max) * 100;
                return (
                  <div key={i.type} className="flex items-center gap-2">
                    <span className="text-xs flex-1 capitalize">{i.type.replace('_', ' ')}</span>
                    <div className="flex-1 max-w-[120px] h-1.5 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: pct + '%' }}
                        transition={{ duration: 0.4 }}
                        className="h-full rounded-full bg-primary"
                      />
                    </div>
                    <span className="font-mono text-[10px] tabular-nums w-16 text-right">{formatMoney(i.amount)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Hero({ data, history, onSnapshot, snapping }: {
  data: OverviewData;
  history: Snapshot[];
  onSnapshot: () => void;
  snapping: boolean;
}) {
  const previous = history.length > 1 ? history[history.length - 2] : null;
  const change = previous ? data.net_worth - previous.net_worth : 0;
  const changePct = previous && previous.net_worth !== 0 ? (change / Math.abs(previous.net_worth)) * 100 : 0;
  const positive = change >= 0;

  const lastSnap = history.length > 0 ? history[history.length - 1] : null;
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const snappedToday = lastSnap?.date === todayStr;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground p-5 md:p-6"
    >
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider opacity-80">Net worth</div>
          <div className="font-serif text-4xl md:text-5xl font-semibold tabular-nums mt-1">
            {formatMoney(data.net_worth)}
          </div>
          {previous ? (
            <div className="font-mono text-xs mt-2 inline-flex items-center gap-1 opacity-90">
              {positive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {positive ? '+' : ''}{formatMoney(change)} ({changePct.toFixed(1)}%) since last snapshot
            </div>
          ) : (
            <div className="font-mono text-[10px] mt-2 opacity-75">
              {lastSnap ? `Last snapshot ${format(parseISO(lastSnap.date), 'MMM d, yyyy')}` : 'No snapshots yet — take one to start the trend.'}
            </div>
          )}
        </div>
        <Tooltip>
          <TooltipTrigger render={
            <Button variant="secondary" size="sm" onClick={onSnapshot} disabled={snapping || snappedToday}>
              <Camera className="size-3.5 mr-1" />
              {snapping ? 'Saving…' : snappedToday ? 'Snapped today' : 'Snapshot'}
            </Button>
          } />
          <TooltipContent side="bottom" className="text-xs max-w-[220px] text-center">
            {snappedToday
              ? "Today's net-worth snapshot is already saved."
              : 'Save today’s net worth as a daily data point. Powers the trend chart over time.'}
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-5">
        <HeroStat label="Assets" value={formatMoney(data.total_assets)} />
        <HeroStat label="Liabilities" value={formatMoney(data.total_liabilities)} />
        <HeroStat label="Investments" value={formatMoney(data.investments_total)} className="col-span-2 md:col-span-1" />
      </div>

      {/* Mini sparkline */}
      {history.length > 1 && <Sparkline points={history.map((h) => h.net_worth)} />}
    </motion.div>
  );
}

function HeroStat({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={`bg-white/10 rounded-lg px-3 py-2 ${className}`}>
      <div className="font-mono text-[9px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="font-serif text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Sparkline({ points }: { points: number[] }) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const w = 100;
  const h = 30;
  const step = points.length > 1 ? w / (points.length - 1) : 0;
  const path = points.map((p, i) => {
    const x = i * step;
    const y = h - ((p - min) / range) * h;
    return (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2);
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10 mt-4 opacity-70" preserveAspectRatio="none">
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.2} />
    </svg>
  );
}

function MonthCard({ label, value, tone, icon: Icon }: {
  label: string; value: number;
  tone: 'primary' | 'destructive' | 'default';
  icon: typeof TrendingUp;
}) {
  const tones: Record<string, string> = {
    primary: 'text-primary',
    destructive: 'text-destructive',
    default: 'text-foreground',
  };
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
        <Icon className="size-3" />
        {label}
      </div>
      <div className={`font-serif text-lg md:text-xl font-semibold tabular-nums mt-0.5 ${tones[tone]}`}>
        {formatMoney(value)}
      </div>
    </div>
  );
}

function Distribution({ accounts, invested }: { accounts: OverviewData['accounts']; invested: number }) {
  const items = useMemo(() => {
    const pos = accounts.filter((a) => a.balance > 0);
    const list = pos.map((a) => ({ key: 'a' + a.account_id, name: a.name, color: a.color, amount: a.balance }));
    if (invested > 0) list.push({ key: 'inv', name: 'Investments', color: '#4F6FA1', amount: invested });
    return list.sort((a, b) => b.amount - a.amount);
  }, [accounts, invested]);

  const total = items.reduce((s, i) => s + i.amount, 0);

  if (total === 0) {
    return <div className="text-sm text-muted-foreground py-4 text-center">No assets yet.</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Stacked bar */}
      <div className="h-2.5 rounded-full overflow-hidden flex bg-muted">
        {items.map((i) => (
          <motion.div
            key={i.key}
            initial={{ width: 0 }}
            animate={{ width: `${(i.amount / total) * 100}%` }}
            transition={{ duration: 0.5 }}
            style={{ backgroundColor: i.color }}
            className="h-full"
            title={i.name}
          />
        ))}
      </div>
      <div className="flex flex-col gap-1.5 mt-1">
        {items.map((i) => (
          <div key={i.key} className="flex items-center gap-2">
            <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: i.color }} />
            <span className="text-xs flex-1 truncate">{i.name}</span>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {((i.amount / total) * 100).toFixed(0)}%
            </span>
            <span className="font-mono text-[10px] tabular-nums w-20 text-right">{formatMoney(i.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendChart({ trend }: { trend: OverviewData['daily_trend'] }) {
  if (trend.length === 0) {
    return <div className="text-sm text-muted-foreground py-6 text-center">No activity in the last 30 days.</div>;
  }
  const max = Math.max(...trend.flatMap((d) => [d.income, d.expense]), 1);
  return (
    <div className="flex items-end gap-0.5 h-32 pt-2">
      {trend.map((d, i) => {
        const incomeH = (d.income / max) * 100;
        const expenseH = (d.expense / max) * 100;
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5 group" title={`${d.date}: +${formatMoney(d.income)} / −${formatMoney(d.expense)}`}>
            <div className="w-full flex items-end justify-center gap-0.5" style={{ height: '110px' }}>
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: incomeH + '%' }}
                transition={{ duration: 0.4, delay: i * 0.01 }}
                className="w-1/2 bg-primary/70 rounded-t-sm"
              />
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: expenseH + '%' }}
                transition={{ duration: 0.4, delay: i * 0.01 }}
                className="w-1/2 bg-destructive/70 rounded-t-sm"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Panel({ title, subtitle, children, className = '' }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`rounded-xl border border-border bg-card p-4 md:p-5 ${className}`}
    >
      <header className="flex items-baseline justify-between gap-2 mb-3">
        <h2 className="font-serif text-base font-semibold">{title}</h2>
        {subtitle && <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{subtitle}</span>}
      </header>
      {children}
    </motion.section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm text-muted-foreground py-4 text-center inline-flex items-center justify-center gap-1.5 w-full">
      <AlertCircle className="size-3.5" />
      {children}
    </div>
  );
}
