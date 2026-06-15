import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { tasks as tasksApi, taskLists as listsApi } from '@/api';
import type { Task, TaskList } from '@/types';
import { qk } from './keys';

export type TaskListParams = Parameters<typeof tasksApi.list>[0];

// --- Reads ---

export function useTasks(params?: TaskListParams) {
  return useQuery({
    queryKey: qk.tasks.list(params),
    queryFn: () => tasksApi.list(params),
  });
}

export function useMissedTasks() {
  return useQuery({
    queryKey: qk.tasks.list({ smart: 'missed' }),
    queryFn: () => tasksApi.list({ smart: 'missed' }),
  });
}

export function useTaskLists() {
  return useQuery({
    queryKey: qk.taskLists.list(),
    queryFn: () => listsApi.list(),
  });
}

// Subtasks of a row. Seeded with the list-embedded prefetch so expand is
// instant, but marked stale (updatedAt 0) so it still refetches fresh once the
// row is actually opened.
export function useSubtasks(id: number, enabled: boolean, prefetch?: Task[]) {
  return useQuery({
    queryKey: qk.tasks.subtasks(id),
    queryFn: () => tasksApi.subtasks(id),
    enabled,
    initialData: prefetch,
    initialDataUpdatedAt: 0,
  });
}

// --- Cache helpers ---

// Patch a task across every cached *list* query (My Day, a user list, board,
// subtasks...) without touching detail/missed shapes. Used by optimistic
// toggles so the change shows in whatever view is mounted.
function patchTaskInLists(
  qc: ReturnType<typeof useQueryClient>,
  id: number,
  patch: Partial<Task>,
) {
  qc.setQueriesData<Task[]>({ queryKey: ['tasks', 'list'] }, (old) =>
    Array.isArray(old) ? old.map((t) => (t.id === id ? { ...t, ...patch } : t)) : old,
  );
  qc.setQueriesData<Task[]>({ queryKey: ['tasks', 'subtasks'] }, (old) =>
    Array.isArray(old) ? old.map((t) => (t.id === id ? { ...t, ...patch } : t)) : old,
  );
}

// --- Mutations ---

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof tasksApi.create>[0]) => tasksApi.create(data),
    onError: () => toast.error('Could not create task'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.tasks.all });
      qc.invalidateQueries({ queryKey: qk.taskLists.all });
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, any> }) =>
      tasksApi.update(id, data),
    onError: () => toast.error('Could not save task'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.tasks.all });
      qc.invalidateQueries({ queryKey: qk.taskLists.all });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => tasksApi.delete(id),
    onError: () => toast.error('Could not delete task'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.tasks.all });
      qc.invalidateQueries({ queryKey: qk.taskLists.all });
    },
  });
}

// Optimistic: the completion checkbox ticks instantly, rolls back on failure.
export function useToggleTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: Task['status'] }) =>
      tasksApi.update(id, { status }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: qk.tasks.all });
      const prev = qc.getQueriesData({ queryKey: ['tasks', 'list'] });
      const prevSubs = qc.getQueriesData({ queryKey: ['tasks', 'subtasks'] });
      patchTaskInLists(qc, id, { status });
      return { prev: [...prev, ...prevSubs] };
    },
    onError: (_e, _v, ctx) => {
      ctx?.prev?.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error('Could not update task');
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.tasks.all });
      qc.invalidateQueries({ queryKey: qk.taskLists.all });
    },
  });
}

// Optimistic: the star fills instantly.
export function useToggleTaskImportant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, important }: { id: number; important: boolean }) =>
      tasksApi.update(id, { important }),
    onMutate: async ({ id, important }) => {
      await qc.cancelQueries({ queryKey: qk.tasks.all });
      const prev = qc.getQueriesData({ queryKey: ['tasks', 'list'] });
      const prevSubs = qc.getQueriesData({ queryKey: ['tasks', 'subtasks'] });
      patchTaskInLists(qc, id, { important });
      return { prev: [...prev, ...prevSubs] };
    },
    onError: (_e, _v, ctx) => {
      ctx?.prev?.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error('Could not update task');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.tasks.all }),
  });
}

export function useRescheduleTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, date }: { id: number; date: string }) => tasksApi.reschedule(id, date),
    onError: () => toast.error('Could not reschedule'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.tasks.all });
      qc.invalidateQueries({ queryKey: qk.taskLists.all });
    },
  });
}

// Bulk reschedule (the missed-banner "all to today"). One mutation so its
// isPending drives the bulk spinner — no local busy flag needed.
export function useRescheduleTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, date }: { ids: number[]; date: string }) =>
      Promise.all(ids.map((id) => tasksApi.reschedule(id, date))),
    onError: () => toast.error('Could not reschedule'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.tasks.all });
      qc.invalidateQueries({ queryKey: qk.taskLists.all });
    },
  });
}

export function useScratchTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => tasksApi.scratch(id),
    onError: () => toast.error('Could not scratch task'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.tasks.all });
      qc.invalidateQueries({ queryKey: qk.taskLists.all });
    },
  });
}

export function useReorderTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => tasksApi.reorder(ids),
    onError: () => toast.error('Could not reorder'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.tasks.all }),
  });
}

// --- Task list (group) mutations ---

export function useCreateTaskList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof listsApi.create>[0]) => listsApi.create(data),
    onError: () => toast.error('Could not create list'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.taskLists.all }),
  });
}

export function useUpdateTaskList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof listsApi.update>[1] }) =>
      listsApi.update(id, data),
    onError: () => toast.error('Could not update list'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.taskLists.all }),
  });
}

export function useDeleteTaskList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => listsApi.delete(id),
    onError: () => toast.error('Could not delete list'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.taskLists.all });
      qc.invalidateQueries({ queryKey: qk.tasks.all });
    },
  });
}

export type { Task, TaskList };
