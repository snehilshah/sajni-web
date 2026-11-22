import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO, differenceInCalendarDays, differenceInCalendarMonths } from 'date-fns';
import { CalendarX2, X, Loader2, ChevronDown, ArrowRight } from '@/components/ui/icons';

import { useMissedTasks, useRescheduleTask, useScratchTask, useUpdateTask } from '@/queries/tasks';
import type { Task } from '@/types';
import { monthFirstKey, weekMondayKey } from './helpers';
import TaskScopeBadge from './TaskScopeBadge';

// MissedBanner surfaces every still-open overdue task with one-tap
// rescheduling to its current scope (day/week/month) and a quick scratch.
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
  const updateTask = useUpdateTask();
  const scratch = useScratchTask();
  const [open, setOpen] = useState(false);
  const today = format(new Date(), 'yyyy-MM-dd');

  // Any in-flight mutation locks the controls so a row can't be double-acted.
  const busy = reschedule.isPending || updateTask.isPending || scratch.isPending;
  const rescheduleOne = (task: Task) => {
    if (task.month_of && !task.due_date) {
      updateTask.mutate({
        id: task.id,
        data: {
          month_of: monthFirstKey(),
          clear_due: true,
          clear_week: true,
          clear_scheduled: true,
          remind: false,
        },
      });
      return;
    }
    if (task.week_of && !task.due_date) {
      updateTask.mutate({
        id: task.id,
        data: {
          week_of: weekMondayKey(),
          clear_due: true,
          clear_month: true,
          clear_scheduled: true,
          remind: false,
        },
      });
      return;
    }
    reschedule.mutate({ id: task.id, date: today });
  };
  const scratchOne = (id: number) => scratch.mutate(id);

  if (missed.length === 0) return null;

  // Compact units keep each scope legible inside the same-width age badge.
  const ageLabel = (task: Task) => {
    if (task.month_of && !task.due_date) {
      try {
        const months = Math.max(1, differenceInCalendarMonths(new Date(), parseISO(task.month_of)));
        return `${months}mo ago`;
      } catch {
        return '1mo ago';
      }
    }
    if (task.week_of && !task.due_date) {
      try {
        const days = differenceInCalendarDays(new Date(), parseISO(task.week_of));
        const weeks = Math.max(1, Math.floor(days / 7));
        return `${weeks}w ago`;
      } catch {
        return '1w ago';
      }
    }
    if (!task.due_date) return '';
    try {
      const d = parseISO(task.due_date);
      const days = differenceInCalendarDays(new Date(), d);
      return days >= 1 ? `${days}d ago` : format(d, 'MMM d');
    } catch {
      return task.due_date;
    }
  };

  const ctaTitle = (task: Task) => {
    if (task.month_of && !task.due_date) return 'Move to this month';
    if (task.week_of && !task.due_date) return 'Move to this week';
    return 'Reschedule to today';
  };

  const rescheduling = (id: number) => {
    return (
      (reschedule.isPending && reschedule.variables?.id === id) ||
      (updateTask.isPending && updateTask.variables?.id === id)
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, transform: 'translateY(-4px)' }}
      animate={{ opacity: 1, transform: 'translateY(0)' }}
      transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
      className="overflow-hidden rounded-2xl bg-[hsl(var(--surface-container))]"
    >
      {/* Summary row — the whole strip toggles the detail list. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-[hsl(var(--on-surface)/0.04)]"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[hsl(var(--color-waiting)/0.16)] text-[hsl(var(--color-waiting))]">
          <CalendarX2 className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 text-sm leading-tight font-medium">
          {missed.length} missed {missed.length === 1 ? 'task' : 'tasks'}
          <span className="font-normal text-muted-foreground"> · review</span>
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
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
            <div className="px-2.5 pt-0.5 pb-2.5">
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
                      className="group flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 transition-colors hover:bg-[hsl(var(--on-surface)/0.05)]"
                    >
                      <button
                        type="button"
                        onClick={() => window.dispatchEvent(new CustomEvent('task:open', { detail: { id: t.id } }))}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <TaskScopeBadge task={t} />
                        <span className="block min-w-0 truncate text-sm">{t.title}</span>
                      </button>
                      <span className="inline-flex h-6 w-18 shrink-0 items-center justify-center rounded-[8px] border border-[hsl(var(--color-waiting)/0.3)] bg-[hsl(var(--color-waiting)/0.12)] px-2 text-xs font-semibold whitespace-nowrap text-[hsl(var(--color-waiting))] tabular-nums">
                        {ageLabel(t)}
                      </span>
                      <button
                        type="button"
                        onClick={() => rescheduleOne(t)}
                        disabled={busy}
                        title={ctaTitle(t)}
                        aria-label={ctaTitle(t)}
                        className="relative inline-flex size-6 shrink-0 items-center justify-center rounded-[8px] border border-primary/30 bg-primary/12 text-primary transition before:absolute before:-inset-2.5 before:content-[''] hover:bg-primary/18 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                      >
                        {rescheduling(t.id) ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <ArrowRight className="size-4" aria-hidden="true" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => scratchOne(t.id)}
                        disabled={busy}
                        title="Scratch (abandon) this task"
                        className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-[hsl(var(--on-surface)/0.1)] hover:text-foreground disabled:opacity-50"
                      >
                        {scratch.isPending && scratch.variables === t.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <X className="size-3.5" />
                        )}
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
