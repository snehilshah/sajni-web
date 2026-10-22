import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { plans as plansApi } from '@/api';
import { clientMsg } from '@/lib/errors';
import type { PlanInput } from '@/types';
import { qk } from './keys';

export function usePlans() {
  return useQuery({ queryKey: qk.plans.list(), queryFn: plansApi.list });
}

/** The plans that run on `date`, with their tasks. */
export function useDayPlans(date: string) {
  return useQuery({ queryKey: qk.plans.day(date), queryFn: () => plansApi.day(date) });
}

/** Open tasks worth pulling into a plan's occurrence on `date`. */
export function usePlanCandidates(id: number, date: string, enabled: boolean) {
  return useQuery({ queryKey: qk.plans.candidates(id, date), queryFn: () => plansApi.candidates(id, date), enabled });
}

function usePlanMutation<T>(mutationFn: (value: T) => Promise<unknown>, error: string) {
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

export function useCreatePlan() {
  return usePlanMutation((input: PlanInput) => plansApi.create(input), 'Could not create plan');
}

export function useUpdatePlan() {
  return usePlanMutation(
    ({ id, input }: { id: number; input: PlanInput }) => plansApi.update(id, input),
    'Could not save plan',
  );
}

export function useDeletePlan() {
  return usePlanMutation((id: number) => plansApi.delete(id), 'Could not delete plan');
}

/** Pulls an existing task into a plan's occurrence. */
export function useAddToPlan() {
  return usePlanMutation(
    ({ id, taskId, date }: { id: number; taskId: number; date: string }) => plansApi.addTask(id, taskId, date),
    'Could not add to plan',
  );
}
