import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO, isPast, isToday } from 'date-fns';
import {
  Star, ChevronRight, Plus, ListChecks, Clock, Bell, Check, X, CornerDownRight, GitBranch, StickyNote,
} from '@/components/ui/icons';
import { M3CookieLoader } from '@/components/ui/shapes';

import type { Task, TaskStep } from '@/types';
import TagPill from '@/components/TagPill';
import { Input } from '@/components/ui/input';
import {
  useToggleTaskStatus, useToggleTaskImportant, useCreateTask, useSubtasks, usePrefetchSubtasks,
} from '@/queries/tasks';
import { PRIORITY_COLORS } from './helpers';
import { cn } from '@/lib/utils';
import { WavyProgress } from '@/components/ui/wavy-progress';

interface Props {
  task: Task;
  onClick: () => void;
  depth?: number;
  compact?: boolean;
  attached?: boolean;
  first?: boolean;
}

// TaskRow renders one task with an inline status checkbox, star, a
// right-aligned "add subtask" action, and a count chip that expands the
// nested children. Children are list-embedded (prefetched) so expand is
// instant; we lazy-fetch only as a fallback. Clicking the body opens the
// detail dialog (via onClick).
export default function TaskRow({
  task, onClick, depth = 0, compact = false, attached = false, first = false,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [addingSub, setAddingSub] = useState(false);
  const [subDraft, setSubDraft] = useState('');

  const toggleStatus = useToggleTaskStatus();
  const toggleImportant = useToggleTaskImportant();
  const createTask = useCreateTask();
  const prefetchSubtasks = usePrefetchSubtasks();

  // Children: seeded by the list-embedded prefetch (instant expand), refetched
  // fresh once the row is opened. Mutations invalidate the cache automatically.
  const { data: subs, isLoading: loadingSubs } = useSubtasks(task.id, expanded, task.subtasks);

  const overdue = task.due_date && task.status !== 'done' && (() => {
    const d = parseISO(task.due_date);
    return !isToday(d) && isPast(d);
  })();

  const completedSteps = task.steps?.filter((s) => s.done).length ?? 0;
  const totalSteps = task.steps?.length ?? 0;
  const hasSubtasks = (task.subtask_count ?? 0) > 0;
  const dimmed = task.status === 'done' || task.status === 'scratched';

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

  // One fixed-height line for every task, whatever it carries: checkbox,
  // accent dot, title, then attribute chips in a fixed order (date → time →
  // steps → subtasks → blocked) and the star. Nothing is ever inserted before
  // the title, so titles line up across rows. Chips drop by priority via
  // container queries (row width, not viewport).
  const chip = 'inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs leading-none';
  const neutral = 'bg-[hsl(var(--on-surface)/0.06)]';
  const calendarIcon = (
    <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="3" width="12" height="11" rx="1.5" /><path d="M2 6h12M5 1.5v3M11 1.5v3" strokeLinecap="round" />
    </svg>
  );

  const row = (
      <div
        onClick={onClick}
        className={cn(
          '@container group cursor-pointer transition-[background-color,border-color] duration-200 ease-[cubic-bezier(0.2,0,0,1)] text-left',
          attached
            ? cn('bg-transparent hover:bg-[hsl(var(--on-surface)/0.04)]', !first && 'border-t border-[hsl(var(--background))] border-t-2')
            : 'hover:bg-[hsl(var(--on-surface)/0.03)]',
          dimmed && 'opacity-60',
        )}
      >
        <div className={cn('flex h-14 items-center gap-3', compact ? 'px-3' : 'px-3.5')}>
          {/* Completion checkbox — 24px visual, padded to a comfortable target */}
          <motion.button
            onClick={handleToggleStatus}
            whileTap={{ transform: 'scale(0.97)' }}
            transition={{ type: 'spring', stiffness: 500, damping: 24 }}
            className="shrink-0 -m-2 p-2 flex items-center justify-center"
            title={task.status === 'done' ? 'Mark incomplete' : 'Complete'}
          >
            {/* M3 Expressive shape morph: soft square while open, full
                circle once done — the state change reads in silhouette. */}
            <motion.span
              initial={false}
              animate={{ borderRadius: task.status === 'done' ? '50%' : '32%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 26 }}
              className={`size-7 border-2 flex items-center justify-center transition-colors
				${task.status === 'done'
				  ? 'border-primary bg-primary text-primary-foreground'
				  : task.status === 'blocked'
				    ? 'border-destructive/70 bg-[hsl(var(--error-container))]'
				    : 'border-[hsl(var(--outline))] group-hover:border-primary'}`}
            >
              <AnimatePresence>
                {task.status === 'done' && (
                  <motion.svg
                    viewBox="0 0 12 12"
                    className="size-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    initial={{ transform: 'scale(0.95)', opacity: 0 }}
                    animate={{ transform: 'scale(1)', opacity: 1 }}
                    exit={{ transform: 'scale(0.95)', opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 22 }}
                  >
                    <path d="M2 6.5L5 9L10 3" strokeLinecap="round" strokeLinejoin="round" />
                  </motion.svg>
                )}
              </AnimatePresence>
            </motion.span>
          </motion.button>

          <div className="flex flex-1 min-w-0 items-center gap-2.5">
            <span className={cn('size-2.5 rounded-full shrink-0', !task.color && PRIORITY_COLORS[task.priority])} style={task.color ? { backgroundColor: task.color } : undefined} />
            <span className={cn('flex-1 min-w-0 truncate font-medium text-[0.9375rem] leading-snug', dimmed && 'line-through')}>
              {task.title}
            </span>

            <div className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
              {task.tags && task.tags.length > 0 && (
                <span className="hidden @2xl:inline-flex items-center gap-1">
                  {task.tags.slice(0, 2).map((tag) => <TagPill key={tag} tag={tag} />)}
                  {task.tags.length > 2 && <span className="text-xs">+{task.tags.length - 2}</span>}
                </span>
              )}
              {Boolean(task.description?.trim()) && (
                <StickyNote className="hidden @md:block size-3.5 shrink-0" aria-label="Has note" />
              )}
              {/* Subtask hint — only when shown as a flat row (smart/missed/all
                  views), so a child task doesn't read as a top-level one. */}
              {depth === 0 && task.parent_task_id != null && !attached && (
                <span className={cn(chip, neutral, 'hidden @sm:inline-flex')} title="This is a subtask">
                  <CornerDownRight className="size-3" /><span className="hidden @xl:inline">subtask</span>
                </span>
              )}
              {task.status === 'scratched' && <span className={cn(chip, 'bg-[hsl(var(--on-surface)/0.08)]')}>scratched</span>}
              {task.due_date ? (
                <span
                  className={cn(chip, 'hidden @xs:inline-flex', overdue
                    ? 'bg-[hsl(var(--error-container))] text-[hsl(var(--on-error-container))]'
                    : neutral)}
                  title={overdue ? 'Overdue' : 'Day task'}
                >
                  {calendarIcon} {format(parseISO(task.due_date), 'MMM d')}
                </span>
              ) : task.week_of ? (
                <span className={cn(chip, neutral, 'hidden @xs:inline-flex')} title="Week task">
                  {calendarIcon} Wk {format(parseISO(task.week_of), 'MMM d')}
                </span>
              ) : task.month_of ? (
                <span className={cn(chip, neutral, 'hidden @xs:inline-flex')} title="Month goal">
                  {calendarIcon} {format(parseISO(task.month_of), 'MMMM')}
                </span>
              ) : null}
              {task.scheduled_at && (
                <span
                  className={cn(chip, 'hidden @sm:inline-flex', task.remind
                    ? 'bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))]'
                    : 'bg-[hsl(var(--tertiary-container))] text-[hsl(var(--on-tertiary-container))]')}
                  title={task.remind ? 'Reminder set' : 'Scheduled'}
                >
                  {task.remind ? <Bell className="size-2.5 fill-current" /> : <Clock className="size-2.5" />}
                  {format(parseISO(task.scheduled_at), 'h:mm a')}
                </span>
              )}
              {totalSteps > 0 && (
                <span className={cn(chip, neutral, 'hidden @sm:inline-flex')} title="Steps">
                  <ListChecks className="size-3" />
                  <span className="tabular-nums">{completedSteps}/{totalSteps}</span>
                </span>
              )}
              {hasSubtasks && (
                <button
                  type="button"
                  onClick={toggleExpand}
                  onPointerEnter={() => { void prefetchSubtasks(task.id); }}
                  onFocus={() => { void prefetchSubtasks(task.id); }}
                  aria-expanded={expanded}
                  aria-label={expanded ? 'Hide subtasks' : `View ${task.subtask_count ?? 0} subtasks`}
                  title={expanded ? 'Hide subtasks' : 'View subtasks'}
                  className={cn(chip, 'relative bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))] hover:brightness-[0.97] before:absolute before:-inset-2 before:content-[""]')}
                >
                  <span className="tabular-nums">{task.subtasks_done ?? 0}/{task.subtask_count ?? 0}</span>
                  <ChevronRight className={cn('size-3.5 transition-transform', expanded && 'rotate-90')} strokeWidth={2.5} />
                </button>
              )}
              {task.status === 'blocked' && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (task.blocked_by_task_id) {
                      window.dispatchEvent(new CustomEvent('task:open', { detail: { id: task.blocked_by_task_id } }));
                    }
                  }}
                  className={cn(chip, 'min-w-0 bg-[hsl(var(--error-container))] text-[hsl(var(--on-error-container))]')}
                  title={task.blocked_by_task_title ? `Blocked by ${task.blocked_by_task_title}` : 'Blocked'}
                >
                  <GitBranch className="size-3 shrink-0" />
                  <span className="@lg:hidden">Blocked</span>
                  <span className="hidden @lg:inline truncate max-w-40">Blocked by {task.blocked_by_task_title || 'another task'}</span>
                </button>
              )}
            </div>
          </div>

          <button
            onClick={handleToggleStar}
            className={`-m-1.5 p-1.5 rounded-full opacity-60 hover:opacity-100 hover:bg-[hsl(var(--surface-container-high))] transition-[background-color,color,opacity] shrink-0 ${task.important ? 'text-[hsl(var(--tertiary))] opacity-100' : ''}`}
            title={task.important ? 'Remove from Important' : 'Mark important'}
          >
            <Star className={`size-[18px] ${task.important ? 'fill-current' : ''}`} />
          </button>
        </div>
      </div>
  );

  const children = (
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, transform: 'translateY(-4px)' }}
            animate={{ opacity: 1, transform: 'translateY(0)' }}
            exit={{ opacity: 0, transform: 'translateY(-4px)' }}
            transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
            className="overflow-hidden flex flex-col border-t border-border/50 bg-[hsl(var(--surface-container-low))] pl-6"
          >
            {loadingSubs && (
              <div className="text-sm text-muted-foreground flex items-center gap-2.5 px-3 py-3">
                <M3CookieLoader size="sm" tone="secondary" /> Loading…
              </div>
            )}

            {subs && subs.length === 0 && !addingSub && (
              <div className="text-sm text-muted-foreground italic px-3 py-3">No subtasks yet. Break this down.</div>
            )}

            {subs?.map((sub, idx) => (
              <TaskRow
                key={sub.id}
                task={sub}
                onClick={() => window.dispatchEvent(new CustomEvent('task:open', { detail: { id: sub.id } }))}
                compact
                attached
                first={idx === 0}
              />
            ))}

            {addingSub ? (
              <div className="px-3 py-2.5 border-t border-border/50">
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
                className="inline-flex min-h-11 w-full items-center gap-1.5 border-t border-border/50 px-3.5 py-2.5 text-left text-sm font-medium text-[hsl(var(--on-secondary-container))] transition-colors hover:bg-[hsl(var(--on-surface)/0.04)]"
              >
                <Plus className="size-4" strokeWidth={2.5} /> Add subtask
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
  );

  // Attached children render bare inside their parent's card; every top-level
  // task gets the same card, with or without subtasks.
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, transform: 'translateY(-2px)' }}
      animate={{ opacity: 1, transform: 'translateY(0)' }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={{ duration: 0.16, ease: [0.22, 0.61, 0.36, 1] }}
      style={!attached && depth > 0 ? { marginLeft: depth * 24 } : undefined}
    >
      {attached ? (
        <>
          {row}
          {children}
        </>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-card">
          {row}
          {children}
        </div>
      )}
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
          <div className="flex-1 min-w-0">
            <WavyProgress
              value={(doneCount / steps.length) * 100}
              height={10}
              active={doneCount > 0 && doneCount < steps.length}
              label="Steps"
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
            initial={{ opacity: 0, transform: 'translateY(-2px)' }}
            animate={{ opacity: 1, transform: 'translateY(0)' }}
            exit={{ opacity: 0, transform: 'translateY(-2px)' }}
            transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
            className="group flex items-center gap-2.5 rounded-xl px-2.5 py-1 hover:bg-[hsl(var(--surface-container-high))] transition-colors"
          >
            <motion.button
              type="button"
              whileTap={{ transform: 'scale(0.97)' }}
              transition={{ type: 'spring', stiffness: 500, damping: 24 }}
              onClick={() => update(s.id, { done: !s.done })}
              className={`size-[18px] rounded-md border-2 flex items-center justify-center shrink-0 transition-colors
                ${s.done ? 'border-primary bg-primary text-primary-foreground' : 'border-[hsl(var(--outline))] hover:border-primary'}`}
              aria-pressed={s.done}
            >
              <AnimatePresence>
                {s.done && (
                  <motion.span
                    initial={{ transform: 'scale(0.95)', opacity: 0 }}
                    animate={{ transform: 'scale(1)', opacity: 1 }}
                    exit={{ transform: 'scale(0.95)', opacity: 0 }}
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
              className="opacity-0 group-hover:opacity-100 size-6 rounded-full inline-flex items-center justify-center text-muted-foreground hover:bg-[hsl(var(--on-surface)/0.08)] hover:text-foreground transition-[background-color,color,opacity] shrink-0"
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
