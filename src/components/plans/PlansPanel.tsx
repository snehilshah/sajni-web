import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronDown, Plus, Repeat } from '@/components/ui/icons';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useTaskDetail } from '@/components/tasks/TaskDetailProvider';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { useCreateTask, useToggleTaskStatus } from '@/queries/tasks';
import { useAddToPlan, usePlanCandidates } from '@/queries/plans';
import type { DayPlan, PlanTask } from '@/types';
import { formatClock } from './PlansManager';

/** Journal side panel: the day's plans in time order. Each is one row
 *  ("Office start · 9:00 AM · 1/3") that unfolds into what's planned. */
export function PlansPanel({ date, today, plans, loading, onEdit }: {
  date: string;
  today: string;
  plans: DayPlan[];
  loading: boolean;
  /** Opens the manager: a plan's editor, 'new', or the list (null). */
  onEdit: (id: number | 'new' | null) => void;
}) {
  // Today and later unfold by default: that's when you plan.
  const [closed, setClosed] = useState<Set<number>>(new Set());
  const [opened, setOpened] = useState<Set<number>>(new Set());
  const isOpen = (id: number) => (date >= today ? !closed.has(id) : opened.has(id));
  const toggle = (id: number) => {
    const flip = (prev: Set<number>) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    };
    if (date >= today) setClosed(flip); else setOpened(flip);
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium">Plans</h3>
        <button
          type="button"
          onClick={() => onEdit(null)}
          className="rounded text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >Edit</button>
      </div>
      {loading ? (
        <Skeleton className="h-9 w-full" />
      ) : plans.length === 0 ? (
        <button
          type="button"
          onClick={() => onEdit('new')}
          className="flex items-center gap-2 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="mono w-[18px] text-center text-[12px]">+</span>
          <span>Set up a plan, like “Office start”</span>
        </button>
      ) : (
        <div className="flex flex-col gap-1">
          {plans.map((p) => (
            <PlanDay key={p.id} plan={p} open={isOpen(p.id)} onToggle={() => toggle(p.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

function PlanDay({ plan, open, onToggle }: { plan: DayPlan; open: boolean; onToggle: () => void }) {
  const done = plan.tasks.filter((t) => t.status === 'done').length;
  return (
    <div className="rounded-lg">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-lg py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="size-2 shrink-0 rounded-full" style={{ background: plan.color || 'hsl(var(--primary))' }} />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{plan.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{formatClock(plan.start_time)}</span>
        {plan.tasks.length > 0 && (
          <span className={cn('shrink-0 text-xs tabular-nums', done === plan.tasks.length ? 'text-[hsl(var(--primary))]' : 'text-muted-foreground')}>{done}/{plan.tasks.length}</span>
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
            <div className="pb-2 pl-[18px] pt-1"><PlanBody plan={plan} /></div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** What's planned for one occurrence, its left-overs, and the ways to add:
 *  type a new task, or pick from your open ones. Shared with Today. */
export function PlanBody({ plan }: { plan: DayPlan }) {
  const { openTask } = useTaskDetail();
  const toggleTask = useToggleTaskStatus();
  const addToPlan = useAddToPlan();
  const [picking, setPicking] = useState(false);
  // A fresh picker (nothing marked Added) each time it opens.
  const [pickerKey, setPickerKey] = useState(0);
  // Ticks land instantly and hold until the day refetches after the save.
  const [ticks, setTicks] = useState<{ of: PlanTask[]; status: Record<number, PlanTask['status']> }>({ of: plan.tasks, status: {} });
  const ticked = ticks.of === plan.tasks ? ticks.status : {};
  const statusOf = (t: PlanTask) => ticked[t.id] ?? t.status;
  const toggle = (t: PlanTask) => {
    const next = statusOf(t) === 'done' ? 'todo' : 'done';
    setTicks({ of: plan.tasks, status: { ...ticked, [t.id]: next } });
    toggleTask.mutate({ id: t.id, status: next }, {
      onError: () => setTicks({ of: plan.tasks, status: {} }),
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {plan.tasks.length === 0 && plan.left_over.length === 0 && (
        <p className="text-[12.5px] text-muted-foreground">Nothing planned yet.</p>
      )}
      {plan.tasks.map((t) => {
        const isDone = statusOf(t) === 'done';
        return (
          <div key={t.id} className="flex items-start gap-2.5">
            <button type="button" onClick={() => toggle(t)} title={isDone ? 'Mark not done' : 'Mark done'} className="mt-0.5 shrink-0">
              <Checkbox checked={isDone} className="pointer-events-none" tabIndex={-1} />
            </button>
            <button
              type="button"
              onClick={() => openTask(t.id)}
              title="Open task"
              className={cn('flex flex-1 items-center gap-1.5 text-left text-[12.5px] leading-snug transition-colors', isDone ? 'text-muted-foreground line-through' : 'text-foreground/85 hover:text-foreground')}
            >
              <span>{t.title}</span>
              {t.recurring && <Repeat className="size-3 shrink-0 text-muted-foreground" aria-label="Repeats" />}
            </button>
          </div>
        );
      })}
      {plan.left_over.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Left over</span>
          {plan.left_over.map((t) => (
            <div key={t.id} className="flex items-center gap-2">
              <button type="button" onClick={() => openTask(t.id)} className="min-w-0 flex-1 truncate text-left text-[12.5px] text-muted-foreground hover:text-foreground">
                {t.title}{t.due_date && <span className="text-xs"> · {format(parseISO(t.due_date), 'MMM d')}</span>}
              </button>
              <button
                type="button"
                onClick={() => addToPlan.mutate({ id: plan.id, taskId: t.id, date: plan.date })}
                className="shrink-0 rounded-full px-2 text-xs text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.08)]"
              >Move here</button>
            </div>
          ))}
        </div>
      )}
      <AddToPlan planId={plan.id} name={plan.name} date={plan.date} />
      <button
        type="button"
        onClick={() => { setPickerKey((k) => k + 1); setPicking(true); }}
        className="flex items-center gap-2 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="mono w-4 text-center text-[12px]">⇣</span>
        <span>Pick from your tasks</span>
      </button>
      <PlanPicker key={pickerKey} plan={plan} open={picking} onOpenChange={setPicking} />
    </div>
  );
}

function AddToPlan({ planId, name, date }: { planId: number; name: string; date: string }) {
  const create = useCreateTask();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const submit = () => {
    const title = value.trim();
    if (!title) { setEditing(false); return; }
    create.mutate({ title, due_date: date, plan_id: planId }, {
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
      name="plan-task-title"
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

/** "Plan Office start · Thu, Oct 23": your open tasks in groups (left
 *  over, overdue, due that day, that week, coming up, no date). Each tap
 *  moves one into the plan; the list stays open for more. */
function PlanPicker({ plan, open, onOpenChange }: { plan: DayPlan; open: boolean; onOpenChange: (open: boolean) => void }) {
  const mobile = useIsMobile();
  const { data: groups, isLoading } = usePlanCandidates(plan.id, plan.date, open);
  const addToPlan = useAddToPlan();
  const [added, setAdded] = useState<Set<number>>(new Set());

  const title = `Plan ${plan.name}`;
  const description = `${format(parseISO(plan.date), 'EEEE, MMM d')} · ${formatClock(plan.start_time)}`;
  const body = (
    <div className="flex flex-col gap-4 pb-2">
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : !groups || groups.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No open tasks to pick from.</p>
      ) : groups.map((g) => (
        <div key={g.key} className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{g.label}</span>
          {g.tasks.map((t) => {
            const isAdded = added.has(t.id);
            return (
              <button
                key={t.id}
                type="button"
                disabled={isAdded}
                onClick={() => {
                  setAdded((s) => new Set(s).add(t.id));
                  addToPlan.mutate({ id: plan.id, taskId: t.id, date: plan.date }, {
                    onError: () => setAdded((s) => { const c = new Set(s); c.delete(t.id); return c; }),
                  });
                }}
                className="flex min-h-10 items-center gap-3 rounded-lg px-2 text-left transition-colors hover:bg-[hsl(var(--on-surface)/0.06)] disabled:opacity-60"
              >
                <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full', isAdded ? 'bg-primary text-primary-foreground' : 'bg-[hsl(var(--surface-container-high))]')}>
                  <Plus className={cn('size-3.5', isAdded && 'rotate-45 opacity-0')} />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                {t.recurring && <Repeat className="size-3 shrink-0 text-muted-foreground" aria-label="Repeats" />}
                {t.due_date && <span className="shrink-0 text-xs text-muted-foreground">{format(parseISO(t.due_date), 'MMM d')}</span>}
                {isAdded && <span className="shrink-0 text-xs text-[hsl(var(--primary))]">Added</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );

  if (mobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[calc(100dvh-env(safe-area-inset-top)-12px)] overflow-y-auto">
          <SheetHeader className="pb-3">
            <SheetTitle className="serif text-xl normal-case tracking-tight">{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <div className="px-6 pb-[calc(env(safe-area-inset-bottom)+1rem)]">{body}</div>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(86vh,760px)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {body}
        <div className="flex justify-end"><Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button></div>
      </DialogContent>
    </Dialog>
  );
}
