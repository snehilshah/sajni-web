import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { TrendingUp, TrendingDown, Camera } from '@/components/ui/icons';

import { finance } from '@/api';
import { useFinNetworthHistory, useFinOverview } from '@/queries/finance';
import { qk } from '@/queries/keys';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AnimatedMoney } from './AnimatedMoney';
import { useFinanceFormatters } from './useFinancePrivacy';
import { sumMoney } from './utils';
import { Money } from './Money';

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

function Distribution({ accounts, investments, lends }: {
  accounts: OverviewData['accounts'];
  investments: NonNullable<OverviewData['investment_assets']>;
  lends: NonNullable<OverviewData['lends_breakdown']>;
}) {
  const { formatPercent } = useFinanceFormatters();
  const items = useMemo(() => {
    const pos = accounts.filter((a) => a.balance > 0);
    const list = pos.map((a) => ({ key: 'a' + a.account_id, name: a.name, color: a.color, amount: a.balance }));
    const investmentColors = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))'];
    investments.forEach((investment, index) => {
      if (investment.amount > 0) {
        list.push({
          key: 'i' + investment.id,
          name: investment.name,
          color: investmentColors[index % investmentColors.length],
          amount: investment.amount,
        });
      }
    });
    lends.forEach((lend, index) => {
      if (lend.outstanding > 0) {
        list.push({
          key: 'l' + lend.id,
          name: `Lent · ${lend.borrower}`,
          color: investmentColors[(investments.length + index) % investmentColors.length],
          amount: lend.outstanding,
        });
      }
    });
    return list.sort((a, b) => b.amount - a.amount);
  }, [accounts, investments, lends]);

  const total = sumMoney(items, (i) => i.amount);

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
            initial={{ transform: 'scaleX(0)' }}
            animate={{ transform: 'scaleX(1)' }}
            transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
            style={{ width: `${(i.amount / total) * 100}%`, backgroundColor: i.color, transformOrigin: 'left center' }}
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
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {formatPercent((i.amount / total) * 100)}
            </span>
            <span className="font-mono text-xs tabular-nums w-20 text-right"><Money value={i.amount} /></span>
          </div>
        ))}
      </div>
    </div>
  );
}

