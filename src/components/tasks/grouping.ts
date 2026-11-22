import { addDays, format, startOfWeek } from 'date-fns';
import type { CSSProperties } from 'react';

import type { Task, TaskList, TaskPatch } from '@/types';
import { STATUS_LABELS, weekMondayKey } from './helpers';

// Group by: how the List view's sections and the Board's lanes split the
// tasks (DESIGN.md → Tasks). One choice per view, kept on this device.
// Status is the default for both. On the Board a lane is also a drop target,
// so each grouping says what a drop there sets (dropPatch).

export type GroupBy = 'status' | 'due' | 'priority' | 'list' | 'none';
export type TaskView = 'list' | 'board';

export const GROUP_LABELS: Record<GroupBy, string> = {
  status: 'Status',
  due: 'Due date',
  priority: 'Priority',
  list: 'List',
  none: 'None',
};

/** Groupings a view offers. The Board has no "None" (a lane is the point);
 *  List grouping is hidden inside one of the owner's lists (one group). */
export function groupOptions(view: TaskView, inOwnList: boolean): GroupBy[] {
  const all: GroupBy[] = view === 'board' ? ['status', 'due', 'priority', 'list'] : ['status', 'due', 'priority', 'list', 'none'];
  return inOwnList ? all.filter((g) => g !== 'list') : all;
}

const groupKey = (view: TaskView) => `sajni:tasks:group:${view}`;

export function readGroupBy(view: TaskView): GroupBy {
  try {
    const v = localStorage.getItem(groupKey(view)) as GroupBy | null;
    if (v && v in GROUP_LABELS && (view === 'list' || v !== 'none')) return v;
  } catch { /* private mode */ }
  return 'status';
}

export function saveGroupBy(view: TaskView, by: GroupBy) {
  try { localStorage.setItem(groupKey(view), by); } catch { /* private mode */ }
}

/** One section (List) or lane (Board). */
export interface TaskGroup {
  key: string;
  label: string;
  tasks: Task[];
  /** Overdue: the header reads in the error colour. */
  tone?: 'error';
  /** A priority group shows that priority's tinted box as its mark. */
  priority?: Task['priority'];
}

type GroupDef = Omit<TaskGroup, 'tasks'>;

const STATUS_ORDER: Record<TaskView, Task['status'][]> = {
  // Lanes in the order work flows; Blocked, the exception, comes last. In
  // the List, Done is the fold at the foot instead.
  board: ['todo', 'in_progress', 'done', 'blocked'],
  list: ['todo', 'in_progress', 'blocked'],
};

const DUE_DEFS: GroupDef[] = [
  { key: 'overdue', label: 'Overdue', tone: 'error' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'later', label: 'Later' },
  { key: 'none', label: 'No date' },
];

const PRIORITY_DEFS: GroupDef[] = [
  { key: 'high', label: 'High', priority: 'high' },
  { key: 'medium', label: 'Medium', priority: 'medium' },
  { key: 'low', label: 'Low', priority: 'low' },
];

/** The due horizon a task falls in. */
export function dueKey(t: Task, now = new Date()): string {
  const today = format(now, 'yyyy-MM-dd');
  const weekEnd = format(addDays(startOfWeek(now, { weekStartsOn: 1 }), 6), 'yyyy-MM-dd');
  if (t.due_date) {
    if (t.due_date < today) return 'overdue';
    if (t.due_date === today) return 'today';
    if (t.due_date <= weekEnd) return 'week';
    return 'later';
  }
  if (t.week_of) return t.week_of <= today ? 'week' : 'later';
  if (t.month_of) return 'later';
  return 'none';
}

const INBOX = 'inbox';

export function keyOf(t: Task, by: GroupBy): string {
  switch (by) {
    case 'status': return t.status;
    case 'due': return dueKey(t);
    case 'priority': return t.priority;
    case 'list': return t.list_id == null ? INBOX : String(t.list_id);
    default: return 'all';
  }
}

function defsFor(by: GroupBy, view: TaskView, lists: TaskList[]): GroupDef[] {
  switch (by) {
    case 'status': return STATUS_ORDER[view].map((s) => ({ key: s, label: STATUS_LABELS[s] }));
    case 'due': return DUE_DEFS;
    case 'priority': return PRIORITY_DEFS;
    case 'list': return [{ key: INBOX, label: 'Inbox' }, ...lists.map((l) => ({ key: String(l.id), label: l.name }))];
    default: return [{ key: 'all', label: '' }];
  }
}

/**
 * Splits tasks into groups in display order. The List drops empty groups;
 * the Board keeps every lane (an empty lane is still a place to drop), except
 * the List grouping's lists, where only lists with tasks get a lane.
 */
