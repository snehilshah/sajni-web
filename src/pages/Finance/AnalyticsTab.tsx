import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { addMonths, format, parse } from 'date-fns';
import { ChevronLeft, ChevronRight } from '@/components/ui/icons';

import type { FinAnalytics, FinAnalyticsTxn } from '@/api';
import { useFinAnalytics } from '@/queries/finance';
import { Button } from '@/components/ui/button';
import { DateBadge } from '@/components/ui/state-chip';
import { hueVar } from '@/components/ui/hue-pill';
import { cn } from '@/lib/utils';
import { AnimatedMoney } from './AnimatedMoney';
import { Money } from './Money';
import { Stat, StatGroup } from './StatGroup';
import { useFinanceFormatters } from './useFinancePrivacy';
import { sumMoney } from './utils';
import { ShareBar } from './ShareBar';

// Finance → Analytics: one month at a time. What was spent against usual,
// how the month built up, what drove it, what stood out, where it went, and
// how saving is going. Figures come from the API's finstats so the AI says
// the same thing.

const monthLabel = (m: string) => format(parse(m, 'yyyy-MM', new Date()), 'MMMM yyyy');
const dayLabel = (m: string, day: number) => format(parse(`${m}-${String(day).padStart(2, '0')}`, 'yyyy-MM-dd', new Date()), 'd MMM');

export default function AnalyticsTab({ enabled }: { enabled: boolean }) {
  // '' is "this month", so the default view stays live across midnight.
  const [month, setMonth] = useState('');
  const q = useFinAnalytics(month, enabled);
  const data = q.data;
  const shown = data?.month ?? month;
  const step = (n: number) => {
    if (!shown) return;
    const next = format(addMonths(parse(shown, 'yyyy-MM', new Date()), n), 'yyyy-MM');
    setMonth(next === format(new Date(), 'yyyy-MM') ? '' : next);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-xl font-semibold">{shown ? monthLabel(shown) : ' '}</h2>
        <div className="-mr-2 flex items-center">
          <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => step(-1)} disabled={!data}>
            <ChevronLeft className="size-5" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => step(1)} disabled={!data || data.current}>
            <ChevronRight className="size-5" />
          </Button>
        </div>
      </div>
      {!data ? <Loading /> : <Report data={data} />}
    </div>
  );
}

function Loading() {
  return (
    <div className="grid gap-4">
      <div className="h-24 rounded-xl bg-muted/40 animate-pulse" />
      <div className="h-56 rounded-xl bg-muted/40 animate-pulse" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-40 rounded-xl bg-muted/40 animate-pulse" />
        <div className="h-40 rounded-xl bg-muted/40 animate-pulse" />
      </div>
    </div>
  );
}

