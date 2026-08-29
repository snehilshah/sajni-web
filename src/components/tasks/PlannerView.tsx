import { useEffect, useMemo, useState } from 'react';
import {
  addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format,
  isSameMonth, isToday, parseISO, startOfMonth, startOfWeek,
} from 'date-fns';
import { useSearchParams } from 'react-router-dom';
import {
  DragDropProvider, KeyboardSensor, PointerSensor,
  useDraggable, useDroppable,
} from '@dnd-kit/react';
import { PointerActivationConstraints } from '@dnd-kit/dom';
import { toast } from 'sonner';

import type { PlannerReminderOccurrence, Reminder, Task } from '@/types';
import type { TaskDefaults } from './TaskFormDialog';
import { reminders as remindersApi } from '@/api';
import { usePlanner, usePlannerReschedule } from '@/queries/planner';
import { useToggleTaskStatus } from '@/queries/tasks';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { SegmentedButton } from '@/components/ui/segmented-button';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Bell, Check, ChevronLeft, ChevronRight,
  Plus, Repeat, StickyNote, X,
} from '@/components/ui/icons';
import { ReminderEditor } from '@/components/reminders/RemindersPanel';

type PlannerViewMode = 'week' | 'month';

type Props = {
  onCreateTask: (defaults?: TaskDefaults) => void;
  onEditTask: (task: Task) => void;
};

const VIEW_DESKTOP_KEY = 'sajni:planner:view:desktop';
const VIEW_MOBILE_KEY = 'sajni:planner:view:mobile';
const HIDE_COMPLETED_KEY = 'sajni:planner:hide-completed';

function dateKey(value: Date) {
  return format(value, 'yyyy-MM-dd');
}

