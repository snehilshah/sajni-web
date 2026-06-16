import { startOfWeek, startOfMonth, format } from 'date-fns';
import type { Task, SmartList } from '@/types';

// weekMondayKey returns the Monday (YYYY-MM-DD) of the week containing `d`
// (default today). week_of on a week task always stores this Monday, matching
// the journal's Monday-anchored weekly view.
export function weekMondayKey(d: Date = new Date()): string {
  return format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
}

// monthFirstKey returns the 1st (YYYY-MM-DD) of the month containing `d`
// (default today). month_of on a month goal always stores this 1st.
export function monthFirstKey(d: Date = new Date()): string {
  return format(startOfMonth(d), 'yyyy-MM-dd');
}

export const STATUSES: Task['status'][] = ['todo', 'in_progress', 'done'];

export const STATUS_LABELS: Record<Task['status'], string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  scratched: 'Scratched',
};

export const STATUS_DOT: Record<Task['status'], string> = {
  todo: 'bg-muted-foreground/40',
  in_progress: 'bg-secondary',
  done: 'bg-primary',
  scratched: 'bg-muted-foreground/30',
};

export const PRIORITIES: Task['priority'][] = ['low', 'medium', 'high'];

export const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-destructive',
  medium: 'bg-amber-500',
  low: 'bg-muted-foreground/50',
};

export const PRIORITY_LABEL: Record<string, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export type Selection =
  | { kind: 'smart'; smart: SmartList }
  | { kind: 'list'; id: number };

export const SMART_LISTS: { smart: SmartList; label: string; description: string }[] = [
  { smart: 'my_day', label: 'My Day', description: 'Tasks due today' },
  { smart: 'important', label: 'Important', description: 'Starred tasks' },
  { smart: 'planned', label: 'Planned', description: 'Tasks with a due date' },
  { smart: 'week', label: 'This Week', description: 'Week-scoped tasks due this week' },
  { smart: 'month', label: 'This Month', description: 'Month goals — long agendas broken into sessions' },
  { smart: 'scheduled', label: 'Scheduled', description: 'Tasks with a time / reminder' },
  { smart: 'missed', label: 'Missed', description: 'Overdue & still open' },
  { smart: 'inbox', label: 'Inbox', description: 'Unfiled tasks' },
  { smart: 'all', label: 'All', description: 'Every open task' },
];

export function selectionLabel(sel: Selection, lists: { id: number; name: string }[]): string {
  if (sel.kind === 'smart') return SMART_LISTS.find((s) => s.smart === sel.smart)?.label || 'Tasks';
  return lists.find((l) => l.id === sel.id)?.name || 'List';
}

// uid generates a stable-enough id for new step rows on the client.
export function uid(): string {
  return 's_' + Math.random().toString(36).slice(2, 10);
}
