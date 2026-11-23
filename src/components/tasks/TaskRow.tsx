import { useState } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { addDays, format, parseISO, isPast, isToday } from 'date-fns';
import {
  Star,
  ChevronDown,
  Plus,
  ListChecks,
  Clock,
  Bell,
  Check,
  X,
  CornerDownRight,
  GitBranch,
  StickyNote,
  Repeat,
  CalendarClock,
} from '@/components/ui/icons';
import { repeatLabel, repeats } from './RepeatPicker';
import { M3CookieLoader } from '@/components/ui/shapes';

import type { Task, TaskStep } from '@/types';
import TagPill from '@/components/TagPill';
import { Input } from '@/components/ui/input';
import {
  useToggleTaskStatus,
  useToggleTaskImportant,
  useRescheduleTask,
  useUpdateTask,
  useCreateTask,
  useSubtasks,
  usePrefetchSubtasks,
} from '@/queries/tasks';
import { TaskRing } from './TaskRing';
import { FinishOverlay, useFinishTask } from './finish';
import { cn } from '@/lib/utils';
import { WavyProgress } from '@/components/ui/wavy-progress';

interface Props {
  task: Task;
  onClick: () => void;
  depth?: number;
  compact?: boolean;
  attached?: boolean;
  /** Show "In progress" (the list isn't grouped by Status). */
  showStatus?: boolean;
  first?: boolean;
}