function Report({ data }: { data: FinAnalytics }) {
  const { formatPercent } = useFinanceFormatters();
  const drivers = data.base_months > 0
    ? data.categories.filter((c) => (c.change ?? 0) > 0.5).sort((a, b) => (b.change ?? 0) - (a.change ?? 0)).slice(0, 5)
    : [];
  const spentCats = data.categories.filter((c) => c.spent > 0);

  return (
    <>
      <div className="flex flex-col gap-2">
        <StatGroup className="grid-cols-2 md:grid-cols-4">
          <Stat label="Spent" value={<AnimatedMoney value={data.spent} />} tone="primary" />
          <Stat label="Income" value={<AnimatedMoney value={data.income} />} />
          <Stat label="Saved" value={<AnimatedMoney value={data.saved} />} tone={data.saved < 0 ? 'destructive' : 'default'} />
          <Stat label="Savings rate" value={data.rate === null ? '—' : formatPercent(data.rate)} tone={(data.rate ?? 0) < 0 ? 'destructive' : 'default'} />
          <Stat label="Daily average" value={<AnimatedMoney value={data.daily_avg} />} />
          {data.projected !== null && <Stat label="Month end, at this pace" value={<AnimatedMoney value={data.projected} />} />}
          {data.base_months > 0 && data.usual !== null && <Stat label={`Usual by the ${ordinal(data.day)}`} value={<AnimatedMoney value={data.usual} />} />}
          {data.slate_spent > 0 && <Stat label="In slates" value={<AnimatedMoney value={data.slate_spent} />} />}
        </StatGroup>
        {data.vs_usual !== null && Math.abs(data.vs_usual) >= 0.5 && (
          <div className="flex flex-wrap gap-1.5">
            <DateBadge tone={data.vs_usual > 0 ? 'alert' : 'positive'}>
              <Money value={Math.abs(data.vs_usual)} /> {data.vs_usual > 0 ? 'more' : 'less'} than usual by the {ordinal(data.day)}
            </DateBadge>
            {data.slate_spent > 0 && <DateBadge>Slates left out of the comparison</DateBadge>}
          </div>
        )}
      </div>

      <Section title="How the month built up">
        <PaceChart data={data} />
      </Section>

      {drivers.length > 0 && (
        <Section title="Why it's higher">
          <Rows>
            {drivers.map((c) => (
              <Row key={String(c.id) + c.name}
                tile={<Tile name={c.name} color={c.color} />}
                title={c.name}
                meta={<>usually <Money value={c.usual ?? 0} /> by the {ordinal(data.day)}</>}
                figure={<span className="text-[hsl(var(--error))]">+<Money value={c.change ?? 0} /></span>}
              />
            ))}
          </Rows>
        </Section>
      )}

      {data.unusual.length > 0 && (
        <Section title="Stood out">
          <Rows>{data.unusual.map((t) => <TxnRow key={t.id} t={t} month={data.month} meta={t.reason} />)}</Rows>
        </Section>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {data.daily.some((d) => d.spent > 0) && (
          <Section title="Day by day">
            <DailyChart data={data} />
          </Section>
        )}
        {data.largest.length > 0 && (
          <Section title="Largest">
            <Rows>{data.largest.map((t) => <TxnRow key={t.id} t={t} month={data.month} />)}</Rows>
          </Section>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {spentCats.length > 0 && (
          <Section title="Categories">
            <CategoryBars cats={spentCats} />
          </Section>
        )}
        {data.merchants.length > 0 && (
          <Section title="Where">
            <Rows>
              {data.merchants.map((m) => (
                <Row key={m.name} tile={<Tile name={m.name} />} title={m.name}
                  meta={m.count > 1 ? <>{m.count}× · avg <Money value={m.avg} /></> : undefined}
                  figure={<Money value={m.spent} />}
                />
              ))}
            </Rows>
          </Section>
        )}
      </div>

      {data.trend.length > 1 && (
        <Section title="Saving, month by month">
          <SavingsChart data={data} />
        </Section>
      )}
    </>
  );
}

function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return n + s;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h3 className="font-serif text-base font-semibold">{title}</h3>
      {children}
    </section>
  );
}

// One row grid for every list card: [tile] [title over meta] [amount]. The
// columns are shared by the whole card (subgrid), so amounts form one
// right-aligned column on the title line, whatever their width.
function Rows({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] rounded-xl bg-card px-4 py-1">{children}</div>;
}

function Row({ tile, title, meta, figure }: { tile: ReactNode; title: ReactNode; meta?: ReactNode; figure: ReactNode }) {
  return (
    <div className={cn(
      'col-span-full grid grid-cols-subgrid gap-x-3 py-3 [&+&]:border-t [&+&]:border-[hsl(var(--outline-variant)/0.5)]',
      meta ? 'items-start' : 'items-center',
    )}>
      {tile}
      <div className="flex min-w-0 flex-col gap-0.5 pt-px">
        <div className="truncate text-sm font-medium leading-5">{title}</div>
        {meta && <div className="truncate text-xs leading-4 text-muted-foreground">{meta}</div>}
      </div>
      <div className="whitespace-nowrap pt-px text-right text-sm leading-5 tabular-nums">{figure}</div>
    </div>
  );
}

/** A row's leading tile: the first letter on a tint of the category's colour
 *  (neutral when there's none), so the colour needs no pill in the text. */
function Tile({ name, color }: { name: string; color?: string | null }) {
  return (
    <span style={hueVar(color || 'hsl(var(--outline))')} aria-hidden
      className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[color-mix(in_oklab,var(--hue)_18%,transparent)] text-[13px] font-semibold text-[color-mix(in_oklab,var(--hue)_70%,hsl(var(--on-surface)))]">
      {name.trim().charAt(0).toUpperCase() || '·'}
    </span>
  );
}

function TxnRow({ t, month, meta }: { t: FinAnalyticsTxn; month: string; meta?: string }) {
  const day = Number(t.date.slice(8, 10));
  return (
    <Row
      tile={<Tile name={t.category} color={t.color} />}
      title={t.title}
      meta={<>{t.category} · {dayLabel(month, day)}{t.slate ? ' · ' + t.slate : ''}{meta ? ' · ' + meta : ''}</>}
      figure={<Money value={t.amount} />}
    />
  );
}

// ── Charts ─────────────────────────────────────────────────────────────────
// Hand-drawn SVG on the page (no surface), drawn at the measured pixel width
// so strokes and text never scale with the screen. A readout above each chart
// shows the hovered (else latest) point in a reserved line, so nothing shifts
// while the pointer moves.

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** The chart's box: fixed height, its SVG only once the width is known. */
function ChartBox({ height, label, children, onPick, onLeave }: {
  height: number; label: string;
  children: (w: number) => ReactNode;
  onPick: (x: number, w: number) => void;
  onLeave: () => void;
}) {
  const [ref, w] = useWidth();
  return (
    <div ref={ref} style={{ height }} className="w-full">
      {w > 0 && (
        <svg width={w} height={height} className="block touch-pan-y select-none" role="img" aria-label={label}
          onPointerMove={(e) => onPick(e.clientX - e.currentTarget.getBoundingClientRect().left, w)}
          onPointerDown={(e) => onPick(e.clientX - e.currentTarget.getBoundingClientRect().left, w)}
          onPointerLeave={onLeave}>
          {children(w)}
        </svg>
      )}
    </div>
  );
}

function AxisLabels({ labels }: { labels: string[] }) {
  return (
    <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
      {labels.map((l, i) => <span key={i}>{l}</span>)}
    </div>
  );
}

function Legend({ items }: { items: { label: string; value: ReactNode; className: string; dashed?: boolean }[] }) {
  return (
    <div className="flex min-h-5 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span className={cn('inline-block h-0.5 w-4 rounded-full', it.className, it.dashed && 'opacity-70')} />
          {it.label} <span className="text-foreground">{it.value}</span>
        </span>
      ))}
    </div>
  );
}

