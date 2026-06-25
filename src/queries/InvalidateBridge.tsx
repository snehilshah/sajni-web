import { useEffect } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { qk } from './keys';

// AI tool mutations arrive over SSE (AIChat.tsx) and the task dialog emits a
// `task_saved` event (TaskDetailProvider) — neither flows through a TanStack
// mutation, so they can't auto-invalidate. This bridge is the single listener
// that translates those `data:invalidate` events into cache invalidations,
// replacing the old per-page event subscriptions.
//
// `kind` is a prefixed string (task_created, task_list_created, habit_logged,
// transaction_added, ...). Most specific prefixes must come first.
const ROUTES: Array<{ prefix: string; keys: QueryKey[] }> = [
  // task_list_* affects both the list groups and the tasks grouped under them.
  { prefix: 'task_list_', keys: [qk.taskLists.all, qk.tasks.all] },
  // A task create, edit, or delete can change its hashtag index too.
  { prefix: 'task_', keys: [qk.tasks.all, qk.tags.all] },
  { prefix: 'habit_', keys: [qk.habits.all] },
  { prefix: 'memo_', keys: [qk.memos.all] },
  { prefix: 'note_', keys: [qk.notes.all] },
  { prefix: 'media_', keys: [qk.media.all] },
  { prefix: 'journal_', keys: [qk.journal.all] },
  { prefix: 'bookmark_', keys: [qk.bookmarks.all] },
  // Money moves ripple across balances, overview and budgets — nuke the whole
  // finance root rather than guess which derived view is affected.
  { prefix: 'transaction_', keys: [qk.finance.all] },
  { prefix: 'biller_', keys: [qk.finance.all] },
  { prefix: 'account_', keys: [qk.finance.all] },
  { prefix: 'insight_', keys: [qk.insights.all] },
  { prefix: 'theme_', keys: [qk.themes.all] },
];

export function InvalidateBridge() {
  const qc = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pending = new Set<string>();

    const flush = () => {
      timer = null;
      const seen = new Set<string>();
      for (const kind of pending) {
        const route = ROUTES.find((r) => kind.startsWith(r.prefix));
        if (!route) continue;
        for (const key of route.keys) {
          const id = JSON.stringify(key);
          if (seen.has(id)) continue;
          seen.add(id);
          qc.invalidateQueries({ queryKey: key });
        }
      }
      pending.clear();
    };

    const handler = (e: Event) => {
      const kind = (e as CustomEvent).detail?.kind as string | undefined;
      if (!kind) return;
      pending.add(kind);
      // Coalesce a multi-tool AI turn (categorize -> update -> ...) into one
      // invalidation pass via a short debounce.
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 400);
    };

    window.addEventListener('data:invalidate', handler);
    return () => {
      window.removeEventListener('data:invalidate', handler);
      if (timer) clearTimeout(timer);
    };
  }, [qc]);

  return null;
}
