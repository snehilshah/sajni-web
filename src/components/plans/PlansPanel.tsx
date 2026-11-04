import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowDownToLine, CalendarClock, Check, ChevronDown, Plus, Repeat } from '@/components/ui/icons';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { WavyProgress } from '@/components/ui/wavy-progress';
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
  const addToPlan = useAddToPlan();
  const { statusOf, toggle } = usePlanTicks(plan);
  const picker = usePickerOpen();

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
        onClick={picker.show}
        className="flex items-center gap-2 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="mono w-4 text-center text-[12px]">⇣</span>
        <span>Pick from your tasks</span>
      </button>
      <PlanPicker key={picker.key} plan={plan} open={picker.open} onOpenChange={picker.setOpen} />
    </div>
  );
}

/** Ticks land instantly and hold until the day refetches after the save. */
function usePlanTicks(plan: DayPlan) {
  const toggleTask = useToggleTaskStatus();
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
  return { statusOf, toggle };
}

/** A fresh picker (nothing marked Added) each time it opens. */
function usePickerOpen() {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return { open, setOpen, key, show: () => { setKey((k) => k + 1); setOpen(true); } };
}

const ringTone: Record<PlanTask['priority'], string> = {
  high: 'border-destructive',
  medium: 'border-[hsl(var(--outline))]',
  low: 'border-[hsl(var(--outline-variant))]',
};

/** Today's card for one plan: progress, its tasks as full rows (same anatomy
 *  as On deck), left-overs to move in, and a footer to add or pick tasks.
 *  `showName` heads the card when Today lists several plans. */
