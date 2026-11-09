import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { TrendingUp, TrendingDown, Camera, ChevronRight } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

import { finance } from '@/api';
import { useFinNetworthHistory, useFinOverview } from '@/queries/finance';
import { qk } from '@/queries/keys';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AnimatedMoney } from './AnimatedMoney';
import { useFinanceFormatters } from './useFinancePrivacy';
import { sumMoney } from './utils';
import { Money } from './Money';
import { ShareBar } from './ShareBar';

type OverviewData = Awaited<ReturnType<typeof finance.overview>>;
type Snapshot = Awaited<ReturnType<typeof finance.networthHistory>>[number];

/** Net worth (accounts, investments and money lent, less what's owed) and
 *  what it's made of. Leads the Accounts tab. */
export default function NetWorth({ enabled }: { enabled: boolean }) {
  const { formatMoney } = useFinanceFormatters();
  const qc = useQueryClient();
  const { data = null } = useFinOverview(enabled);
  const { data: history = [] } = useFinNetworthHistory(enabled);
  const [snapping, setSnapping] = useState(false);

  if (!data) return <div className="h-48 rounded-xl bg-muted/40 animate-pulse" />;

  const takeSnapshot = async () => {
    setSnapping(true);
    try {
      await finance.takeSnapshot();
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.finance.overview() }),
        qc.invalidateQueries({ queryKey: qk.finance.networthHistory() }),
      ]);
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Hero data={data} history={history} onSnapshot={takeSnapshot} snapping={snapping} />
      <section className="rounded-xl bg-card p-4 md:p-5">
        <h2 className="mb-3 font-serif text-base font-semibold">Asset distribution</h2>
        <Distribution accounts={data.accounts} investments={data.investment_assets ?? []} lends={data.lends_breakdown ?? []} />
      </section>
    </div>
  );
}

