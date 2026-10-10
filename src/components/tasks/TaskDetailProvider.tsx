import {
  createContext, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { tasks as tasksApi, taskLists as listsApi } from '@/api';
import type { Task, TaskList } from '@/types';
import { qk } from '@/queries/keys';
import ErrorBoundary from '@/components/ErrorBoundary';
import { lazyPage } from '@/lib/lazyPage';
import { failureText } from '@/lib/errors';
import { toast } from 'sonner';
// Lazy: TaskFormDialog drags the whole tiptap editor along; this provider
// wraps every page, so an eager import would put tiptap in the boot bundle.
const TaskFormDialog = lazyPage(() => import('./TaskFormDialog'));

/**
 * Global task-detail surface. Any component anywhere in the app can call
 * `useTaskDetail().openTask(id)` and the same TaskFormDialog opens with
 * that task loaded — no route navigation, no per-page wiring.
 *
 * The provider keeps a small `taskLists` cache so the dialog's list
 * dropdown stays accurate without each caller having to thread it.
 *
 * Mounted near the root of App.tsx so it sits inside AuthProvider
 * (needs auth for API calls) and outside route boundaries (so the
 * dialog survives route changes).
 */
interface TaskDetailState {
  /** Open the dialog for an existing task. Fetches it if not cached. */
  openTask: (id: number) => Promise<void>;
  /** Open the dialog seeded for creating a new task. */
  openNew: (defaults?: Record<string, unknown>) => void;
  /** Close the dialog manually (rarely needed from callers). */
  close: () => void;
}

const Ctx = createContext<TaskDetailState | null>(null);

export function useTaskDetail(): TaskDetailState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTaskDetail must be used inside TaskDetailProvider');
  return ctx;
}

export function TaskDetailProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [defaults, setDefaults] = useState<Record<string, unknown>>({});
  const [lists, setLists] = useState<TaskList[]>([]);

  // Tracks the most recent openTask invocation so an in-flight fetch
  // for an earlier task can't overwrite the state set by a newer one.
  const openSeqRef = useRef(0);
  // Back stack: opening a task from inside the dialog (a subtask, its
  // parent) stacks the one on screen, and closing walks back to it instead
  // of dismissing everything. Cleared whenever the dialog really closes.
  const shownIdRef = useRef<number | null>(null);
  const backRef = useRef<number[]>([]);
  useEffect(() => {
    shownIdRef.current = open ? editingTask?.id ?? null : null;
  }, [open, editingTask]);
  // Lazy-load lists so unauthenticated routes don't make a wasted call. The
  // shared query key lets a Tasks-page read satisfy the dialog too.
  const ensureLists = useCallback(async () => {
    try {
      setLists(await qc.fetchQuery({
        queryKey: qk.taskLists.list(),
        queryFn: () => listsApi.list(),
      }));
    }
    catch {/* ignore — dialog still works with an empty list array */}
  }, [qc]);

  const openTask = useCallback(async (id: number) => {
    const seq = ++openSeqRef.current;
    const shown = shownIdRef.current;
    let pushed = false;
    if (shown !== null && shown !== id) {
      // Jumping back to the task underneath pops it rather than stacking a loop.
      if (backRef.current.at(-1) === id) backRef.current.pop();
      else { backRef.current.push(shown); pushed = true; }
    }
    // Don't pop the dialog yet — wait until we actually have task data.
    // Otherwise the dialog briefly mounts with stale or null `editing`,
    // which is what users see as a "blank page" flicker.
    ensureLists();
    try {
      // List responses carry the complete editable task shape. Seed the
      // detail key from any fresh list before falling back to GET /tasks/:id.
      if (!qc.getQueryData(qk.tasks.detail(id))) {
        const now = Date.now();
        const cached = qc.getQueriesData<Task[]>({ queryKey: ['tasks', 'list'] })
          .filter(([key]) => {
            const state = qc.getQueryState(key);
            return state && !state.isInvalidated && now - state.dataUpdatedAt < 60_000;
          })
          .flatMap(([, rows]) => rows ?? [])
          .find((task) => task.id === id);
        if (cached) qc.setQueryData(qk.tasks.detail(id), cached);
      }
      const t = await qc.fetchQuery({
        queryKey: qk.tasks.detail(id),
        queryFn: () => tasksApi.get(id),
      });
      // A later openTask call has superseded this one — drop the stale
      // result so we don't overwrite the newer task.
      if (seq !== openSeqRef.current) return;
      setEditingTask(t);
      setDefaults({});
      setOpen(true);
    } catch (e) {
      if (seq !== openSeqRef.current) return;
      toast.error(failureText(e, "Couldn't open that task"));
      // Stay on the task already on screen; otherwise there's nothing to show.
      if (pushed) { backRef.current.pop(); return; }
      if (shown !== null && shown !== id) return;
      backRef.current = [];
      setEditingTask(null);
      setOpen(false);
    }
  }, [ensureLists, qc]);

  const openNew = useCallback((d: Record<string, unknown> = {}) => {
    ++openSeqRef.current;
    backRef.current = [];
    ensureLists();
    setEditingTask(null);
    setDefaults(d);
    setOpen(true);
  }, [ensureLists]);

  const close = useCallback(() => {
    backRef.current = [];
    setOpen(false);
  }, []);

  // Closing (Esc, ×, Cancel, after Save/Delete) returns to the task this one
  // was opened from, if any; only the last close dismisses the dialog.
  const handleOpenChange = useCallback((o: boolean) => {
    if (!o) {
      const back = backRef.current.pop();
      if (back !== undefined) {
        shownIdRef.current = null; // returning is not a new jump
        void openTask(back);
        return;
      }
    }
    setOpen(o);
  }, [openTask]);

  const handleCloseComplete = useCallback(() => {
    if (!open) {
      setEditingTask(null);
      setDefaults({});
    }
  }, [open]);

  // After save: emit the existing AI-invalidation event so list pages
  // refresh without us holding their reload callbacks.
  const handleSaved = useCallback(() => {
    window.dispatchEvent(new CustomEvent('data:invalidate', { detail: { kind: 'task_saved' } }));
  }, []);

  // Listen for global "open task" events so non-React code (e.g. tiptap
  // chip click handlers) can trigger without grabbing the hook.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent).detail?.id;
      if (typeof id === 'number') openTask(id);
      else if (typeof id === 'string' && /^\d+$/.test(id)) openTask(Number(id));
    };
    window.addEventListener('task:open', onOpen);
    return () => window.removeEventListener('task:open', onOpen);
  }, [openTask]);

  const value = useMemo<TaskDetailState>(() => ({ openTask, openNew, close }), [openTask, openNew, close]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {/* Outside the route boundary: a failed chunk must hide the dialog, not
          unmount the whole app (the old blank-page failure). */}
      <ErrorBoundary fallback={null}>
      <Suspense fallback={null}>
        <TaskFormDialog
          open={open}
          onOpenChange={handleOpenChange}
          onCloseComplete={handleCloseComplete}
          editing={editingTask}
          defaults={defaults}
          lists={lists}
          onSaved={handleSaved}
        />
      </Suspense>
      </ErrorBoundary>
    </Ctx.Provider>
  );
}
