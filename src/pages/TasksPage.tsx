import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Loader2, LayoutGrid, ListChecks, ChevronDown,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useDataInvalidate } from '@/hooks/useDataInvalidate';

import { tasks as tasksApi, taskLists as listsApi } from '@/api';
import type { Task, TaskList } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

import PillScroller from '@/components/tasks/PillScroller';
import TaskRow from '@/components/tasks/TaskRow';
// Lazy: keeps tiptap (RichEditor inside the dialog) out of this route chunk.
const TaskFormDialog = lazy(() => import('@/components/tasks/TaskFormDialog'));
import MissedBanner from '@/components/tasks/MissedBanner';
import {
  STATUSES, STATUS_LABELS, PRIORITY_COLORS, type Selection, selectionLabel, weekMondayKey,
} from '@/components/tasks/helpers';
import PageShell from '@/components/PageShell';
import { SplitButton } from '@/components/ui/split-button';

type ViewMode = 'list' | 'board';

const VIEW_KEY = 'sajni:tasks:view';

export default function TasksPage() {
  const [lists, setLists] = useState<TaskList[]>([]);
  const [selection, setSelection] = useState<Selection>({ kind: 'smart', smart: 'my_day' });
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      return (localStorage.getItem(VIEW_KEY) as ViewMode) || 'list';
    } catch { return 'list'; }
  });

  const [tasksList, setTasksList] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [missedCount, setMissedCount] = useState(0);

  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formDefaults, setFormDefaults] = useState<Record<string, any>>({});

  const [quickTitle, setQuickTitle] = useState('');
  const loadedTasksKeyRef = useRef<string | null>(null);

  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, viewMode); } catch {}
  }, [viewMode]);

  const reloadLists = useCallback(async () => {
    try {
      const data = await listsApi.list();
      setLists(data);
    } catch {/* ignore */}
  }, []);

  // Overdue count powers the Missed pill badge. Cheap; refreshed alongside lists.
  const reloadMissed = useCallback(async () => {
    try {
      const data = await tasksApi.list({ smart: 'missed' });
      setMissedCount(data.length);
    } catch {/* ignore */}
  }, []);

  const reloadTasks = useCallback(async () => {
    const key = selection.kind === 'smart' ? `smart:${selection.smart}` : `list:${selection.id}`;
    if (loadedTasksKeyRef.current !== key) setLoading(true);
    try {
      const params: Parameters<typeof tasksApi.list>[0] = {};
      if (selection.kind === 'smart') {
        params.smart = selection.smart;
      } else {
        params.list = selection.id;
        params.parent = 'null';
      }
      const data = await tasksApi.list(params);
      setTasksList(data);
      loadedTasksKeyRef.current = key;
    } finally {
      setLoading(false);
    }
  }, [selection]);

  useEffect(() => { reloadLists(); }, [reloadLists]);
  useEffect(() => { reloadTasks(); }, [reloadTasks]);
  useEffect(() => { reloadMissed(); }, [reloadMissed]);

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

  // Refresh after AI tools mutate tasks (`data:invalidate` from AIChat).
  // Debounced so a multi-tool turn coalesces into one refetch. The `task_`
  // prefix covers task_created/updated/completed/deleted + task_list_*.
  useDataInvalidate(['task_'], () => { reloadTasks(); reloadLists(); reloadMissed(); });

  const grouped = useMemo(() => {
    const map: Record<Task['status'], Task[]> = { todo: [], in_progress: [], done: [], scratched: [] };
    for (const t of tasksList) map[t.status]?.push(t);
    return map;
  }, [tasksList]);

  // Scratched (abandoned) tasks are neither open nor completed — their own
  // collapsible group, so the open list stays clean.
  const open = tasksList.filter((t) => t.status !== 'done' && t.status !== 'scratched');
  const completed = tasksList.filter((t) => t.status === 'done');
  const scratched = tasksList.filter((t) => t.status === 'scratched');

  const openCreate = (overrides: Record<string, any> = {}) => {
    setEditingTask(null);
    setFormDefaults({
      list_id: selection.kind === 'list' ? selection.id : null,
      ...(selection.kind === 'smart' && selection.smart === 'my_day'
        ? { due_date: new Date().toLocaleDateString('en-CA') }
        : {}),
      ...(selection.kind === 'smart' && selection.smart === 'week'
        ? { due_type: 'week', week_of: weekMondayKey() }
        : {}),
      ...(selection.kind === 'smart' && selection.smart === 'important'
        ? { important: true }
        : {}),
      ...overrides,
    });
    setShowForm(true);
  };

  const openEdit = (task: Task) => {
    setEditingTask(task);
    setShowForm(true);
  };

  const handleQuickAdd = async () => {
    const title = quickTitle.trim();
    if (!title) return;
    const overrides: any = { title };
    if (selection.kind === 'list') overrides.list_id = selection.id;
    if (selection.kind === 'smart' && selection.smart === 'my_day') {
      overrides.due_date = new Date().toLocaleDateString('en-CA');
    }
    if (selection.kind === 'smart' && selection.smart === 'week') {
      overrides.week_of = weekMondayKey();
    }
    if (selection.kind === 'smart' && selection.smart === 'important') {
      overrides.important = true;
    }
    await tasksApi.create(overrides);
    setQuickTitle('');
    reloadTasks();
    reloadLists();
  };

  const headerLabel = selectionLabel(selection, lists);

  // Reactive mobile detection — kanban board is forced to list on phone.
  const isMobile = useIsMobile();
  const effectiveView = isMobile ? 'list' : viewMode;

  const subtitleStats = `${open.length} open · ${grouped.in_progress.length} in flight · ${tasksList.filter((t) => t.status === 'done').length} done`;

  return (
    <PageShell
      caption={subtitleStats}
      title={headerLabel}
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
            <Button onClick={() => openCreate()} size="sm" className="gap-1.5">
              <Plus className="size-3.5" /> New task
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3.5">
        {/* Smart + user list pills — single swipeable row. */}
        <PillScroller
          lists={lists}
          selection={selection}
          smartCounts={{ missed: missedCount }}
          onSelect={setSelection}
          onCreate={async (name) => {
            await listsApi.create({ name });
            reloadLists();
          }}
          onRename={async (id, name) => {
            await listsApi.update(id, { name });
            reloadLists();
          }}
          onDelete={async (id) => {
            await listsApi.delete(id);
            if (selection.kind === 'list' && selection.id === id) {
              setSelection({ kind: 'smart', smart: 'all' });
            }
            reloadLists();
            reloadTasks();
          }}
        />

        {/* Missed-tasks highlight + reschedule CTA. Hidden while actually
            viewing the Missed list (would be redundant). Self-hides when empty. */}
        {!(selection.kind === 'smart' && selection.smart === 'missed') && (
          <MissedBanner onChanged={() => { reloadTasks(); reloadLists(); reloadMissed(); }} />
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
              onChange={() => { reloadTasks(); reloadLists(); reloadMissed(); }}
            />
          ) : (
            <BoardView
              grouped={grouped}
              onClick={openEdit}
              onMove={async (id, status) => {
                const t = tasksList.find((x) => x.id === id);
                if (!t || t.status === status) return;
                setTasksList((arr) => arr.map((x) => (x.id === id ? { ...x, status } : x)));
                await tasksApi.update(id, { status });
                reloadLists();
              }}
              onQuickAdd={async (status, title) => {
                const overrides: any = { title, status };
                if (selection.kind === 'list') overrides.list_id = selection.id;
                await tasksApi.create(overrides);
                reloadTasks();
                reloadLists();
              }}
              onChange={() => { reloadTasks(); reloadLists(); }}
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
          onSaved={() => { reloadTasks(); reloadLists(); reloadMissed(); }}
        />
      </Suspense>

      {/* Mobile FAB — sits above the bottom tabbar. */}
      {isMobile && (
        <button
          type="button"
          aria-label="New task"
          onClick={() => openCreate()}
          className="md:hidden fixed right-4 z-40 size-14 inline-flex items-center justify-center rounded-2xl bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))] shadow-[var(--m3-elev-3)] active:translate-y-px"
          style={{
            bottom: 'calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 16px)',
          }}
        >
          <Plus className="size-6" />
        </button>
      )}
    </PageShell>
  );
}

// --- List view ---

function ListView({
  open, completed, scratched, showCompleted, onToggleCompleted, onClick, onChange,
}: {
  open: Task[];
  completed: Task[];
  scratched: Task[];
  showCompleted: boolean;
  onToggleCompleted: () => void;
  onClick: (t: Task) => void;
  onChange: () => void;
}) {
  const [showScratched, setShowScratched] = useState(false);
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
      <AnimatePresence initial={false}>
        {open.map((t) => (
          <TaskRow key={t.id} task={t} onClick={() => onClick(t)} onChange={onChange} />
        ))}
      </AnimatePresence>

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
                <TaskRow key={t.id} task={t} onClick={() => onClick(t)} onChange={onChange} />
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
                <TaskRow key={t.id} task={t} onClick={() => onClick(t)} onChange={onChange} />
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
  grouped, onClick, onMove, onQuickAdd, onChange,
}: {
  grouped: Record<Task['status'], Task[]>;
  onClick: (t: Task) => void;
  onMove: (id: number, status: Task['status']) => void;
  onQuickAdd: (status: Task['status'], title: string) => Promise<void>;
  onChange: () => void;
}) {
  const [hover, setHover] = useState<Task['status'] | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [adding, setAdding] = useState<Task['status'] | null>(null);
  const [draft, setDraft] = useState('');

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                status === 'in_progress' ? 'bg-secondary' : 'bg-primary'
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
                  onChange={onChange}
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

function BoardCard({ task, dragging, onClick, onDragStart, onDragEnd, onChange }: {
  task: Task;
  dragging: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const toggleStar = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try {
      await tasksApi.update(task.id, { important: !task.important });
      onChange();
    } finally { setBusy(false); }
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
            disabled={busy}
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
      </div>
    </motion.div>
  );
}
