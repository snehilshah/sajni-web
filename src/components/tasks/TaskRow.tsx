import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO, isPast, isToday } from 'date-fns';
import {
  Star, ChevronRight, Plus, ListChecks, Clock, Bell, Check, X, CornerDownRight,
} from 'lucide-react';
import { M3CookieLoader } from '@/components/ui/shapes';

import type { Task, TaskStep } from '@/types';
import TagPill from '@/components/TagPill';
import { Input } from '@/components/ui/input';
import {
  useToggleTaskStatus, useToggleTaskImportant, useCreateTask, useSubtasks,
} from '@/queries/tasks';
import { PRIORITY_COLORS } from './helpers';

interface Props {
  task: Task;
  onClick: () => void;
  depth?: number;
}

// TaskRow renders one task with an inline status checkbox, star, a
// right-aligned "add subtask" action, and a count chip that expands the
// nested children. Children are list-embedded (prefetched) so expand is
// instant; we lazy-fetch only as a fallback. Clicking the body opens the
// detail dialog (via onClick).
export default function TaskRow({ task, onClick, depth = 0 }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [addingSub, setAddingSub] = useState(false);
  const [subDraft, setSubDraft] = useState('');

  const toggleStatus = useToggleTaskStatus();
  const toggleImportant = useToggleTaskImportant();
  const createTask = useCreateTask();

  // Children: seeded by the list-embedded prefetch (instant expand), refetched
  // fresh once the row is opened. Mutations invalidate the cache automatically.
  const { data: subs, isFetching: loadingSubs } = useSubtasks(task.id, expanded, task.subtasks);

  const overdue = task.due_date && task.status !== 'done' && (() => {
    const d = parseISO(task.due_date);
    return !isToday(d) && isPast(d);
  })();

  const completedSteps = task.steps?.filter((s) => s.done).length ?? 0;
  const totalSteps = task.steps?.length ?? 0;

  const handleToggleStatus = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleStatus.mutate({ id: task.id, status: task.status === 'done' ? 'todo' : 'done' });
  };

  const handleToggleStar = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleImportant.mutate({ id: task.id, important: !task.important });
  };

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((v) => !v);
  };

  const addSubtask = async () => {
    const title = subDraft.trim();
    if (!title) { setAddingSub(false); setSubDraft(''); return; }
    setSubDraft('');
    setAddingSub(false);
    await createTask.mutateAsync({
      title,
      parent_task_id: task.id,
      list_id: task.list_id ?? null,
    });
  };

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: -2 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={{ duration: 0.16, ease: [0.22, 0.61, 0.36, 1] }}
    >
      <div
        onClick={onClick}
        className={`group rounded-lg border border-border bg-card hover:border-primary/40 hover:shadow-sm transition-[box-shadow,border-color] cursor-pointer
          ${task.status === 'done' || task.status === 'scratched' ? 'opacity-60' : ''}`}
        style={{ marginLeft: depth * 24 }}
      >
        <div className="flex items-start gap-3 px-3.5 py-3 min-h-12">
          {/* Completion checkbox — 24px visual, padded to a comfortable target */}
          <button
            onClick={handleToggleStatus}
            className="shrink-0 -m-2 p-2 flex items-center justify-center"
            title={task.status === 'done' ? 'Mark incomplete' : 'Complete'}
          >
            <span
              className={`size-6 rounded-full border-2 flex items-center justify-center transition-colors
                ${task.status === 'done'
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-muted-foreground/40 group-hover:border-primary'}`}
            >
              {task.status === 'done' && (
                <svg viewBox="0 0 12 12" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 6.5L5 9L10 3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`size-2 rounded-full shrink-0 ${PRIORITY_COLORS[task.priority]}`} />
              <span className={`font-medium text-[0.9375rem] leading-snug flex-1 truncate ${task.status === 'done' || task.status === 'scratched' ? 'line-through' : ''}`}>
                {task.title}
              </span>
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
              {/* Subtask hint — only when shown as a flat row (smart/missed/all
                  views). Stops a child task from reading as a normal top-level
                  task, which is what made "Talk with chandan once" confusing. */}
              {depth === 0 && task.parent_task_id != null && (
                <span className="inline-flex items-center gap-0.5 text-muted-foreground/80" title="This is a subtask">
                  <CornerDownRight className="size-3" /> subtask
                </span>
              )}
              {task.status === 'scratched' && (
                <span className="inline-flex items-center rounded-full px-1.5 py-px bg-[hsl(var(--on-surface)/0.08)]">scratched</span>
              )}
              {task.due_date && (
                <span className={`inline-flex items-center gap-1 ${overdue ? 'text-destructive' : ''}`}>
                  <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="3" width="12" height="11" rx="1.5" /><path d="M2 6h12M5 1.5v3M11 1.5v3" strokeLinecap="round" />
                  </svg>
                  {format(parseISO(task.due_date), 'MMM d')}
                </span>
              )}
              {task.week_of && !task.due_date && (
                <span className="inline-flex items-center gap-1" title="Week task">
                  <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="3" width="12" height="11" rx="1.5" /><path d="M2 6h12M5 1.5v3M11 1.5v3" strokeLinecap="round" />
                  </svg>
                  wk of {format(parseISO(task.week_of), 'MMM d')}
                </span>
              )}
              {task.scheduled_at && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full pl-1.5 pr-2 py-0.5 leading-none ${
                    task.remind
                      ? 'bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))]'
                      : 'bg-[hsl(var(--tertiary-container))] text-[hsl(var(--on-tertiary-container))]'
                  }`}
                  title={task.remind ? 'Reminder set' : 'Scheduled'}
                >
                  {task.remind ? <Bell className="size-2.5 fill-current" /> : <Clock className="size-2.5" />}
                  <span>{format(parseISO(task.scheduled_at), 'h:mm a')}</span>
                </span>
              )}
              {totalSteps > 0 && (
                <span className="inline-flex items-center gap-1">
                  <ListChecks className="size-3" /> {completedSteps}/{totalSteps}
                </span>
              )}
              {task.tags && task.tags.length > 0 && (
                <span className="inline-flex gap-1 flex-wrap">
                  {task.tags.slice(0, 3).map((tag) => <TagPill key={tag} tag={tag} />)}
                  {task.tags.length > 3 && <span className="text-xs">+{task.tags.length - 3}</span>}
                </span>
              )}
            </div>
          </div>

          {/* Subtasks toggle — arrow that expands/collapses the children. Count
              label on desktop, arrow-only on mobile. */}
          {task.subtask_count > 0 && (
            <button
              type="button"
              onClick={toggleExpand}
              aria-expanded={expanded}
              title={expanded ? 'Hide subtasks' : 'Show subtasks'}
              className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 sm:px-2.5 py-1.5 text-muted-foreground opacity-70 hover:opacity-100 hover:text-foreground hover:bg-[hsl(var(--surface-container-high))] transition-colors"
            >
              <span className="hidden sm:inline text-xs tabular-nums">{task.subtasks_done}/{task.subtask_count}</span>
              <ChevronRight className={`size-4 transition-transform ${expanded ? 'rotate-90' : ''}`} strokeWidth={2.5} />
            </button>
          )}

          <button
            onClick={handleToggleStar}
            className={`-m-1.5 p-1.5 rounded-full opacity-60 hover:opacity-100 hover:bg-[hsl(var(--surface-container-high))] transition-all shrink-0 ${task.important ? 'text-[hsl(var(--tertiary))] opacity-100' : ''}`}
            title={task.important ? 'Remove from Important' : 'Mark important'}
          >
            <Star className={`size-[18px] ${task.important ? 'fill-current' : ''}`} />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.26, ease: [0.2, 0, 0, 1] }}
            className="overflow-hidden"
            style={{ marginLeft: (depth + 1) * 24 }}
          >
            <div className="mt-2 mb-1 flex flex-col gap-1.5 rounded-2xl border border-border/60 bg-[hsl(var(--surface-container-low))] p-2.5">
              {loadingSubs && (
                <div className="text-sm text-muted-foreground flex items-center gap-2.5 px-2 py-2.5">
                  <M3CookieLoader size="sm" tone="secondary" /> Loading…
                </div>
              )}

              {subs && subs.length === 0 && !addingSub && (
                <div className="text-sm text-muted-foreground italic px-2 py-2">No subtasks yet — break this down.</div>
              )}

              {subs?.map((sub) => (
                <TaskRow
                  key={sub.id}
                  task={sub}
                  onClick={onClick}
                />
              ))}

              {addingSub ? (
                <div className="px-0.5 py-0.5">
                  <Input
                    name={`subtask-${task.id}`}
                    autoFocus
                    placeholder="New subtask"
                    value={subDraft}
                    onChange={(e) => setSubDraft(e.target.value)}
                    onBlur={addSubtask}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addSubtask();
                      if (e.key === 'Escape') { setAddingSub(false); setSubDraft(''); }
                    }}
                    className="h-10 text-sm"
                  />
                </div>
              ) : (
                <button
                  onClick={() => setAddingSub(true)}
                  className="self-start inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))] hover:opacity-90 active:scale-[0.98] transition-all"
                >
                  <Plus className="size-4" strokeWidth={2.5} /> Add subtask
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// StepsEditor renders the inline checklist editor used inside the
// task detail dialog. Maintains a local draft until "save".
// onCommit (optional) is fired immediately after a step is added via
// Enter or toggled/removed, so the parent dialog can persist without
// requiring a separate Save click.
export function StepsEditor({
  steps, onChange, onCommit,
}: {
  steps: TaskStep[];
  onChange: (next: TaskStep[]) => void;
  onCommit?: (next: TaskStep[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const update = (id: string, patch: Partial<TaskStep>) => {
    const next = steps.map((s) => (s.id === id ? { ...s, ...patch } : s));
    onChange(next);
    onCommit?.(next);
  };
  const remove = (id: string) => {
    const next = steps.filter((s) => s.id !== id);
    onChange(next);
    onCommit?.(next);
  };
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    const next = [...steps, { id: 's_' + Date.now(), text, done: false }];
    onChange(next);
    onCommit?.(next);
    setDraft('');
  };

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="flex flex-col gap-0.5">
      {steps.length > 0 && (
        <div className="flex items-center gap-2 px-1.5 pb-1">
          <div className="h-1 flex-1 rounded-full bg-[hsl(var(--surface-container-highest))] overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={false}
              animate={{ width: `${(doneCount / steps.length) * 100}%` }}
              transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            />
          </div>
          <span className="mono text-xs tabular-nums text-muted-foreground shrink-0">{doneCount}/{steps.length}</span>
        </div>
      )}
      <AnimatePresence initial={false}>
        {steps.map((s) => (
          <motion.div
            key={s.id}
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
            className="group flex items-center gap-2.5 rounded-xl px-2.5 py-1 hover:bg-[hsl(var(--surface-container-high))] transition-colors"
          >
            <motion.button
              type="button"
              whileTap={{ scale: 0.85 }}
              transition={{ type: 'spring', stiffness: 500, damping: 24 }}
              onClick={() => update(s.id, { done: !s.done })}
              className={`size-[18px] rounded-md border-2 flex items-center justify-center shrink-0 transition-colors
                ${s.done ? 'border-primary bg-primary text-primary-foreground' : 'border-[hsl(var(--outline))] hover:border-primary'}`}
              aria-pressed={s.done}
            >
              <AnimatePresence>
                {s.done && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 22 }}
                  >
                    <Check className="size-3" strokeWidth={3.5} />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
            <Input
              name={`step-${s.id}`}
              value={s.text}
              onChange={(e) => update(s.id, { text: e.target.value })}
              className={`flex-1 h-7 border-0 bg-transparent px-1 py-0 shadow-none outline-none focus-visible:border-0 focus-visible:shadow-none text-sm ${s.done ? 'line-through text-muted-foreground' : ''}`}
            />
            <button
              type="button"
              onClick={() => remove(s.id)}
              className="opacity-0 group-hover:opacity-100 size-6 rounded-full inline-flex items-center justify-center text-muted-foreground hover:bg-[hsl(var(--on-surface)/0.08)] hover:text-foreground transition-all shrink-0"
              title="Remove step"
            >
              <X className="size-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
      <div className="flex items-center gap-2.5 rounded-xl px-2.5 py-1">
        <span className="size-[18px] rounded-md border-2 border-dashed border-[hsl(var(--outline)/0.6)] inline-flex items-center justify-center shrink-0 text-muted-foreground/60">
          <Plus className="size-3" strokeWidth={2.5} />
        </span>
        <Input
          name="new-step"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add(); }
          }}
          placeholder="Add a step"
          className="flex-1 h-7 border-0 bg-transparent px-1 py-0 shadow-none outline-none focus-visible:border-0 focus-visible:shadow-none text-sm placeholder:text-muted-foreground/50"
        />
        {draft && (
          <button
            type="button"
            onClick={add}
            className="shrink-0 rounded-full bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))] text-xs font-medium px-3 py-1 hover:opacity-90 transition-opacity"
          >
            Add
          </button>
        )}
      </div>
    </div>
  );
}
