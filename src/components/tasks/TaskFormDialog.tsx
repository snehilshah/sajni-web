import { useCallback, useEffect, useState } from 'react';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Trash2, Star, CalendarClock, ListChecks, Bell, Clock, History, Plus, X, Check, GitBranch, Ban, RotateCcw, Mail } from '@/components/ui/icons';
import { M3CookieLoader } from '@/components/ui/shapes';

import type { Task, TaskList, TaskStep } from '@/types';
import { tasks as tasksApi, type TaskHistoryEntry, type TaskEvent, type TaskReminder } from '@/api';
import { confirmDialog } from '@/lib/confirm';
import RichEditor from '@/components/editor/RichEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { TimePicker } from '@/components/ui/time-picker';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { MorphingDialog } from '@/components/motion/morphing-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { SegmentedButton } from '@/components/ui/segmented-button';
import {
  STATUSES, STATUS_LABELS, STATUS_DOT, PRIORITIES, PRIORITY_COLORS, PRIORITY_LABEL, weekMondayKey, monthFirstKey,
} from './helpers';
import { StepsEditor } from './TaskRow';

export interface FormState {
  title: string;
  description: string;
  priority: Task['priority'];
  status: Task['status'];
  blocked_by_task_id: number | null;
  /** 'day' = a dated task (due_date); 'week' = a week-scoped task (week_of);
   *  'month' = a month goal (month_of), broken into dated child sessions. */
  due_type: 'day' | 'week' | 'month';
  due_date: string;
  /** Monday (YYYY-MM-DD) of the chosen week when due_type === 'week'. */
  week_of: string;
  /** 1st (YYYY-MM-DD) of the chosen month when due_type === 'month'. */
  month_of: string;
  /** Local HH:MM clock time; '' = no time (all-day). */
  scheduled_time: string;
  /** Email the user at scheduled_time. */
  remind: boolean;
  /** Extra recipients also emailed when this task's reminders fire. */
  notify_emails: string[];
  list_id: number | null;
  important: boolean;
  steps: TaskStep[];
  /** Extra reminders (ISO instants) buffered while creating — flushed to the
   *  task after it's created. Unused when editing (those load from the API). */
  reminders: string[];
}

export type TaskDefaults = Partial<FormState>;

const blank: FormState = {
  title: '', description: '', priority: 'medium', status: 'todo', blocked_by_task_id: null,
  due_type: 'day', due_date: '', week_of: '', month_of: '', scheduled_time: '', remind: false,
  notify_emails: [], list_id: null, important: false, steps: [], reminders: [],
};

// Local "HH:MM" from an ISO instant, in the browser's tz. '' when null.
function timeFromISO(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// eventText renders one audit-trail line for the activity timeline.
function eventText(e: TaskEvent): React.ReactNode {
  const label = (s: string) => STATUS_LABELS[s as Task['status']] ?? s;
  switch (e.kind) {
    case 'created':
      return 'Created this task';
    case 'status':
      return <>Status <b className="font-medium">{label(e.from) || '—'}</b> → <b className="font-medium">{label(e.to)}</b></>;
    case 'title':
      return <>Renamed to <b className="font-medium">“{e.to}”</b></>;
    case 'list':
      return <>Moved <b className="font-medium">{e.from}</b> → <b className="font-medium">{e.to}</b></>;
    case 'rescheduled': {
      const fmt = (s: string) => { try { return format(parseISO(s), 'MMM d'); } catch { return s; } };
      return <>Rescheduled from <b className="font-medium">{fmt(e.from)}</b> → <b className="font-medium">{fmt(e.to)}</b></>;
    }
    default:
      return e.kind;
  }
}

// Combine a YYYY-MM-DD date + local HH:MM into an absolute ISO instant.
// Returns null unless both are present. new Date('YYYY-MM-DDTHH:MM')
// parses as local time, so toISOString() yields the correct UTC instant.
function toScheduledISO(date: string, time: string): string | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseComplete?: () => void;
  editing: Task | null;
  defaults?: TaskDefaults;
  lists: TaskList[];
  onSaved: () => void;
  layoutId?: string;
  /** Fired only on a *new* task create, with the created row — lets callers
   *  (e.g. the journal /task picker) act on it, like inserting a chip. */
  onCreated?: (saved: { id: number; title: string }) => void;
}

