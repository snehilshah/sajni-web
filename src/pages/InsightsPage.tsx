import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import {
  Sparkles, Pin, PinOff, X, RefreshCw, Clock, Search,
  BookOpen, FileText, StickyNote, Wallet, Film,
} from 'lucide-react';

import { insights, timeTravel, type Insight, type InsightWindow, type TimeTravelHit } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useNavigate } from 'react-router-dom';

const WINDOWS: { id: InsightWindow; label: string; long: string }[] = [
  { id: '1w', label: '1w', long: 'Past week' },
  { id: '2w', label: '2w', long: 'Past 2 weeks' },
  { id: '1m', label: '1m', long: 'Past month' },
  { id: '6m', label: '6m', long: 'Past 6 months' },
  { id: '1y', label: '1y', long: 'Past year' },
];

export default function InsightsPage() {
  const [window, setWindow] = useState<InsightWindow>('1w');
  const [items, setItems] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async (w: InsightWindow = window) => {
    setLoading(true);
    try {
      const rows = await insights.list(w);
      setItems(rows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(window);   }, [window]);

  const runNow = async () => {
    setRunning(true);
    try {
      await insights.run(window);
      await load(window);
    } finally {
      setRunning(false);
    }
  };

  const togglePin = async (it: Insight) => {
    if (it.pinned) await insights.unpin(it.id);
    else await insights.pin(it.id);
    load(window);
  };

  const dismiss = async (it: Insight) => {
    await insights.dismiss(it.id);
    setItems((arr) => arr.filter((x) => x.id !== it.id));
  };

  return (
    <div className="flex flex-col h-full page-fade-in">
      <header className="border-b border-border bg-background/85 backdrop-blur sticky top-0 z-20">
        <div className="px-4 md:px-8 h-14 md:h-16 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="mono text-[9.5px] uppercase tracking-[0.22em] text-muted-foreground leading-none">
              correlations · time travel
            </div>
            <h1 className="serif text-base md:text-lg font-semibold tracking-tight leading-tight mt-0.5">Insights</h1>
          </div>
          <Button size="sm" variant="ghost" onClick={runNow} disabled={running}>
            <RefreshCw className={`size-3.5 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Computing…' : 'Re-run'}
          </Button>
        </div>

        {/* Window pills */}
        <div className="px-4 md:px-8 pb-3 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {WINDOWS.map((w) => {
            const active = w.id === window;
            return (
              <button
                key={w.id}
                onClick={() => setWindow(w.id)}
                className={`relative px-3 py-1 rounded-full text-[12px] font-mono uppercase tracking-wider transition-colors ${
                  active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
                title={w.long}
              >
                {active && (
                  <motion.span
                    layoutId="insights-window-pill"
                    className="absolute inset-0 rounded-full bg-primary/15 ring-1 ring-primary/30"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative z-10">{w.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-5 flex flex-col gap-6">
          <TimeTravelSearch />

          {loading ? (
            <div className="grid place-items-center py-16">
              <Spinner />
            </div>
          ) : items.length === 0 ? (
            <Empty onRun={runNow} running={running} />
          ) : (
            <ul className="flex flex-col gap-3">
              <AnimatePresence initial={false}>
                {items.map((it) => (
                  <InsightCard key={it.id} insight={it} onPin={togglePin} onDismiss={dismiss} />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function InsightCard({
  insight, onPin, onDismiss,
}: {
  insight: Insight;
  onPin: (it: Insight) => void;
  onDismiss: (it: Insight) => void;
}) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="rounded-2xl border border-border bg-card p-4 md:p-5 flex gap-3"
    >
      <span className="size-9 rounded-md bg-primary/10 text-primary grid place-items-center shrink-0">
        <Sparkles className="size-4" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-serif text-base font-semibold">{insight.title}</span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {insight.window_key} · score {insight.score.toFixed(2)}
          </span>
        </div>
        <p className="text-sm text-foreground/85 mt-1 leading-relaxed">{insight.body}</p>
        <div className="font-mono text-[10px] text-muted-foreground mt-2 inline-flex items-center gap-1">
          <Clock className="size-3" />
          {format(parseISO(insight.generated_at), 'MMM d, h:mm a')}
        </div>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <button
          onClick={() => onPin(insight)}
          title={insight.pinned ? 'Unpin' : 'Pin'}
          className={`size-8 grid place-items-center rounded-md hover:bg-accent ${
            insight.pinned ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {insight.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
        </button>
        <button
          onClick={() => onDismiss(insight)}
          title="Dismiss"
          className="size-8 grid place-items-center rounded-md hover:bg-accent text-muted-foreground hover:text-destructive"
        >
          <X className="size-4" />
        </button>
      </div>
    </motion.li>
  );
}

function Empty({ onRun, running }: { onRun: () => void; running: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-10 text-center">
      <Sparkles className="size-6 text-muted-foreground mx-auto mb-3" />
      <div className="serif text-lg font-medium">Nothing surfaced yet.</div>
      <div className="text-sm text-muted-foreground mt-1 mb-4">
        Insights look for cross-module patterns once you have a few days of data.
        Try recording a journal entry, completing some tasks, and running it.
      </div>
      <Button onClick={onRun} disabled={running}>
        <RefreshCw className={`size-3.5 ${running ? 'animate-spin' : ''}`} />
        {running ? 'Computing…' : 'Run now'}
      </Button>
    </div>
  );
}

function TimeTravelSearch() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [hits, setHits] = useState<TimeTravelHit[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (debounced.length < 2) {
      setHits([]);
      return;
    }
    setLoading(true);
    timeTravel.search(debounced, { limit: 15 })
      .then((res) => setHits(res.items))
      .catch(() => setHits([]))
      .finally(() => setLoading(false));
  }, [debounced]);

  const open = (h: TimeTravelHit) => {
    switch (h.type) {
      case 'journal': navigate(`/journal?date=${h.date}`); break;
      case 'note': navigate(`/notes?id=${h.id}`); break;
      case 'memo': navigate('/memos'); break;
      case 'transaction': navigate('/finance/transactions'); break;
      case 'media': navigate('/media'); break;
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 md:p-5">
      <div className="flex items-center gap-2 mb-3">
        <Search className="size-3.5 text-muted-foreground" />
        <h2 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Time travel</h2>
      </div>
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="When did I last meet Jay? Where did I go on Mar 12?"
        className="text-base"
      />
      <div className="mt-3 flex flex-col gap-1.5">
        {loading ? (
          <div className="text-xs text-muted-foreground">Searching…</div>
        ) : debounced.length < 2 ? (
          <div className="text-xs text-muted-foreground">
            Searches journals, memos, notes, transactions, and media for the most recent matches.
          </div>
        ) : hits.length === 0 ? (
          <div className="text-xs text-muted-foreground">Nothing matched.</div>
        ) : (
          hits.map((h, i) => <HitRow key={`${h.type}:${h.id}:${i}`} hit={h} onOpen={() => open(h)} />)
        )}
      </div>
    </section>
  );
}

function HitRow({ hit, onOpen }: { hit: TimeTravelHit; onOpen: () => void }) {
  const Icon = useMemo(() => {
    switch (hit.type) {
      case 'journal': return BookOpen;
      case 'note': return FileText;
      case 'memo': return StickyNote;
      case 'transaction': return Wallet;
      case 'media': return Film;
      default: return Sparkles;
    }
  }, [hit.type]);
  return (
    <button
      onClick={onOpen}
      className="flex items-center gap-3 text-left p-2 rounded-md hover:bg-accent transition-colors"
    >
      <span className="size-7 rounded-md bg-primary/10 text-primary grid place-items-center shrink-0">
        <Icon className="size-3.5" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{hit.title}</div>
        <div className="font-mono text-[10px] text-muted-foreground truncate">
          {hit.date} · {hit.type}
          {hit.excerpt ? ` · ${hit.excerpt}` : ''}
        </div>
      </div>
    </button>
  );
}