function instantDateKey(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function instantTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

function safeDate(value: string | null) {
  if (!value) return new Date();
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export default function PlannerView({ onCreateTask, onEditTask }: Props) {
  const mobile = useIsMobile() || (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  const [agendaLayout, setAgendaLayout] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1359px)').matches
  ));
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1359px)');
    const update = () => setAgendaLayout(media.matches);
    media.addEventListener('change', update);
    update();
    return () => media.removeEventListener('change', update);
  }, []);
  const [params, setParams] = useSearchParams();
  const storedView = (() => {
    try { return localStorage.getItem(mobile ? VIEW_MOBILE_KEY : VIEW_DESKTOP_KEY) as PlannerViewMode | null; }
    catch { return null; }
  })();
  const view: PlannerViewMode = params.get('view') === 'month' || params.get('view') === 'week'
    ? params.get('view') as PlannerViewMode
    : storedView || (mobile ? 'month' : 'week');
  const anchor = safeDate(params.get('date'));

  useEffect(() => {
    if (params.get('view') && params.get('date')) return;
    const next = new URLSearchParams(params);
    next.set('tab', 'planner');
    next.set('view', view);
    next.set('date', dateKey(anchor));
    setParams(next, { replace: true });
  }, [anchor, params, setParams, view]);

  useEffect(() => {
    try { localStorage.setItem(mobile ? VIEW_MOBILE_KEY : VIEW_DESKTOP_KEY, view); } catch {}
  }, [mobile, view]);

  const period = useMemo(() => {
    if (view === 'week') {
      const from = startOfWeek(anchor, { weekStartsOn: 1 });
      return { from, to: addDays(from, 6), days: Array.from({ length: 7 }, (_, index) => addDays(from, index)) };
    }
    const monthStart = startOfMonth(anchor);
    const from = startOfWeek(monthStart, { weekStartsOn: 1 });
    const to = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });
    return {
      from, to,
      days: Array.from({ length: Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1 }, (_, index) => addDays(from, index)),
    };
  }, [anchor, view]);

  const fromKey = dateKey(period.from);
  const toKey = dateKey(period.to);
  const { data, isLoading } = usePlanner(fromKey, toKey);
  const moveTask = usePlannerReschedule();
  const toggleStatus = useToggleTaskStatus();
  const [hideCompleted, setHideCompleted] = useState(() => {
    try { return localStorage.getItem(HIDE_COMPLETED_KEY) === 'true'; } catch { return false; }
  });
  const [agendaDay, setAgendaDay] = useState<Date | null>(null);
  const [moveModeTask, setMoveModeTask] = useState<Task | null>(null);
  const [reminderEditorOpen, setReminderEditorOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);

  const setView = (nextView: PlannerViewMode) => {
    const next = new URLSearchParams(params);
    next.set('view', nextView);
    next.set('date', dateKey(anchor));
    setParams(next, { replace: true });
  };
  const go = (direction: -1 | 1) => {
    const nextDate = view === 'week' ? addWeeks(anchor, direction) : addMonths(anchor, direction);
    const next = new URLSearchParams(params);
    next.set('date', dateKey(nextDate));
    setParams(next, { replace: true });
  };
  const today = () => {
    const next = new URLSearchParams(params);
    next.set('date', dateKey(new Date()));
    setParams(next, { replace: true });
  };

  const dayTasks = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of data?.tasks ?? []) {
      if (!task.due_date || (hideCompleted && task.status === 'done')) continue;
      const list = map.get(task.due_date) ?? [];
      list.push(task);
      map.set(task.due_date, list);
    }
    for (const tasks of map.values()) tasks.sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done'));
    return map;
  }, [data?.tasks, hideCompleted]);

  const dayReminders = useMemo(() => {
    const map = new Map<string, PlannerReminderOccurrence[]>();
    for (const reminder of data?.reminder_occurrences ?? []) {
      const key = instantDateKey(reminder.scheduled_at, data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
      const list = map.get(key) ?? [];
      list.push(reminder);
      map.set(key, list);
    }
    return map;
  }, [data?.reminder_occurrences, data?.timezone]);

  const openReminder = async (item: PlannerReminderOccurrence) => {
    try {
      const reminder = await remindersApi.get(item.reminder_id);
      setEditingReminder(reminder);
      setReminderEditorOpen(true);
    } catch { toast.error('Could not open reminder'); }
  };

  const reschedule = async (task: Task, targetDate: string) => {
    if (task.due_date === targetDate) return;
    try {
      await moveTask.mutateAsync({ id: task.id, targetDate });
      toast.success(`Moved to ${format(parseISO(targetDate), 'EEE, MMM d')}`);
    } catch {
      onEditTask({ ...task, due_date: targetDate });
    }
  };

  const directDrag = !(mobile && view === 'month');
  const sensors = useMemo(() => [
    PointerSensor.configure({
      activationConstraints: (event) => event.pointerType === 'touch'
        ? [new PointerActivationConstraints.Delay({ value: 280, tolerance: { x: 8, y: 8 } })]
        : [new PointerActivationConstraints.Distance({ value: 4 })],
    }),
    KeyboardSensor,
  ], []);

  const calendar = (
    <DragDropProvider
      sensors={sensors}
      onDragEnd={(event) => {
        if (event.canceled) return;
        const task = event.operation.source?.data?.task as Task | undefined;
        const targetDate = event.operation.target?.data?.date as string | undefined;
        if (task && targetDate) void reschedule(task, targetDate);
      }}
    >
      {view === 'week' && agendaLayout ? (
        <div className="grid gap-2" aria-label="Weekly planner">
          {period.days.map((day) => (
            <AgendaDay
              key={dateKey(day)} day={day} tasks={dayTasks.get(dateKey(day)) ?? []}
              reminders={dayReminders.get(dateKey(day)) ?? []} draggable={directDrag}
              timezone={data?.timezone ?? 'UTC'}
              onAdd={() => onCreateTask({ due_date: dateKey(day) })} onEdit={onEditTask}
              onReminder={openReminder} onToggle={(task) => toggleStatus.mutate({ id: task.id, status: task.status === 'done' ? 'todo' : 'done' })}
            />
          ))}
        </div>
      ) : (
        <div className={cn(
          'grid grid-cols-7',
          view === 'week'
            ? 'min-h-[430px] gap-x-4 lg:gap-x-6'
            : 'overflow-hidden border-l border-t border-[hsl(var(--outline-variant)/0.7)] auto-rows-[minmax(112px,1fr)] sm:auto-rows-[minmax(128px,1fr)]',
        )} aria-label={`${view === 'week' ? 'Weekly' : 'Monthly'} planner`}>
          {period.days.map((day) => {
            const key = dateKey(day);
            return (
              <DayCell
                key={key} day={day} tasks={dayTasks.get(key) ?? []} reminders={dayReminders.get(key) ?? []}
                month={anchor} compact={view === 'month'} draggable={directDrag}
                timezone={data?.timezone ?? 'UTC'}
                previewLimit={mobile ? 2 : view === 'month' ? 3 : 12}
                moveTarget={Boolean(moveModeTask)}
                onClick={() => {
                  if (moveModeTask) {
                    void reschedule(moveModeTask, key);
                    setMoveModeTask(null);
                  } else if (mobile && view === 'month') setAgendaDay(day);
                }}
                onAdd={() => onCreateTask({ due_date: key })} onEdit={onEditTask} onReminder={openReminder}
                onToggle={(task) => toggleStatus.mutate({ id: task.id, status: task.status === 'done' ? 'todo' : 'done' })}
              />
            );
          })}
        </div>
      )}
    </DragDropProvider>
  );

  const anchorMonthKey = dateKey(startOfMonth(anchor));
  const scopedTasks = (data?.tasks ?? []).filter((task) => !task.due_date && (
    (task.week_of && task.week_of >= fromKey && task.week_of <= toKey)
    || task.month_of === anchorMonthKey
  ));
  const agendaKey = agendaDay ? dateKey(agendaDay) : '';

  return (
    <div className="flex flex-col gap-4 pb-24 sm:pb-6">
      <section className="flex flex-col gap-3 border-b border-[hsl(var(--outline-variant)/0.7)] px-1 pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{view === 'week' ? 'Week plan' : 'Month plan'}</p>
          <h2 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
            {view === 'week'
              ? `${format(period.from, 'MMM d')} – ${format(period.to, period.from.getMonth() === period.to.getMonth() ? 'd, yyyy' : 'MMM d, yyyy')}`
              : format(anchor, 'MMMM yyyy')}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={today}>Today</Button>
          <div className="flex">
            <Button variant="ghost" size="icon-sm" aria-label="Previous period" onClick={() => go(-1)}><ChevronLeft /></Button>
            <Button variant="ghost" size="icon-sm" aria-label="Next period" onClick={() => go(1)}><ChevronRight /></Button>
          </div>
          <SegmentedButton value={view} options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} onChange={setView} showCheck={false} />
        </div>
        <div className="flex gap-2 sm:hidden">
          <Button size="sm" onClick={() => onCreateTask({ due_date: dateKey(anchor) })}><Plus /> Task</Button>
          <Button size="sm" variant="tonal" onClick={() => { setEditingReminder(null); setReminderEditorOpen(true); }}><Bell /> Reminder</Button>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3 px-1">
        <button
          type="button" className="inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-sm text-muted-foreground hover:bg-[hsl(var(--on-surface)/0.06)]"
          aria-pressed={hideCompleted}
          onClick={() => {
            const next = !hideCompleted;
            setHideCompleted(next);
            try { localStorage.setItem(HIDE_COMPLETED_KEY, String(next)); } catch {}
          }}
        >
          <span className={cn('flex size-4 items-center justify-center rounded-md border', hideCompleted && 'border-primary bg-primary text-primary-foreground')}>{hideCompleted && <Check className="size-3" />}</span>
          Hide completed
        </button>
        {moveModeTask && (
          <div className="flex items-center gap-2 rounded-full bg-[hsl(var(--secondary-container))] px-3 py-1.5 text-xs text-[hsl(var(--on-secondary-container))]">
            Choose a new day for “{moveModeTask.title}”
            <button type="button" aria-label="Cancel move" onClick={() => setMoveModeTask(null)}><X className="size-4" /></button>
          </div>
        )}
      </div>

      {isLoading ? <PlannerSkeleton view={view} /> : calendar}

      {scopedTasks.length > 0 && (
        <section className="grid gap-5 sm:grid-cols-2 sm:gap-7" aria-label="Period tasks">
          {(['week', 'month'] as const).map((scope) => {
            const items = scopedTasks.filter((task) => scope === 'week' ? task.week_of : task.month_of);
            if (!items.length) return null;
            return (
              <div key={scope} className="min-w-0">
                <h3 className="border-b border-[hsl(var(--outline-variant)/0.8)] pb-2 text-lg font-semibold text-muted-foreground">{scope === 'week' ? 'This week' : 'This month'}</h3>
                <div className="grid gap-1 pt-2">
                  {items.map((task) => <PlannerTask key={task.id} task={task} draggable={false} timezone={data?.timezone ?? 'UTC'} onEdit={onEditTask} onToggle={(item) => toggleStatus.mutate({ id: item.id, status: item.status === 'done' ? 'todo' : 'done' })} />)}
                </div>
              </div>
            );
          })}
        </section>
      )}

      <Sheet open={Boolean(agendaDay)} onOpenChange={(open) => !open && setAgendaDay(null)}>
        <SheetContent side="bottom" className="max-h-[calc(100dvh-env(safe-area-inset-top)-12px)] overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+5.5rem)]">
          <SheetHeader>
            <SheetTitle>{agendaDay ? format(agendaDay, 'EEEE, MMMM d') : 'Day'}</SheetTitle>
            <SheetDescription>{(dayTasks.get(agendaKey)?.length ?? 0) + (dayReminders.get(agendaKey)?.length ?? 0)} planned items</SheetDescription>
          </SheetHeader>
          <div className="grid gap-2 px-5 pb-4">
            {(dayTasks.get(agendaKey) ?? []).filter((task) => task.status !== 'done').map((task) => (
              <div key={task.id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1"><PlannerTask task={task} draggable={false} timezone={data?.timezone ?? 'UTC'} onEdit={onEditTask} onToggle={(item) => toggleStatus.mutate({ id: item.id, status: item.status === 'done' ? 'todo' : 'done' })} /></div>
                <Button variant="ghost" size="sm" onClick={() => { setMoveModeTask(task); setAgendaDay(null); }}>Move</Button>
              </div>
            ))}
            {(dayReminders.get(agendaKey) ?? []).map((item) => <ReminderPreview key={item.key} item={item} timezone={data?.timezone ?? 'UTC'} onClick={() => openReminder(item)} />)}
            {(dayTasks.get(agendaKey) ?? []).filter((task) => task.status === 'done').map((task) => (
              <div key={task.id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1"><PlannerTask task={task} draggable={false} timezone={data?.timezone ?? 'UTC'} onEdit={onEditTask} onToggle={(item) => toggleStatus.mutate({ id: item.id, status: item.status === 'done' ? 'todo' : 'done' })} /></div>
                <Button variant="ghost" size="sm" onClick={() => { setMoveModeTask(task); setAgendaDay(null); }}>Move</Button>
              </div>
            ))}
            <Button variant="tonal" className="mt-2" onClick={() => { onCreateTask({ due_date: agendaKey }); setAgendaDay(null); }}><Plus /> Add task</Button>
          </div>
        </SheetContent>
      </Sheet>

      <ReminderEditor open={reminderEditorOpen} editing={editingReminder} onOpenChange={setReminderEditorOpen} />
    </div>
  );
}

function DayCell({ day, month, tasks, reminders, compact, draggable, previewLimit, moveTarget, timezone, onClick, onAdd, onEdit, onReminder, onToggle }: {
  day: Date; month: Date; tasks: Task[]; reminders: PlannerReminderOccurrence[]; compact: boolean; draggable: boolean;
  previewLimit: number; moveTarget: boolean; timezone: string; onClick: () => void; onAdd: () => void; onEdit: (task: Task) => void;
  onReminder: (item: PlannerReminderOccurrence) => void; onToggle: (task: Task) => void;
}) {
  const key = dateKey(day);
  const { ref, isDropTarget } = useDroppable({ id: `day:${key}`, data: { date: key } });
  const previews = [
    ...tasks.filter((task) => task.status !== 'done').map((task) => ({ kind: 'task' as const, task })),
    ...reminders.map((reminder) => ({ kind: 'reminder' as const, reminder })),
    ...tasks.filter((task) => task.status === 'done').map((task) => ({ kind: 'task' as const, task })),
  ];
  return (
    <div
      ref={ref as React.Ref<HTMLDivElement>}
      onClick={onClick}
      className={cn(
        'group/day relative min-w-0 transition-colors',
        compact
          ? 'border-b border-r border-[hsl(var(--outline-variant)/0.7)] p-1.5 sm:p-2'
          : 'p-0',
        !isSameMonth(day, month) && compact && 'text-muted-foreground/55',
        isDropTarget && 'bg-[hsl(var(--secondary-container))]', moveTarget && 'cursor-crosshair hover:bg-[hsl(var(--secondary-container)/0.62)]',
      )}
    >
      <div className={cn(
        'flex items-center justify-between gap-1',
        compact ? 'mb-1' : 'min-h-14 items-baseline border-b-2 pb-2 pt-1',
        !compact && (isToday(day) ? 'border-primary text-primary' : 'border-[hsl(var(--on-surface))]'),
      )}>
        {compact ? (
          <span className={cn('flex size-8 items-center justify-center rounded-full text-sm font-semibold sm:text-base', isToday(day) && 'bg-primary text-primary-foreground')}>
            {format(day, 'd')}
          </span>
        ) : (
          <>
            <span className="shrink-0 whitespace-nowrap text-xl font-bold tracking-tight lg:text-2xl">{format(day, 'd MMM')}</span>
            <span className="ml-auto flex shrink-0 items-center gap-0.5">
              <span className={cn('text-base font-semibold lg:text-lg', !isToday(day) && 'text-muted-foreground')}>{format(day, 'EEE')}</span>
              <button
                type="button"
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[hsl(var(--on-surface)/0.06)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
                aria-label={`Add task on ${format(day, 'MMMM d')}`}
                onClick={(event) => { event.stopPropagation(); onAdd(); }}
              >
                <Plus className="size-4" />
              </button>
            </span>
          </>
        )}
      </div>
      <div
        className={cn('relative grid content-start', compact ? 'gap-1' : 'min-h-[370px] gap-1 py-1')}
        style={!compact ? {
          backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 43px, hsl(var(--outline-variant) / 0.58) 44px)',
        } : undefined}
      >
        {previews.slice(0, previewLimit).map((preview) => preview.kind === 'task'
          ? <PlannerTask key={`t:${preview.task.id}`} task={preview.task} draggable={draggable} compact={compact} timezone={timezone} onEdit={onEdit} onToggle={onToggle} />
          : <ReminderPreview key={preview.reminder.key} item={preview.reminder} compact={compact} timezone={timezone} onClick={() => onReminder(preview.reminder)} />)}
        {previews.length > previewLimit && <span className="px-1 text-[11px] font-medium text-muted-foreground">+{previews.length - previewLimit} more</span>}
      </div>
    </div>
  );
}

function AgendaDay({ day, tasks, reminders, draggable, timezone, onAdd, onEdit, onReminder, onToggle }: {
  day: Date; tasks: Task[]; reminders: PlannerReminderOccurrence[]; draggable: boolean; onAdd: () => void;
  timezone: string; onEdit: (task: Task) => void; onReminder: (item: PlannerReminderOccurrence) => void; onToggle: (task: Task) => void;
}) {
  const key = dateKey(day);
  const { ref, isDropTarget } = useDroppable({ id: `day:${key}`, data: { date: key } });
  return (
    <section ref={ref as React.Ref<HTMLElement>} className={cn('border-b border-[hsl(var(--outline-variant)/0.8)] px-1 py-3', isDropTarget && 'bg-[hsl(var(--secondary-container))]')}>
      <div className={cn('mb-2 flex items-center justify-between border-b-2 pb-2', isToday(day) ? 'border-primary text-primary' : 'border-[hsl(var(--on-surface))]')}>
        <h3 className="text-lg font-bold">{format(day, 'EEE, MMM d')}</h3>
        <Button variant="ghost" size="icon" className="size-11" aria-label={`Add task on ${format(day, 'MMMM d')}`} onClick={onAdd}><Plus /></Button>
      </div>
      <div className="grid gap-1">
        {tasks.filter((task) => task.status !== 'done').map((task) => <PlannerTask key={task.id} task={task} draggable={draggable} timezone={timezone} onEdit={onEdit} onToggle={onToggle} />)}
        {reminders.map((item) => <ReminderPreview key={item.key} item={item} timezone={timezone} onClick={() => onReminder(item)} />)}
        {tasks.filter((task) => task.status === 'done').map((task) => <PlannerTask key={task.id} task={task} draggable={draggable} timezone={timezone} onEdit={onEdit} onToggle={onToggle} />)}
        {!tasks.length && !reminders.length && <button type="button" onClick={onAdd} className="min-h-11 border-b border-dashed border-[hsl(var(--outline-variant))] text-left text-sm text-muted-foreground hover:text-foreground">Add a task</button>}
      </div>
    </section>
  );
}

function PlannerTask({ task, draggable, compact = false, timezone, onEdit, onToggle }: { task: Task; draggable: boolean; compact?: boolean; timezone: string; onEdit: (task: Task) => void; onToggle: (task: Task) => void }) {
  if (!draggable) return <PlannerTaskPill task={task} compact={compact} timezone={timezone} onEdit={onEdit} onToggle={onToggle} />;
  return <DraggablePlannerTask task={task} compact={compact} timezone={timezone} onEdit={onEdit} onToggle={onToggle} />;
}

function DraggablePlannerTask({ task, compact, timezone, onEdit, onToggle }: { task: Task; compact: boolean; timezone: string; onEdit: (task: Task) => void; onToggle: (task: Task) => void }) {
  const { ref, handleRef, isDragging } = useDraggable({ id: `task:${task.id}`, data: { task } });
  return <PlannerTaskPill task={task} compact={compact} timezone={timezone} onEdit={onEdit} onToggle={onToggle} containerRef={ref} handleRef={handleRef} isDragging={isDragging} />;
}

function PlannerTaskPill({ task, compact, timezone, onEdit, onToggle, containerRef, handleRef, isDragging = false }: {
  task: Task; compact: boolean; timezone: string; onEdit: (task: Task) => void; onToggle: (task: Task) => void;
  containerRef?: (element: Element | null) => void; handleRef?: (element: Element | null) => void; isDragging?: boolean;
}) {
  return (
    <div
      ref={containerRef as React.Ref<HTMLDivElement> | undefined}
      className={cn(
        'group/task flex min-w-0 items-center text-left transition-[background-color,opacity]',
        compact ? 'min-h-7 gap-0.5 rounded-md px-1 text-xs' : 'min-h-10 gap-1 px-1 text-sm',
        task.color && 'rounded-md', task.status === 'done' && 'opacity-55', isDragging && 'opacity-35',
      )}
      style={task.color ? { backgroundColor: `${task.color}24`, color: task.color } : undefined}
    >
      <button type="button" aria-label={task.status === 'done' ? 'Mark incomplete' : 'Complete task'} className={cn('flex shrink-0 items-center justify-center rounded-full', compact ? 'size-6' : 'size-11 min-[1360px]:size-8')} onClick={(event) => { event.stopPropagation(); onToggle(task); }}>
        <span className={cn('flex size-4 items-center justify-center rounded-full border border-current', task.status === 'done' && 'bg-current')}>
          {task.status === 'done' && <Check className="size-3 text-[hsl(var(--surface))]" />}
        </span>
      </button>
      <button
        type="button"
        aria-label={`Edit ${task.title}`}
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
        onClick={(event) => { event.stopPropagation(); onEdit(task); }}
      >
        {task.description.trim() && <StickyNote className={cn('shrink-0', compact ? 'size-3' : 'size-3.5')} aria-label="Has note" />}
        {task.scheduled_at && <span className="shrink-0 font-medium">{instantTime(task.scheduled_at, timezone)}</span>}
        <span className={cn('min-w-0 flex-1 truncate', task.status === 'done' && 'line-through')}>{task.title}</span>
      </button>
      {handleRef && !compact && (
        <button ref={handleRef as React.Ref<HTMLButtonElement>} type="button" className="flex size-11 min-[1360px]:size-8 shrink-0 touch-none items-center justify-center rounded-full text-muted-foreground opacity-25 transition-opacity hover:bg-[hsl(var(--on-surface)/0.06)] hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 group-hover/task:opacity-70" aria-label={`Move ${task.title}. Press Space or Enter to pick up, arrow keys to move, and Space or Enter to drop.`} onClick={(event) => event.stopPropagation()}>
          <span className="grid grid-cols-2 gap-[3px]" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => <span key={index} className="size-[2px] rounded-full bg-current" />)}
          </span>
        </button>
      )}
    </div>
  );
}

