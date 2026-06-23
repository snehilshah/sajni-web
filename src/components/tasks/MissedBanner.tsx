import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO, isYesterday, differenceInCalendarDays } from 'date-fns';
import { CalendarX2, X, Loader2, ChevronDown } from '@/components/ui/icons';

import { useMissedTasks, useRescheduleTask, useScratchTask } from '@/queries/tasks';

// MissedBanner surfaces every still-open overdue task with one-tap
// reschedule-to-today (per task + bulk) and a quick scratch.
//
// It reads as a CALM summary, not an alarm: a single neutral surface-container
// chip ("N missed · review") the user taps to expand the full list — no
// persistent red wall, the old error-container treatment shouted on every
// visit. Accent is the calm `--color-waiting` tone, never error-red.
//
// Fully react-query driven: the list (useMissedTasks) auto-refetches whenever a
// task mutation invalidates the tasks cache, and per-row / bulk spinners read
// straight off each mutation's isPending + variables — no local busy state, no
// onChanged callback. Renders nothing when there's nothing missed.
export default function MissedBanner() {
  const { data: missed = [] } = useMissedTasks();
  const reschedule = useRescheduleTask();
  const scratch = useScratchTask();
  const [open, setOpen] = useState(false);
  const today = format(new Date(), 'yyyy-MM-dd');

  // Any in-flight mutation locks the controls so a row can't be double-acted.
  const busy = reschedule.isPending || scratch.isPending;
  const rescheduleOne = (id: number) => reschedule.mutate({ id, date: today });
  const scratchOne = (id: number) => scratch.mutate(id);

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
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
      className="rounded-2xl border border-border bg-[hsl(var(--surface-container))] overflow-hidden"
    >
      {/* Summary row — the whole strip toggles the detail list. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-[hsl(var(--on-surface)/0.04)] transition-colors"
      >
        <span className="grid place-items-center size-7 rounded-full bg-[hsl(var(--color-waiting)/0.16)] text-[hsl(var(--color-waiting))] shrink-0">
          <CalendarX2 className="size-3.5" />
        </span>
        <span className="text-sm font-medium leading-tight flex-1 min-w-0">
          {missed.length} missed {missed.length === 1 ? 'task' : 'tasks'}
          <span className="text-muted-foreground font-normal"> · review</span>
        </span>
        <ChevronDown
          className={`size-4 text-muted-foreground shrink-0 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-2.5 pb-2.5 pt-0.5">
              <div className="flex flex-col gap-0.5">
                <AnimatePresence initial={false}>
                  {missed.map((t) => (
                    <motion.div
                      key={t.id}
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
                      className="group flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 hover:bg-[hsl(var(--on-surface)/0.05)] transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => window.dispatchEvent(new CustomEvent('task:open', { detail: { id: t.id } }))}
                        className="flex-1 min-w-0 text-left"
                      >
                        <span className="text-sm truncate block">{t.title}</span>
                      </button>
                      <span className="mono text-xs tabular-nums shrink-0 rounded-full px-1.5 py-0.5 bg-[hsl(var(--color-waiting)/0.14)] text-[hsl(var(--color-waiting))]">
                        {ageLabel(t.due_date)}
                      </span>
                      <button
                        type="button"
                        onClick={() => rescheduleOne(t.id)}
                        disabled={busy}
                        title="Reschedule to today"
                        className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 h-7 text-xs font-medium bg-[hsl(var(--on-surface)/0.08)] hover:bg-[hsl(var(--on-surface)/0.14)] transition disabled:opacity-50"
                      >
                        {reschedule.isPending && reschedule.variables?.id === t.id ? <Loader2 className="size-3 animate-spin" /> : 'Today'}
                      </button>
                      <button
                        type="button"
                        onClick={() => scratchOne(t.id)}
                        disabled={busy}
                        title="Scratch (abandon) this task"
                        className="shrink-0 size-7 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-[hsl(var(--on-surface)/0.1)] hover:text-foreground transition disabled:opacity-50"
                      >
                        {scratch.isPending && scratch.variables === t.id ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