export function groupTasks(tasks: Task[], by: GroupBy, view: TaskView, lists: TaskList[]): TaskGroup[] {
  const groups = defsFor(by, view, lists).map((d) => ({ ...d, tasks: [] as Task[] }));
  const at = new Map(groups.map((g) => [g.key, g]));
  for (const t of tasks) at.get(keyOf(t, by))?.tasks.push(t);
  const keepEmpty = view === 'board' && by !== 'list';
  return groups.filter((g) => keepEmpty || g.tasks.length > 0);
}

/** What a Board drop into a lane does. */
export type DropAction =
  | { kind: 'patch'; patch: TaskPatch }
  /** The task opens to finish the move (Blocked needs a blocker). */
  | { kind: 'open' }
  /** A date to pick first (Due date → Later). */
  | { kind: 'pickDate' }
  | { kind: 'none' };

export function dropAction(by: GroupBy, lane: string, task: Task): DropAction {
  if (keyOf(task, by) === lane) return { kind: 'none' };
  switch (by) {
    case 'status':
      if (lane === 'blocked') return { kind: 'open' };
      return { kind: 'patch', patch: { status: lane as Task['status'] } };
    case 'priority':
      return { kind: 'patch', patch: { priority: lane as Task['priority'] } };
    case 'list':
      return { kind: 'patch', patch: lane === INBOX ? { clear_list: true } : { list_id: Number(lane) } };
    case 'due':
      if (lane === 'today') return { kind: 'patch', patch: { due_date: format(new Date(), 'yyyy-MM-dd') } };
      if (lane === 'week') return { kind: 'patch', patch: { week_of: weekMondayKey(), clear_due: true, clear_month: true } };
      if (lane === 'none') return { kind: 'patch', patch: { clear_due: true, clear_week: true, clear_month: true } };
      if (lane === 'later') return { kind: 'pickDate' };
      return { kind: 'none' };
    default:
      return { kind: 'none' };
  }
}

/** The fields a patch changes on the task as shown (the optimistic copy). */
export function patchFields(patch: TaskPatch): Partial<Task> {
  const next: Partial<Task> = {};
  if (patch.status) next.status = patch.status;
  if (patch.priority) next.priority = patch.priority;
  if (patch.list_id !== undefined) next.list_id = patch.list_id;
  if (patch.clear_list) next.list_id = null;
  if (patch.clear_due) next.due_date = null;
  if (patch.clear_week) next.week_of = null;
  if (patch.clear_month) next.month_of = null;
  if (patch.due_date) Object.assign(next, { due_date: patch.due_date, week_of: null, month_of: null });
  if (patch.week_of) Object.assign(next, { week_of: patch.week_of, due_date: null, month_of: null });
  return next;
}

/** Why a lane refuses a task, or null. The Board shows it at the lane's foot. */
export function laneRefusal(by: GroupBy, lane: string, task: Task): string | null {
  if (by === 'status' && lane === 'done' && (task.subtask_count ?? 0) > (task.subtasks_done ?? 0)) {
    const open = (task.subtask_count ?? 0) - (task.subtasks_done ?? 0);
    return `Mark its ${open} open subtask${open === 1 ? '' : 's'} done first.`;
  }
  if (by === 'due' && lane === 'overdue' && keyOf(task, by) !== 'overdue') {
    return "A task can't be made overdue. Drop it on a date.";
  }
  return null;
}

// ── Priority mark: the tinted box ─────────────────────────────────────────
// The status box carries priority: its border in the priority's colour (or
// the task's own colour) and a light fill of it. No separate dot.

const PRIORITY_HUE: Record<Task['priority'], string> = {
  high: 'var(--color-destructive)',
  medium: 'var(--color-amber-500)',
  low: 'var(--color-outline)',
};

export function priorityBox(priority: Task['priority'], color?: string | null): CSSProperties {
  const hue = color || PRIORITY_HUE[priority];
  return { borderColor: hue, backgroundColor: `color-mix(in oklab, ${hue} 18%, transparent)` };
}

// ── Folds (List view), kept on this device ────────────────────────────────

const FOLDS_KEY = 'sajni:tasks:folds';

function readFolds(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(FOLDS_KEY) || '{}') as Record<string, boolean>; } catch { return {}; }
}

/** Whether a fold is open. Groups start open; Done, Archive and Scratched closed. */
export function foldOpen(id: string, byDefault: boolean): boolean {
  return readFolds()[id] ?? byDefault;
}

export function saveFold(id: string, open: boolean) {
  try {
    const all = readFolds();
    all[id] = open;
    localStorage.setItem(FOLDS_KEY, JSON.stringify(all));
  } catch { /* private mode */ }
}
