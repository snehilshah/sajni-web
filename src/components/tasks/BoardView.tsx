import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DragDropProvider, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable,
} from '@dnd-kit/react';
import { PointerActivationConstraints } from '@dnd-kit/dom';
import { format, parseISO, isPast, isToday } from 'date-fns';
import { toast } from 'sonner';

import type { Task } from '@/types';
import { Plus, Star, ListChecks, GitBranch, Repeat, CornerDownRight } from '@/components/ui/icons';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { repeats } from './RepeatPicker';
import { STATUSES, STATUS_LABELS, PRIORITY_COLORS } from './helpers';

// The Tasks board (desktop): one tonal lane per status, cards of one fixed
// height (two-line title, one badge row; DESIGN.md → Board). Order in a lane
// is the app's order, last updated first, so a dropped card lands at the top
// of its lane. Drag lifts the card into an overlay and leaves a same-sized
// slot, so nothing under the pointer moves; on drop the card flies from where
// it was let go to its new place (FLIP), and the lanes close and open around
// it with layout springs.

const DONE_PREVIEW = 5;
const spring = { type: 'spring' as const, stiffness: 520, damping: 42, mass: 0.9 };

type Lane = Task['status'];

interface Props {
  grouped: Record<Lane, Task[]>;
  onClick: (t: Task) => void;
  onMove: (id: number, status: Lane) => void;
  onQuickAdd: (status: Lane, title: string) => Promise<void>;
  onToggleImportant: (id: number, important: boolean) => void;
  onToggleDone: (task: Task) => void;
}

const stamp = (t: Task) => Date.parse(t.updated_at ?? '') || 0;
const byUpdated = (a: Task, b: Task) => stamp(b) - stamp(a);

