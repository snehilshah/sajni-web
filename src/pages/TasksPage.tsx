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

import type { Task, TaskList } from '@/types';
import {
  useTasks, useTaskLists, useMissedTasks, useTaskArchive, useTaskArchiveCount,
  useCreateTask, useToggleTaskStatus, useToggleTaskImportant, useMoveOnBoard,
  useCreateTaskList, useUpdateTaskList, useDeleteTaskList,
  type TaskListParams,
} from '@/queries/tasks';
import { qk } from '@/queries/keys';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import PillScroller from '@/components/tasks/PillScroller';
import GroupMenu from '@/components/tasks/GroupMenu';
import {
  type GroupBy, type TaskGroup, dropAction, foldOpen, groupOptions, groupTasks, priorityBox, readGroupBy, saveFold, saveGroupBy,
} from '@/components/tasks/grouping';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
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

  const [reminderCreateSignal, setReminderCreateSignal] = useState(0);

  // Group by, one choice per view, kept on this device (grouping.ts).
  const [groupPref, setGroupPref] = useState<Record<ViewMode, GroupBy>>(() => ({ list: readGroupBy('list'), board: readGroupBy('board') }));
  // A Board drop on Due date → Later: the date to pick first.
  const [pickDue, setPickDue] = useState<{ task: Task; rank: number } | null>(null);

  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, viewMode); } catch {}
  }, [viewMode]);

  // Selection -> list query params. Smart filters carry a `smart` key; a user
  // list filters by id and only shows top-level tasks. done=recent: Done (the
  // list's fold, the Board's lane) holds the view's tasks done in the last 7
  // days, open-only views (My Day, Planned…) included; older ones are in the
  // Archive.
  const isMobile = useIsMobile();
  const params: TaskListParams = useMemo(() => (
    selection.kind === 'smart'
      ? { smart: selection.smart, done: 'recent' }
      : { list: selection.id, parent: 'null', done: 'recent' }
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


  // Scratched (abandoned) tasks are neither open nor done: their own
  // collapsible group, so the open list stays clean.
  const open = tasksList.filter((t) => t.status !== 'done' && t.status !== 'scratched');
  const done = tasksList.filter((t) => t.status === 'done');
  const scratched = tasksList.filter((t) => t.status === 'scratched');

  // The List view's Archive fold: in one of the owner's lists (its own
  // archive) and in All (every archived task); not in the other smart views,
  // nor on the Board.
  const archiveScope: number | 'all' | null = selection.kind === 'list' ? selection.id
    : selection.smart === 'all' ? 'all' : null;

  // Grouping by list inside one of the owner's lists would be one group.
  const inOwnList = selection.kind === 'list';
  const groupFor = (view: ViewMode): GroupBy => {
    const by = groupPref[view];
    return groupOptions(view, inOwnList).includes(by) ? by : 'status';
  };
  const setGroupFor = (view: ViewMode, by: GroupBy) => {
    saveGroupBy(view, by);
    setGroupPref((cur) => ({ ...cur, [view]: by }));
  };

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

  // Reactive mobile detection — kanban board is forced to list on phone.
  const effectiveView: ViewMode = isMobile ? 'list' : viewMode;
  const listGroup = groupFor('list');
  const boardGroup = groupFor('board');
  // Board lanes: under Status, Done is a lane (its last 7 days); under any
  // other grouping the Board holds open tasks only.
  const boardGroups = useMemo(() => groupTasks(
    boardGroup === 'status' ? tasksList.filter((t) => t.status !== 'scratched') : open,
    boardGroup, 'board', lists,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [tasksList, boardGroup, lists]);
  const moveCard = (task: Task, lane: string | undefined, rank: number) => {
    if (!lane) { moveOnBoard.mutate({ id: task.id, board_rank: rank }); return; }
    const action = dropAction(boardGroup, lane, task);
    if (action.kind === 'open') {
      // Blocked needs a blocker: the task opens; the card returns until saved.
      setEditingTask({ ...task, status: 'blocked', blocked_by_task_id: null, blocked_by_task_title: null });
      setShowForm(true);
    } else if (action.kind === 'pickDate') {
      setPickDue({ task, rank });
    } else if (action.kind === 'patch') {
      moveOnBoard.mutate({ id: task.id, patch: action.patch, board_rank: rank });
    }
  };

  const switchTab = (tab: 'tasks' | 'planner' | 'reminders') => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'reminders') next.set('tab', 'reminders');
    else if (tab === 'planner') next.set('tab', 'planner');
    else next.delete('tab');
    next.delete('focus');
    setShowForm(false);
    setSearchParams(next, { replace: true });
  };

  // Tasks (List and Board) run wide on desktop: 24px gutters, capped at
  // 2000px so very wide screens (4K) keep margins either side.
  const boardWide = activeTab === 'tasks' && !isMobile;

  return (
    <PageShell
      title="Tasks"
      // The List and Board run (almost) edge to edge, capped for very wide
      // screens, instead of the reading column's 6xl.
      columnClassName={activeTab === 'planner' ? 'max-w-[1600px] px-4 md:px-6 xl:px-8'
        : boardWide ? 'max-w-[2000px] px-4 md:px-6' : undefined}
      contentClassName={activeTab === 'planner'
        ? 'mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 pb-28 pt-5 md:px-6 md:pb-20 md:pt-6 xl:px-8'
        : boardWide ? 'mx-auto flex w-full max-w-[2000px] flex-col gap-6 px-4 pb-6 pt-5 md:px-6 md:pt-6'
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
              <GroupMenu
                value={groupFor(effectiveView)}
                options={groupOptions(effectiveView, inOwnList)}
                board={effectiveView === 'board'}
                onChange={(by) => setGroupFor(effectiveView, by)}
              />
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
              key={archiveScope ?? 'none'}
              open={open}
              done={done}
              scratched={scratched}
              groupBy={listGroup}
              lists={lists}
              archiveScope={archiveScope}
              onClick={openEdit}
            />
          ) : (
            <BoardView
              groups={boardGroups}
              groupBy={boardGroup}
              onClick={openEdit}
              onMove={moveCard}
              onQuickAdd={async (lane, title) => {
                // A new card takes its lane's value (as a drop there would).
                const blank = { status: 'todo', priority: 'medium', list_id: selection.kind === 'list' ? selection.id : null } as Task;
                const action = dropAction(boardGroup, lane, blank);
                if (action.kind === 'open') { openCreate({ status: 'blocked', title }); return; }
                if (action.kind === 'pickDate' || (boardGroup === 'due' && lane === 'overdue')) {
                  openCreate({ title });
                  return;
                }
                const overrides: Parameters<typeof createTask.mutateAsync>[0] = { title };
                if (selection.kind === 'list') overrides.list_id = selection.id;
                if (action.kind === 'patch') {
                  const p = action.patch;
                  if (p.status) overrides.status = p.status;
                  if (p.priority) overrides.priority = p.priority;
                  if (p.list_id !== undefined) overrides.list_id = p.list_id;
                  if (p.clear_list) overrides.list_id = null;
                  if (p.due_date) overrides.due_date = p.due_date;
                  if (p.week_of) overrides.week_of = p.week_of;
                }
                await createTask.mutateAsync(overrides);
              }}
              onToggleImportant={(id, important) => toggleImportant.mutate({ id, important })}
              onToggleDone={(t) => moveStatus.mutate({ id: t.id, status: t.status === 'done' ? 'todo' : 'done' })}
            />
          )}
        </div>
        </div>
      )}

      {/* Board, Due date → Later: pick the day, then the card moves. */}
      <Dialog open={pickDue !== null} onOpenChange={(o) => { if (!o) setPickDue(null); }}>
        <DialogContent className="w-auto max-w-[calc(100vw-2rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="line-clamp-2 pr-8 text-base">Due date for “{pickDue?.task.title}”</DialogTitle>
          </DialogHeader>
          {/* Later starts after this week (Monday-anchored, as week tasks are). */}
          <Calendar
            mode="single"
            fixedWeeks
            weekStartsOn={1}
            defaultMonth={addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 7)}
            disabled={{ before: addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 7) }}
            onSelect={(d) => {
              if (!d || !pickDue) return;
              moveOnBoard.mutate({ id: pickDue.task.id, patch: { due_date: format(d, 'yyyy-MM-dd') }, board_rank: pickDue.rank });
              setPickDue(null);
            }}
            className="mx-auto"
          />
        </DialogContent>
      </Dialog>

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
// Open tasks in the chosen grouping (Group by; Status by default), each group
// under a tonal header that folds; then Done (last 7 days), Archive and
// Scratched, folded by default. Folds are remembered on this device.

