import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO, isYesterday, differenceInCalendarDays } from 'date-fns';
import { CalendarX2, ArrowRight, X, Loader2 } from 'lucide-react';

import { tasks as tasksApi } from '@/api';
import type { Task } from '@/types';

// MissedBanner surfaces every still-open overdue task (accumulates, oldest
// first) with a one-tap reschedule-to-today CTA — per task and in bulk — plus
// a quick scratch for things that are simply not happening. Self-fetching so
// both Today and Tasks can drop it in; calls onChanged so the host can
// refresh its own lists/counts after a move.
//
// Rendered on an M3 error-container tonal surface so a pile of misses reads as
// a gentle alert, not decoration. Renders nothing when there's nothing missed.
export default function MissedBanner({ onChanged }: { onChanged?: () => void }) {
  const [missed, setMissed] = useState<Task[]>([]);
  const [busy, setBusy] = useState<number | 'all' | null>(null);
  const today = format(new Date(), 'yyyy-MM-dd');

  const load = useCallback(async () => {
    try {
      setMissed(await tasksApi.list({ smart: 'missed' }));
    } catch {
      setMissed([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const after = async () => { await load(); onChanged?.(); };

  const rescheduleOne = async (id: number) => {
    setBusy(id);
    try { await tasksApi.reschedule(id, today); await after(); }
    finally { setBusy(null); }
  };
  const scratchOne = async (id: number) => {
    setBusy(id);
    try { await tasksApi.scratch(id); await after(); }
    finally { setBusy(null); }
  };
  const rescheduleAll = async () => {
    setBusy('all');
    try {
      await Promise.all(missed.map((t) => tasksApi.reschedule(t.id, today)));
      await after();
    } finally { setBusy(null); }
  };

  if (missed.length === 0) return null;

  // Age label: "Yesterday" leads, then "Nd ago" so the longest-ignored read at a glance.
  const ageLabel = (due?: string | null) => {
    if (!due) return '';
    try {
      const d = parseISO(due);
      if (isYesterday(d)) return 'Yesterday';
      const days = differenceInCalendarDays(new Date(), d);
      return days > 1 ? `${days}d ago` : format(d, 'MMM d');
    } catch { return due; }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}
      className="rounded-2xl border border-[hsl(var(--error)/0.4)] bg-[hsl(var(--error-container)/0.55)] text-[hsl(var(--on-error-container))] p-3.5"
    >
      <div className="flex items-center gap-2.5">
        <span className="grid place-items-center size-8 rounded-full bg-[hsl(var(--error)/0.18)] shrink-0">
          <CalendarX2 className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-tight">
            {missed.length} missed {missed.length === 1 ? 'task' : 'tasks'}
          </div>
          <div className="text-[11px] opacity-80 leading-tight mt-0.5">
            Overdue and still open — reschedule or scratch them.
          </div>
        </div>
        <button
          type="button"
          onClick={rescheduleAll}
          disabled={busy !== null}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 h-8 text-xs font-medium bg-[hsl(var(--error)/0.9)] text-[hsl(var(--on-error))] hover:opacity-90 active:scale-[0.98] transition disabled:opacity-50"
        >
          {busy === 'all' ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRight className="size-3.5" />}
          All to today
        </button>
      </div>

      <div className="mt-2.5 flex flex-col gap-1">
        <AnimatePresence initial={false}>
          {missed.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
              className="group flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 hover:bg-[hsl(var(--on-error-container)/0.06)] transition-colors"
            >
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('task:open', { detail: { id: t.id } }))}
                className="flex-1 min-w-0 text-left"
              >
                <span className="text-sm truncate block">{t.title}</span>
              </button>
              <span className="mono text-[10px] tabular-nums shrink-0 rounded-full px-1.5 py-0.5 bg-[hsl(var(--error)/0.16)]">
                {ageLabel(t.due_date)}
              </span>
              <button
                type="button"
                onClick={() => rescheduleOne(t.id)}
                disabled={busy !== null}
                title="Reschedule to today"
                className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 h-7 text-[11px] font-medium bg-[hsl(var(--on-error-container)/0.1)] hover:bg-[hsl(var(--on-error-container)/0.18)] transition disabled:opacity-50"
              >
                {busy === t.id ? <Loader2 className="size-3 animate-spin" /> : 'Today'}
              </button>
              <button
                type="button"
                onClick={() => scratchOne(t.id)}
                disabled={busy !== null}
                title="Scratch (abandon) this task"
                className="shrink-0 size-7 inline-flex items-center justify-center rounded-full text-current/70 hover:bg-[hsl(var(--on-error-container)/0.12)] transition disabled:opacity-50"
              >
                <X className="size-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
