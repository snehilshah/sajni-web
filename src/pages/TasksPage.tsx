import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDays, format, startOfWeek } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Loader2, LayoutGrid, ListChecks, ChevronDown,
} from '@/components/ui/icons';
import { useIsMobile } from '@/hooks/use-mobile';

import type { Task } from '@/types';
import {
  useTasks, useTaskLists, useMissedTasks,
  useCreateTask, useToggleTaskStatus, useToggleTaskImportant,
  useCreateTaskList, useUpdateTaskList, useDeleteTaskList,
  type TaskListParams,
} from '@/queries/tasks';
import { qk } from '@/queries/keys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

import PillScroller from '@/components/tasks/PillScroller';
import TaskRow from '@/components/tasks/TaskRow';
import type { TaskDefaults } from '@/components/tasks/TaskFormDialog';
// Lazy: keeps tiptap (RichEditor inside the dialog) out of this route chunk.
const TaskFormDialog = lazy(() => import('@/components/tasks/TaskFormDialog'));
import MissedBanner from '@/components/tasks/MissedBanner';
import {
  STATUSES, STATUS_LABELS, PRIORITY_COLORS, type Selection, weekMondayKey, monthFirstKey,
} from '@/components/tasks/helpers';
import { useNavChrome } from '@/components/nav-chrome';
import PageShell from '@/components/PageShell';
import { SplitButton } from '@/components/ui/split-button';

type ViewMode = 'list' | 'board';

const VIEW_KEY = 'sajni:tasks:view';

