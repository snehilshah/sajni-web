import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { bookmarks as bookmarksApi } from '@/api';
import type { Bookmark } from '@/types';
import { qk } from './keys';

export type BookmarkListParams = Parameters<typeof bookmarksApi.list>[0];

export function useBookmarks(params?: BookmarkListParams) {
  return useQuery({
    queryKey: qk.bookmarks.list(params),
    queryFn: () => bookmarksApi.list(params),
  });
}

export function useCreateBookmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { url: string; title?: string; note?: string }) => bookmarksApi.create(data),
    onError: () => toast.error('Could not save bookmark'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.bookmarks.all }),
  });
}

// Optimistic: read/archive toggles flip instantly across every cached
// bookmark list (unread filter, archived filter, etc).
export function useUpdateBookmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { title?: string; note?: string; unread?: boolean; archived?: boolean } }) =>
      bookmarksApi.update(id, data),
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: qk.bookmarks.all });
      const prev = qc.getQueriesData({ queryKey: qk.bookmarks.all });
      qc.setQueriesData<Bookmark[]>({ queryKey: qk.bookmarks.all }, (old) =>
        Array.isArray(old) ? old.map((b) => (b.id === id ? { ...b, ...data } : b)) : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      ctx?.prev?.forEach(([key, val]) => qc.setQueryData(key, val));
      toast.error('Could not update bookmark');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.bookmarks.all }),
  });
}

export function useDeleteBookmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => bookmarksApi.delete(id),
    onError: () => toast.error('Could not delete bookmark'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.bookmarks.all }),
  });
}
