import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { notes as notesApi } from '@/api';
import { qk } from './keys';

export type NoteListParams = Parameters<typeof notesApi.list>[0];

export function useNotes(params?: NoteListParams) {
  return useQuery({
    queryKey: qk.notes.list(params),
    queryFn: () => notesApi.list(params),
  });
}

export function useNote(id: number, enabled = true) {
  return useQuery({
    queryKey: qk.notes.detail(id),
    queryFn: () => notesApi.get(id),
    enabled,
  });
}

export function useNoteFolders() {
  return useQuery({
    queryKey: qk.notes.folders(),
    queryFn: () => notesApi.listFolders(),
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ title, content, folder }: { title: string; content: string; folder?: string }) =>
      notesApi.create(title, content, folder),
    onError: () => toast.error('Could not create note'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.notes.all });
    },
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { title?: string; content?: string; folder?: string } }) =>
      notesApi.update(id, data),
    onError: () => toast.error('Could not save note'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.notes.all }),
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => notesApi.delete(id),
    onError: () => toast.error('Could not delete note'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.notes.all }),
  });
}

export function useCreateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => notesApi.createFolder(path),
    onError: () => toast.error('Could not create folder'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.notes.all }),
  });
}

export function useDeleteFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => notesApi.deleteFolder(path),
    onError: () => toast.error('Could not delete folder'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.notes.all }),
  });
}

export function useRenameFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) => notesApi.renameFolder(from, to),
    onError: () => toast.error('Could not rename folder'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.notes.all }),
  });
}
