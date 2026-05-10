import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Loader2, LayoutGrid, ListChecks, ChevronDown,
} from 'lucide-react';

import { tasks as tasksApi, taskLists as listsApi } from '@/api';
import type { Task, TaskList } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

import ListsRail from '@/components/tasks/ListsRail';
import TaskRow from '@/components/tasks/TaskRow';
import TaskFormDialog from '@/components/tasks/TaskFormDialog';
import {
  STATUSES, STATUS_LABELS, PRIORITY_COLORS, type Selection, selectionLabel,
} from '@/components/tasks/helpers';
import PageShell from '@/components/PageShell';

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

  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formDefaults, setFormDefaults] = useState<Record<string, any>>({});

  const [quickTitle, setQuickTitle] = useState('');

  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, viewMode); } catch {}
  }, [viewMode]);

  const reloadLists = useCallback(async () => {
    try {
      const data = await listsApi.list();
      setLists(data);
    } catch {/* ignore */}
  }, []);

  const reloadTasks = useCallback(async () => {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }, [selection]);

  useEffect(() => { reloadLists(); }, [reloadLists]);
  useEffect(() => { reloadTasks(); }, [reloadTasks]);

  // Refresh after AI tools mutate tasks (`data:invalidate` fires from AIChat).
  useEffect(() => {
    const onInvalidate = (e: Event) => {
      const kind = (e as CustomEvent).detail?.kind as string | undefined;
      if (!kind) return;
      if (kind.startsWith('task_') || kind === 'task_list_changed') {
        reloadTasks();
        reloadLists();
      }
    };
    window.addEventListener('data:invalidate', onInvalidate);
    return () => window.removeEventListener('data:invalidate', onInvalidate);
  }, [reloadTasks, reloadLists]);

  const grouped = useMemo(() => {
    const map: Record<Task['status'], Task[]> = { todo: [], in_progress: [], done: [] };
    for (const t of tasksList) map[t.status]?.push(t);
    return map;
  }, [tasksList]);

  const open = tasksList.filter((t) => t.status !== 'done');
  const completed = tasksList.filter((t) => t.status === 'done');

  const openCreate = (overrides: Record<string, any> = {}) => {
    setEditingTask(null);
    setFormDefaults({
      list_id: selection.kind === 'list' ? selection.id : null,
      ...(selection.kind === 'smart' && selection.smart === 'my_day'
        ? { due_date: new Date().toISOString().slice(0, 10) }
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
      overrides.due_date = new Date().toISOString().slice(0, 10);
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

  return (
    <PageShell
      caption={`${open.length} open · ${grouped.in_progress.length} in flight · ${tasksList.filter((t) => t.status === 'done').length} done`}
      title="Tasks"
      subtitle="Lists, nesting, steps. Click any task to edit."
      actions={<Button onClick={() => openCreate()}><Plus className="size-4" /> Add task</Button>}
    >
      <div className="flex w-full gap-4 -mx-4 md:-mx-12 px-4 md:px-12">
        <ListsRail
          lists={lists}
          selection={selection}
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
              setSelection({ kind: 'smart', smart: 'inbox' });
            }
            reloadLists();
            reloadTasks();
          }}
        />

        <main className="flex-1 min-w-0 flex flex-col gap-4">
          {/* Sub-heading: list name + view toggle */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="serif text-xl font-semibold truncate">{headerLabel}</h2>
              {!loading && (
                <Badge variant="secondary" className="mono text-[10px]">
                  {open.length}
                </Badge>
              )}
            </div>
            <div className="inline-flex rounded-md border border-border overflow-hidden">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 h-8 inline-flex items-center gap-1.5 text-xs ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                title="List view"
              >
                <ListChecks className="size-3.5" /> List
              </button>
              <button
                onClick={() => setViewMode('board')}
                className={`px-3 h-8 inline-flex items-center gap-1.5 text-xs border-l border-border ${viewMode === 'board' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                title="Board view"
              >
                <LayoutGrid className="size-3.5" /> Board
              </button>
            </div>
          </div>

          {/* Quick add — card-styled to match the design's input row */}
          <div className="rounded-lg border border-border bg-card/60 px-3 flex items-center gap-2 h-11">
            <Plus className="size-4 text-muted-foreground shrink-0" />
            <Input
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleQuickAdd();
              }}
              placeholder="Add a task. Press ↵."
              className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:border-0 px-0 text-sm"
            />
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0">
            {loading ? (
              <div className="flex flex-col gap-2">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
              </div>
            ) : viewMode === 'list' ? (
              <ListView
                open={open}
                completed={completed}
                showCompleted={showCompleted}
                onToggleCompleted={() => setShowCompleted((v) => !v)}
                onClick={openEdit}
                onChange={() => { reloadTasks(); reloadLists(); }}
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
        </main>
      </div>

      <TaskFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        editing={editingTask}
        defaults={formDefaults}
        lists={lists}
        onSaved={() => { reloadTasks(); reloadLists(); }}
      />
    </PageShell>
  );
}

// --- List view ---

function ListView({
  open, completed, showCompleted, onToggleCompleted, onClick, onChange,
}: {
  open: Task[];
  completed: Task[];
  showCompleted: boolean;
  onToggleCompleted: () => void;
  onClick: (t: Task) => void;
  onChange: () => void;
}) {
  if (open.length === 0 && completed.length === 0) {
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
            className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
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
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                {STATUS_LABELS[status]}
              </span>
              <Badge variant="secondary" className="font-mono text-[10px]">{grouped[status].length}</Badge>
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
            className={`opacity-60 hover:opacity-100 transition-opacity shrink-0 ${task.important ? 'text-amber-500 opacity-100' : ''}`}
            title={task.important ? 'Remove from Important' : 'Mark important'}
          >
            <svg viewBox="0 0 24 24" className="size-3.5" fill={task.important ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {(task.subtask_count > 0 || (task.steps?.length ?? 0) > 0) && (
          <div className="flex items-center gap-3 mt-2 ml-4 text-[10px] font-mono text-muted-foreground">
            {(task.steps?.length ?? 0) > 0 && (
              <span>{task.steps.filter((s) => s.done).length}/{task.steps.length} steps</span>
            )}
            {task.subtask_count > 0 && (
              <span>{task.subtasks_done}/{task.subtask_count} subtasks</span>
            )}
          </div>
        )}

        {task.due_date && (
          <div className="flex items-center gap-1 mt-2 ml-4 text-[10px] font-mono text-muted-foreground">
            <Loader2 className="size-3 hidden" />
            <span>{task.due_date}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