function PaceChart({ data }: { data: FinAnalytics }) {
  const [hover, setHover] = useState<number | null>(null);
  const H = 180, padT = 8, padB = 2;
  const innerH = H - padT - padB;
  const pts = data.cumulative;
  const n = pts.length;
  const max = Math.max(1, ...pts.map((p) => Math.max(p.this ?? 0, p.last, p.usual ?? 0)));
  const at = hover ?? Math.min(data.day, n) - 1;
  const p = pts[at];
  const hasLast = pts.some((q) => q.last > 0);
  const x = (i: number, w: number) => 2 + (n > 1 ? (i / (n - 1)) * (w - 4) : 0);
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const path = (vals: (number | null)[], w: number) => {
    let d = '';
    vals.forEach((v, i) => { if (v !== null) d += (d ? 'L' : 'M') + x(i, w).toFixed(1) + ',' + y(v).toFixed(1); });
    return d;
  };
  return (
    <div className="flex flex-col gap-2">
      <Legend items={[
        { label: p ? dayLabel(data.month, p.day) : '', value: p && p.this !== null ? <Money value={p.this} /> : '—', className: 'bg-[hsl(var(--primary))]' },
        ...(data.base_months > 0 ? [{ label: 'Usual', value: <Money value={p?.usual ?? 0} />, className: 'bg-[hsl(var(--tertiary))]' }] : []),
        ...(hasLast ? [{ label: 'Last month', value: <Money value={p?.last ?? 0} />, className: 'bg-[hsl(var(--on-surface-variant))]', dashed: true }] : []),
      ]} />
      <ChartBox height={H} label="Running total of spending through the month"
        onPick={(px, w) => setHover(Math.max(0, Math.min(n - 1, Math.round(((px - 2) / (w - 4)) * (n - 1)))))}
        onLeave={() => setHover(null)}>
        {(w) => (
          <>
            <line x1={0} x2={w} y1={padT + innerH} y2={padT + innerH} stroke="hsl(var(--outline-variant))" strokeWidth={1} />
            {hasLast && <path d={path(pts.map((q) => q.last), w)} fill="none" stroke="hsl(var(--on-surface-variant))" strokeOpacity={0.6} strokeWidth={1.5} strokeDasharray="4 4" />}
            {data.base_months > 0 && <path d={path(pts.map((q) => q.usual), w)} fill="none" stroke="hsl(var(--tertiary))" strokeWidth={2} />}
            <path d={path(pts.map((q) => q.this), w)} fill="none" stroke="hsl(var(--primary))" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            {p && <line x1={x(at, w)} x2={x(at, w)} y1={padT} y2={padT + innerH} stroke="hsl(var(--outline))" strokeWidth={1} />}
            {p && p.this !== null && <circle cx={x(at, w)} cy={y(p.this)} r={4} fill="hsl(var(--primary))" />}
          </>
        )}
      </ChartBox>
      <AxisLabels labels={[dayLabel(data.month, 1), dayLabel(data.month, Math.ceil(n / 2)), dayLabel(data.month, n)]} />
    </div>
  );
}

