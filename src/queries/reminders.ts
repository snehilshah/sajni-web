import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { reminders as remindersApi } from '@/api';
import type { ReminderInput } from '@/types';
import { qk } from './keys';

export function useReminders(search = '') {
  return useQuery({
    queryKey: qk.reminders.list({ search }),
    queryFn: () => remindersApi.list({ search }),
  });
}

export function useReminderHistory(limit = 30, offset = 0) {
  return useQuery({
    queryKey: qk.reminders.recent(limit, offset),
    queryFn: () => remindersApi.recent(limit, offset),
  });
}

function useReminderMutation<T>(mutationFn: (value: T) => Promise<unknown>, error: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onError: () => toast.error(error),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.reminders.all }),
  });
}

export function useCreateReminder() {
  return useReminderMutation((input: ReminderInput) => remindersApi.create(input), 'Could not create reminder');
}

export function useUpdateReminder() {
  return useReminderMutation(
    ({ id, input }: { id: number; input: ReminderInput }) => remindersApi.update(id, input),
    'Could not save reminder',
  );
}

export function useDeleteReminder() {
  return useReminderMutation((id: number) => remindersApi.delete(id), 'Could not delete reminder');
}

export function useSnoozeReminder() {
  return useReminderMutation(
    ({ id, occurrenceId, minutes, fireAt }: { id: number; occurrenceId?: number; minutes?: number; fireAt?: string }) =>
      remindersApi.snooze(id, { occurrence_id: occurrenceId, minutes, fire_at: fireAt }),
    'Could not snooze reminder',
  );
}

export function useSkipReminder() {
  return useReminderMutation(
    ({ id, occurrenceId }: { id: number; occurrenceId?: number }) => remindersApi.skip(id, occurrenceId),
    'Could not skip reminder',
  );
}
