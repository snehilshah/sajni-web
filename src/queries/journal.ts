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

export function useJournalEntry(date: string) {
  return useQuery({
    queryKey: qk.journal.entry(date),
    queryFn: () => journalApi.get(date),
    enabled: Boolean(date),
  });
}

export function useSaveJournal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ date, content, location }: {
      date: string; content: string; location?: JournalLocation | null;
    }) => journalApi.save(date, content, location),
    onError: () => toast.error('Could not save entry'),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: qk.journal.all });
      if (vars?.date) qc.invalidateQueries({ queryKey: qk.journal.entry(vars.date) });
    },
  });
}