function Hero({ data, history, onSnapshot, snapping }: {
  data: OverviewData;
  history: Snapshot[];
  onSnapshot: () => void;
  snapping: boolean;
}) {
  const { formatPercent } = useFinanceFormatters();
  const previous = history.length > 1 ? history[history.length - 2] : null;
  const change = previous ? data.net_worth - previous.net_worth : 0;
  const changePct = previous && previous.net_worth !== 0 ? (change / Math.abs(previous.net_worth)) * 100 : 0;
  const positive = change >= 0;

  const lastSnap = history.length > 0 ? history[history.length - 1] : null;
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const snappedToday = lastSnap?.date === todayStr;

  return (
    <motion.div
      initial={{ opacity: 0, transform: 'translateY(6px)' }}
      animate={{ opacity: 1, transform: 'translateY(0)' }}
      className="rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground p-5 md:p-6"
    >
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="font-mono text-xs label-kicker opacity-80">Net worth</div>
          <div className="font-serif text-4xl md:text-5xl font-semibold tabular-nums mt-1">
            <AnimatedMoney value={data.net_worth} />
          </div>
          {previous ? (
            <div className="font-mono text-xs mt-2 inline-flex items-center gap-1 opacity-90">
              {positive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {positive ? '+' : ''}<Money value={change} /> ({formatPercent(changePct, 1)}) since last snapshot
            </div>
          ) : (
            <div className="font-mono text-xs mt-2 opacity-75">
              {lastSnap ? `Last snapshot ${format(parseISO(lastSnap.date), 'MMM d, yyyy')}` : 'No snapshots yet. Take one to start the trend.'}
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 mt-6">
        <HeroStat label="Assets" value={data.total_assets} />
        <HeroStat label="Liabilities" value={data.total_liabilities} />
        <HeroStat label="Investments" value={data.investments_total} />
        <HeroStat label="Money lent" value={data.money_lent_total} />
      </div>

      {/* Mini sparkline */}
      {history.length > 1 && <Sparkline points={history.map((h) => h.net_worth)} />}
    </motion.div>
  );
}

function HeroStat({ label, value, className = '' }: { label: string; value: number; className?: string }) {
  return (
    // Plain column in the hero — space separates, no card inside the card.
    <div className={className}>
      <div className="text-xs opacity-75">{label}</div>
      <div className="font-serif text-lg font-semibold tabular-nums"><AnimatedMoney value={value} /></div>
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

type Group = { key: string; label: string; color: string; amount: number; members: { name: string; amount: number }[] };

/** What the assets are made of, in three groups (bank and cash,
 *  investments, money lent per person), not one row per account. Tap a
 *  group to see what's in it. */
function Distribution({ accounts, investments, lends }: {
  accounts: OverviewData['accounts'];
  investments: NonNullable<OverviewData['investment_assets']>;
  lends: NonNullable<OverviewData['lends_breakdown']>;
}) {
  const { formatPercent, formatMoney } = useFinanceFormatters();
  const [open, setOpen] = useState<string | null>(null);
  const groups = useMemo(() => {
    const byAmount = (a: { amount: number }, b: { amount: number }) => b.amount - a.amount;
    const bank = accounts.filter((a) => a.balance > 0 && a.type !== 'investment').map((a) => ({ name: a.name, amount: a.balance }));
    const invested = [
      ...accounts.filter((a) => a.balance > 0 && a.type === 'investment').map((a) => ({ name: a.name, amount: a.balance })),
      ...investments.filter((i) => i.amount > 0).map((i) => ({ name: i.name, amount: i.amount })),
    ];
    // One line per person, not per lend.
    const people = new Map<string, { name: string; amount: number }>();
    for (const l of lends) {
      if (l.outstanding <= 0) continue;
      const k = l.borrower.trim().toLowerCase();
      const p = people.get(k);
      if (p) p.amount = sumMoney([p.amount, l.outstanding], (v) => v);
      else people.set(k, { name: l.borrower.trim(), amount: l.outstanding });
    }
    const list: Group[] = [
      { key: 'bank', label: 'Bank and cash', color: 'hsl(var(--chart-1))', members: bank.sort(byAmount), amount: sumMoney(bank, (m) => m.amount) },
      { key: 'invested', label: 'Investments', color: 'hsl(var(--chart-3))', members: invested.sort(byAmount), amount: sumMoney(invested, (m) => m.amount) },
      { key: 'lent', label: 'Lent', color: 'hsl(var(--chart-2))', members: [...people.values()].sort(byAmount), amount: sumMoney([...people.values()], (m) => m.amount) },
    ];
    return list.filter((g) => g.amount > 0).sort(byAmount);
  }, [accounts, investments, lends]);

  const total = sumMoney(groups, (g) => g.amount);
  if (total === 0) {
    return <div className="py-4 text-sm text-muted-foreground">No assets yet.</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      <ShareBar parts={groups.map((g) => ({ key: g.key, label: g.label, value: g.amount, color: g.color }))} />
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3">
        {groups.map((g) => {
          const expanded = open === g.key;
          const summary = g.key === 'lent'
            ? g.members.map((m) => `${m.name} ${formatMoney(m.amount)}`).join(' · ')
            : g.members.map((m) => m.name).join(' · ');
          return (
            <div key={g.key} className="col-span-full grid grid-cols-subgrid [&+&]:border-t [&+&]:border-[hsl(var(--outline-variant)/0.5)]">
              <button type="button" onClick={() => setOpen(expanded ? null : g.key)} aria-expanded={expanded}
                className="col-span-full grid grid-cols-subgrid items-start py-3 text-left">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-2 text-sm font-medium leading-5">
                    <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: g.color }} />
                    {g.label}
                    <ChevronRight className={cn('size-3.5 text-muted-foreground transition-transform', expanded && 'rotate-90')} />
                  </span>
                  {!expanded && <span className="truncate pl-[18px] text-xs leading-4 text-muted-foreground">{summary}</span>}
                </span>
                <span className="pt-px text-right text-xs leading-5 text-muted-foreground tabular-nums">{formatPercent((g.amount / total) * 100)}</span>
                <span className="whitespace-nowrap pt-px text-right text-sm leading-5 tabular-nums"><Money value={g.amount} /></span>
              </button>
              {expanded && g.members.map((m) => (
                <div key={m.name} className="col-span-full grid grid-cols-subgrid pb-2 text-xs text-muted-foreground">
                  <span className="truncate pl-[18px]">{m.name}</span>
                  <span className="text-right tabular-nums">{formatPercent((m.amount / total) * 100)}</span>
                  <span className="whitespace-nowrap text-right tabular-nums"><Money value={m.amount} /></span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
