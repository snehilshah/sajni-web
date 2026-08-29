import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { planner as plannerApi, tasks as tasksApi } from '@/api';
import type { PlannerResponse } from '@/types';
import { qk } from './keys';

export function usePlanner(from: string, to: string) {
  return useQuery({
    queryKey: qk.planner.range(from, to),
    queryFn: () => plannerApi.range(from, to),
    staleTime: 30_000,
  });
}

export function usePlannerReschedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, targetDate }: { id: number; targetDate: string }) =>
      tasksApi.reschedule(id, { target_date: targetDate, schedule_mode: 'preserve' }),
    onMutate: async ({ id, targetDate }) => {
      await qc.cancelQueries({ queryKey: qk.planner.all });
      const previous = qc.getQueriesData<PlannerResponse>({ queryKey: qk.planner.all });
      qc.setQueriesData<PlannerResponse>({ queryKey: qk.planner.all }, (old) => old ? {
        ...old,
        tasks: old.tasks.map((task) => task.id === id ? { ...task, due_date: targetDate } : task),
      } : old);
      return { previous };
    },
    onError: (_error, _variables, context) => {
      context?.previous.forEach(([key, value]) => qc.setQueryData(key, value));
      toast.error('That move needs a quick schedule check');
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.planner.all });
      qc.invalidateQueries({ queryKey: qk.tasks.all });
    },
  });
}