function ReminderPreview({ item, onClick, timezone, compact = false }: { item: PlannerReminderOccurrence; onClick: () => void; timezone: string; compact?: boolean }) {
  return (
    <button type="button" onClick={(event) => { event.stopPropagation(); onClick(); }} className={cn('flex min-w-0 items-center gap-1.5 rounded-md bg-[hsl(var(--tertiary-container))] text-left text-[hsl(var(--on-tertiary-container))]', compact ? 'min-h-7 px-1.5 text-xs' : 'min-h-10 px-2 text-sm')}>
      {item.recurring ? <Repeat className="size-3 shrink-0" /> : <Bell className="size-3 shrink-0" />}
      {!compact && <span className="shrink-0 font-medium">{instantTime(item.scheduled_at, timezone)}</span>}
      <span className="min-w-0 flex-1 truncate">{item.message}</span>
    </button>
  );
}

function PlannerSkeleton({ view }: { view: PlannerViewMode }) {
  return <div className={cn('grid gap-2', view === 'month' ? 'grid-cols-7' : 'grid-cols-1 min-[1360px]:grid-cols-7')}>{Array.from({ length: view === 'month' ? 35 : 7 }, (_, index) => <Skeleton key={index} className="h-28 rounded-[18px]" />)}</div>;
}