export function PlanCard({ plan, showName }: { plan: DayPlan; showName: boolean }) {
  const { openTask } = useTaskDetail();
  const addToPlan = useAddToPlan();
  const { statusOf, toggle } = usePlanTicks(plan);
  const picker = usePickerOpen();
  const [adding, setAdding] = useState(false);
  const done = plan.tasks.filter((t) => statusOf(t) === 'done').length;
  const total = plan.tasks.length;
  const accent = plan.color || 'hsl(var(--primary))';

  return (
    <div className="overflow-hidden rounded-xl bg-[hsl(var(--surface-container))]">
      {(showName || total > 0) && (
        <div className="flex flex-col gap-2.5 px-4 pb-1 pt-3.5 md:px-5">
          {showName && (
            <div className="flex items-center gap-2 text-[13px]">
              <span
                className="rounded-md px-2 py-0.5 font-semibold"
                style={{ backgroundColor: `color-mix(in srgb, ${accent} 22%, transparent)`, color: `color-mix(in srgb, ${accent} 55%, hsl(var(--on-surface)))` }}
              >{plan.name}</span>
              <span className="mono text-xs text-muted-foreground">{formatClock(plan.start_time)}</span>
            </div>
          )}
          {total > 0 && (
            <div className="flex items-center gap-3">
              <WavyProgress value={(done / total) * 100} height={10} className="flex-1" label={`${done} of ${total} done`} />
              <span className={cn('mono shrink-0 text-xs tabular-nums', done === total ? 'text-[hsl(var(--primary))]' : 'text-muted-foreground')}>
                {done === total ? 'All done' : `${done} of ${total}`}
              </span>
            </div>
          )}
        </div>
      )}

      {total === 0 && plan.left_over.length === 0 && !adding && (
        <div className="flex items-center gap-3.5 px-4 py-5 md:px-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]">
            <CalendarClock className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <div className="text-[14px] font-medium">Nothing planned yet</div>
            <div className="mt-0.5 text-[12.5px] text-muted-foreground">
              Add what {plan.name} is for, or pull in tasks you already have.
            </div>
          </div>
        </div>
      )}

      {plan.tasks.map((t, i) => {
        const isDone = statusOf(t) === 'done';
        return (
          <div
            key={t.id}
            onClick={() => openTask(t.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') openTask(t.id); }}
            className={cn(
              'flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[hsl(var(--surface-container-high))] md:px-5',
              i > 0 && 'border-t border-border/50',
            )}
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggle(t); }}
              aria-label={isDone ? 'Mark not done' : 'Mark done'}
              className={cn(
                'grid size-[18px] shrink-0 place-items-center rounded-full border-2 transition-colors',
                isDone ? 'border-primary bg-primary text-primary-foreground' : cn(ringTone[t.priority], 'hover:bg-primary/10'),
              )}
            >
              {isDone && <Check className="size-3" strokeWidth={3} />}
            </button>
            <span className={cn('min-w-0 flex-1 truncate text-[14px] font-medium', isDone && 'text-muted-foreground line-through')}>
              {t.title}
            </span>
            {t.recurring && <Repeat className="size-3.5 shrink-0 text-muted-foreground" aria-label="Repeats" />}
          </div>
        );
      })}

      {plan.left_over.length > 0 && (
        <div className={cn('flex flex-col px-4 pb-1.5 pt-3 md:px-5', total > 0 && 'border-t border-border/50')}>
          <span className="mono label-kicker mb-1 text-xs text-muted-foreground">Left over · {plan.left_over.length}</span>
          {plan.left_over.map((t) => (
            <div key={t.id} className="flex min-h-9 items-center gap-3">
              <button
                type="button"
                onClick={() => openTask(t.id)}
                className="min-w-0 flex-1 truncate text-left text-[13.5px] text-muted-foreground transition-colors hover:text-foreground"
              >
                {t.title}
                {t.due_date && <span className="mono text-xs"> · {format(parseISO(t.due_date), 'MMM d')}</span>}
              </button>
              <button
                type="button"
                onClick={() => addToPlan.mutate({ id: plan.id, taskId: t.id, date: plan.date })}
                className="h-7 shrink-0 rounded-full bg-[hsl(var(--secondary-container))] px-3 text-xs font-medium text-[hsl(var(--on-secondary-container))] transition-colors hover:brightness-110"
              >Move here</button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-border/50 px-3 py-2.5 md:px-4">
        {adding ? (
          <PlanCardInput plan={plan} onDone={() => setAdding(false)} />
        ) : (
          <>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[hsl(var(--secondary-container))] px-3.5 text-[13px] font-medium text-[hsl(var(--on-secondary-container))] transition-colors hover:brightness-110"
            >
              <Plus className="size-3.5" /> Add a task
            </button>
            <button
              type="button"
              onClick={picker.show}
              className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] text-muted-foreground transition-colors hover:bg-[hsl(var(--on-surface)/0.06)] hover:text-foreground"
            >
              <ArrowDownToLine className="size-3.5" /> Pick from tasks
            </button>
          </>
        )}
      </div>
      <PlanPicker key={picker.key} plan={plan} open={picker.open} onOpenChange={picker.setOpen} />
    </div>
  );
}

/** The footer's inline add: Enter adds and stays open for the next one. */
function PlanCardInput({ plan, onDone }: { plan: DayPlan; onDone: () => void }) {
  const create = useCreateTask();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const submit = () => {
    const title = value.trim();
    if (!title) { onDone(); return; }
    create.mutate({ title, due_date: plan.date, plan_id: plan.id }, {
      onSuccess: () => { setValue(''); inputRef.current?.focus(); },
    });
  };
  return (
    <>
      <Input
        name="plan-task-title"
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
          else if (e.key === 'Escape') onDone();
        }}
        onBlur={() => { if (!value.trim()) onDone(); }}
        disabled={create.isPending}
        placeholder={`Add to ${plan.name}…`}
        className="h-8 flex-1 text-[13.5px]"
      />
      <Button size="sm" className="h-8" disabled={!value.trim() || create.isPending} onMouseDown={(e) => e.preventDefault()} onClick={submit}>Add</Button>
    </>
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
