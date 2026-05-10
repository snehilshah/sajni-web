import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

import { analytics as analyticsApi } from '@/api';
import type { Analytics } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Flame, Film, BookOpen, Tv, TrendingUp, Hash, CalendarDays, Sparkles } from 'lucide-react';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);

  useEffect(() => {
    analyticsApi.get().then(setData);
  }, []);

  const heatmap = useMemo(() => {
    if (!data) return null;
    const map = new Map(data.activity_heatmap.map((d) => [d.date, d.count]));
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 364);
    start.setDate(start.getDate() - start.getDay()); // align to Sunday

    const weeks: { date: string; count: number; month: number }[][] = [];
    let week: { date: string; count: number; month: number }[] = [];
    const cur = new Date(start);

    while (cur <= today) {
      const dateStr = cur.toISOString().split('T')[0];
      week.push({ date: dateStr, count: map.get(dateStr) || 0, month: cur.getMonth() });
      if (week.length === 7) { weeks.push(week); week = []; }
      cur.setDate(cur.getDate() + 1);
    }
    if (week.length > 0) {
      while (week.length < 7) week.push({ date: '', count: 0, month: -1 });
      weeks.push(week);
    }

    // Compute month label positions: first week of the year for each month
    const monthLabels: { weekIndex: number; month: number }[] = [];
    let lastMonth = -1;
    weeks.forEach((w, i) => {
      const firstReal = w.find((d) => d.month >= 0);
      if (firstReal && firstReal.month !== lastMonth) {
        monthLabels.push({ weekIndex: i, month: firstReal.month });
        lastMonth = firstReal.month;
      }
    });

    const total = data.activity_heatmap.reduce((s, d) => s + d.count, 0);
    const activeDays = data.activity_heatmap.filter((d) => d.count > 0).length;

    return { weeks, monthLabels, total, activeDays };
  }, [data]);

  if (!data || !heatmap) {
    return (
      <div className="flex flex-col h-full page-fade-in">
        <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-10">
          <div className="max-w-6xl mx-auto pl-14 md:pl-8 pr-4 md:pr-8 py-4">
            <h1 className="font-serif font-semibold tracking-tight text-3xl md:text-4xl">Analytics</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Patterns from your second brain.</p>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 grid gap-4">
            <Skeleton className="h-44 w-full rounded-xl" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-44 w-full rounded-xl" />)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const maxModuleVal = Math.max(...Object.values(data.module_breakdown), 1);
  const maxVelocity = Math.max(...data.task_velocity.map((v) => v.completed), 1);
  const maxTagCount = Math.max(...data.top_tags.map((t) => t.count), 1);
  const journalPct = data.journal_consistency.percentage;

  const moduleEntries = Object.entries(data.module_breakdown).sort((a, b) => b[1] - a[1]);

  const heatLevel = (count: number) => {
    if (count === 0) return '';
    if (count <= 2) return 'l1';
    if (count <= 5) return 'l2';
    if (count <= 10) return 'l3';
    return 'l4';
  };

  const moduleColors: Record<string, string> = {
    memo: '#7C9A92',
    note: '#2D5A4F',
    journal: '#C49A6C',
    task: '#A14B4F',
    habit: '#4F6FA1',
    media: '#8B6FA1',
  };

  return (
    <div className="flex flex-col h-full page-fade-in">
      <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto pl-14 md:pl-8 pr-4 md:pr-8 py-4 flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-serif font-semibold tracking-tight text-3xl md:text-4xl">Analytics</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Patterns from your second brain.</p>
          </div>
          <div className="flex gap-4 font-mono text-[11px] text-muted-foreground">
            <Stat icon={Sparkles} label="Total entries" value={heatmap.total} />
            <Stat icon={CalendarDays} label="Active days" value={heatmap.activeDays} />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 flex flex-col gap-5">
          {/* Heatmap */}
          <Panel title="Activity (last 365 days)" subtitle={`${heatmap.total} contributions`}>
            <div className="overflow-x-auto -mx-1 px-1">
              <div className="inline-flex flex-col gap-1 min-w-full">
                {/* Month labels */}
                <div className="relative h-3 ml-7">
                  {heatmap.monthLabels.map((m) => (
                    <span
                      key={`${m.month}-${m.weekIndex}`}
                      className="absolute font-mono text-[9px] uppercase tracking-wider text-muted-foreground"
                      style={{ left: `${m.weekIndex * 14}px` }}
                    >
                      {MONTH_LABELS[m.month]}
                    </span>
                  ))}
                </div>
                <div className="flex gap-[3px]">
                  {/* Weekday labels */}
                  <div className="flex flex-col gap-[3px] w-6 shrink-0">
                    {WEEKDAY_LABELS.map((w, i) => (
                      <div key={i} className="font-mono text-[9px] text-muted-foreground h-[11px] leading-[11px]">
                        {w}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-[3px]">
                    {heatmap.weeks.map((week, wi) => (
                      <div key={wi} className="flex flex-col gap-[3px]">
                        {week.map((day, di) => (
                          <div
                            key={`${wi}-${di}`}
                            className={`heatmap-cell ${heatLevel(day.count)}`}
                            title={day.date ? `${day.date}: ${day.count} ${day.count === 1 ? 'entry' : 'entries'}` : ''}
                            style={day.date ? undefined : { visibility: 'hidden' }}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 mt-2 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  <span>Less</span>
                  {['', 'l1', 'l2', 'l3', 'l4'].map((lvl) => (
                    <div key={lvl} className={`heatmap-cell ${lvl}`} />
                  ))}
                  <span>More</span>
                </div>
              </div>
            </div>
          </Panel>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Journal consistency ring */}
            <Panel title="Journal" subtitle="This month">
              <div className="flex items-center gap-5">
                <div className="relative size-[120px] shrink-0">
                  <svg width="120" height="120" viewBox="0 0 120 120" className="-rotate-90">
                    <circle className="fill-none stroke-muted" cx="60" cy="60" r="48" strokeWidth="8" />
                    <motion.circle
                      cx="60" cy="60" r="48" strokeWidth="8"
                      className="fill-none stroke-primary"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 48}
                      initial={{ strokeDashoffset: 2 * Math.PI * 48 }}
                      animate={{ strokeDashoffset: 2 * Math.PI * 48 * (1 - journalPct / 100) }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center font-serif text-3xl font-semibold text-primary">
                    {Math.round(journalPct)}%
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-serif text-2xl font-medium">
                    {data.journal_consistency.days_logged}
                    <span className="text-muted-foreground text-base"> / {data.journal_consistency.total_days}</span>
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
                    Days logged
                  </div>
                  <Link to="/journal" className="font-mono text-[10px] text-primary hover:underline mt-3 inline-block">
                    Open journal →
                  </Link>
                </div>
              </div>
            </Panel>

            {/* Module breakdown */}
            <Panel title="Last 30 days" subtitle="By module">
              {moduleEntries.length === 0 ? (
                <Empty>No activity yet.</Empty>
              ) : (
                <div className="flex flex-col gap-2">
                  {moduleEntries.map(([mod, count], i) => {
                    const color = moduleColors[mod] || 'hsl(var(--primary))';
                    return (
                      <div key={mod} className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-muted-foreground w-16 text-right capitalize">{mod}</span>
                        <div className="flex-1 h-5 bg-muted/60 rounded-sm overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${(count / maxModuleVal) * 100}%` }}
                            transition={{ duration: 0.6, delay: i * 0.05, ease: 'easeOut' }}
                            className="h-full rounded-sm"
                            style={{ backgroundColor: color }}
                          />
                        </div>
                        <span className="font-mono text-[11px] tabular-nums text-foreground/70 w-7 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>

            {/* Task velocity */}
            <Panel title="Task velocity" subtitle="Completed by week">
              {data.task_velocity.length === 0 ? (
                <Empty>No completed tasks yet.</Empty>
              ) : (
                <div className="flex items-end gap-1 h-32 pt-2">
                  {data.task_velocity.map((v, i) => {
                    const pct = (v.completed / maxVelocity) * 100;
                    return (
                      <div key={v.week} className="flex-1 flex flex-col items-center gap-1 group" title={`${v.week}: ${v.completed}`}>
                        <div className="font-mono text-[10px] tabular-nums text-foreground/70 opacity-0 group-hover:opacity-100 transition-opacity">
                          {v.completed}
                        </div>
                        <div className="w-full flex items-end justify-center" style={{ height: '92px' }}>
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: `${Math.max(pct, v.completed > 0 ? 6 : 0)}%` }}
                            transition={{ duration: 0.5, delay: i * 0.04, ease: 'easeOut' }}
                            className="w-full bg-primary/80 rounded-t-sm group-hover:bg-primary"
                          />
                        </div>
                        <span className="font-mono text-[9px] text-muted-foreground truncate max-w-full">
                          {v.week.slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>

            {/* Habit streaks */}
            <Panel
              title="Habit streaks"
              subtitle={data.habit_streaks.length ? `${data.habit_streaks.length} tracked` : undefined}
            >
              {data.habit_streaks.length === 0 ? (
                <Empty>No habits tracked yet.</Empty>
              ) : (
                <div className="flex flex-col gap-2">
                  {data.habit_streaks.slice(0, 6).map((s) => (
                    <div key={s.name} className="flex items-center justify-between gap-2 py-1.5 border-b border-border/40 last:border-0">
                      <span className="text-sm truncate flex-1">{s.name}</span>
                      <div className="flex items-center gap-3 font-mono text-xs shrink-0">
                        <span className="inline-flex items-center gap-1">
                          {s.current > 0 && <Flame className="size-3 text-orange-500" />}
                          <span className="tabular-nums">{s.current}</span>
                          <span className="text-[9px] text-muted-foreground uppercase">cur</span>
                        </span>
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <span className="tabular-nums">{s.longest}</span>
                          <span className="text-[9px] uppercase">best</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {/* Top tags */}
            <Panel title="Top tags" subtitle={`${data.top_tags.length} ranked`}>
              {data.top_tags.length === 0 ? (
                <Empty>No tags used yet.</Empty>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {data.top_tags.slice(0, 8).map((t, i) => {
                    const pct = (t.count / maxTagCount) * 100;
                    return (
                      <Link
                        key={t.tag}
                        to={`/tags/${encodeURIComponent(t.tag)}`}
                        className="flex items-center gap-2 group hover:bg-accent/30 rounded-md px-1 -mx-1 py-1 transition-colors"
                      >
                        <Hash className="size-3 text-muted-foreground" />
                        <span className="font-mono text-xs flex-1 truncate group-hover:text-primary transition-colors">
                          {t.tag}
                        </span>
                        <div className="w-20 h-1.5 bg-muted/60 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.5, delay: i * 0.04 }}
                            className="h-full bg-primary/70 rounded-full"
                          />
                        </div>
                        <span className="font-mono text-[10px] tabular-nums text-muted-foreground w-6 text-right">{t.count}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </Panel>

            {/* Media stats */}
            <Panel title="Media" subtitle={`${data.media_stats.total || 0} tracked`}>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  { label: 'Movies', key: 'movies_finished', icon: Film },
                  { label: 'Books', key: 'books_finished', icon: BookOpen },
                  { label: 'Shows', key: 'shows_finished', icon: Tv },
                ].map(({ label, key, icon: Icon }) => (
                  <div key={key} className="text-center rounded-lg bg-muted/40 py-3 px-1">
                    <Icon className="size-4 mx-auto mb-1 text-muted-foreground" />
                    <div className="font-serif text-2xl font-semibold text-primary tabular-nums">
                      {data.media_stats[key] || 0}
                    </div>
                    <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>
              {(data.media_stats.in_progress || 0) > 0 && (
                <div className="font-mono text-[10px] text-muted-foreground flex items-center justify-center gap-1.5">
                  <TrendingUp className="size-3" />
                  {data.media_stats.in_progress} in progress
                </div>
              )}
              <Link to="/media" className="font-mono text-[10px] text-primary hover:underline mt-2 inline-block">
                Open library →
              </Link>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-xl border border-border bg-card p-5"
    >
      <header className="flex items-baseline justify-between gap-2 mb-4">
        <h2 className="font-serif text-base font-semibold">{title}</h2>
        {subtitle && <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{subtitle}</span>}
      </header>
      {children}
    </motion.section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground py-4 text-center">{children}</p>;
}

function Stat({ icon: Icon, label, value }: { icon: typeof Flame; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="size-3.5" />
      <span className="tabular-nums font-medium text-foreground">{value}</span>
      <span className="opacity-70">{label}</span>
    </div>
  );
}