function DailyChart({ data }: { data: FinAnalytics }) {
  const [hover, setHover] = useState<number | null>(null);
  const days = data.daily;
  const H = 120;
  const slots = data.days_in_month;
  const max = Math.max(1, ...days.map((d) => d.spent));
  // The three biggest days carry full ink; the rest stay soft.
  const top = useMemo(() => new Set([...days].sort((a, b) => b.spent - a.spent).slice(0, 3).filter((d) => d.spent > 0).map((d) => d.day)), [days]);
  // Until pointed at, the readout shows the biggest day.
  const peak = days.reduce((b, d, i) => (d.spent > days[b].spent ? i : b), 0);
  const at = hover ?? peak;
  const p = days[at];
  return (
    <div className="flex flex-col gap-2">
      <Legend items={[{ label: p ? dayLabel(data.month, p.day) : '', value: p ? <Money value={p.spent} /> : '—', className: 'bg-[hsl(var(--primary))]' }]} />
      <ChartBox height={H} label="Spending per day"
        onPick={(px, w) => setHover(Math.max(0, Math.min(days.length - 1, Math.floor(px / (w / slots)))))}
        onLeave={() => setHover(null)}>
        {(w) => {
          const slot = w / slots;
          const bw = Math.max(2, slot * 0.66);
          return (
            <>
              {days.map((d, i) => {
                const h = Math.max(d.spent > 0 ? 2 : 0, (Math.max(0, d.spent) / max) * (H - 2));
                return (
                  <rect key={d.day} x={i * slot + (slot - bw) / 2} y={H - 1 - h} width={bw} height={h} rx={Math.min(3, bw / 2)}
                    fill="hsl(var(--primary))" fillOpacity={i === hover ? 1 : top.has(d.day) ? 0.9 : 0.35} />
                );
              })}
              <line x1={0} x2={w} y1={H - 0.5} y2={H - 0.5} stroke="hsl(var(--outline-variant))" strokeWidth={1} />
            </>
          );
        }}
      </ChartBox>
      <AxisLabels labels={[dayLabel(data.month, 1), dayLabel(data.month, data.days_in_month)]} />
    </div>
  );
}

