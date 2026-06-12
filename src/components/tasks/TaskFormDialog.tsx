import { useCallback, useEffect, useState } from 'react';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Trash2, Star, CalendarClock, ListChecks, Bell, Clock, History, Plus, X, Check, GitBranch, Ban, RotateCcw } from 'lucide-react';
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  STATUSES, STATUS_LABELS, STATUS_DOT, PRIORITIES, PRIORITY_COLORS, PRIORITY_LABEL,
} from './helpers';
import { StepsEditor } from './TaskRow';

interface FormState {
  title: string;
  description: string;
  priority: Task['priority'];
  status: Task['status'];
  due_date: string;
  /** Local HH:MM clock time; '' = no time (all-day). */
  scheduled_time: string;
  /** Email the user ~5 min before scheduled_time. */
  remind: boolean;
  list_id: number | null;
  important: boolean;
  steps: TaskStep[];
}

const blank: FormState = {
  title: '', description: '', priority: 'medium', status: 'todo',
  due_date: '', scheduled_time: '', remind: false,
  list_id: null, important: false, steps: [],
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
  defaults?: Partial<FormState>;
  lists: TaskList[];
  onSaved: () => void;
}

export default function TaskFormDialog({ open, onOpenChange, onCloseComplete, editing, defaults, lists, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(blank);
  const [history, setHistory] = useState<TaskHistoryEntry[]>([]);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [saving, setSaving] = useState(false);
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
        due_date: editing.due_date || '',
        scheduled_time: timeFromISO(editing.scheduled_at),
        remind: editing.remind ?? false,
        list_id: editing.list_id ?? null,
        important: editing.important,
        steps: editing.steps || [],
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
  }, [open, editing, defaults]);

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    // A time only makes sense with a day; remind only with a time.
    const scheduledISO = toScheduledISO(form.due_date, form.scheduled_time);
    const remind = scheduledISO ? form.remind : false;
    try {
      if (editing) {
        const listChanged = form.list_id !== (editing.list_id ?? null);
        await tasksApi.update(editing.id, {
          title: form.title,
          description: form.description,
          priority: form.priority,
          status: form.status,
          due_date: form.due_date || null,
          // null clears the time; clear_scheduled lets the server NULL it.
          scheduled_at: scheduledISO,
          clear_scheduled: scheduledISO === null,
          remind,
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
      } else {
        await tasksApi.create({
          title: form.title,
          description: form.description,
          priority: form.priority,
          status: form.status,
          due_date: form.due_date || undefined,
          scheduled_at: scheduledISO ?? undefined,
          remind,
          list_id: form.list_id ?? null,
          important: form.important,
          steps: form.steps,
        });
      }
      onOpenChange(false);
      onSaved();
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
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) onCloseComplete?.();
      }}
    >
      <DialogContent
        className={cn(
          'flex flex-col gap-0 p-0 overflow-hidden',
          isMobile
            ? 'fixed inset-x-0 bottom-0 top-auto left-0 translate-x-0 translate-y-0 max-w-full w-full h-[92dvh] border-t border-border'
            : 'max-w-2xl w-full sm:max-w-2xl h-[min(85vh,720px)]',
        )}
      >
        <DialogHeader className="shrink-0 px-4 md:px-6 pt-4 md:pt-6 pb-3 md:pb-4 pr-14 border-b border-border">
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
              <DialogTitle>{editing ? 'Edit task' : 'New task'}</DialogTitle>
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                {editing ? 'Update details below' : 'Capture something to do'}
              </p>
            </div>
          </div>
        </DialogHeader>

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

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3 shrink-0">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Status</Label>
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
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Priority</Label>
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
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Due date</Label>
              <DatePicker
                id="task-due-date"
                name="task-due-date"
                value={form.due_date}
                onChange={(v) => setForm({ ...form, due_date: v })}
                placeholder="No date"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">List</Label>
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

          {/* Schedule — one section: the task's own time + ~5-min email nudge
              on top, then any number of extra reminders below. */}
          <div className="flex flex-col rounded-lg border border-border bg-card/50">
            <div className="flex flex-col gap-2 p-3">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex flex-col gap-1.5 sm:w-44">
                <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
                  <Clock className="size-3" /> Time
                </Label>
                <TimePicker
                  id="task-time"
                  name="task-time"
                  value={form.scheduled_time}
                  placeholder="Set time"
                  onChange={(v) => setForm({
                    ...form,
                    scheduled_time: v,
                    // A reminder needs a concrete day — default to today when
                    // none is picked so a quick "remind me at 5pm" works
                    // without first choosing a due date. The user can still
                    // move the date freely with the Due date picker.
                    due_date: v && !form.due_date ? format(new Date(), 'yyyy-MM-dd') : form.due_date,
                    remind: v ? form.remind : false,
                  })}
                />
              </div>
              <label
                className={cn(
                  'flex items-center gap-2.5 rounded-xl px-3 h-11 flex-1 transition-colors',
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
                  ? 'Sajni will email you ~5 min before.'
                  : 'Shows on your Today agenda. Turn on Remind for an email nudge.'}
            </p>
            </div>
            {/* Extra reminders — any date/time, delivered by the cron. */}
            {editing && (
              <div className="border-t border-border/70 p-3">
                <RemindersSection taskId={editing.id} />
              </div>
            )}
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
            <SubtasksSection taskId={editing.id} listId={editing.list_id ?? null} onChanged={onSaved} />
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

        <DialogFooter className="shrink-0 px-4 md:px-6 py-3 md:py-4 border-t border-border bg-muted/20">
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
          <Button onClick={handleSave} disabled={saving || !form.title.trim()} className="gap-1.5">
            {saving && <M3CookieLoader size="xs" tone="primary" className="!text-primary-foreground" />}
            {editing ? 'Save' : 'Create task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// SubtasksSection — real child tasks under a parent. Each carries its own
// status/due; toggling completes it, the title opens it in this same dialog,
// and the inline row adds a new one. This is the explicit "add subtask" CTA
// that previously only existed (hidden) behind the list-row expander.
function SubtasksSection({ taskId, listId, onChanged }: { taskId: number; listId: number | null; onChanged: () => void }) {
  const [subs, setSubs] = useState<Task[] | null>(null);
  const [draft, setDraft] = useState('');

  const load = useCallback(() => {
    tasksApi.subtasks(taskId).then(setSubs).catch(() => setSubs([]));
  }, [taskId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const title = draft.trim();
    if (!title) return;
    setDraft('');
    await tasksApi.create({ title, parent_task_id: taskId, list_id: listId });
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
          <GitBranch className="size-3" /> Subtasks
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
            placeholder={total === 0 ? 'Break this into smaller tasks…' : 'Add a subtask'}
            className="flex-1 h-7 border-0 bg-transparent px-1 py-0 shadow-none outline-none focus-visible:border-0 focus-visible:shadow-none text-sm placeholder:text-muted-foreground/50"
          />
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

// RemindersSection — any number of reminder instants on any date, delivered
// by the reminder cron (currently email). Independent of the task's own time
// and the single "remind ~5 min before" toggle above.
function RemindersSection({ taskId }: { taskId: number }) {
  const [rems, setRems] = useState<TaskReminder[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    tasksApi.reminders(taskId).then(setRems).catch(() => setRems([]));
  }, [taskId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!date || !time) return;
    const d = new Date(`${date}T${time}`);
    if (isNaN(d.getTime())) return;
    setSaving(true);
    try {
      await tasksApi.addReminder(taskId, d.toISOString());
      setAdding(false);
      setDate('');
      setTime('09:00');
      load();
    } finally {
      setSaving(false);
    }
  };
  const remove = async (rid: number) => {
    await tasksApi.deleteReminder(taskId, rid);
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