function GroupHeader({ id, label, count, open, onToggle, mark, tone, quiet }: {
  id: string;
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  mark?: React.ReactNode;
  tone?: 'error';
  /** Done, Archive, Scratched: the finished folds read a step quieter. */
  quiet?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={id}
      className="flex h-10 w-full items-center gap-2.5 rounded-2xl bg-[hsl(var(--surface-container-low))] pl-3 pr-4 text-left transition-colors hover:bg-[hsl(var(--surface-container))]"
    >
      <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)]', !open && '-rotate-90')} />
      {mark}
      <span className={cn('text-sm', quiet ? 'font-medium text-muted-foreground' : 'font-semibold', tone === 'error' && 'text-destructive')}>{label}</span>
      <span className={cn(
        'inline-grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-xs font-semibold tabular-nums',
        tone === 'error' ? 'bg-[hsl(var(--error-container))] text-[hsl(var(--on-error-container))]' : 'bg-[hsl(var(--on-surface)/0.07)] text-muted-foreground',
      )}>{count}</span>
    </button>
  );
}

/** A fold remembered on this device (grouping.ts foldOpen). */
function useFold(id: string, byDefault: boolean): [boolean, () => void] {
  const [open, setOpen] = useState(() => foldOpen(id, byDefault));
  const [seen, setSeen] = useState(id);
  if (seen !== id) { setSeen(id); setOpen(foldOpen(id, byDefault)); }
  return [open, () => setOpen((v) => { saveFold(id, !v); return !v; })];
}

