import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { journal as journalApi, type JournalLocation } from '@/api';
import { qk } from './keys';

export function useJournalList() {
  return useQuery({
    queryKey: qk.journal.list(),
    queryFn: () => journalApi.list(),
  });
}

export function useJournalEntry(date: string, enabled = true) {
  return useQuery({
    queryKey: qk.journal.entry(date),
    queryFn: () => journalApi.get(date),
    enabled,
  });
}

export function useSaveJournal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ date, content, mood, location }: {
      date: string; content: string; mood?: string | null; location?: JournalLocation | null;
    }) => journalApi.save(date, content, mood, location),
    onError: () => toast.error('Could not save entry'),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: qk.journal.all });
      if (vars?.date) qc.invalidateQueries({ queryKey: qk.journal.entry(vars.date) });
    },
  });
}

export function useDeleteJournal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (date: string) => journalApi.delete(date),
    onError: () => toast.error('Could not delete entry'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.journal.all }),
  });
}

// --- Weekly ---

export function useJournalWeeks() {
  return useQuery({
    queryKey: qk.journal.weeks(),
    queryFn: () => journalApi.week.list(),
  });
}

export function useJournalWeek(year: number, week: number, enabled = true) {
  return useQuery({
    queryKey: qk.journal.week(year, week),
    queryFn: () => journalApi.week.get(year, week),
    enabled,
  });
}

export function useJournalWeekSummary(year: number, week: number, enabled = true) {
  return useQuery({
    queryKey: qk.journal.weekSummary(year, week),
    queryFn: () => journalApi.week.summary(year, week),
    enabled,
  });
}

export function useSaveJournalWeek() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ year, week, content, mood }: { year: number; week: number; content: string; mood?: string | null }) =>
      journalApi.week.save(year, week, content, mood),
    onError: () => toast.error('Could not save entry'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.journal.all }),
  });
}
