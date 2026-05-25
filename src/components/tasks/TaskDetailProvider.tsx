import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { tasks as tasksApi, taskLists as listsApi } from '@/api';
import type { Task, TaskList } from '@/types';
import TaskFormDialog from './TaskFormDialog';

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
  const [open, setOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [defaults, setDefaults] = useState<Record<string, unknown>>({});
  const [lists, setLists] = useState<TaskList[]>([]);

  // Tracks the most recent openTask invocation so an in-flight fetch
  // for an earlier task can't overwrite the state set by a newer one.
  const openSeqRef = useRef(0);
  // Lazy-load lists so unauthenticated routes don't make a wasted call.
  // Refreshed every time the dialog opens so newly-created lists show up.
  const ensureLists = useCallback(async () => {
    try { setLists(await listsApi.list()); }
    catch {/* ignore — dialog still works with an empty list array */}
  }, []);

  const openTask = useCallback(async (id: number) => {
    const seq = ++openSeqRef.current;
    // Don't pop the dialog yet — wait until we actually have task data.
    // Otherwise the dialog briefly mounts with stale or null `editing`,
    // which is what users see as a "blank page" flicker.
    ensureLists();
    try {
      const t = await tasksApi.get(id);
      // A later openTask call has superseded this one — drop the stale
      // result so we don't overwrite the newer task.
      if (seq !== openSeqRef.current) return;
      setEditingTask(t);
      setDefaults({});
      setOpen(true);
    } catch {
      if (seq !== openSeqRef.current) return;
      setEditingTask(null);
      setOpen(false);
    }
  }, [ensureLists]);

  const openNew = useCallback((d: Record<string, unknown> = {}) => {
    ++openSeqRef.current;
    ensureLists();
    setEditingTask(null);
    setDefaults(d);
    setOpen(true);
  }, [ensureLists]);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const handleOpenChange = useCallback((o: boolean) => {
    setOpen(o);
  }, []);

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
      <TaskFormDialog
        open={open}
        onOpenChange={handleOpenChange}
        onCloseComplete={handleCloseComplete}
        editing={editingTask}
        defaults={defaults}
        lists={lists}
        onSaved={handleSaved}
      />
    </Ctx.Provider>
  );
}