export default function BoardView({ grouped, onClick, onMove, onQuickAdd, onToggleImportant, onToggleDone }: Props) {
  // A drop moves the card at once, in this frame; the query cache catches up
  // a moment later (optimistic patch), and then the override is dropped.
  const [moved, setMoved] = useState<Record<number, { status: Lane; at: string }>>({});
  useEffect(() => {
    setMoved((cur) => {
      const ids = Object.keys(cur).map(Number);
      if (ids.length === 0) return cur;
      const next = { ...cur };
      for (const id of ids) {
        const t = STATUSES.flatMap((s) => grouped[s]).find((x) => x.id === id);
        if (!t || t.status === cur[id].status) delete next[id];
      }
      return next;
    });
  }, [grouped]);

  const lanes = useMemo(() => {
    const out = {} as Record<Lane, Task[]>;
    for (const s of STATUSES) out[s] = [];
    for (const s of STATUSES) {
      for (const t of grouped[s]) {
        const m = moved[t.id];
        if (m) out[m.status].push({ ...t, status: m.status, updated_at: m.at });
        else out[s].push(t);
      }
    }
    for (const s of STATUSES) out[s].sort(byUpdated);
    return out;
  }, [grouped, moved]);

  // Where the lifted card was let go, so it can fly from there to its place.
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const lastRect = useRef<DOMRect | null>(null);
  // status: the lane it lands in; only the card there flies.
  const [landing, setLanding] = useState<{ id: number; rect: DOMRect; status: Lane } | null>(null);

  const sensors = useMemo(() => [
    PointerSensor.configure({
      activationConstraints: (event) => event.pointerType === 'touch'
        ? [new PointerActivationConstraints.Delay({ value: 250, tolerance: { x: 8, y: 8 } })]
        : [new PointerActivationConstraints.Distance({ value: 5 })],
    }),
    KeyboardSensor,
  ], []);

  return (
    <DragDropProvider
      sensors={sensors}
      // The overlay may be gone by the time the drag ends: keep its last spot.
      onDragMove={() => {
        const r = overlayRef.current?.getBoundingClientRect();
        if (r) lastRect.current = r;
      }}
      onDragEnd={(event) => {
        const task = event.operation.source?.data?.task as Task | undefined;
        if (!task) return;
        const shape = event.operation.shape?.current as { boundingRectangle?: { left: number; top: number; width: number; height: number } } | undefined;
        const box = shape?.boundingRectangle;
        const rect = overlayRef.current?.getBoundingClientRect() ?? lastRect.current
          ?? (box ? new DOMRect(box.left, box.top, box.width, box.height) : null);
        lastRect.current = null;
        const target = event.operation.target?.data?.status as Lane | undefined;
        const moving = !event.canceled && target && target !== task.status && !boardMoveRefusal(task, target)
          // Blocked needs a blocker: the dialog opens and the card stays put.
          && target !== 'blocked';
        // Move and land in one update, so the card never shows in its old
        // lane for a frame.
        flushSync(() => {
          if (rect) setLanding({ id: task.id, rect, status: moving ? target : task.status });
          if (moving) setMoved((cur) => ({ ...cur, [task.id]: { status: target, at: new Date().toISOString() } }));
        });
        if (event.canceled || !target || target === task.status) return;
        const refusal = boardMoveRefusal(task, target);
        if (refusal) { toast.info(refusal); return; }
        onMove(task.id, target);
      }}
    >
      <div
        className="grid grid-flow-col auto-cols-[minmax(15rem,1fr)] gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1"
        aria-label="Tasks board"
      >
        {STATUSES.map((status) => (
          <BoardLane
            key={status}
            status={status}
            tasks={lanes[status]}
            landing={landing}
            onLanded={() => setLanding(null)}
            onClick={onClick}
            onQuickAdd={onQuickAdd}
            onToggleImportant={onToggleImportant}
            onToggleDone={onToggleDone}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {(source) => {
          const task = source.data?.task as Task | undefined;
          if (!task) return null;
          return (
            <div ref={overlayRef} className="cursor-grabbing">
              <div className="rotate-[1.5deg] scale-[1.03] rounded-[14px] shadow-lg transition-transform duration-150">
                <CardBody task={task} lifted />
              </div>
            </div>
          );
        }}
      </DragOverlay>
    </DragDropProvider>
  );
}

function BoardLane({ status, tasks, landing, onLanded, onClick, onQuickAdd, onToggleImportant, onToggleDone }: {
  status: Lane;
  tasks: Task[];
  landing: { id: number; rect: DOMRect; status: Lane } | null;
  onLanded: () => void;
  onClick: (t: Task) => void;
  onQuickAdd: (status: Lane, title: string) => Promise<void>;
  onToggleImportant: (id: number, important: boolean) => void;
  onToggleDone: (task: Task) => void;
}) {
  const { ref, isDropTarget } = useDroppable({ id: `lane:${status}`, data: { status } });
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [showAll, setShowAll] = useState(false);
  const folded = status === 'done' && !showAll && tasks.length > DONE_PREVIEW;
  const shown = folded ? tasks.slice(0, DONE_PREVIEW) : tasks;

  const submit = async () => {
    const title = draft.trim();
    setDraft('');
    setAdding(false);
    if (title) await onQuickAdd(status, title);
  };

  return (
    <section
      ref={ref as React.Ref<HTMLElement>}
      aria-label={STATUS_LABELS[status]}
      className={cn(
        'snap-start flex max-h-[calc(100dvh-13rem)] min-h-40 flex-col rounded-[20px] bg-[hsl(var(--surface-container))] transition-[background-color,box-shadow] duration-200',
        isDropTarget && 'bg-[hsl(var(--surface-container-high))] shadow-[inset_0_0_0_2px_hsl(var(--primary)/0.45)]',
      )}
    >
      <header className="flex h-12 shrink-0 items-center gap-2 pl-4 pr-2">
        <h3 className="text-sm font-semibold">{STATUS_LABELS[status]}</h3>
        <span className="text-xs tabular-nums text-muted-foreground">{tasks.length}</span>
        <Button
          variant="ghost" size="icon-sm" className="ml-auto rounded-full"
          aria-label={`Add a task to ${STATUS_LABELS[status]}`}
          onClick={() => { setAdding(true); setDraft(''); }}
        >
          <Plus className="size-4" />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain px-1.5 pb-1.5">
        {adding && (
          <div className="rounded-[14px] bg-[hsl(var(--surface-container-lowest))] p-2">
            <Input
              autoFocus
              placeholder="What needs doing?"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => { if (!draft.trim()) setAdding(false); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); void submit(); }
                if (e.key === 'Escape') { setAdding(false); setDraft(''); }
              }}
              className="h-9 text-sm"
            />
          </div>
        )}
        <AnimatePresence initial={false} mode="popLayout">
          {shown.map((task) => (
            <BoardCard
              key={task.id}
              task={task}
              landingFrom={landing?.id === task.id && landing.status === status ? landing.rect : null}
              onLanded={onLanded}
              onClick={() => onClick(task)}
              onToggleImportant={onToggleImportant}
              onToggleDone={onToggleDone}
            />
          ))}
        </AnimatePresence>
        {tasks.length === 0 && !adding && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {status === 'done' ? 'Nothing finished yet' : 'Nothing here'}
          </p>
        )}
      </div>

      <footer className="flex h-11 shrink-0 items-center px-1.5 pb-1.5">
        {folded ? (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="h-9 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-[hsl(var(--on-surface)/0.06)] hover:text-foreground"
          >
            Show {tasks.length - DONE_PREVIEW} more
          </button>
        ) : status === 'done' && showAll && tasks.length > DONE_PREVIEW ? (
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className="h-9 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-[hsl(var(--on-surface)/0.06)] hover:text-foreground"
          >
            Show fewer
          </button>
        ) : (
          <button
            type="button"
            onClick={() => { setAdding(true); setDraft(''); }}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-[hsl(var(--on-surface)/0.06)] hover:text-foreground"
          >
            <Plus className="size-4" /> Add a task
          </button>
        )}
      </footer>
    </section>
  );
}