export default function TasksPage() {
  const qc = useQueryClient();
  const [selection, setSelection] = useState<Selection>({ kind: 'smart', smart: 'my_day' });
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      return (localStorage.getItem(VIEW_KEY) as ViewMode) || 'list';
    } catch { return 'list'; }
  });

  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formDefaults, setFormDefaults] = useState<TaskDefaults>({});
  const [taskFormLayoutId, setTaskFormLayoutId] = useState<string | undefined>();

  const [quickTitle, setQuickTitle] = useState('');

  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, viewMode); } catch {}
  }, [viewMode]);

  // Selection -> list query params. Smart filters carry a `smart` key; a user
  // list filters by id and only shows top-level tasks.
  const params: TaskListParams = useMemo(() => (
    selection.kind === 'smart'
      ? { smart: selection.smart }
      : { list: selection.id, parent: 'null' }
  ), [selection]);

  const { data: lists = [] } = useTaskLists();
  const { data: tasksList = [], isLoading: loading } = useTasks(params);
  const { data: missed = [] } = useMissedTasks();
  const { data: blockedTasks = [] } = useTasks({ smart: 'blocked' });
  const missedCount = missed.length;

  const createTask = useCreateTask();
  const moveStatus = useToggleTaskStatus();
  const toggleImportant = useToggleTaskImportant();
  const createList = useCreateTaskList();
  const updateList = useUpdateTaskList();
  const deleteList = useDeleteTaskList();

  // The task dialog saves through paths that don't carry our hooks; invalidating
  // the roots refreshes every mounted task view. (The missed banner is fully
  // react-query now and self-invalidates — it needs no callback.)
  const refreshTasks = () => {
    qc.invalidateQueries({ queryKey: qk.tasks.all });
    qc.invalidateQueries({ queryKey: qk.taskLists.all });
  };

  // Deep-link support: /tasks?focus=<id> opens that task's edit dialog
  // once it appears in the loaded list. Default smart filter is "my_day"
  // so Today-page links always resolve; other filters may not include it.
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = searchParams.get('focus');
  const focusHandled = useRef<string | null>(null);
  useEffect(() => {
    if (!focusId || focusHandled.current === focusId) return;
    const inList = tasksList.find((x) => String(x.id) === focusId);
    if (inList) {
      focusHandled.current = focusId;
      setEditingTask(inList);
      setShowForm(true);
      searchParams.delete('focus');
      setSearchParams(searchParams, { replace: true });
    }
  }, [focusId, tasksList, searchParams, setSearchParams]);

  const grouped = useMemo(() => {
    const map: Record<Task['status'], Task[]> = { todo: [], in_progress: [], blocked: [], done: [], scratched: [] };
    for (const t of tasksList) map[t.status]?.push(t);
    return map;
  }, [tasksList]);

  // Scratched (abandoned) tasks are neither open nor completed — their own
  // collapsible group, so the open list stays clean.
  const open = tasksList.filter((t) => t.status !== 'done' && t.status !== 'scratched');
  const completed = tasksList.filter((t) => t.status === 'done');
  const scratched = tasksList.filter((t) => t.status === 'scratched');

  const [showCompleted, setShowCompleted] = useState(false);

  const { scrolled: chromeScrolled } = useNavChrome();
  const currentTaskFormLayoutId = `task-form-${chromeScrolled ? 'merged' : 'rest'}`;

  const openCreate = (overrides: TaskDefaults = {}) => {
    setEditingTask(null);
    setTaskFormLayoutId(currentTaskFormLayoutId);
    setFormDefaults({
      list_id: selection.kind === 'list' ? selection.id : null,
      ...(selection.kind === 'smart' && selection.smart === 'my_day'
        ? { due_date: new Date().toLocaleDateString('en-CA') }
        : {}),
      ...(selection.kind === 'smart' && selection.smart === 'week'
        ? { due_type: 'week', week_of: weekMondayKey() }
        : {}),
      ...(selection.kind === 'smart' && selection.smart === 'month'
        ? { due_type: 'month', month_of: monthFirstKey() }
        : {}),
      ...(selection.kind === 'smart' && selection.smart === 'important'
        ? { important: true }
        : {}),
      ...(selection.kind === 'smart' && selection.smart === 'blocked'
        ? { status: 'blocked' as const }
        : {}),
      ...overrides,
    });
    setShowForm(true);
  };

  const openEdit = (task: Task) => {
    setEditingTask(task);
    setTaskFormLayoutId(undefined);
    setShowForm(true);
  };

  const handleQuickAdd = async () => {
    const title = quickTitle.trim();
    if (!title) return;
    if (selection.kind === 'smart' && selection.smart === 'blocked') {
      setQuickTitle('');
      openCreate({ title, status: 'blocked' });
      return;
    }
    const overrides: Parameters<typeof createTask.mutateAsync>[0] = { title };
    if (selection.kind === 'list') overrides.list_id = selection.id;
    if (selection.kind === 'smart' && selection.smart === 'my_day') {
      overrides.due_date = new Date().toLocaleDateString('en-CA');
    }
    if (selection.kind === 'smart' && selection.smart === 'week') {
      overrides.week_of = weekMondayKey();
    }
    if (selection.kind === 'smart' && selection.smart === 'month') {
      overrides.month_of = monthFirstKey();
    }
    if (selection.kind === 'smart' && selection.smart === 'important') {
      overrides.important = true;
    }
    setQuickTitle('');
    await createTask.mutateAsync(overrides);
  };

  // Reactive mobile detection — kanban board is forced to list on phone.
  const isMobile = useIsMobile();
  const effectiveView = isMobile ? 'list' : viewMode;

  return (
    <PageShell
      title="Tasks"
      actions={
        !isMobile ? (
          <div className="inline-flex items-center gap-2">
            <SplitButton
              size="sm"
              value={viewMode}
              options={[
                { value: 'list',  label: 'List',  icon: ListChecks },
                { value: 'board', label: 'Board', icon: LayoutGrid },
              ]}
              onChange={(v) => setViewMode(v as ViewMode)}
              onPrimary={() => setViewMode(viewMode === 'list' ? 'board' : 'list')}
            />
            {/* Same visual source, state-specific layoutId: the page chrome can
                morph rest↔merged without this CTA doing a delayed shared jump. */}
            {showForm && !editingTask ? (
              <span className="inline-flex rounded-full">
                <Button onClick={() => openCreate()} size="sm" className="gap-1.5">
                  <Plus className="size-3.5" /> New task
                </Button>
              </span>
            ) : (
              <motion.span layoutId={taskFormLayoutId ?? currentTaskFormLayoutId} className="inline-flex rounded-full">
                <Button onClick={() => openCreate()} size="sm" className="gap-1.5">
                  <Plus className="size-3.5" /> New task
                </Button>
              </motion.span>
            )}
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3.5">
        {/* Smart + user list pills — single swipeable row. */}
        <PillScroller
          lists={lists}
          selection={selection}
          smartCounts={{ missed: missedCount, blocked: blockedTasks.length }}
          onSelect={setSelection}
          onCreate={async (name) => { await createList.mutateAsync({ name }); }}
          onRename={async (id, name) => { await updateList.mutateAsync({ id, data: { name } }); }}
          onDelete={async (id) => {
            await deleteList.mutateAsync(id);
            if (selection.kind === 'list' && selection.id === id) {
              setSelection({ kind: 'smart', smart: 'all' });
            }
          }}
        />

        {/* Missed-tasks highlight + reschedule CTA. Hidden while actually
            viewing the Missed list (would be redundant). Self-hides when empty. */}
        {!(selection.kind === 'smart' && selection.smart === 'missed') && (
          <MissedBanner />
        )}

        {/* Inline quick-add — desktop only. Mobile uses the FAB → full sheet. */}
        {!isMobile && (
          <div className="rounded-xl border border-border bg-card/60 px-3.5 flex items-center gap-2.5 h-11">
            <Plus className="size-4 text-muted-foreground shrink-0" />
            <Input
              name="quick-task-title"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleQuickAdd();
              }}
              placeholder="Add a task. Press ↵."
              className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:border-0 px-2 text-sm"
            />
            {quickTitle.trim() && (
              <Button size="sm" className="h-7 px-3 text-xs" onClick={handleQuickAdd}>
                Add
              </Button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="min-h-0">
          {loading ? (
            <div className="flex flex-col gap-2">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </div>
          ) : effectiveView === 'list' ? (
            <ListView
              open={open}
              completed={completed}
              scratched={scratched}
              showCompleted={showCompleted}
              onToggleCompleted={() => setShowCompleted((v) => !v)}
              onClick={openEdit}
            />
          ) : (
            <BoardView
              grouped={grouped}
              onClick={openEdit}
              onMove={(id, status) => {
                const t = tasksList.find((x) => x.id === id);
                if (!t || t.status === status) return;
                if (status === 'blocked') {
                  setEditingTask({ ...t, status: 'blocked', blocked_by_task_id: null, blocked_by_task_title: null });
                  setShowForm(true);
                  return;
                }
                moveStatus.mutate({ id, status });
              }}
              onQuickAdd={async (status, title) => {
                if (status === 'blocked') {
                  openCreate({ status: 'blocked', title });
                  return;
                }
                const overrides: Parameters<typeof createTask.mutateAsync>[0] = { title, status };
                if (selection.kind === 'list') overrides.list_id = selection.id;
                await createTask.mutateAsync(overrides);
              }}
              onToggleImportant={(id, important) => toggleImportant.mutate({ id, important })}
            />
          )}
        </div>
      </div>

      <Suspense fallback={null}>
        <TaskFormDialog
          open={showForm}
          onOpenChange={setShowForm}
          editing={editingTask}
          defaults={formDefaults}
          lists={lists}
          onSaved={refreshTasks}
          layoutId={taskFormLayoutId}
          onCloseComplete={() => {
            if (!showForm) setTaskFormLayoutId(undefined);
          }}
        />
      </Suspense>

      {/* Mobile FAB — bottom-right, above the safe area. */}
      {isMobile && (
        <button
          type="button"
          aria-label="New task"
          onClick={() => openCreate()}
          className="md:hidden fixed right-4 z-40 size-14 inline-flex items-center justify-center rounded-2xl bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))] shadow-[var(--m3-elev-3)] active:translate-y-px"
          style={{
            bottom: 'calc(env(safe-area-inset-bottom) + 84px)',
          }}
        >
          <Plus className="size-6" />
        </button>
      )}
    </PageShell>
  );
}

// --- List view ---

// --- Due buckets (list view) ---
// Open tasks group into scannable horizons. Headers only show when more
// than one bucket has items — a single-horizon list (e.g. My Day) stays flat.
const BUCKETS = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'today',   label: 'Today' },
  { key: 'week',    label: 'This week' },
  { key: 'later',   label: 'Later' },
  { key: 'someday', label: 'No date' },
] as const;
type BucketKey = (typeof BUCKETS)[number]['key'];

function bucketOf(t: Task, todayKey: string, weekEndKey: string): BucketKey {
  if (t.due_date) {
    if (t.due_date < todayKey) return 'overdue';
    if (t.due_date === todayKey) return 'today';
    if (t.due_date <= weekEndKey) return 'week';
    return 'later';
  }
  if (t.week_of) return t.week_of <= todayKey ? 'week' : 'later';
  if (t.month_of) return 'later';
  return 'someday';
}

function BucketHeader({ label, count, overdue }: { label: string; count: number; overdue?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 pt-1.5">
      <span className={`mono text-xs uppercase tracking-[0.18em] ${overdue ? 'text-destructive' : 'text-muted-foreground'}`}>
        {label}
      </span>
      <span className="mono text-xs tabular-nums text-muted-foreground/70">{count}</span>
      <span className="flex-1 h-px bg-[hsl(var(--outline-variant))]" aria-hidden="true" />
    </div>
  );
}

function ListView({
  open, completed, scratched, showCompleted, onToggleCompleted, onClick,
}: {
  open: Task[];
  completed: Task[];
  scratched: Task[];
  showCompleted: boolean;
  onToggleCompleted: () => void;
  onClick: (t: Task) => void;
}) {
  const [showScratched, setShowScratched] = useState(false);

  const bucketed = useMemo(() => {
    const todayKey = new Date().toLocaleDateString('en-CA');
    const weekEndKey = format(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 6), 'yyyy-MM-dd');
    const map: Record<BucketKey, Task[]> = { overdue: [], today: [], week: [], later: [], someday: [] };
    for (const t of open) map[bucketOf(t, todayKey, weekEndKey)].push(t);
    return map;
  }, [open]);
  const activeBuckets = BUCKETS.filter((b) => bucketed[b.key].length > 0);
  const showHeaders = activeBuckets.length > 1;

  if (open.length === 0 && completed.length === 0 && scratched.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
        <ListChecks className="size-9 mx-auto mb-3 opacity-30" />
        <div className="text-sm">Nothing here yet.</div>
        <div className="text-xs mt-1">Type a task above to get started.</div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {activeBuckets.map(({ key, label }) => (
        <div key={key} className="flex flex-col gap-2">
          {showHeaders && (
            <BucketHeader label={label} count={bucketed[key].length} overdue={key === 'overdue'} />
          )}
          <AnimatePresence initial={false}>
            {bucketed[key].map((t) => (
              <TaskRow key={t.id} task={t} onClick={() => onClick(t)} />
            ))}
          </AnimatePresence>
        </div>
      ))}

      {completed.length > 0 && (
        <div className="mt-4">
          <button
            onClick={onToggleCompleted}
            className="inline-flex items-center gap-1.5 h-9 px-2 -ml-2 rounded-full text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--on-surface)/0.08)] transition-colors"
          >
            <ChevronDown className={`size-3.5 transition-transform ${showCompleted ? '' : '-rotate-90'}`} />
            Completed ({completed.length})
          </button>
          {showCompleted && (
            <div className="flex flex-col gap-2 mt-2">
              {completed.map((t) => (
                <TaskRow key={t.id} task={t} onClick={() => onClick(t)} />
              ))}
            </div>
          )}
        </div>
      )}

      {scratched.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowScratched((v) => !v)}
            className="inline-flex items-center gap-1.5 h-9 px-2 -ml-2 rounded-full text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--on-surface)/0.08)] transition-colors"
          >
            <ChevronDown className={`size-3.5 transition-transform ${showScratched ? '' : '-rotate-90'}`} />
            Scratched ({scratched.length})
          </button>
          {showScratched && (
            <div className="flex flex-col gap-2 mt-2">
              {scratched.map((t) => (
                <TaskRow key={t.id} task={t} onClick={() => onClick(t)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Board view (kanban kept for users who prefer it) ---

function BoardView({
  grouped, onClick, onMove, onQuickAdd, onToggleImportant,
}: {
  grouped: Record<Task['status'], Task[]>;
  onClick: (t: Task) => void;
  onMove: (id: number, status: Task['status']) => void;
  onQuickAdd: (status: Task['status'], title: string) => Promise<void>;
  onToggleImportant: (id: number, important: boolean) => void;
}) {
  const [hover, setHover] = useState<Task['status'] | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [adding, setAdding] = useState<Task['status'] | null>(null);
  const [draft, setDraft] = useState('');

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {STATUSES.map((status) => (
        <div
          key={status}
          onDragOver={(e) => { e.preventDefault(); setHover(status); }}
          onDragLeave={() => setHover((c) => (c === status ? null : c))}
          onDrop={(e) => {
            e.preventDefault();
            setHover(null);
            const id = Number(e.dataTransfer.getData('text/task-id'));
            if (id) onMove(id, status);
          }}
          className={`flex flex-col rounded-xl border border-border bg-card/40 transition-colors ${hover === status ? 'border-primary/40 bg-primary/5' : ''}`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
            <div className="flex items-center gap-2">
              <span className={`size-2 rounded-full ${
                status === 'todo' ? 'bg-muted-foreground/40' :
                status === 'in_progress' ? 'bg-secondary' :
                status === 'blocked' ? 'bg-destructive' : 'bg-primary'
              }`} />
              <span className="text-[13px] font-medium text-muted-foreground">
                {STATUS_LABELS[status]}
              </span>
              <Badge variant="secondary" className="text-xs tabular-nums">{grouped[status].length}</Badge>
            </div>
            <Button variant="ghost" size="icon-xs" onClick={() => { setAdding(status); setDraft(''); }}>
              <Plus className="size-3.5" />
            </Button>
          </div>

          <div className="flex flex-col gap-2 p-2 min-h-[120px]">
            {adding === status && (
              <div className="rounded-md border border-primary/40 bg-card p-2 flex flex-col gap-2">
                <Input
                  autoFocus
                  placeholder="What needs doing?"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      if (draft.trim()) {
                        await onQuickAdd(status, draft.trim());
                      }
                      setAdding(null); setDraft('');
                    }
                    if (e.key === 'Escape') { setAdding(null); setDraft(''); }
                  }}
                  className="h-8 text-sm"
                />
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="xs" onClick={() => { setAdding(null); setDraft(''); }}>Cancel</Button>
                  <Button size="xs" onClick={async () => {
                    if (draft.trim()) await onQuickAdd(status, draft.trim());
                    setAdding(null); setDraft('');
                  }}>Add</Button>
                </div>
              </div>
            )}
            <AnimatePresence initial={false}>
              {grouped[status].map((task) => (
                <BoardCard
                  key={task.id}
                  task={task}
                  dragging={draggingId === task.id}
                  onDragStart={(e) => { setDraggingId(task.id); e.dataTransfer.setData('text/task-id', String(task.id)); }}
                  onDragEnd={() => setDraggingId(null)}
                  onClick={() => onClick(task)}
                  onToggleImportant={onToggleImportant}
                />
              ))}
            </AnimatePresence>
            {grouped[status].length === 0 && adding !== status && (
              <div className="text-center text-xs text-muted-foreground py-8 border border-dashed border-border/60 rounded-md">
                No tasks
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function BoardCard({ task, dragging, onClick, onDragStart, onDragEnd, onToggleImportant }: {
  task: Task;
  dragging: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onToggleImportant: (id: number, important: boolean) => void;
}) {
  const toggleStar = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleImportant(task.id, !task.important);
  };

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.12 } }}
      transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
    >
      <div
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onClick={onClick}
        className={`group rounded-lg border border-border bg-card px-3 py-2.5 cursor-pointer transition-[box-shadow,border-color,opacity] duration-200
          ${dragging ? 'opacity-40' : 'opacity-100'}
          hover:border-primary/40 hover:shadow-sm`}
      >
        <div className="flex items-start gap-2">
          <span className={`size-2 rounded-full mt-1.5 shrink-0 ${PRIORITY_COLORS[task.priority]}`} />
          <span className={`font-medium text-sm leading-tight flex-1 ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
            {task.title}
          </span>
          <button
            onClick={toggleStar}
            className={`opacity-60 hover:opacity-100 transition-opacity shrink-0 ${task.important ? 'text-secondary opacity-100' : ''}`}
            title={task.important ? 'Remove from Important' : 'Mark important'}
          >
            <svg viewBox="0 0 24 24" className="size-3.5" fill={task.important ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {(task.subtask_count > 0 || (task.steps?.length ?? 0) > 0) && (
          <div className="flex items-center gap-3 mt-2 ml-4 text-xs font-mono text-muted-foreground">
            {(task.steps?.length ?? 0) > 0 && (
              <span>{task.steps.filter((s) => s.done).length}/{task.steps.length} steps</span>
            )}
            {task.subtask_count > 0 && (
              <span>{task.subtasks_done}/{task.subtask_count} subtasks</span>
            )}
          </div>
        )}

        {task.due_date && (
          <div className="flex items-center gap-1 mt-2 ml-4 text-xs font-mono text-muted-foreground">
            <Loader2 className="size-3 hidden" />
            <span>{task.due_date}</span>
          </div>
        )}
        {task.status === 'blocked' && (
          <div className="mt-2 ml-4 truncate text-xs text-[hsl(var(--on-error-container))]">
            Blocked by {task.blocked_by_task_title || 'another task'}
          </div>
        )}
      </div>
    </motion.div>
  );
}
