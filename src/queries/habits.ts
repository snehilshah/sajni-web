import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { habits as habitsApi } from '@/api';
import type { Habit, HabitPatch } from '@/types';
import { qk } from './keys';

export function useHabits() {
  return useQuery({
    queryKey: qk.habits.list(),
    queryFn: () => habitsApi.list(),
  });
}

export function useHabitRecentLogs(days = 30) {
  return useQuery({
    queryKey: qk.habits.recentLogs(days),
    queryFn: () => habitsApi.recentLogs(days),
  });
}

export function useHabitLogRange(from: string, to: string) {
  return useQuery({
    queryKey: qk.habits.logRange(from, to),
    queryFn: () => habitsApi.recentLogsRange(from, to),
    enabled: Boolean(from && to),
  });
}

export function useHabitStatus(date: string) {
  return useQuery({
    queryKey: qk.habits.status(date),
    queryFn: () => habitsApi.statusForDate(date),
  });
}

export function useHabitPeriodStatus(date: string) {
  return useQuery({
    queryKey: qk.habits.periodStatus(date),
    queryFn: () => habitsApi.periodStatusForDate(date),
  });
}

export function useHabitLogs(id: number, days = 30, enabled = true) {
  return useQuery({
    queryKey: qk.habits.logs(id, days),
    queryFn: () => habitsApi.getLogs(id, days),
    enabled,
  });
}

// Optimistic: the habit cell fills instantly. Patches both the habits list
// (logged_today, when toggling today) and any recent-logs grid (date
// membership) so the Today strip and the Habits week-grid both react at once.
export function useToggleHabitLog(today: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, date }: { id: number; date: string }) =>
      date ? habitsApi.toggleLogForDate(id, date) : habitsApi.toggleLog(id),
    onMutate: async ({ id, date }) => {
      await qc.cancelQueries({ queryKey: qk.habits.all });
      const prevList = qc.getQueryData<Habit[]>(qk.habits.list());
      const prevLogs = qc.getQueriesData({ queryKey: ['habits', 'recentLogs'] });
      const day = date || today;
      if (day === today) {
        qc.setQueryData<Habit[]>(qk.habits.list(), (old) =>
          old?.map((h) => (h.id === id ? { ...h, logged_today: !h.logged_today } : h)),
        );
      }
      qc.setQueriesData<Record<string, string[]>>({ queryKey: ['habits', 'recentLogs'] }, (old) => {
        if (!old) return old;
        const key = String(id);
        const arr = old[key] ?? [];
        const next = arr.includes(day) ? arr.filter((x) => x !== day) : [...arr, day];
        return { ...old, [key]: next };
      });
      return { prevList, prevLogs };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prevList) qc.setQueryData(qk.habits.list(), ctx.prevList);
      ctx?.prevLogs?.forEach(([key, val]) => qc.setQueryData(key, val));
      toast.error('Could not update habit');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.habits.all }),
  });
}

export function useToggleHabitPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, periodStart }: {
      id: number;
      periodStart: string;
      periodEnd: string;
      isCurrent: boolean;
    }) => habitsApi.togglePeriod(id, periodStart),
    onMutate: async ({ id, periodStart, periodEnd, isCurrent }) => {
      await qc.cancelQueries({ queryKey: qk.habits.all });
      const prevList = qc.getQueryData<Habit[]>(qk.habits.list());
      const prevLogs = qc.getQueriesData<Record<string, string[]>>({ queryKey: qk.habits.all });
      const key = String(id);
      const wasLogged = prevLogs.some(([, data]) => {
        if (!data || Array.isArray(data)) return false;
        return (data[key] ?? []).some((date) => date >= periodStart && date <= periodEnd);
      });
      const nextLogged = !wasLogged;

      qc.setQueriesData<Record<string, string[]>>({ queryKey: qk.habits.all }, (old) => {
        if (!old || Array.isArray(old)) return old;
        const arr = old[key] ?? [];
        const next = nextLogged
          ? [...arr, periodStart]
          : arr.filter((date) => date < periodStart || date > periodEnd);
        return { ...old, [key]: next };
      });

      if (isCurrent) {
        qc.setQueryData<Habit[]>(qk.habits.list(), (old) =>
          old?.map((habit) => habit.id === id
            ? { ...habit, logged_current_period: nextLogged }
            : habit),
        );
      }
      return { prevList, prevLogs };
    },
    onError: (_error, _variables, context) => {
      if (context?.prevList) qc.setQueryData(qk.habits.list(), context.prevList);
      context?.prevLogs.forEach(([key, value]) => qc.setQueryData(key, value));
      toast.error('Could not update habit');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.habits.all }),
  });
}

export function useCreateHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof habitsApi.create>[0]) => habitsApi.create(data),
    onError: () => toast.error('Could not create habit'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.habits.all }),
  });
}

export function useUpdateHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: HabitPatch }) =>
      habitsApi.update(id, data),
    onError: () => toast.error('Could not update habit'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.habits.all }),
  });
}

export function useDeleteHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => habitsApi.delete(id),
    onError: () => toast.error('Could not delete habit'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.habits.all }),
  });
}