// The month's split as one stacked bar, then the same row grid as the other
// cards: [tile] [name over its bar] [amount over its share]. Every bar spans
// the same column and shows the share of the month, not of the biggest.
function CategoryBars({ cats }: { cats: FinAnalytics['categories'] }) {
  const { formatPercent } = useFinanceFormatters();
  const total = sumMoney(cats, (c) => c.spent) || 1;
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-card px-4 pb-1 pt-4">
      <ShareBar parts={cats.map((c) => ({ key: String(c.id) + c.name, label: c.name, value: c.spent, color: c.color }))} />
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto]">
        {cats.map((c) => (
          <div key={String(c.id) + c.name} title={`${c.count} payment${c.count === 1 ? '' : 's'}`}
            className="col-span-full grid grid-cols-subgrid items-center gap-x-3 py-3 [&+&]:border-t [&+&]:border-[hsl(var(--outline-variant)/0.5)]">
            <Tile name={c.name} color={c.color} />
            <div className="flex min-w-0 flex-col gap-2">
              <span className="truncate text-sm font-medium leading-5">{c.name}</span>
              <div className="h-1.5 overflow-hidden rounded-full bg-[hsl(var(--surface-container-highest))]">
                <div className="h-full rounded-full" style={{ width: `${(c.spent / total) * 100}%`, backgroundColor: c.color || 'hsl(var(--outline))' }} />
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="whitespace-nowrap text-sm leading-5 tabular-nums"><Money value={c.spent} /></span>
              <span className="text-xs leading-4 text-muted-foreground tabular-nums">{formatPercent(c.share)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SavingsChart({ data }: { data: FinAnalytics }) {
  const { formatPercent } = useFinanceFormatters();
  const [hover, setHover] = useState<number | null>(null);
  const months = data.trend;
  const H = 150;
  const max = Math.max(1, ...months.map((m) => Math.max(m.income, m.spent)));
  const at = hover ?? months.length - 1;
  const p = months[at];
  const label = (m: string) => format(parse(m, 'yyyy-MM', new Date()), 'MMM');
  return (
    <div className="flex flex-col gap-2">
      <Legend items={p ? [
        { label: format(parse(p.month, 'yyyy-MM', new Date()), 'MMM yyyy') + ' · income', value: <Money value={p.income} />, className: 'bg-[hsl(var(--secondary))]' },
        { label: 'Spent', value: <Money value={p.spent} />, className: 'bg-[hsl(var(--primary))]' },
        { label: 'Saved', value: <><Money value={p.saved} />{p.rate !== null ? ` · ${formatPercent(p.rate)}` : ''}</>, className: 'bg-transparent' },
      ] : []} />
      <ChartBox height={H} label="Income and spending by month"
        onPick={(px, w) => setHover(Math.max(0, Math.min(months.length - 1, Math.floor(px / (w / months.length)))))}
        onLeave={() => setHover(null)}>
        {(w) => {
          const slot = w / months.length;
          const bw = Math.min(18, slot * 0.3);
          return (
            <>
              {months.map((m, i) => {
                const cx = i * slot + slot / 2;
                const hi = (m.income / max) * (H - 2);
                const hs = (Math.max(0, m.spent) / max) * (H - 2);
                const dim = i === at ? 1 : 0.55;
                return (
                  <g key={m.month}>
                    <rect x={cx - bw - 1} y={H - 1 - hi} width={bw} height={hi} rx={3} fill="hsl(var(--secondary))" fillOpacity={dim} />
                    <rect x={cx + 1} y={H - 1 - hs} width={bw} height={hs} rx={3} fill="hsl(var(--primary))" fillOpacity={dim} />
                  </g>
                );
              })}
              <line x1={0} x2={w} y1={H - 0.5} y2={H - 0.5} stroke="hsl(var(--outline-variant))" strokeWidth={1} />
            </>
          );
        }}
      </ChartBox>
      <div className="flex text-xs text-muted-foreground">
        {months.map((m) => <span key={m.month} className="flex-1 text-center">{label(m.month)}</span>)}
      </div>
    </div>
  );
}