// TaskRow renders one task with an inline status checkbox, star, a
// right-aligned "add subtask" action, and a count chip that expands the
// nested children. Children are list-embedded (prefetched) so expand is
// instant; we lazy-fetch only as a fallback. Clicking the body opens the
// detail dialog (via onClick).
export default function TaskRow({
  task,
  onClick,
  depth = 0,
  compact = false,
  attached = false,
  first = false,
  showStatus = false,
}: Props) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [addingSub, setAddingSub] = useState(false);
  const [subDraft, setSubDraft] = useState('');

  const toggleStatus = useToggleTaskStatus();
  const toggleImportant = useToggleTaskImportant();
  const createTask = useCreateTask();
  const prefetchSubtasks = usePrefetchSubtasks();

  // Children come embedded in the list response, which every task mutation
  // refetches, so expanding shows the current set at once. A separately cached
  // /subtasks copy could be older and flash the previous items first; it is
  // only fetched for rows that arrive without embedded children.
  const embedded = task.subtasks;
  const { data: fetched, isLoading: loadingFetched } = useSubtasks(task.id, expanded && !embedded);
  const subs = embedded ?? fetched;
  const loadingSubs = !embedded && loadingFetched;

  const overdue =
    task.due_date &&
    task.status !== 'done' &&
    (() => {
      const d = parseISO(task.due_date);
      return !isToday(d) && isPast(d);
    })();

  const doneSteps = task.steps?.filter((s) => s.done).length ?? 0;
  const totalSteps = task.steps?.length ?? 0;
  const hasSubtasks = (task.subtask_count ?? 0) > 0;
  // Deleting the last subtask takes the toggle with it; fold the group too,
  // or its "Add subtask" row is left open with nothing to close it.
  if (expanded && !hasSubtasks) {
    setExpanded(false);
    setAddingSub(false);
  }
  const dimmed = task.status === 'done' || task.status === 'scratched';
  const showParent = depth === 0 && !attached && task.parent_task_id != null;

  const handleToggleStatus = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleStatus.mutate({ id: task.id, status: task.status === 'done' ? 'todo' : 'done' });
  };

  // Done and Tomorrow, the phone's two swipes as buttons: they show while
  // the pointer is over the row (or it has focus; D and T from the keyboard).
  // Done plays its moment first: the sage wave drifts across the row with a
  // white "Done" for a beat, then it files under Done with Undo.
  const reschedule = useRescheduleTask();
  const updateTask = useUpdateTask();
  const { open, finishing, finish } = useFinishTask(task);
  const tomorrow = (e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    if (!open) return;
    const prevDue = task.due_date;
    reschedule.mutate(
      { id: task.id, date: format(addDays(new Date(), 1), 'yyyy-MM-dd') },
      {
        onSuccess: () =>
          toast(`Tomorrow: ${task.title}`, {
            action: {
              label: 'Undo',
              onClick: () =>
                prevDue
                  ? reschedule.mutate({ id: task.id, date: prevDue })
                  : updateTask.mutate({ id: task.id, data: { clear_due: true, clear_scheduled: true } }),
            },
          }),
      },
    );
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
    if (!title) {
      setAddingSub(false);
      setSubDraft('');
      return;
    }
    setSubDraft('');
    setAddingSub(false);
    await createTask.mutateAsync({
      title,
      parent_task_id: task.id,
      list_id: task.list_id ?? null,
    });
  };

  // One fixed-height line for every task, whatever it carries: checkbox
  // (tinted by priority), title, then attribute chips in a fixed order (date → time →
  // steps → subtasks → blocked) and the star. Nothing is ever inserted before
  // the title, so titles line up across rows. Chips drop by priority via
  // container queries (row width, not viewport).
  const chip = 'inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs leading-none';
  const neutral = 'bg-[hsl(var(--on-surface)/0.06)]';
  const calendarIcon = (
    <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="3" width="12" height="11" rx="1.5" />
      <path d="M2 6h12M5 1.5v3M11 1.5v3" strokeLinecap="round" />
    </svg>
  );

  const row = (
    <div
      onClick={onClick}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter') onClick();
        else if (e.key === 'd' || e.key === 'D') finish(e);
        else if (e.key === 't' || e.key === 'T') tomorrow(e);
      }}
      className={cn(
        'group @container cursor-pointer text-left transition-[background-color,border-color] duration-200 ease-[cubic-bezier(0.2,0,0,1)] outline-none focus-visible:shadow-[inset_0_0_0_2px_hsl(var(--primary))]',
        attached
          ? cn(
              'bg-transparent hover:bg-[hsl(var(--on-surface)/0.04)]',
              !first && 'border-t border-t-2 border-[hsl(var(--background))]',
            )
          : 'hover:bg-[hsl(var(--on-surface)/0.03)]',
        dimmed && 'opacity-60',
      )}
    >
      <div className={cn('relative flex h-14 items-center gap-3', compact ? 'px-3' : 'px-3.5')}>
        {/* Done checkbox — 24px visual, padded to a comfortable target */}
        <motion.button
          onClick={handleToggleStatus}
          whileTap={{ scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 500, damping: 24 }}
          className="-m-2 flex shrink-0 items-center justify-center p-2"
          title={task.status === 'done' ? 'Mark not done' : 'Mark done'}
        >
          <TaskRing status={task.status} priority={task.priority} color={task.color} size={26} />
        </motion.button>

        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-[0.9375rem] leading-snug font-medium',
              dimmed && 'line-through',
            )}
          >
            {task.title}
          </span>

          <div className="flex min-w-0 shrink items-center gap-1.5 text-muted-foreground">
            {/* A subtask listed flat (smart lists, Missed, All) names its
                  parent in the first chip, so the title keeps its line;
                  tapping it opens the parent. */}
            {showParent && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  window.dispatchEvent(new CustomEvent('task:open', { detail: { id: task.parent_task_id } }));
                }}
                title={`Subtask of ${task.parent_task_title || 'another task'}`}
                className={cn(chip, neutral, 'max-w-40 min-w-0 shrink hover:text-foreground')}
              >
                <CornerDownRight className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{task.parent_task_title || 'Subtask'}</span>
              </button>
            )}
            {/* A planned task names its Journal plan; tapping opens that
                  day in Journal, where the plan lists it. */}
            {task.plan_id != null && task.plan_name && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(task.due_date ? `/journal?date=${task.due_date}` : '/journal');
                }}
                title={`Planned for ${task.plan_name}`}
                className={cn(chip, neutral, 'max-w-40 min-w-0 shrink hover:text-foreground')}
              >
                <CalendarClock className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{task.plan_name}</span>
              </button>
            )}
            {repeats(task.recurrence) && (
              <span
                title={`Repeats ${repeatLabel(task.recurrence).toLowerCase()}`}
                className={cn(chip, neutral, 'max-w-36 min-w-0 shrink')}
              >
                <Repeat className="size-3 shrink-0" aria-hidden />
                <span className="hidden truncate @md:inline">{repeatLabel(task.recurrence)}</span>
              </span>
            )}
            {task.tags && task.tags.length > 0 && (
              <span className="hidden items-center gap-1 @2xl:inline-flex">
                {task.tags.slice(0, 2).map((tag) => (
                  <TagPill key={tag} tag={tag} />
                ))}
                {task.tags.length > 2 && <span className="text-xs">+{task.tags.length - 2}</span>}
              </span>
            )}
            {Boolean(task.description?.trim()) && (
              <StickyNote className="hidden size-3.5 shrink-0 @md:block" aria-label="Has note" />
            )}
            {task.status === 'scratched' && (
              <span className={cn(chip, 'bg-[hsl(var(--on-surface)/0.08)]')}>scratched</span>
            )}
            {task.due_date ? (
              <span
                className={cn(
                  chip,
                  'hidden @xs:inline-flex',
                  overdue ? 'bg-[hsl(var(--error-container))] text-[hsl(var(--on-error-container))]' : neutral,
                )}
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
                className={cn(
                  chip,
                  'hidden @sm:inline-flex',
                  task.remind
                    ? 'bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))]'
                    : 'bg-[hsl(var(--tertiary-container))] text-[hsl(var(--on-tertiary-container))]',
                )}
                title={task.remind ? 'Reminder set' : 'Scheduled'}
              >
                {task.remind ? <Bell className="size-2.5 fill-current" /> : <Clock className="size-2.5" />}
                {format(parseISO(task.scheduled_at), 'h:mm a')}
              </span>
            )}
            {totalSteps > 0 && (
              <span className={cn(chip, neutral, 'hidden @sm:inline-flex')} title="Steps">
                <ListChecks className="size-3" />
                <span className="tabular-nums">
                  {doneSteps}/{totalSteps}
                </span>
              </span>
            )}
            {hasSubtasks && (
              <button
                type="button"
                onClick={toggleExpand}
                onPointerEnter={() => {
                  if (!embedded) void prefetchSubtasks(task.id);
                }}
                onFocus={() => {
                  if (!embedded) void prefetchSubtasks(task.id);
                }}
                aria-expanded={expanded}
                aria-label={expanded ? 'Hide subtasks' : `View ${task.subtask_count ?? 0} subtasks`}
                title={expanded ? 'Hide subtasks' : 'View subtasks'}
                // Taller than the info chips because it's the row's one
                // control; the hit area grows to the row's full height.
                className={cn(
                  'relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full pr-1.5 pl-2 text-xs leading-none font-medium transition-colors',
                  'before:absolute before:-inset-x-1 before:-inset-y-3 before:content-[""]',
                  expanded
                    ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]'
                    : 'bg-[hsl(var(--on-surface)/0.06)] text-foreground/80 hover:bg-[hsl(var(--secondary-container))] hover:text-[hsl(var(--on-secondary-container))]',
                )}
              >
                <SubtaskRing done={task.subtasks_done ?? 0} total={task.subtask_count ?? 0} />
                <span className="tabular-nums">
                  {task.subtasks_done ?? 0}/{task.subtask_count ?? 0}
                </span>
                <ChevronDown className={cn('size-4 transition-transform duration-200', expanded && 'rotate-180')} />
              </button>
            )}
            {showStatus && task.status === 'in_progress' && (
              <span className={cn(chip, 'bg-[var(--task-prog-c)] text-[hsl(var(--on-primary-container))]')}>
                In progress
              </span>
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
                className={cn(chip, 'min-w-0 bg-[var(--task-sand-c)] text-[var(--task-sand-on)]')}
                title={task.blocked_by_task_title ? `Blocked by ${task.blocked_by_task_title}` : 'Blocked'}
              >
                <GitBranch className="size-3 shrink-0" />
                <span className="@lg:hidden">Blocked</span>
                <span className="hidden max-w-40 truncate @lg:inline">
                  Blocked by {task.blocked_by_task_title || 'another task'}
                </span>
              </button>
            )}
          </div>
        </div>

        {open && !finishing && (
          <div
            className="pointer-events-none absolute inset-y-0 right-11 flex items-center gap-1.5 pl-10 opacity-0 transition-opacity duration-150 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
            style={{ background: 'linear-gradient(to right, transparent, hsl(var(--card)) 2.25rem)' }}
          >
            <button
              type="button"
              tabIndex={-1}
              onClick={tomorrow}
              title="Move to tomorrow (T)"
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[hsl(var(--surface-container-high))] px-3 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              <Clock className="size-3.5" /> Tomorrow
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={finish}
              title="Mark done (D)"
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--task-sage-c)] px-3 text-xs font-semibold text-[var(--task-sage-on)] transition-[filter] hover:brightness-110"
            >
              <Check className="size-3.5" strokeWidth={3} /> Done
            </button>
          </div>
        )}
        <FinishOverlay show={finishing} title={task.title} />
        <button
          onClick={handleToggleStar}
          className={`-m-1.5 shrink-0 rounded-full p-1.5 opacity-60 transition-[background-color,color,opacity] hover:bg-[hsl(var(--surface-container-high))] hover:opacity-100 ${task.important ? 'text-[hsl(var(--tertiary))] opacity-100' : ''}`}
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
          className="flex flex-col overflow-hidden border-t border-border/50 bg-[hsl(var(--surface-container-low))] pl-6"
        >
          {loadingSubs && (
            <div className="flex items-center gap-2.5 px-3 py-3 text-sm text-muted-foreground">
              <M3CookieLoader size="sm" tone="secondary" /> Loading…
            </div>
          )}

          {subs && subs.length === 0 && !addingSub && (
            <div className="px-3 py-3 text-sm text-muted-foreground italic">No subtasks yet. Break this down.</div>
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
            <div className="border-t border-border/50 px-3 py-2.5">
              <Input
                name={`subtask-${task.id}`}
                autoFocus
                placeholder="New subtask"
                value={subDraft}
                onChange={(e) => setSubDraft(e.target.value)}
                onBlur={addSubtask}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addSubtask();
                  if (e.key === 'Escape') {
                    setAddingSub(false);
                    setSubDraft('');
                  }
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
  steps,
  onChange,
  onCommit,
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
          <div className="min-w-0 flex-1">
            <WavyProgress
              value={(doneCount / steps.length) * 100}
              height={10}
              active={doneCount > 0 && doneCount < steps.length}
              label="Steps"
            />
          </div>
          <span className="mono shrink-0 text-xs text-muted-foreground tabular-nums">
            {doneCount}/{steps.length}
          </span>
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
            className="group flex items-center gap-2.5 rounded-xl px-2.5 py-1 transition-colors hover:bg-[hsl(var(--surface-container-high))]"
          >
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 500, damping: 24 }}
              onClick={() => update(s.id, { done: !s.done })}
              className={`flex size-[18px] shrink-0 items-center justify-center rounded-md border-2 transition-colors ${s.done ? 'border-primary bg-primary text-primary-foreground' : 'border-[hsl(var(--outline))] hover:border-primary'}`}
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
              className={`h-7 flex-1 border-0 bg-transparent px-1 py-0 text-sm shadow-none outline-none focus-visible:border-0 focus-visible:shadow-none ${s.done ? 'text-muted-foreground line-through' : ''}`}
            />
            <button
              type="button"
              onClick={() => remove(s.id)}
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-[background-color,color,opacity] group-hover:opacity-100 hover:bg-[hsl(var(--on-surface)/0.08)] hover:text-foreground"
              title="Remove step"
            >
              <X className="size-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
      <div className="flex items-center gap-2.5 rounded-xl px-2.5 py-1">
        <span className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-md border-2 border-dashed border-[hsl(var(--outline)/0.6)] text-muted-foreground/60">
          <Plus className="size-3" strokeWidth={2.5} />
        </span>
        <Input
          name="new-step"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add a step"
          className="h-7 flex-1 border-0 bg-transparent px-1 py-0 text-sm shadow-none outline-none placeholder:text-muted-foreground/50 focus-visible:border-0 focus-visible:shadow-none"
        />
        {draft && (
          <button
            type="button"
            onClick={add}
            className="shrink-0 rounded-full bg-[hsl(var(--secondary-container))] px-3 py-1 text-xs font-medium text-[hsl(var(--on-secondary-container))] transition-opacity hover:opacity-90"
          >
            Add
          </button>
        )}
      </div>
    </div>
  );
}

// Small progress ring for the subtask chip: a track plus an arc for the
// share done, so progress reads before the numbers do.
function SubtaskRing({ done, total }: { done: number; total: number }) {
  const r = 5.5;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? Math.min(done / total, 1) : 0;
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0 -rotate-90" aria-hidden>
      <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeOpacity={0.22} strokeWidth="2.5" />
      {frac > 0 && (
        <circle
          cx="8"
          cy="8"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${c * frac} ${c}`}
        />
      )}
    </svg>
  );
}
