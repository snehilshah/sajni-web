import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
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

export function useMediaEvents(id: number, enabled = true) {
  return useQuery({
    queryKey: qk.media.events(id),
    queryFn: () => mediaApi.events(id),
    enabled,
  });
}

export function useCreateMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: MediaPatch) => mediaApi.create(data),
    onError: () => toast.error('Could not add'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.media.all }),
  });
}

export function useUpdateMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: MediaPatch }) =>
      mediaApi.update(id, data),
    onError: () => toast.error('Could not update'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.media.all }),
  });
}

export function useDeleteMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => mediaApi.delete(id),
    onError: () => toast.error('Could not delete'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.media.all }),
  });
}