export default function TaskFormDialog({ open, onOpenChange, onCloseComplete, editing, defaults, lists, onSaved, layoutId, onCreated }: Props) {
  const [form, setForm] = useState<FormState>(blank);
  const [history, setHistory] = useState<TaskHistoryEntry[]>([]);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [saving, setSaving] = useState(false);
  const [blockerTasks, setBlockerTasks] = useState<Task[]>([]);
  // The parent task when editing a subtask — drives the "Subtask of …" banner
  // so a child never reads as a standalone task, and so the user can promote it.
  const [parent, setParent] = useState<{ id: number; title: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        title: editing.title,
        description: editing.description || '',
        priority: editing.priority,
        status: editing.status,
        blocked_by_task_id: editing.blocked_by_task_id ?? null,
        due_type: editing.month_of ? 'month' : editing.week_of ? 'week' : 'day',
        due_date: editing.due_date || '',
        week_of: editing.week_of || '',
        month_of: editing.month_of || '',
        scheduled_time: timeFromISO(editing.scheduled_at),
        remind: editing.remind ?? false,
        notify_emails: editing.notify_emails ?? [],
        list_id: editing.list_id ?? null,
        important: editing.important,
        steps: editing.steps || [],
        reminders: [],
      });
      setHistory([]);
      setEvents([]);
      setParent(null);
      tasksApi.history(editing.id).then(setHistory).catch(() => {});
      tasksApi.events(editing.id).then(setEvents).catch(() => {});
      if (editing.parent_task_id != null) {
        tasksApi.get(editing.parent_task_id)
          .then((p) => setParent({ id: p.id, title: p.title }))
          .catch(() => setParent(null));
      }
    } else {
      setForm({ ...blank, ...defaults });
      setHistory([]);
      setEvents([]);
      setParent(null);
    }
    tasksApi.list({ smart: 'all' }).then(setBlockerTasks).catch(() => setBlockerTasks([]));
  }, [open, editing, defaults]);

  const blockerCandidates = blockerTasks.filter((candidate) => {
    if (candidate.id === editing?.id || candidate.status === 'done' || candidate.status === 'scratched') return false;
    if (!editing) return true;
    const byId = new Map(blockerTasks.map((task) => [task.id, task]));
    let cursor: Task | undefined = candidate;
    const seen = new Set<number>();
    while (cursor?.blocked_by_task_id && !seen.has(cursor.id)) {
      if (cursor.blocked_by_task_id === editing.id) return false;
      seen.add(cursor.id);
      cursor = byId.get(cursor.blocked_by_task_id);
    }
    return true;
  });

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    // A week task or month goal has no specific day → no time/reminder.
    // Otherwise a time only makes sense with a day, and remind only with a time.
    const isWeek = form.due_type === 'week';
    const isMonth = form.due_type === 'month';
    const noDay = isWeek || isMonth;
    const scheduledISO = noDay ? null : toScheduledISO(form.due_date, form.scheduled_time);
    const remind = scheduledISO ? form.remind : false;
    // Custom recipients only matter when something actually fires.
    const notify_emails = form.notify_emails;
    try {
      if (editing) {
        const listChanged = form.list_id !== (editing.list_id ?? null);
        await tasksApi.update(editing.id, {
          title: form.title,
          description: form.description,
          priority: form.priority,
          status: form.status,
          blocked_by_task_id: form.status === 'blocked' ? form.blocked_by_task_id ?? undefined : undefined,
          clear_blocked_by: form.status !== 'blocked',
          // Day / week / month are exclusive — set one column, clear the others
          // so a switch never leaves a stale due_date / week_of / month_of behind.
          ...(isMonth
            ? { month_of: form.month_of, clear_due: true, clear_week: true, clear_scheduled: true, remind: false }
            : isWeek
            ? { week_of: form.week_of, clear_due: true, clear_month: true, clear_scheduled: true, remind: false }
            : {
                due_date: form.due_date || null,
                week_of: null, clear_week: true,
                month_of: null, clear_month: true,
                scheduled_at: scheduledISO,
                clear_scheduled: scheduledISO === null,
                remind,
              }),
          notify_emails,
          list_id: form.list_id,
          // list_id:null alone is ignored by the API ("leave alone"); clear_list
          // is what actually moves a task to Inbox.
          clear_list: form.list_id === null,
          // A subtask only ever renders under its parent, so assigning it a
          // different list does nothing visible unless we also detach it.
          // Promote it to a real top-level task in the chosen list.
          ...(parent && listChanged ? { clear_parent: true } : {}),
          important: form.important,
          steps: form.steps,
        });
        onOpenChange(false);
        onSaved();
      } else {
        const res = await tasksApi.create({
          title: form.title,
          description: form.description,
          priority: form.priority,
          status: form.status,
          blocked_by_task_id: form.status === 'blocked' ? form.blocked_by_task_id ?? undefined : undefined,
          due_date: noDay ? undefined : (form.due_date || undefined),
          week_of: isWeek ? form.week_of : undefined,
          month_of: isMonth ? form.month_of : undefined,
          scheduled_at: scheduledISO ?? undefined,
          remind,
          notify_emails,
          list_id: form.list_id ?? null,
          important: form.important,
          steps: form.steps,
        });
        // Flush buffered extra reminders to the new task (parity with edit,
        // where RemindersSection talks to the API directly). The task is
        // already saved — a failed reminder shouldn't lose it, so surface a
        // soft toast and carry on.
        if (form.reminders.length > 0) {
          const results = await Promise.allSettled(
            form.reminders.map((iso) => tasksApi.addReminder(res.id, iso)),
          );
          const failed = results.filter((r) => r.status === 'rejected').length;
          if (failed > 0) toast.error(`Task saved, but ${failed} reminder${failed > 1 ? 's' : ''} failed to add.`);
        }
        onOpenChange(false);
        onSaved();
        onCreated?.({ id: res.id, title: form.title.trim() });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    if (!(await confirmDialog(`Delete "${editing.title}"? Subtasks will be removed too.`))) return;
    await tasksApi.delete(editing.id);
    onOpenChange(false);
    onSaved();
  };

  // Promote a subtask to a standalone top-level task (keeps it in its current
  // list). The banner action; list changes auto-detach via handleSave too.
  const handleDetach = async () => {
    if (!editing) return;
    await tasksApi.update(editing.id, { clear_parent: true });
    setParent(null);
    onSaved();
  };

  // Scratch = abandon-but-keep (reversible). Toggles between scratched/todo.
  const handleScratch = async () => {
    if (!editing) return;
    const next = form.status === 'scratched' ? 'todo' : 'scratched';
    await tasksApi.update(editing.id, { status: next });
    onOpenChange(false);
    onSaved();
  };

  const isMobile = useIsMobile();
  return (
    <MorphingDialog
      open={open}
      onClose={() => onOpenChange(false)}
      onCloseComplete={onCloseComplete}
      // New-task opens can morph from a page-owned source. Flows without one
      // (task rows, RichEditor /task) keep the scale/fade fallback.
      layoutId={editing ? undefined : layoutId}
      ariaLabel={editing ? 'Edit task' : 'New task'}
      className={cn(
        isMobile
          ? 'inset-x-0 bottom-0 max-w-full w-full h-[92dvh] rounded-b-none border-t border-border'
          : 'left-0 right-0 top-[7vh] mx-auto w-[min(42rem,92vw)] h-[min(85vh,720px)]',
      )}
    >
        <div className="shrink-0 px-4 md:px-6 pt-4 md:pt-6 pb-3 md:pb-4 pr-14 border-b border-border">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => setForm({ ...form, important: !form.important })}
              className={`mt-0.5 p-1.5 hover:bg-accent transition-colors ${form.important ? 'text-secondary' : 'text-muted-foreground'}`}
              title={form.important ? 'Remove from Important' : 'Mark important'}
            >
              <Star className={`size-4 ${form.important ? 'fill-current' : ''}`} />
            </button>
            <div className="min-w-0">
              <div className="text-lg font-semibold leading-none tracking-tight font-serif">{editing ? 'Edit task' : 'New task'}</div>
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mt-1">
                {editing ? 'Update details below' : 'Capture something to do'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 md:gap-5 flex-1 overflow-y-auto px-4 md:px-6 py-4 md:py-5">
          {/* Subtask context — makes parentage explicit (a child must never
              read as a normal task) and lets the user promote it out so it can
              live in its own list. */}
          {parent && (
            <div className="flex items-center gap-2.5 rounded-xl border border-border bg-[hsl(var(--surface-container))] px-3 py-2 text-sm">
              <GitBranch className="size-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground shrink-0">Subtask of</span>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('task:open', { detail: { id: parent.id } }))}
                className="font-medium truncate hover:text-primary transition-colors"
              >
                {parent.title}
              </button>
              <Button variant="outline" size="sm" className="ml-auto h-7 shrink-0" onClick={handleDetach}>
                Move out
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Title</Label>
            <Input
              id="task-title"
              name="task-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              autoFocus={!editing}
              placeholder="What needs doing?"
              className="h-auto font-serif text-lg md:text-2xl font-medium tracking-tight placeholder:text-muted-foreground/40 px-3 py-2"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 md:gap-3 shrink-0">
            <div className="flex flex-col gap-1.5">
              <Label className="flex h-6 items-center text-xs font-mono uppercase tracking-wider text-muted-foreground">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: (v as Task['status']) || 'todo' })}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue>
                    <span className="flex items-center gap-2">
                      <span className={`size-2 rounded-full ${STATUS_DOT[form.status]}`} />
                      {STATUS_LABELS[form.status]}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      <span className="flex items-center gap-2">
                        <span className={`size-2 rounded-full ${STATUS_DOT[s]}`} />
                        {STATUS_LABELS[s]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="flex h-6 items-center text-xs font-mono uppercase tracking-wider text-muted-foreground">Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: (v as Task['priority']) || 'medium' })}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue>
                    <span className="flex items-center gap-2">
                      <span className={`size-2 rounded-full ${PRIORITY_COLORS[form.priority]}`} />
                      {PRIORITY_LABEL[form.priority]}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      <span className="flex items-center gap-2">
                        <span className={`size-2 rounded-full ${PRIORITY_COLORS[p]}`} />
                        {PRIORITY_LABEL[p]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="flex h-6 items-center text-xs font-mono uppercase tracking-wider text-muted-foreground">List</Label>
              <Select
                value={form.list_id ? String(form.list_id) : 'inbox'}
                onValueChange={(v) =>
                  setForm({ ...form, list_id: v === 'inbox' ? null : Number(v) })
                }
                items={[{ value: 'inbox', label: '📥 Inbox' }, ...lists.map((l) => ({ value: String(l.id), label: l.name }))]}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inbox">📥 Inbox</SelectItem>
                  {lists.map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>
                      <span className="flex items-center gap-2">
                        <span className="size-2 rounded-full" style={{ backgroundColor: l.color }} />
                        {l.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.status === 'blocked' && (
            <div className="flex flex-col gap-1.5 rounded-xl border border-[hsl(var(--error)/0.25)] bg-[hsl(var(--error-container)/0.55)] p-3">
              <Label className="text-xs font-mono uppercase tracking-wider text-[hsl(var(--on-error-container))] inline-flex items-center gap-1.5">
                <GitBranch className="size-3" /> Blocked by
              </Label>
              <Select
                value={form.blocked_by_task_id ? String(form.blocked_by_task_id) : undefined}
                onValueChange={(value) => setForm({ ...form, blocked_by_task_id: Number(value) })}
                items={blockerCandidates.map((task) => ({ value: String(task.id), label: task.title }))}
              >
                <SelectTrigger className="h-10 bg-card text-sm" aria-label="Select blocking task">
                  <SelectValue placeholder="Select task that must finish first" />
                </SelectTrigger>
                <SelectContent>
                  {blockerCandidates.map((task) => (
                    <SelectItem key={task.id} value={String(task.id)}>
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={`size-2 rounded-full shrink-0 ${STATUS_DOT[task.status]}`} />
                        <span className="truncate">{task.title}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-[hsl(var(--on-error-container)/0.8)]">
                Completing, scratching, or deleting blocker returns this task to To do.
              </p>
            </div>
          )}

          {/* Due scope — its own full-width row (a 3-way toggle crammed into a
              grid cell overran the List label). Connected M3 button-group picks
              the scope; the picker below adapts. Day → date, Week → Monday
              anchor, Month → 1st-of-month goal (broken into dated sessions). */}
          <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-card/50 p-3 shrink-0">
            <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
              <CalendarClock className="size-3" /> Due date &amp; time
            </Label>
            <SegmentedButton
              showCheck={false}
              stretch
              aria-label="Due scope"
              value={form.due_type}
              onChange={(t) => setForm({
                ...form,
                due_type: t as FormState['due_type'],
                ...(t === 'week' && !form.week_of ? { week_of: weekMondayKey() } : {}),
                ...(t === 'month' && !form.month_of ? { month_of: monthFirstKey() } : {}),
              })}
              options={[
                { value: 'day', label: 'Day' },
                { value: 'week', label: 'Week' },
                { value: 'month', label: 'Month' },
              ]}
            />
            <div className={cn('grid gap-2.5', form.due_type === 'day' && 'sm:grid-cols-2')}>
            {form.due_type === 'day' ? (
              <DatePicker
                id="task-due-date"
                name="task-due-date"
                value={form.due_date}
                onChange={(v) => setForm({ ...form, due_date: v })}
                placeholder="No date"
              />
            ) : form.due_type === 'week' ? (
              // Picking any day snaps to that week's Monday (week_of anchor).
              <DatePicker
                value={form.week_of}
                onChange={(v) => setForm({ ...form, week_of: v ? weekMondayKey(parseISO(v)) : '' })}
                placeholder="Pick a week"
              />
            ) : (
              // Picking any day snaps to that month's 1st (month_of anchor).
              <DatePicker
                value={form.month_of}
                onChange={(v) => setForm({ ...form, month_of: v ? monthFirstKey(parseISO(v)) : '' })}
                placeholder="Pick a month"
              />
            )}
            {form.due_type === 'day' && (
              <TimePicker
                id="task-time"
                name="task-time"
                value={form.scheduled_time}
                placeholder="No time"
                onChange={(v) => setForm({
                  ...form,
                  scheduled_time: v,
                  due_date: v && !form.due_date ? format(new Date(), 'yyyy-MM-dd') : form.due_date,
                  remind: v ? form.remind : false,
                })}
              />
            )}
            </div>
          </div>

          {/* Reminder controls stay together, separate from due date/time. */}
          <div className="flex flex-col rounded-lg border border-border bg-card/50">
            {form.due_type === 'day' ? (
              <div className="flex flex-col gap-2 p-3">
                <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
                  <Bell className="size-3" /> Reminders
                </Label>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <label
                    className={cn(
                      'flex items-center gap-2.5 rounded-xl px-3 h-11 flex-1 border border-border transition-colors',
                      form.scheduled_time ? 'hover:bg-[hsl(var(--on-surface)/0.06)] cursor-pointer' : 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    <Bell className="size-4 text-muted-foreground shrink-0" />
                    <span className="text-sm flex-1">Remind me by email</span>
                    <Switch
                      checked={form.remind}
                      disabled={!form.scheduled_time}
                      onCheckedChange={(v) => setForm({ ...form, remind: v })}
                    />
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {!form.scheduled_time
                    ? 'Set a time — scheduled for the due date, or today if none is set.'
                    : form.remind
                      ? "You'll be emailed at this task's scheduled time. Want another nudge too? Add a custom reminder below."
                      : 'Shows on your Today agenda. Turn on Remind for an email nudge at the scheduled time.'}
                </p>
              </div>
            ) : (
              <div className="p-3">
                <p className="text-xs text-muted-foreground inline-flex items-start gap-1.5">
                  <Clock className="size-3 mt-0.5 shrink-0" /> <span>{form.due_type === 'month'
                    ? 'Month goals have no set time. Sajni emails your pending month tasks on the last day of the month — break them into dated sessions below.'
                    : 'Week tasks have no set time. Sajni emails your pending week tasks every Friday morning. Add a reminder below for a custom nudge.'}</span>
                </p>
              </div>
            )}
            {/* Custom recipients — also email these people when reminders fire. */}
            <div className="border-t border-border/70 p-3">
              <EmailRecipients
                value={form.notify_emails}
                onChange={(em) => setForm({ ...form, notify_emails: em })}
              />
            </div>
            {/* Extra reminders — any date/time, delivered by the cron. Editing
                talks to the API directly; creating buffers them in form state
                and the create handler flushes them once the task exists. */}
            <div className="border-t border-border/70 p-3">
              {editing ? (
                <RemindersSection taskId={editing.id} />
              ) : (
                <RemindersSection
                  draft={form.reminders}
                  onDraftChange={(r) => setForm({ ...form, reminders: r })}
                />
              )}
            </div>
          </div>

          {/* Steps editor — a quick inline checklist (lighter than subtasks). */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
              <ListChecks className="size-3" /> Steps
            </Label>
            <div className="rounded-lg border border-border bg-card/50 px-2 py-1.5">
              <StepsEditor
                steps={form.steps}
                onChange={(next) => setForm({ ...form, steps: next })}
                onCommit={editing ? (next) => {
                  // Persist step mutations immediately when editing an
                  // existing task so Enter/toggle/delete don't require
                  // a separate Save click.
                  tasksApi.update(editing.id, { steps: next }).then(onSaved).catch(() => {});
                } : undefined}
              />
            </div>
          </div>

          {/* Subtasks — real child tasks (own status/due). Only on an existing
              task; a new task has no id to parent them to yet. */}
          {editing && (
            <SubtasksSection taskId={editing.id} listId={editing.list_id ?? null} isGoal={!!editing.month_of} onChanged={onSaved} />
          )}

          {editing && history.length > 0 && (
            <div className="rounded-lg border border-border bg-card/30 p-3 flex flex-col gap-2 shrink-0">
              <h4 className="font-mono text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <CalendarClock className="size-3" />
                Lifecycle ({history.length})
              </h4>
              <div className="flex flex-col gap-1">
                {history.map((h, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={`font-mono text-xs uppercase tracking-wider ${
                      h.outcome === 'rescheduled'
                        ? 'text-[hsl(var(--primary))]'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}>
                      {h.outcome}
                    </span>
                    <span className="text-muted-foreground">on</span>
                    <span className="font-mono">{format(parseISO(h.due_date), 'MMM d, yyyy')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity — GitHub-style audit timeline (create / status / title
              / list moves). Note edits are intentionally not tracked. */}
          {editing && events.length > 0 && (
            <div className="rounded-lg border border-border bg-card/30 p-3 flex flex-col gap-2 shrink-0">
              <h4 className="font-mono text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <History className="size-3" /> Activity ({events.length})
              </h4>
              <ol className="relative ml-1 flex flex-col gap-3 border-l border-border/60 pl-4 pt-1">
                {events.map((e, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[21px] top-1 size-2.5 rounded-full bg-[hsl(var(--secondary))] ring-2 ring-[hsl(var(--card))]" />
                    <div className="text-xs text-foreground/90 leading-snug">{eventText(e)}</div>
                    <div className="font-mono text-xs text-muted-foreground mt-0.5">
                      {formatDistanceToNow(parseISO(e.created_at), { addSuffix: true })}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="flex flex-col flex-1 min-h-[140px] md:min-h-[200px] border border-border rounded-lg overflow-hidden bg-card">
            <div className="bg-muted/30 border-b border-border px-3 py-1.5 flex items-center justify-between shrink-0">
              <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Notes</Label>
              <span className="text-xs text-muted-foreground/80">/ commands · # tags · [[ links</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
              <RichEditor
                value={form.description}
                onChange={(v) => setForm({ ...form, description: v })}
                placeholder="Add details, links, sub-context…"
              />
            </div>
          </div>
        </div>

        <div className="shrink-0 flex flex-row items-center justify-end gap-2 px-4 md:px-6 py-3 md:py-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-border bg-muted/20">
          {editing && (
            <div className="mr-auto flex items-center gap-1">
              <Button
                variant="ghost"
                onClick={handleScratch}
                className="text-muted-foreground hover:text-foreground gap-1.5"
                title={form.status === 'scratched' ? 'Restore this task' : 'Scratch (abandon, but keep)'}
              >
                {form.status === 'scratched'
                  ? <><RotateCcw className="size-3.5" /> Unscratch</>
                  : <><Ban className="size-3.5" /> Scratch</>}
              </Button>
              <Button
                variant="ghost"
                onClick={handleDelete}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5"
              >
                <Trash2 className="size-3.5" /> Delete
              </Button>
            </div>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.title.trim() || (form.status === 'blocked' && !form.blocked_by_task_id)} className="gap-1.5">
            {saving && <M3CookieLoader size="xs" tone="primary" className="!text-primary-foreground" />}
            {editing ? 'Save' : 'Create task'}
          </Button>
        </div>
    </MorphingDialog>
  );
}

// SubtasksSection — real child tasks under a parent. Each carries its own
// status/due; toggling completes it, the title opens it in this same dialog,
// and the inline row adds a new one. This is the explicit "add subtask" CTA
// that previously only existed (hidden) behind the list-row expander.
function SubtasksSection({ taskId, listId, isGoal = false, onChanged }: { taskId: number; listId: number | null; isGoal?: boolean; onChanged: () => void }) {
  const [subs, setSubs] = useState<Task[] | null>(null);
  const [draft, setDraft] = useState('');
  // Month-goal sessions can carry a date as they're added (the "+ add session"
  // flow); a plain subtask stays dateless and gets a date via its own dialog.
  const [dateDraft, setDateDraft] = useState('');

  const load = useCallback(() => {
    tasksApi.subtasks(taskId).then(setSubs).catch(() => setSubs([]));
  }, [taskId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const title = draft.trim();
    if (!title) return;
    setDraft('');
    setDateDraft('');
    await tasksApi.create({ title, parent_task_id: taskId, list_id: listId, due_date: dateDraft || undefined });
    load();
    onChanged();
  };
  const toggle = async (s: Task) => {
    await tasksApi.update(s.id, { status: s.status === 'done' ? 'todo' : 'done' });
    load();
    onChanged();
  };
  const remove = async (s: Task) => {
    await tasksApi.delete(s.id);
    load();
    onChanged();
  };

  const done = subs?.filter((s) => s.status === 'done').length ?? 0;
  const total = subs?.length ?? 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
          <GitBranch className="size-3" /> {isGoal ? 'Sessions' : 'Subtasks'}
        </Label>
        {total > 0 && <span className="mono text-xs text-muted-foreground tabular-nums">{done}/{total} done</span>}
      </div>
      <div className="rounded-lg border border-border bg-card/50 px-1.5 py-1.5 flex flex-col gap-0.5">
        <AnimatePresence initial={false}>
          {subs?.map((s) => (
            <motion.div
              key={s.id}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
              className="group flex items-center gap-2.5 rounded-xl px-2 py-1 hover:bg-[hsl(var(--surface-container-high))] transition-colors"
            >
              <motion.button
                type="button"
                whileTap={{ scale: 0.85 }}
                transition={{ type: 'spring', stiffness: 500, damping: 24 }}
                onClick={() => toggle(s)}
                className={`size-[18px] rounded-full border-2 flex items-center justify-center shrink-0 transition-colors
                  ${s.status === 'done' ? 'border-primary bg-primary text-primary-foreground' : 'border-[hsl(var(--outline))] hover:border-primary'}`}
                aria-pressed={s.status === 'done'}
              >
                {s.status === 'done' && <Check className="size-3" strokeWidth={3.5} />}
              </motion.button>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('task:open', { detail: { id: s.id } }))}
                className={`flex-1 text-left text-sm truncate hover:text-primary transition-colors ${s.status === 'done' ? 'line-through text-muted-foreground' : ''}`}
              >
                {s.title}
              </button>
              {s.due_date && (
                <span className="mono text-xs text-muted-foreground shrink-0">{format(parseISO(s.due_date), 'MMM d')}</span>
              )}
              <button
                type="button"
                onClick={() => remove(s)}
                className="opacity-0 group-hover:opacity-100 size-6 rounded-full inline-flex items-center justify-center text-muted-foreground hover:bg-[hsl(var(--on-surface)/0.08)] hover:text-foreground transition-all shrink-0"
                title="Delete subtask"
              >
                <X className="size-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
        <div className="flex items-center gap-2.5 rounded-xl px-2 py-1">
          <span className="size-[18px] rounded-full border-2 border-dashed border-[hsl(var(--outline)/0.6)] inline-flex items-center justify-center shrink-0 text-muted-foreground/60">
            <Plus className="size-3" strokeWidth={2.5} />
          </span>
          <Input
            name={`new-subtask-${taskId}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); add(); }
              if (e.key === 'Escape') setDraft('');
            }}
            placeholder={isGoal ? (total === 0 ? 'Add a session…' : 'Add a session') : (total === 0 ? 'Break this into smaller tasks…' : 'Add a subtask')}
            className="flex-1 h-7 border-0 bg-transparent px-1 py-0 shadow-none outline-none focus-visible:border-0 focus-visible:shadow-none text-sm placeholder:text-muted-foreground/50"
          />
          {isGoal && draft && (
            <div className="shrink-0 w-32">
              <DatePicker value={dateDraft} onChange={setDateDraft} placeholder="Date" />
            </div>
          )}
          {draft && (
            <button
              type="button"
              onClick={add}
              className="shrink-0 rounded-full bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))] text-xs font-medium px-3 py-1 hover:opacity-90 transition-opacity"
            >
              Add
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// EmailRecipients — extra addresses also emailed when this task's reminders
// fire (e.g. a friend for a meet-up). The owner is always notified anyway;
// these are email-only. Capped at MAX (server enforces the same) with a
// lightweight format check so obvious typos don't get saved.
const MAX_NOTIFY_EMAILS = 3;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function EmailRecipients({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState('');

  const add = () => {
    const e = draft.trim().toLowerCase();
    if (!e) return;
    if (!EMAIL_RE.test(e)) { setErr('Enter a valid email address.'); return; }
    if (value.includes(e)) { setDraft(''); return; }
    if (value.length >= MAX_NOTIFY_EMAILS) { setErr(`Up to ${MAX_NOTIFY_EMAILS} recipients.`); return; }
    onChange([...value, e]);
    setDraft('');
    setErr('');
  };
  const remove = (e: string) => onChange(value.filter((x) => x !== e));

  const full = value.length >= MAX_NOTIFY_EMAILS;
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
        <Mail className="size-3" /> Also email
      </Label>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <AnimatePresence initial={false}>
            {value.map((e) => (
              <motion.span
                key={e}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.14, ease: [0.2, 0, 0, 1] }}
                className="group inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))] pl-2.5 pr-1.5 py-1 text-xs"
              >
                <span className="max-w-[14rem] truncate">{e}</span>
                <button
                  type="button"
                  onClick={() => remove(e)}
                  className="size-4 inline-flex items-center justify-center rounded-full hover:bg-[hsl(var(--on-surface)/0.12)] transition-colors"
                  title="Remove recipient"
                >
                  <X className="size-3" />
                </button>
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      )}
      {!full && (
        <div className="flex items-center gap-2">
          <Input
            type="email"
            inputMode="email"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); if (err) setErr(''); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
            }}
            placeholder="friend@example.com"
            className="h-9 flex-1 text-sm"
          />
          {draft.trim() && (
            <Button type="button" size="sm" variant="outline" className="h-9 shrink-0" onClick={add}>
              <Plus className="size-3.5" /> Add
            </Button>
          )}
        </div>
      )}
      <p className={cn('text-xs', err ? 'text-destructive' : 'text-muted-foreground')}>
        {err || 'They get an email-only nudge when this task reminds. You’re always notified too.'}
      </p>
    </div>
  );
}

// RemindersSection — any number of reminder instants on any date, delivered
// by the reminder cron (currently email). Independent of the task's own time
// and the single "remind at scheduled time" toggle above.
// RemindersSection works in two modes:
//  • API mode (taskId)        — reads/writes reminders straight to the task.
//  • draft mode (draft/onDraftChange) — for a not-yet-created task; reminders
//    live in parent form state as ISO strings and the create handler flushes
//    them once the task exists. Same UI either way (parity create⇄edit).
function RemindersSection({ taskId, draft, onDraftChange }: {
  taskId?: number;
  draft?: string[];
  onDraftChange?: (v: string[]) => void;
}) {
  const isDraft = taskId == null;
  const [apiRems, setApiRems] = useState<TaskReminder[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [saving, setSaving] = useState(false);

  // Unified display list. Draft reminders have no real id (key by ISO); they
  // can't be "sent" yet, so sent_at is always null.
  const rems: TaskReminder[] | null = isDraft
    ? (draft ?? []).map((iso, i) => ({ id: i, remind_at: iso, sent_at: null }))
    : apiRems;

  const load = useCallback(() => {
    if (isDraft || taskId == null) return;
    tasksApi.reminders(taskId).then(setApiRems).catch(() => setApiRems([]));
  }, [isDraft, taskId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!date || !time) return;
    const d = new Date(`${date}T${time}`);
    if (isNaN(d.getTime())) return;
    if (isDraft) {
      onDraftChange?.([...(draft ?? []), d.toISOString()]);
      setAdding(false); setDate(''); setTime('09:00');
      return;
    }
    setSaving(true);
    try {
      await tasksApi.addReminder(taskId!, d.toISOString());
      setAdding(false);
      setDate('');
      setTime('09:00');
      load();
    } finally {
      setSaving(false);
    }
  };
  const remove = async (rid: number) => {
    if (isDraft) {
      onDraftChange?.((draft ?? []).filter((_, i) => i !== rid));
      return;
    }
    await tasksApi.deleteReminder(taskId!, rid);
    load();
  };

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
        <Bell className="size-3" /> Reminders
      </Label>
      <div className="flex flex-col gap-1.5">
        <AnimatePresence initial={false}>
          {rems?.map((r) => (
            <motion.div
              key={r.id}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
              className="group flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 bg-[hsl(var(--surface-container-high))]"
            >
              <Bell className={`size-3.5 shrink-0 ${r.sent_at ? 'text-muted-foreground/50' : 'text-[hsl(var(--primary))]'}`} />
              <span className={`text-sm flex-1 ${r.sent_at ? 'text-muted-foreground line-through' : ''}`}>
                {(() => { try { return format(parseISO(r.remind_at), 'EEE, MMM d · h:mm a'); } catch { return r.remind_at; } })()}
              </span>
              {r.sent_at && <span className="mono text-xs uppercase tracking-wider text-muted-foreground">sent</span>}
              <button
                type="button"
                onClick={() => remove(r.id)}
                className="opacity-0 group-hover:opacity-100 size-6 rounded-full inline-flex items-center justify-center text-muted-foreground hover:bg-[hsl(var(--on-surface)/0.08)] hover:text-foreground transition-all shrink-0"
                title="Remove reminder"
              >
                <X className="size-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>

        {rems && rems.length === 0 && !adding && (
          <p className="text-xs text-muted-foreground px-1">No extra reminders — add one for any date and time.</p>
        )}

        {adding ? (
          <div className="flex flex-col gap-2 pt-0.5">
            {/* Give time an explicit column so the date field cannot squeeze
                "12:55 PM" behind the icon/clear control. Stack only on
                extra-narrow screens. */}
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(9.5rem,10rem)] gap-2 max-[380px]:grid-cols-1">
              <div className="min-w-0"><DatePicker value={date} onChange={setDate} placeholder="Pick a date" /></div>
              <div className="min-w-0"><TimePicker value={time} onChange={setTime} placeholder="Time" /></div>
            </div>
            <div className="flex gap-1.5 justify-end">
              <Button size="sm" onClick={add} disabled={!date || saving} className="gap-1.5">
                {saving && <M3CookieLoader size="xs" tone="primary" className="!text-primary-foreground" />}
                Add
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setAdding(true); if (!date) setDate(format(new Date(), 'yyyy-MM-dd')); }}
            className="self-start inline-flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5 bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))] hover:opacity-90 transition-opacity"
          >
            <Plus className="size-3.5" /> Add reminder
          </button>
        )}
      </div>
    </div>
  );
}
