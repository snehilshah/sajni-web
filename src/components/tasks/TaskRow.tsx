import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO, isPast, isToday } from 'date-fns';
import {
  Star, ChevronRight, Plus, ListChecks, Clock, Bell,
} from 'lucide-react';
import { M3CookieLoader } from '@/components/ui/shapes';

import type { Task, TaskStep } from '@/types';
import TagPill from '@/components/TagPill';
import { Input } from '@/components/ui/input';
import { tasks as tasksApi } from '@/api';
import { PRIORITY_COLORS } from './helpers';

interface Props {
  task: Task;
  onClick: () => void;
  onChange: () => void;
  depth?: number;
}

// TaskRow renders one task with inline status checkbox, star, and an
// expander that reveals child subtasks (lazy-loaded). Clicking the body
// opens the detail dialog (via onClick).
export default function TaskRow({ task, onClick, onChange, depth = 0 }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [subs, setSubs] = useState<Task[] | null>(null);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [addingSub, setAddingSub] = useState(false);
  const [subDraft, setSubDraft] = useState('');

  const overdue = task.due_date && task.status !== 'done' && (() => {
    const d = parseISO(task.due_date);
    return !isToday(d) && isPast(d);
  })();

  const completedSteps = task.steps?.filter((s) => s.done).length ?? 0;
  const totalSteps = task.steps?.length ?? 0;

  const toggleStatus = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = task.status === 'done' ? 'todo' : 'done';
    await tasksApi.update(task.id, { status: next });
    onChange();
  };

  const toggleStar = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await tasksApi.update(task.id, { important: !task.important });
    onChange();
  };

  const expand = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (subs === null) {
      setLoadingSubs(true);
      try {
        const data = await tasksApi.subtasks(task.id);
        setSubs(data);
      } finally {
        setLoadingSubs(false);
      }
    }
  };

  const addSubtask = async () => {
    const title = subDraft.trim();
    if (!title) { setAddingSub(false); setSubDraft(''); return; }
    await tasksApi.create({
      title,
      parent_task_id: task.id,
      list_id: task.list_id ?? null,
    });
    setSubDraft('');
    setAddingSub(false);
    // Refetch subtasks; trigger parent refresh too.
    const data = await tasksApi.subtasks(task.id);
    setSubs(data);
    onChange();
  };

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: -2 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={{ duration: 0.16, ease: [0.22, 0.61, 0.36, 1] }}
    >
      <div
        onClick={onClick}
        className={`group rounded-lg border border-border bg-card hover:border-primary/40 hover:shadow-sm transition-[box-shadow,border-color] cursor-pointer
          ${task.status === 'done' ? 'opacity-60' : ''}`}
        style={{ marginLeft: depth * 24 }}
      >
        <div className="flex items-start gap-2 px-3 py-2.5">
          {/* Subtask expander */}
          {(task.subtask_count > 0 || expanded) && (
            <button
              onClick={expand}
              className="size-5 rounded hover:bg-accent flex items-center justify-center mt-0.5 shrink-0"
              aria-label={expanded ? 'Collapse subtasks' : 'Expand subtasks'}
            >
              <ChevronRight className={`size-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
            </button>
          )}

          {/* Completion checkbox */}
          <button
            onClick={toggleStatus}
            className={`size-5 mt-0.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors
              ${task.status === 'done'
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-muted-foreground/40 hover:border-primary'}`}
            title={task.status === 'done' ? 'Mark incomplete' : 'Complete'}
          >
            {task.status === 'done' && (
              <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 6.5L5 9L10 3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`size-1.5 rounded-full shrink-0 ${PRIORITY_COLORS[task.priority]}`} />
              <span className={`font-medium text-sm leading-tight flex-1 truncate ${task.status === 'done' ? 'line-through' : ''}`}>
                {task.title}
              </span>
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-muted-foreground flex-wrap">
              {task.due_date && (
                <span className={`inline-flex items-center gap-1 ${overdue ? 'text-destructive' : ''}`}>
                  <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="3" width="12" height="11" rx="1.5" /><path d="M2 6h12M5 1.5v3M11 1.5v3" strokeLinecap="round" />
                  </svg>
                  {format(parseISO(task.due_date), 'MMM d')}
                </span>
              )}
              {task.scheduled_at && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full pl-1.5 pr-2 py-0.5 leading-none ${
                    task.remind
                      ? 'bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))]'
                      : 'bg-[hsl(var(--tertiary-container))] text-[hsl(var(--on-tertiary-container))]'
                  }`}
                  title={task.remind ? 'Reminder set' : 'Scheduled'}
                >
                  {task.remind ? <Bell className="size-2.5 fill-current" /> : <Clock className="size-2.5" />}
                  <span>{format(parseISO(task.scheduled_at), 'h:mm a')}</span>
                </span>
              )}
              {totalSteps > 0 && (
                <span className="inline-flex items-center gap-1">
                  <ListChecks className="size-3" /> {completedSteps}/{totalSteps}
                </span>
              )}
              {task.subtask_count > 0 && (
                <span className="inline-flex items-center gap-1">
                  <ChevronRight className="size-3" /> {task.subtasks_done}/{task.subtask_count} subtasks
                </span>
              )}
              {task.tags && task.tags.length > 0 && (
                <span className="inline-flex gap-1 flex-wrap">
                  {task.tags.slice(0, 3).map((tag) => <TagPill key={tag} tag={tag} />)}
                  {task.tags.length > 3 && <span className="text-[10px]">+{task.tags.length - 3}</span>}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={toggleStar}
            className={`opacity-60 hover:opacity-100 transition-opacity shrink-0 ${task.important ? 'text-amber-500 opacity-100' : ''}`}
            title={task.important ? 'Remove from Important' : 'Mark important'}
          >
            <Star className={`size-4 ${task.important ? 'fill-current' : ''}`} />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
            style={{ marginLeft: (depth + 1) * 24 }}
          >
            <div className="flex flex-col gap-1 mt-1">
              {loadingSubs && (
                <div className="text-xs text-muted-foreground flex items-center gap-2 px-3 py-1.5">
                  <M3CookieLoader size="sm" tone="secondary" /> Loading…
                </div>
              )}

              {subs && subs.length === 0 && !addingSub && (
                <div className="text-xs text-muted-foreground italic px-3">No subtasks yet.</div>
              )}

              {subs?.map((sub) => (
                <TaskRow
                  key={sub.id}
                  task={sub}
                  onClick={onClick}
                  onChange={async () => {
                    onChange();
                    const refreshed = await tasksApi.subtasks(task.id);
                    setSubs(refreshed);
                  }}
                />
              ))}

              {addingSub ? (
                <div className="px-3 py-1.5">
                  <Input
                    name={`subtask-${task.id}`}
                    autoFocus
                    placeholder="New subtask"
                    value={subDraft}
                    onChange={(e) => setSubDraft(e.target.value)}
                    onBlur={addSubtask}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addSubtask();
                      if (e.key === 'Escape') { setAddingSub(false); setSubDraft(''); }
                    }}
                    className="h-7 text-xs"
                  />
                </div>
              ) : (
                <button
                  onClick={() => setAddingSub(true)}
                  className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-3 py-1.5 self-start"
                >
                  <Plus className="size-3" /> Add subtask
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// StepsEditor renders the inline checklist editor used inside the
// task detail dialog. Maintains a local draft until "save".
// onCommit (optional) is fired immediately after a step is added via
// Enter or toggled/removed, so the parent dialog can persist without
// requiring a separate Save click.
export function StepsEditor({
  steps, onChange, onCommit,
}: {
  steps: TaskStep[];
  onChange: (next: TaskStep[]) => void;
  onCommit?: (next: TaskStep[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const update = (id: string, patch: Partial<TaskStep>) => {
    const next = steps.map((s) => (s.id === id ? { ...s, ...patch } : s));
    onChange(next);
    onCommit?.(next);
  };
  const remove = (id: string) => {
    const next = steps.filter((s) => s.id !== id);
    onChange(next);
    onCommit?.(next);
  };
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    const next = [...steps, { id: 's_' + Date.now(), text, done: false }];
    onChange(next);
    onCommit?.(next);
    setDraft('');
  };

  return (
    <div className="flex flex-col gap-1.5">
      {steps.map((s) => (
        <div key={s.id} className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-accent/50 group">
          <button
            type="button"
            onClick={() => update(s.id, { done: !s.done })}
            className={`size-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors
              ${s.done ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 hover:border-primary'}`}
          >
            {s.done && (
              <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M2 6.5L5 9L10 3" strokeLinecap="round" />
              </svg>
            )}
          </button>
          <Input
            name={`step-${s.id}`}
            value={s.text}
            onChange={(e) => update(s.id, { text: e.target.value })}
            className={`flex-1 border-0 bg-transparent px-1 py-0 shadow-none outline-none focus-visible:border-0 focus-visible:shadow-none text-sm ${s.done ? 'line-through text-muted-foreground' : ''}`}
          />
          <button
            type="button"
            onClick={() => remove(s.id)}
            className="opacity-0 group-hover:opacity-60 hover:opacity-100 text-muted-foreground text-xs"
            title="Remove step"
          >
            ✕
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2 px-2 py-1">
        <span className="size-4 rounded-full border-2 border-dashed border-muted-foreground/30 shrink-0" />
        <Input
          name="new-step"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add(); }
          }}
          placeholder="Add a step"
          className="flex-1 border-0 bg-transparent px-1 py-0 shadow-none outline-none focus-visible:border-0 focus-visible:shadow-none text-sm placeholder:text-muted-foreground/50"
        />
        {draft && (
          <button type="button" onClick={add} className="text-xs text-primary hover:underline">
            Add
          </button>
        )}
      </div>
    </div>
  );
}
