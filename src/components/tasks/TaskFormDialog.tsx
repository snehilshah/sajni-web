import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Trash2, Star, CalendarClock, ListChecks, Bell, Clock } from 'lucide-react';
import { M3CookieLoader } from '@/components/ui/shapes';

import type { Task, TaskList, TaskStep } from '@/types';
import { tasks as tasksApi, type TaskHistoryEntry } from '@/api';
import RichEditor from '@/components/editor/RichEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
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
  const [saving, setSaving] = useState(false);

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
      tasksApi.history(editing.id).then(setHistory).catch(() => {});
    } else {
      setForm({ ...blank, ...defaults });
      setHistory([]);
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
    if (!confirm(`Delete "${editing.title}"? Subtasks will be removed too.`)) return;
    await tasksApi.delete(editing.id);
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
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {editing ? 'Update details below' : 'Capture something to do'}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4 md:gap-5 flex-1 overflow-y-auto px-4 md:px-6 py-4 md:py-5">
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

          {/* Time + reminder. A task with a time appears on the Today
              agenda; with Remind on, Sajni emails a nudge ~5 min before. */}
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-card/50 p-3">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex flex-col gap-1.5 sm:w-40">
                <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
                  <Clock className="size-3" /> Time
                </Label>
                <Input
                  type="time"
                  value={form.scheduled_time}
                  disabled={!form.due_date}
                  onChange={(e) => setForm({ ...form, scheduled_time: e.target.value, remind: e.target.value ? form.remind : false })}
                  className="h-9 text-sm"
                />
              </div>
              <label
                className={cn(
                  'flex items-center gap-2.5 rounded-xl px-3 h-9 flex-1 transition-colors',
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
            <p className="text-[11px] text-muted-foreground">
              {!form.due_date
                ? 'Pick a due date to set a time.'
                : form.remind
                  ? 'Sajni will email you ~5 min before.'
                  : 'Add a time to show this on your Today agenda.'}
            </p>
          </div>

          {/* Steps editor */}
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

          {editing && history.length > 0 && (
            <div className="rounded-lg border border-border bg-card/30 p-3 flex flex-col gap-2 shrink-0">
              <h4 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <CalendarClock className="size-3" />
                Lifecycle ({history.length})
              </h4>
              <div className="flex flex-col gap-1">
                {history.map((h, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      {h.outcome}
                    </span>
                    <span className="text-muted-foreground">on</span>
                    <span className="font-mono">{format(parseISO(h.due_date), 'MMM d, yyyy')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col flex-1 min-h-[140px] md:min-h-[200px] border border-border rounded-lg overflow-hidden bg-card">
            <div className="bg-muted/30 border-b border-border px-3 py-1.5 flex items-center justify-between shrink-0">
              <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Notes</Label>
              <span className="text-[10px] text-muted-foreground/80">/ commands · # tags · [[ links</span>
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
            <Button
              variant="ghost"
              onClick={handleDelete}
              className="mr-auto text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5"
            >
              <Trash2 className="size-3.5" /> Delete
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.title.trim()} className="gap-1.5">
            {saving && <M3CookieLoader size="xs" tone="primary" className="!bg-primary-foreground" />}
            {editing ? 'Save' : 'Create task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
