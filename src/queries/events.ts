import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { events as eventsApi, type EventEntryInput } from '@/api';
import type { TrackedEventPatch } from '@/types';
import { qk } from './keys';

type EventListParams = { archived?: boolean; search?: string };
type EventEntryParams = { search?: string; from?: string; to?: string; before?: string; limit?: number };

function useEventMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<unknown>,
  errorMessage: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onError: () => toast.error(errorMessage),
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.events.all }),
  });
}

export function useEvents(params?: EventListParams) {
  return useQuery({
    queryKey: qk.events.list(params),
    queryFn: () => eventsApi.list(params),
  });
}

export function useEvent(id: number) {
  return useQuery({
    queryKey: qk.events.detail(id),
    queryFn: () => eventsApi.get(id),
    enabled: id > 0,
  });
}

export function useEventEntries(id: number, params?: EventEntryParams) {
  return useQuery({
    queryKey: qk.events.entries(id, params),
    queryFn: () => eventsApi.entries(id, params),
    enabled: id > 0,
  });
}

export function useEventTrends(id: number, enabled = true) {
  return useQuery({
    queryKey: qk.events.trends(id),
    queryFn: () => eventsApi.trends(id),
    enabled: id > 0 && enabled,
  });
}

export function useEventDayEntries(date: string) {
  return useQuery({
    queryKey: qk.events.day(date),
    queryFn: () => eventsApi.entriesForDate(date),
    enabled: Boolean(date),
  });
}

export function useCreateEvent() {
  return useEventMutation(
    (data: Parameters<typeof eventsApi.create>[0]) => eventsApi.create(data),
    'Could not create event',
  );
}

export function useUpdateEvent() {
  return useEventMutation(
    ({ id, data }: { id: number; data: TrackedEventPatch }) => eventsApi.update(id, data),
    'Could not update event',
  );
}

export function useDeleteEvent() {
  return useEventMutation((id: number) => eventsApi.delete(id), 'Could not delete event');
}

export function useAddEventVariable() {
  return useEventMutation(
    ({ eventId, data }: { eventId: number; data: { name: string; unit: string } }) =>
      eventsApi.addVariable(eventId, data),
    'Could not add variable',
  );
}

export function useUpdateEventVariable() {
  return useEventMutation(
    ({ eventId, variableId, data }: {
      eventId: number;
      variableId: number;
      data: { name?: string; unit?: string; sort_order?: number };
    }) => eventsApi.updateVariable(eventId, variableId, data),
    'Could not update variable',
  );
}

export function useDeleteEventVariable() {
  return useEventMutation(
    ({ eventId, variableId }: { eventId: number; variableId: number }) =>
      eventsApi.deleteVariable(eventId, variableId),
    'Could not delete variable',
  );
}

export function useCreateEventEntry() {
  return useEventMutation(
    ({ eventId, data }: { eventId: number; data: EventEntryInput }) =>
      eventsApi.createEntry(eventId, data),
    'Could not log event',
  );
}

export function useUpdateEventEntry() {
  return useEventMutation(
    ({ eventId, entryId, data }: {
      eventId: number;
      entryId: number;
      data: Partial<EventEntryInput>;
    }) => eventsApi.updateEntry(eventId, entryId, data),
    'Could not update entry',
  );
}

export function useDeleteEventEntry() {
  return useEventMutation(
    ({ eventId, entryId }: { eventId: number; entryId: number }) =>
      eventsApi.deleteEntry(eventId, entryId),
    'Could not delete entry',
  );
}
