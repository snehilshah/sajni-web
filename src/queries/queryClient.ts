import { QueryClient } from '@tanstack/react-query';

// Single-device PKMS: invalidation (post-mutation + the AI bus bridge) is the
// correctness mechanism, not focus-polling. So we keep a short stale window for
// snappy repeat reads, skip refetch-on-focus (pure noise here), but do refetch
// on reconnect so a dropped connection self-heals.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});

// A task list invalidated while off screen would otherwise paint its old rows
// and counts for a beat when its pill is picked again, then jump to the fresh
// set. Drop it instead, so a switch goes skeleton → current list.
queryClient.getQueryCache().subscribe((event) => {
  if (event.type !== 'updated' || event.action.type !== 'invalidate') return;
  const { query } = event;
  if (query.queryKey[0] === 'tasks' && query.queryKey[1] === 'list' && !query.isActive()) {
    queryClient.removeQueries({ queryKey: query.queryKey, exact: true });
  }
});
