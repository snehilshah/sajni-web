import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { memos as memosApi } from '@/api';
import { qk } from './keys';

export type MemoListParams = Parameters<typeof memosApi.list>[0];

export function useMemos(params?: MemoListParams) {
  return useQuery({
    queryKey: qk.memos.list(params),
    queryFn: () => memosApi.list(params),
  });
}

export function useCreateMemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ content, pinned }: { content: string; pinned?: boolean }) =>
      memosApi.create(content, pinned),
    onError: () => toast.error('Could not save memo'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.memos.all }),
  });
}

export function useUpdateMemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { content?: string; pinned?: boolean } }) =>
      memosApi.update(id, data),
    onError: () => toast.error('Could not update memo'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.memos.all }),
  });
}

export function useDeleteMemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => memosApi.delete(id),
    onError: () => toast.error('Could not delete memo'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.memos.all }),
  });
}
