import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { routines as routinesApi } from '@/api';
import { clientMsg } from '@/lib/errors';
import type { DayRoutine, RoutineInput } from '@/types';
import { qk } from './keys';

export function useRoutines() {
  return useQuery({ queryKey: qk.routines.list(), queryFn: routinesApi.list });
}

/** The routines that run on `date`, with that day's ticks and agenda. */
export function useDayRoutines(date: string) {
  return useQuery({ queryKey: qk.routines.day(date), queryFn: () => routinesApi.day(date) });
}

function useRoutineMutation<T>(mutationFn: (value: T) => Promise<unknown>, error: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onError: (e) => toast.error(clientMsg(e, error)),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.tasks.all });
      qc.invalidateQueries({ queryKey: qk.planner.all });
    },
  });
}

export function useCreateRoutine() {
  return useRoutineMutation((input: RoutineInput) => routinesApi.create(input), 'Could not create routine');
}

export function useUpdateRoutine() {
  return useRoutineMutation(
    ({ id, input }: { id: number; input: RoutineInput }) => routinesApi.update(id, input),
    'Could not save routine',
  );
}

export function useDeleteRoutine() {
  return useRoutineMutation((id: number) => routinesApi.delete(id), 'Could not delete routine');
}

// Optimistic: the tick lands instantly and rolls back on failure.
export function useCheckRoutineItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, date, itemId, done }: { id: number; date: string; itemId: string; done: boolean }) =>
      routinesApi.check(id, { date, item_id: itemId, done }),
    onMutate: async ({ id, date, itemId, done }) => {
      const key = qk.routines.day(date);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<DayRoutine[]>(key);
      qc.setQueryData<DayRoutine[]>(key, (old) =>
        old?.map((r) =>
          r.id !== id ? r : { ...r, done: done ? [...r.done.filter((x) => x !== itemId), itemId] : r.done.filter((x) => x !== itemId) },
        ),
      );
      return { prev, key };
    },
    onError: (e, _v, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.prev);
      toast.error(clientMsg(e, 'Could not update routine'));
    },
    onSettled: (_d, _e, { date }) => qc.invalidateQueries({ queryKey: qk.routines.day(date) }),
  });
}
