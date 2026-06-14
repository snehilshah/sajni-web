import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { analytics as analyticsApi, insights as insightsApi, type InsightWindow } from '@/api';
import type { Analytics } from '@/types';
import { qk } from './keys';

export function useAnalytics() {
  return useQuery({
    queryKey: qk.analytics.get(),
    queryFn: () => analyticsApi.get() as Promise<Analytics>,
  });
}

// --- Insights ---

export function useInsights(window?: InsightWindow) {
  return useQuery({
    queryKey: qk.insights.list(window),
    queryFn: () => insightsApi.list(window),
  });
}

export function useRunInsights() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (window: InsightWindow) => insightsApi.run(window),
    onError: () => toast.error('Could not refresh insights'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.insights.all }),
  });
}

export function usePinInsight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pinned }: { id: number; pinned: boolean }) =>
      pinned ? insightsApi.pin(id) : insightsApi.unpin(id),
    onError: () => toast.error('Could not update insight'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.insights.all }),
  });
}

export function useDismissInsight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => insightsApi.dismiss(id),
    onError: () => toast.error('Could not dismiss insight'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.insights.all }),
  });
}
