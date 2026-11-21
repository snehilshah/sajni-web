import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDays, format, startOfWeek } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import BoardView from '@/components/tasks/BoardView';
import {
  Bell, Plus, LayoutGrid, ListChecks, ChevronDown, CalendarDays,
} from '@/components/ui/icons';
import { useIsMobile } from '@/hooks/use-mobile';

import type { Task } from '@/types';
import {
  useTasks, useTaskLists, useMissedTasks,
  useCreateTask, useToggleTaskStatus, useToggleTaskImportant, useMoveOnBoard,
  useCreateTaskList, useUpdateTaskList, useDeleteTaskList,
  type TaskListParams,
} from '@/queries/tasks';
import { qk } from '@/queries/keys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

import PillScroller from '@/components/tasks/PillScroller';
import TaskRow from '@/components/tasks/TaskRow';
import type { TaskDefaults } from '@/components/tasks/TaskFormDialog';
// Lazy: keeps the Markdown editor (inside the dialog) out of this route chunk.
const TaskFormDialog = lazy(() => import('@/components/tasks/TaskFormDialog'));
const PlannerView = lazyPage(() => import('@/components/tasks/PlannerView'));
import MissedBanner from '@/components/tasks/MissedBanner';
import RemindersPanel from '@/components/reminders/RemindersPanel';
import {
  type Selection, weekMondayKey, monthFirstKey,
} from '@/components/tasks/helpers';
import { useNavChrome } from '@/components/nav-chrome';
import PageShell, { PageShellTabs } from '@/components/PageShell';
import { SplitButton } from '@/components/ui/split-button';
import { lazyPage } from '@/lib/lazyPage';

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
  const [reminderCreateSignal, setReminderCreateSignal] = useState(0);

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
  const moveOnBoard = useMoveOnBoard();
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
    qc.invalidateQueries({ queryKey: qk.planner.all });
  };

  // Deep-link support: /tasks?focus=<id> opens that task's edit dialog
  // once it appears in the loaded list. Default smart filter is "my_day"
  // so Today-page links always resolve; other filters may not include it.
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = searchParams.get('focus');
  const activeTab = searchParams.get('tab') === 'reminders'
    ? 'reminders'
    : searchParams.get('tab') === 'planner' ? 'planner' : 'tasks';
  const focusHandled = useRef<string | null>(null);
  useEffect(() => {
    if (activeTab !== 'tasks' || !focusId || focusHandled.current === focusId) return;
    const inList = tasksList.find((x) => String(x.id) === focusId);
    if (inList) {
      focusHandled.current = focusId;
      setEditingTask(inList);
      setShowForm(true);
      const next = new URLSearchParams(searchParams);
      next.delete('focus');
      setSearchParams(next, { replace: true });
    }
  }, [activeTab, focusId, tasksList, searchParams, setSearchParams]);

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

  const switchTab = (tab: 'tasks' | 'planner' | 'reminders') => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'reminders') next.set('tab', 'reminders');
    else if (tab === 'planner') next.set('tab', 'planner');
    else next.delete('tab');
    next.delete('focus');
    setShowForm(false);
    setSearchParams(next, { replace: true });
  };

  return (
    <PageShell
      title="Tasks"
      columnClassName={activeTab === 'planner' ? 'max-w-[1600px] px-4 md:px-6 xl:px-8' : undefined}
      contentClassName={activeTab === 'planner'
        ? 'mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 pb-28 pt-5 md:px-6 md:pb-20 md:pt-6 xl:px-8'
        : undefined}
      actions={
        !isMobile ? (
          activeTab === 'reminders' ? (
            <Button onClick={() => setReminderCreateSignal((value) => value + 1)} size="sm" className="gap-1.5">
              <Plus className="size-3.5" /> New reminder
            </Button>
          ) : activeTab === 'planner' ? (
            <div className="flex items-center gap-2">
              <Button variant="tonal" onClick={() => { setReminderCreateSignal((value) => value + 1); switchTab('reminders'); }} size="sm" className="gap-1.5">
                <Bell className="size-3.5" /> New reminder
              </Button>
              <Button onClick={() => openCreate()} size="sm" className="gap-1.5">
                <Plus className="size-3.5" /> New task
              </Button>
            </div>
          ) : (
            showForm && !editingTask ? (
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
            )
          )
        ) : undefined
      }
      navigation={
        <PageShellTabs
          bare
          ariaLabel="Task sections"
          value={activeTab}
          options={[
            { value: 'tasks', label: 'Tasks', icon: ListChecks },
            { value: 'planner', label: 'Planner', icon: CalendarDays },
            { value: 'reminders', label: 'Reminders', icon: Bell },
          ]}
          onChange={switchTab}
        />
      }
    >
      {activeTab === 'reminders' ? (
        <RemindersPanel
          createSignal={reminderCreateSignal}
          focusId={focusId ? Number(focusId) : undefined}
        />
      ) : activeTab === 'planner' ? (
        <Suspense fallback={<PlannerLoading />}>
          <PlannerView onCreateTask={openCreate} onEditTask={openEdit} />
        </Suspense>
      ) : (
        <div className="flex flex-col gap-3.5">
          <section
            aria-label="Task controls"
            className="flex flex-col gap-2.5"
          >
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0 flex-1">
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
              </div>
              {!isMobile && (
                <SplitButton
                  size="sm"
                  value={viewMode}
                  options={[
                    { value: 'list', label: 'List', icon: ListChecks },
                    { value: 'board', label: 'Board', icon: LayoutGrid },
                  ]}
                  onChange={(value) => setViewMode(value as ViewMode)}
                  onPrimary={() => setViewMode(viewMode === 'list' ? 'board' : 'list')}
                />
              )}
            </div>

            {/* The Board has an Add in every lane, so it skips this bar. */}
            {!isMobile && viewMode !== 'board' && (
              <div className="flex h-12 items-center gap-3 rounded-xl bg-card px-4 transition-shadow focus-within:shadow-[inset_0_0_0_1px_hsl(var(--outline))]">
                <Plus className="size-4 shrink-0 text-muted-foreground" />
                <Input
                  name="quick-task-title"
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleQuickAdd(); }}
                  placeholder="Add a task"
                  className="h-8 border-0 bg-transparent px-2 text-sm shadow-none focus-visible:border-0 focus-visible:ring-0 focus-visible:shadow-none"
                />
                {quickTitle.trim() && (
                  <Button size="sm" className="h-8 px-3 text-xs" onClick={handleQuickAdd}>Add</Button>
                )}
              </div>
            )}
          </section>

        {/* Missed-tasks highlight + reschedule CTA. Hidden while actually
            viewing the Missed list (would be redundant). Self-hides when empty. */}
        {!(selection.kind === 'smart' && selection.smart === 'missed') && (
          <MissedBanner />
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
              onMove={(id, status, rank) => {
                const t = tasksList.find((x) => x.id === id);
                if (!t) return;
                if (status === 'blocked') {
                  setEditingTask({ ...t, status: 'blocked', blocked_by_task_id: null, blocked_by_task_title: null });
                  setShowForm(true);
                  return;
                }
                moveOnBoard.mutate({ id, status, board_rank: rank });
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
              onToggleDone={(t) => moveStatus.mutate({ id: t.id, status: t.status === 'done' ? 'todo' : 'done' })}
            />
          )}
        </div>
        </div>
      )}

      {activeTab !== 'reminders' && (
        <Suspense fallback={null}>
          <TaskFormDialog
            open={showForm}
            onOpenChange={setShowForm}
            editing={editingTask}
            defaults={formDefaults}
            lists={lists}
            onSaved={refreshTasks}
            layoutId={taskFormLayoutId}
            onCloseComplete={() => { if (!showForm) setTaskFormLayoutId(undefined); }}
          />
        </Suspense>
      )}

      {/* Mobile FAB — bottom-right, above the safe area. */}
      {isMobile && activeTab !== 'planner' && (
        <button
          type="button"
          aria-label={activeTab === 'reminders' ? 'New reminder' : 'New task'}
          onClick={() => activeTab === 'reminders' ? setReminderCreateSignal((value) => value + 1) : openCreate()}
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

function PlannerLoading() {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-24 rounded-[28px]" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-7">
        {Array.from({ length: 7 }, (_, index) => <Skeleton key={index} className="h-40 rounded-[20px]" />)}
      </div>
    </div>
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
      <span className={`mono text-xs label-kicker ${overdue ? 'text-destructive' : 'text-muted-foreground'}`}>
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

