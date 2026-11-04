import { QueryClient, type Query } from '@tanstack/react-query';
import { retryable } from '@/lib/retryable';

// Single-device PKMS: invalidation (post-mutation + the AI bus bridge) is the
// correctness mechanism, not focus-polling. So we keep a short stale window for
// snappy repeat reads and skip refetch-on-focus for loaded data, but do refetch
// on reconnect so a dropped connection self-heals.
//
// A read that failed on a bad connection (no reply, a cut-off reply, a 5xx,
// our 30 s limit) is tried again after 1, 2 and 4 s; a refusal (4xx) isn't. One
// that still failed is fetched again when the tab is next focused, so a page
// isn't left showing nothing until a reload.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: (query: Query) => query.state.status === 'error',
      refetchOnReconnect: true,
      retry: (failures, err) => failures < 3 && retryable(err),
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
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
