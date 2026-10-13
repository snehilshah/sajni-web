import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown } from '@/components/ui/icons';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useTaskDetail } from '@/components/tasks/TaskDetailProvider';
import { cn } from '@/lib/utils';
import { useCreateTask, useToggleTaskStatus } from '@/queries/tasks';
import { useCheckRoutineItem } from '@/queries/routines';
import type { DayRoutine } from '@/types';
import { formatClock } from './RoutinesManager';

/** Journal side panel: the day's routines in time order, each one collapsed
 *  row ("Office start · 9:00 AM · 1/5") that unfolds into its standing
 *  checklist and that day's agenda tasks. */
export function RoutinesPanel({ date, today, routines, loading, onEdit }: {
  date: string;
  today: string;
  routines: DayRoutine[];
  loading: boolean;
  /** Opens the manager: a routine's editor, 'new', or the list (null). */
  onEdit: (id: number | 'new' | null) => void;
}) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (id: number) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium">Routines</h3>
        <button
          type="button"
          onClick={() => onEdit(null)}
          className="rounded text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >Edit</button>
      </div>
      {loading ? (
        <Skeleton className="h-9 w-full" />
      ) : routines.length === 0 ? (
        <button
          type="button"
          onClick={() => onEdit('new')}
          className="flex items-center gap-2 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="mono w-[18px] text-center text-[12px]">+</span>
          <span>Set up a routine</span>
        </button>
      ) : (
        <div className="flex flex-col gap-1">
          {routines.map((r) => (
            <RoutineDay key={r.id} routine={r} date={date} future={date > today} open={open.has(r.id)} onToggle={() => toggle(r.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

function RoutineDay({ routine, date, future, open, onToggle }: {
  routine: DayRoutine;
  date: string;
  future: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const { openTask } = useTaskDetail();
  const check = useCheckRoutineItem();
  const toggleTask = useToggleTaskStatus();
  const total = routine.items.length + routine.agenda.length;
  const done = routine.items.filter((it) => routine.done.includes(it.id)).length
    + routine.agenda.filter((t) => t.status === 'done').length;

  return (
    <div className="rounded-lg">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-lg py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="size-2 shrink-0 rounded-full" style={{ background: routine.color || 'hsl(var(--primary))' }} />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{routine.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{formatClock(routine.start_time)}</span>
        {total > 0 && (
          <span className={cn('shrink-0 text-xs tabular-nums', done === total ? 'text-[hsl(var(--primary))]' : 'text-muted-foreground')}>{done}/{total}</span>
        )}
        <ChevronDown className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 pb-2 pl-[18px] pt-1">
              {routine.items.map((it) => {
                const ticked = routine.done.includes(it.id);
                return (
                  <button
                    key={it.id}
                    type="button"
                    disabled={future}
                    onClick={() => check.mutate({ id: routine.id, date, itemId: it.id, done: !ticked })}
                    title={future ? 'Ticks open on the day' : ticked ? 'Mark not done' : 'Mark done'}
                    className="flex items-start gap-2.5 text-left disabled:cursor-default"
                  >
                    <Checkbox checked={ticked} className="pointer-events-none mt-0.5" tabIndex={-1} />
                    <span className={cn('text-[12.5px] leading-snug', ticked ? 'text-muted-foreground line-through' : 'text-foreground/85')}>{it.text}</span>
                  </button>
                );
              })}
              {routine.agenda.map((t) => {
                const isDone = t.status === 'done';
                return (
                  <div key={t.id} className="flex items-start gap-2.5">
                    <button
                      type="button"
                      onClick={() => toggleTask.mutate({ id: t.id, status: isDone ? 'todo' : 'done' })}
                      title={isDone ? 'Mark not done' : 'Mark done'}
                      className="mt-0.5 shrink-0"
                    >
                      <Checkbox checked={isDone} className="pointer-events-none" tabIndex={-1} />
                    </button>
                    <button
                      type="button"
                      onClick={() => openTask(t.id)}
                      title="Open task"
                      className={cn('flex-1 text-left text-[12.5px] leading-snug transition-colors', isDone ? 'text-muted-foreground line-through' : 'text-foreground/85 hover:text-foreground')}
                    >{t.title}</button>
                  </div>
                );
              })}
              <AddToRoutine routineId={routine.id} name={routine.name} date={date} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AddToRoutine({ routineId, name, date }: { routineId: number; name: string; date: string }) {
  const create = useCreateTask();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const submit = () => {
    const title = value.trim();
    if (!title) { setEditing(false); return; }
    create.mutate({ title, due_date: date, routine_id: routineId }, {
      onSuccess: () => { setValue(''); inputRef.current?.focus(); },
    });
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex items-center gap-2 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="mono w-4 text-center text-[12px]">+</span>
        <span className="truncate">Add to {name}</span>
      </button>
    );
  }
  return (
    <Input
      name="routine-agenda-title"
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
        else if (e.key === 'Escape') { setEditing(false); setValue(''); }
      }}
      onBlur={() => { if (!value.trim()) setEditing(false); }}
      disabled={create.isPending}
      placeholder={`Add to ${name}…`}
      className="h-7 px-2 text-[12.5px]"
    />
  );
}
