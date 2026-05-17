import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Trash2, Star, CalendarClock, ListChecks } from 'lucide-react';
import { M3CookieLoader } from '@/components/ui/shapes';

import type { Task, TaskList, TaskStep } from '@/types';
import { tasks as tasksApi, type TaskHistoryEntry } from '@/api';
import RichEditor from '@/components/editor/RichEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
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
  list_id: number | null;
  important: boolean;
  steps: TaskStep[];
}

const blank: FormState = {
  title: '', description: '', priority: 'medium', status: 'todo',
  due_date: '', list_id: null, important: false, steps: [],
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Task | null;
  defaults?: Partial<FormState>;
  lists: TaskList[];
  onSaved: () => void;
}

export default function TaskFormDialog({ open, onOpenChange, editing, defaults, lists, onSaved }: Props) {
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
    try {
      if (editing) {
        await tasksApi.update(editing.id, {
          title: form.title,
          description: form.description,
          priority: form.priority,
          status: form.status,
          due_date: form.due_date || null,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'flex flex-col gap-0 p-0 overflow-hidden',
          isMobile
            ? 'fixed inset-x-0 bottom-0 top-auto left-0 translate-x-0 translate-y-0 max-w-full w-full h-[92dvh] border-t border-border'
            : 'max-w-2xl w-full sm:max-w-2xl h-[min(85vh,720px)]',
        )}
      >
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 pr-14 border-b border-border">
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

        <div className="flex flex-col gap-5 flex-1 overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Title</Label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              autoFocus={!editing}
              placeholder="What needs doing?"
              className="bg-transparent font-serif text-2xl font-medium tracking-tight outline-none placeholder:text-muted-foreground/40 border-b border-border focus:border-primary transition-colors pb-2"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
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

          {/* Steps editor */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
              <ListChecks className="size-3" /> Steps
            </Label>
            <div className="rounded-lg border border-border bg-card/50 px-2 py-1.5">
              <StepsEditor
                steps={form.steps}
                onChange={(next) => setForm({ ...form, steps: next })}
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

          <div className="flex flex-col flex-1 min-h-[200px] border border-border rounded-lg overflow-hidden bg-card">
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

        <DialogFooter className="shrink-0 px-6 py-4 border-t border-border bg-muted/20">
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
