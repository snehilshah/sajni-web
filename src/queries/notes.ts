import { useQuery } from '@tanstack/react-query';
import { notes as notesApi } from '@/api';
import { qk } from './keys';

export type NoteListParams = Parameters<typeof notesApi.list>[0];

export function useNotes(params?: NoteListParams) {
  return useQuery({
    queryKey: qk.notes.list(params),
    queryFn: () => notesApi.list(params),
  });
}

export function useNoteFolders() {
  return useQuery({
    queryKey: qk.notes.folders(),
    queryFn: () => notesApi.listFolders(),
  });
}