function BoardCard({ task, landingFrom, onLanded, onClick, onToggleImportant, onToggleDone }: {
  task: Task;
  landingFrom: DOMRect | null;
  onLanded: () => void;
  onClick: () => void;
  onToggleImportant: (id: number, important: boolean) => void;
  onToggleDone: (task: Task) => void;
}) {
  const { ref, isDragSource } = useDraggable({ id: `task:${task.id}`, data: { task } });
  const inner = useRef<HTMLDivElement | null>(null);

  // FLIP: start where the lifted card was let go, then settle into place.
  useLayoutEffect(() => {
    const el = inner.current;
    if (!landingFrom || !el) return;
    const to = el.getBoundingClientRect();
    const dx = landingFrom.left - to.left;
    const dy = landingFrom.top - to.top;
    // Web Animations: runs on the compositor, so it stays smooth while the
    // lanes re-render around it.
    const anim = el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) rotate(1.5deg) scale(1.03)` },
        { transform: 'translate(0, 0) rotate(0deg) scale(1)' },
      ],
      { duration: 300, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    );
    // Above the cards sliding aside for it while it settles.
    const slot = el.parentElement?.parentElement as HTMLElement | null;
    if (slot) { slot.style.position = 'relative'; slot.style.zIndex = '10'; }
    const settle = () => { if (slot) slot.style.zIndex = ''; };
    anim.onfinish = () => { settle(); onLanded(); };
    anim.oncancel = settle;
    return () => anim.cancel();
    // Runs once per landing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landingFrom]);

  return (
    <motion.div
      layout="position"
      transition={spring}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      // A card leaving by drag is already shown in its new lane: no fade.
      exit={{ opacity: 0, transition: { duration: isDragSource || landingFrom ? 0 : 0.12 } }}
      className="shrink-0"
    >
      <div ref={ref as React.Ref<HTMLDivElement>} className="relative">
        {isDragSource && (
          <div aria-hidden className="absolute inset-0 rounded-[14px] border-2 border-dashed border-[hsl(var(--outline-variant))]" />
        )}
        <div ref={inner} className={cn('will-change-transform', isDragSource && 'invisible')}>
          <CardBody task={task} onClick={onClick} onToggleImportant={onToggleImportant} onToggleDone={onToggleDone} />
        </div>
      </div>
    </motion.div>
  );
}

// CardBody is one task at a fixed height: status box, priority/colour dot,
// title on up to two lines and the star, then one row of badges in the list's
// order (date, repeat, steps, subtasks, blocked).
function CardBody({ task, lifted = false, onClick, onToggleImportant, onToggleDone }: {
  task: Task;
  lifted?: boolean;
  onClick?: () => void;
  onToggleImportant?: (id: number, important: boolean) => void;
  onToggleDone?: (task: Task) => void;
}) {
  const done = task.status === 'done';
  const overdue = Boolean(task.due_date && !done && (() => {
    const d = parseISO(task.due_date!);
    return !isToday(d) && isPast(d);
  })());
  const steps = task.steps?.length ?? 0;
  const stepsDone = task.steps?.filter((s) => s.done).length ?? 0;
  const subs = task.subtask_count ?? 0;
  const chip = 'inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs leading-none';
  const neutral = 'bg-[hsl(var(--on-surface)/0.06)] text-muted-foreground';

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
      className={cn(
        'group flex h-24 flex-col justify-between rounded-[14px] bg-[hsl(var(--surface-container-lowest))] px-3 py-2.5 text-left outline-none',
        'transition-shadow duration-150 focus-visible:ring-2 focus-visible:ring-ring/45',
        // State layer, not a new surface: a faint wash on hover.
        lifted ? 'cursor-grabbing' : 'cursor-pointer hover:shadow-[inset_0_0_0_100vmax_hsl(var(--on-surface)/0.035)]',
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <button
          type="button"
          aria-label={done ? 'Mark not done' : 'Complete task'}
          onClick={(e) => { e.stopPropagation(); onToggleDone?.(task); }}
          className="-m-1 shrink-0 p-1"
        >
          <span className={cn(
            'flex size-5 items-center justify-center rounded-[32%] border-2 transition-colors',
            done ? 'rounded-full border-primary bg-primary text-primary-foreground'
              : task.status === 'blocked' ? 'border-destructive/70 bg-[hsl(var(--error-container))]'
                : 'border-[hsl(var(--outline))] group-hover:border-primary',
          )}>
            {done && (
              <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 6.5L5 9L10 3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
        </button>
        <span
          className={cn('mt-[7px] size-2 shrink-0 rounded-full', !task.color && PRIORITY_COLORS[task.priority])}
          style={task.color ? { backgroundColor: task.color } : undefined}
        />
        <span className={cn(
          'line-clamp-2 min-w-0 flex-1 text-sm font-medium leading-5',
          done && 'text-muted-foreground line-through',
        )}>
          {task.title}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleImportant?.(task.id, !task.important); }}
          className={cn(
            '-m-1 shrink-0 rounded-full p-1 transition-[opacity,color]',
            task.important ? 'text-[hsl(var(--tertiary))]' : 'text-muted-foreground opacity-50 hover:opacity-100',
          )}
          aria-label={task.important ? 'Remove from Important' : 'Mark important'}
        >
          <Star className={cn('size-4', task.important && 'fill-current')} />
        </button>
      </div>

      <div className="flex min-w-0 items-center gap-1.5 overflow-hidden pl-[3.25rem]">
        {task.parent_task_id != null && task.parent_task_title && (
          <span className={cn(chip, neutral, 'min-w-0 max-w-32')} title={`Subtask of ${task.parent_task_title}`}>
            <CornerDownRight className="size-3 shrink-0" /><span className="truncate">{task.parent_task_title}</span>
          </span>
        )}
        {task.due_date ? (
          <span className={cn(chip, overdue ? 'bg-[hsl(var(--error-container))] text-[hsl(var(--on-error-container))]' : neutral)}>
            {format(parseISO(task.due_date), 'MMM d')}
          </span>
        ) : task.week_of ? (
          <span className={cn(chip, neutral)}>Wk {format(parseISO(task.week_of), 'MMM d')}</span>
        ) : task.month_of ? (
          <span className={cn(chip, neutral)}>{format(parseISO(task.month_of), 'MMMM')}</span>
        ) : null}
        {repeats(task.recurrence) && (
          <span className={cn(chip, neutral)} title="Repeats"><Repeat className="size-3" /></span>
        )}
        {steps > 0 && (
          <span className={cn(chip, neutral)} title="Steps"><ListChecks className="size-3" /><span className="tabular-nums">{stepsDone}/{steps}</span></span>
        )}
        {subs > 0 && (
          <span className={cn(chip, neutral)} title="Subtasks"><CornerDownRight className="size-3" /><span className="tabular-nums">{task.subtasks_done ?? 0}/{subs}</span></span>
        )}
        {task.status === 'blocked' && (
          <span className={cn(chip, 'min-w-0 bg-[hsl(var(--error-container))] text-[hsl(var(--on-error-container))]')}>
            <GitBranch className="size-3 shrink-0" />
            <span className="truncate">Blocked{task.blocked_by_task_title ? ` by ${task.blocked_by_task_title}` : ''}</span>
          </span>
        )}
      </div>
    </div>
  );
}

// boardMoveRefusal says why a drop can't happen, or null. Done with open
// subtasks is refused by the server (409), so the card never flies there.
export function boardMoveRefusal(task: Task, status: Lane): string | null {
  if (status === 'done' && (task.subtask_count ?? 0) > (task.subtasks_done ?? 0)) {
    const open = (task.subtask_count ?? 0) - (task.subtasks_done ?? 0);
    return `Finish its ${open} open subtask${open === 1 ? '' : 's'} first.`;
  }
  return null;
}

