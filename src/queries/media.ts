import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { failureText } from '@/lib/errors';
import { media as mediaApi } from '@/api';
import type { MediaPatch } from '@/types';
import { qk } from './keys';

export type MediaListParams = Parameters<typeof mediaApi.list>[0];

export function useMedia(params?: MediaListParams, enabled = true) {
  return useQuery({
    queryKey: qk.media.list(params),
    queryFn: () => mediaApi.list(params),
    enabled,
    // Keep the current shelf visible while a filter switch refetches, so the
    // grid animates instead of flashing the skeleton.
    placeholderData: keepPreviousData,
  });
}

export function useCreateMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: MediaPatch) => mediaApi.create(data),
    onError: (err) =>
      toast.error(failureText(err, 'Could not add')),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.media.all });
      qc.invalidateQueries({ queryKey: qk.tags.all });
    },
  });
}

export function useDeleteMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => mediaApi.delete(id),
    onError: () => toast.error('Could not delete'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.media.all });
      qc.invalidateQueries({ queryKey: qk.tags.all });
    },
  });
}

/** Autosave's write: no toast of its own (the editor's autosave reports
 *  failures), then refresh library and tag views. */
export function useAutosaveMedia() {
  const qc = useQueryClient();
  return async (id: number, data: MediaPatch) => {
    await mediaApi.update(id, data);
    void qc.invalidateQueries({ queryKey: qk.media.all });
    void qc.invalidateQueries({ queryKey: qk.tags.all });
  };
}
