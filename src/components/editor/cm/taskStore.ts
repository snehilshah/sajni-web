import { tasks as tasksApi } from '@/api';
import type { Task } from '@/types';

/** What a task chip shows. `missing` = the task was deleted. */
export type ChipTask = Pick<Task, 'id' | 'title' | 'status' | 'due_date'> & { missing?: boolean };

const STALE_MS = 60_000;
const entries = new Map<number, { data?: ChipTask; at: number; loading?: boolean }>();
const listeners = new Map<number, Set<() => void>>();

function notify(id: number) {
  listeners.get(id)?.forEach((fn) => fn());
}

function load(id: number) {
  const e = entries.get(id) ?? { at: 0 };
  if (e.loading) return;
  e.loading = true;
  entries.set(id, e);
  tasksApi.get(id)
    .then((t) => { entries.set(id, { data: { id: t.id, title: t.title, status: t.status, due_date: t.due_date }, at: Date.now() }); })
    .catch((err: unknown) => {
      const gone = /not found|404/i.test(String((err as Error)?.message ?? err));
      entries.set(id, { data: gone ? { id, title: '', status: 'todo', missing: true } : e.data, at: Date.now() });
    })
    .finally(() => notify(id));
}

/** The task as last seen; fetches it (again) when unknown or stale. */
export function chipTask(id: number): ChipTask | undefined {
  const e = entries.get(id);
  if (!e || (!e.loading && Date.now() - e.at > STALE_MS)) load(id);
  return entries.get(id)?.data;
}

export function onChipTask(id: number, fn: () => void): () => void {
  let set = listeners.get(id);
  if (!set) listeners.set(id, (set = new Set()));
  set.add(fn);
  return () => { set.delete(fn); };
}

// A task saved anywhere in the app refreshes every chip on screen.
if (typeof window !== 'undefined') {
  window.addEventListener('data:invalidate', (event) => {
    const kind = (event as CustomEvent<{ kind?: string }>).detail?.kind ?? '';
    if (!kind.startsWith('task')) return;
    for (const id of listeners.keys()) if (listeners.get(id)?.size) load(id);
  });
}