/** A group's rows unfold downward; folding is instant to the header. */
function FoldBody({ id, open, children }: { id: string; open: boolean; children: React.ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          id={id}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
          className="overflow-hidden"
        >
          <div className="flex flex-col gap-2 pt-2">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TaskGroupSection({ group, by, onClick }: { group: TaskGroup; by: GroupBy; onClick: (t: Task) => void }) {
  const id = `fold:list:${by}:${group.key}`;
  const [open, toggle] = useFold(id, true);
  return (
    <section>
      <GroupHeader
        id={id}
        label={group.label}
        count={group.tasks.length}
        open={open}
        onToggle={toggle}
        tone={group.tone}
        mark={group.priority ? <span aria-hidden className="size-3.5 shrink-0 rounded-[32%] border-2" style={priorityBox(group.priority)} /> : undefined}
      />
      <FoldBody id={id} open={open}>
        <AnimatePresence initial={false}>
          {group.tasks.map((t) => <TaskRow key={t.id} task={t} showStatus={by !== 'status'} onClick={() => onClick(t)} />)}
        </AnimatePresence>
      </FoldBody>
    </section>
  );
}

function FinishedFold({ name, label, count, children }: { name: string; label: string; count: number; children: React.ReactNode }) {
  const id = `fold:list:fin:${name}`;
  const [open, toggle] = useFold(id, false);
  return (
    <section>
      <GroupHeader id={id} label={label} count={count} open={open} onToggle={toggle} quiet />
      <FoldBody id={id} open={open}>{children}</FoldBody>
    </section>
  );
}

function ListView({
  open, done, scratched, groupBy, lists, archiveScope, onClick,
}: {
  open: Task[];
  done: Task[];
  scratched: Task[];
  groupBy: GroupBy;
  lists: TaskList[];
  archiveScope: number | 'all' | null;
  onClick: (t: Task) => void;
}) {
  const groups = useMemo(() => groupTasks(open, groupBy, 'list', lists), [open, groupBy, lists]);

  if (open.length === 0 && done.length === 0 && scratched.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
          <ListChecks className="size-9 mx-auto mb-3 opacity-30" />
          <div className="text-sm">Nothing here yet.</div>
        </div>
        {archiveScope !== null && <ArchiveFold scope={archiveScope} onClick={onClick} />}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {groupBy === 'none' ? (
        <AnimatePresence initial={false}>
          {open.map((t) => <TaskRow key={t.id} task={t} showStatus onClick={() => onClick(t)} />)}
        </AnimatePresence>
      ) : (
        groups.map((g) => <TaskGroupSection key={`${groupBy}:${g.key}`} group={g} by={groupBy} onClick={onClick} />)
      )}

      <div className="mt-4 flex flex-col gap-2">
        {done.length > 0 && (
          <FinishedFold name="done" label="Done" count={done.length}>
            {done.map((t) => <TaskRow key={t.id} task={t} onClick={() => onClick(t)} />)}
          </FinishedFold>
        )}
        {archiveScope !== null && <ArchiveFold scope={archiveScope} onClick={onClick} />}
        {scratched.length > 0 && (
          <FinishedFold name="scratched" label="Scratched" count={scratched.length}>
            {scratched.map((t) => <TaskRow key={t.id} task={t} onClick={() => onClick(t)} />)}
          </FinishedFold>
        )}
      </div>
    </div>
  );
}

// The Archive fold: tasks done more than 7 days ago, newest done first. Only
// its count is fetched until it is opened; then 50 at a time. Unticking one
// brings it back to To do.
function ArchiveFold({ scope, onClick }: { scope: number | 'all'; onClick: (t: Task) => void }) {
  // Not remembered: archived tasks load only when it's opened, every time.
  const id = 'fold:list:fin:archive';
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((v) => !v);
  const { data: count = 0 } = useTaskArchiveCount(scope);
  const archive = useTaskArchive(scope, open);
  if (count === 0) return null;
  const items = archive.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <section>
      <GroupHeader id={id} label="Archive" count={count} open={open} onToggle={toggle} quiet />
      <FoldBody id={id} open={open}>
          {archive.isLoading ? (
            [1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)
          ) : archive.isError && items.length === 0 ? (
            <div className="flex items-center gap-3 px-2 py-3 text-sm text-muted-foreground">
              Couldn't load the archive.
              <Button variant="ghost" size="sm" onClick={() => archive.refetch()}>Try again</Button>
            </div>
          ) : (
            items.map((t) => <TaskRow key={t.id} task={t} onClick={() => onClick(t)} />)
          )}
          {archive.hasNextPage && (
            <Button
              variant="ghost" size="sm" className="self-start text-muted-foreground"
              disabled={archive.isFetchingNextPage}
              onClick={() => archive.fetchNextPage()}
            >
              {archive.isFetchingNextPage ? 'Loading…' : 'Show more'}
            </Button>
          )}
      </FoldBody>
    </section>
  );
}
