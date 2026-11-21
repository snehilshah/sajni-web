import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  DragDropProvider, DragOverlay, KeyboardSensor, PointerSensor, useDroppable, useDragOperation,
} from '@dnd-kit/react';
import { useSortable, isSortable } from '@dnd-kit/react/sortable';
import { PointerActivationConstraints } from '@dnd-kit/dom';
import { format, parseISO, isPast, isToday } from 'date-fns';

import type { Task } from '@/types';
import { Plus, Star, ListChecks, Repeat, CornerDownRight, Ban, Bell, AlignLeft, Image as ImageIcon } from '@/components/ui/icons';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { track } from '@/lib/telemetry';
import { repeats } from './RepeatPicker';
import { STATUSES, STATUS_LABELS } from './helpers';

// The status box's ring carries priority, as in the list (DESIGN.md:
// "Priority ring"); no separate dot.
const PRIORITY_RING: Record<string, string> = {
  high: 'border-destructive',
  medium: 'border-amber-500',
  low: 'border-[hsl(var(--outline))]',
};

// Lanes in the order work flows; Blocked, the exception, comes last.
const LANES: Task['status'][] = ['todo', 'in_progress', 'done', 'blocked'];

// The Tasks board (desktop): one tonal lane per status; a card is its title
// (up to two lines) and, when it has any, one badge row (DESIGN.md → Board).
//
// Lanes keep the order the owner gives them. Each task carries a board_rank
// (smaller is higher); one never placed sorts as -updated_at in ms, so new
// and edited tasks come first until moved. Dragging is sortable: the cards
// make room where the card would go, and it drops exactly there; the rank is
// the midpoint of its new neighbours'. A move is applied in the same frame
// (local override) and saved optimistically, so nothing re-sorts after.

const DONE_PREVIEW = 5;
const EASE = 'cubic-bezier(0.2, 0, 0, 1)';
const SHIFT = { duration: 220, easing: EASE };
const GAP_MS = 60_000;

type Lane = Task['status'];

interface Props {
  grouped: Record<Lane, Task[]>;
  onClick: (t: Task) => void;
  /** status is set only when the lane changed. */
  onMove: (id: number, status: Lane | undefined, rank: number) => void;
  onQuickAdd: (status: Lane, title: string) => Promise<void>;
  onToggleImportant: (id: number, important: boolean) => void;
  onToggleDone: (task: Task) => void;
  /** This view lists open tasks only; its Done lane holds today's. */
  doneToday?: boolean;
}

/** The lane's card slots (minus the dragged one) and the first whose middle
 *  is below y: the card goes before it (-1 = at the end). */
function slotsAt(box: HTMLElement, dragged: Element | null, y: number) {
  const slots = [...box.querySelectorAll<HTMLElement>(':scope > [data-board-slot]')].filter((x) => x !== dragged);
  const at = slots.findIndex((x) => { const r = x.getBoundingClientRect(); return r.top + r.height / 2 > y; });
  return { slots, at };
}

/** A task's place in its lane: its rank, else newest first. */
export const boardRank = (t: Task) => t.board_rank ?? -(Date.parse(t.updated_at ?? '') || 0);

/** The rank for a card dropped at index in list (which no longer holds it). */
export function rankAt(list: Task[], index: number): number {
  const prev = index > 0 ? list[index - 1] : undefined;
  const next = index < list.length ? list[index] : undefined;
  if (prev && next) return (boardRank(prev) + boardRank(next)) / 2;
  if (next) return boardRank(next) - GAP_MS;
  if (prev) return boardRank(prev) + GAP_MS;
  return -Date.now();
}

export default function BoardView({ grouped, onClick, onMove, onQuickAdd, onToggleImportant, onToggleDone, doneToday = false }: Props) {
  // A drop shows in this frame; the query cache catches up a moment later
  // (optimistic patch), and then the override is dropped.
  const [moved, setMoved] = useState<Record<number, { status: Lane; rank: number }>>({});
  // Bumped on every drop: dnd-kit moves the dragged card's element between
  // lanes while sorting, which React can't reconcile, so the lanes redraw
  // from data (in the same frame; scroll and the Done fold carry over).
  const [epoch, setEpoch] = useState(0);
  const scroll = useRef<Partial<Record<Lane, HTMLDivElement | null>>>({});
  const savedScroll = useRef<Partial<Record<Lane, number>>>({});
  const [doneOpen, setDoneOpen] = useState(false);
  // Lanes run from where the board starts to just above the screen's foot,
  // whatever sits above them (the missed-tasks banner comes and goes).
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [laneH, setLaneH] = useState('calc(100dvh - 16rem)');
  useLayoutEffect(() => {
    const measure = () => {
      const el = gridRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setLaneH(`calc(100dvh - ${Math.round(top)}px - 1.5rem)`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const redraw = () => {
    for (const s of STATUSES) savedScroll.current[s] = scroll.current[s]?.scrollTop ?? 0;
    setEpoch((e) => e + 1);
  };
  useEffect(() => {
    setMoved((cur) => {
      const ids = Object.keys(cur).map(Number);
      if (ids.length === 0) return cur;
      const next = { ...cur };
      for (const id of ids) {
        const t = STATUSES.flatMap((s) => grouped[s]).find((x) => x.id === id);
        if (!t || (t.status === cur[id].status && t.board_rank === cur[id].rank)) delete next[id];
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
        if (m) out[m.status].push({ ...t, status: m.status, board_rank: m.rank });
        else out[s].push(t);
      }
    }
    for (const s of STATUSES) out[s].sort((a, b) => boardRank(a) - boardRank(b));
    return out;
  }, [grouped, moved]);

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
      // dnd-kit only re-slots a card over another card. Over a lane's own
      // space (an empty lane, below its last card, the gaps) nothing moved,
      // so the drop read as "no move" and the card sprang back. Here the slot
      // goes into that lane where the pointer is, the same DOM move the
      // library makes over a card; the redraw after the drop resets the DOM.
      onDragOver={(event, manager) => {
        const { source, target, position } = event.operation;
        if (!source || !isSortable(source) || !target || isSortable(target)) return;
        const lane = (target.data as { status?: Lane } | undefined)?.status;
        const el = source.element;
        const box = document.querySelector<HTMLElement>(`[data-board-lane="${lane}"]`);
        if (!lane || lane === source.group || !el || !box) return;
        const { slots, at } = slotsAt(box, el, position.current.y);
        const index = at === -1 ? slots.length : at;
        const from = source.group;
        const fromIndex = source.index;
        if (at === -1) {
          if (slots.length) slots[slots.length - 1].after(el);
          else box.prepend(el);
        } else box.insertBefore(el, slots[at]);
        for (const d of manager.registry.draggables) {
          if (!isSortable(d) || d === source) continue;
          if (d.sortable.group === from && d.sortable.index > fromIndex) d.sortable.index -= 1;
          else if (d.sortable.group === lane && d.sortable.index >= index) d.sortable.index += 1;
        }
        source.sortable.group = lane;
        source.sortable.index = index;
      }}
      onDragEnd={(event) => {
        const source = event.operation.source;
        if (event.canceled || !source || !isSortable(source)) {
          if (event.canceled) flushSync(redraw);
          return;
        }
        const task = source.data?.task as Task | undefined;
        const slotLane = source.group as Lane | undefined;
        const target = event.operation.target;
        if (!task || !slotLane) return;
        // Let go over a lane that refused it (Done with open subtasks), the
        // card goes home: its slot may have been left in a lane it crossed.
        if (!target) { flushSync(redraw); return; }
        // The lane under the pointer decides, not the slot: dnd-kit re-slots
        // a card a frame or two after it enters a lane, so a quick drop
        // (In progress → Done in one flick) still had its slot at home and
        // read as "no move". Then place it by the pointer ourselves.
        const targetLane = (isSortable(target) ? target.group : (target.data as { status?: Lane } | undefined)?.status) as Lane | undefined;
        let lane = slotLane;
        let slotIndex = source.index;
        if (targetLane && targetLane !== slotLane) {
          const box = document.querySelector<HTMLElement>(`[data-board-lane="${targetLane}"]`);
          if (box) {
            const { slots, at } = slotsAt(box, source.element ?? null, event.operation.position.current.y);
            lane = targetLane;
            slotIndex = at === -1 ? slots.length : at;
          }
        }
        // Diagnostics (2026-11): every drop goes to the server log, so a
        // drop that doesn't do what the owner meant can be traced.
        track('board_drop', {
          task: task.id, from: task.status, slot: slotLane, over: targetLane ?? '', lane,
          idx: slotIndex, fixed: lane !== slotLane, kind: isSortable(target) ? 'card' : 'lane',
        }, true);
        if (lane === 'blocked' && task.status !== 'blocked') {
          // Blocked needs a blocker: the task opens; the card returns until saved.
          flushSync(redraw);
          onMove(task.id, 'blocked', boardRank(task));
          return;
        }
        const list = lanes[lane].filter((t) => t.id !== task.id);
        // Done shows five until opened; a card dropped below them stays in
        // sight as the fifth rather than vanishing behind "Show N more".
        const shown = lane === 'done' && !doneOpen ? DONE_PREVIEW - 1 : list.length;
        const index = Math.max(0, Math.min(slotIndex, list.length, shown));
        const before = lanes[task.status].findIndex((t) => t.id === task.id);
        if (lane === task.status && index === before) { flushSync(redraw); return; }
        const rank = rankAt(list, index);
        flushSync(() => {
          setMoved((cur) => ({ ...cur, [task.id]: { status: lane, rank } }));
          redraw();
        });
        onMove(task.id, lane === task.status ? undefined : lane, rank);
      }}
    >
      <div
        key={epoch}
        ref={gridRef}
        style={{ '--lane-h': laneH } as React.CSSProperties}
        className="grid grid-flow-col auto-cols-[minmax(15.5rem,1fr)] gap-4 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1"
        aria-label="Tasks board"
      >
        {LANES.map((status) => (
          <BoardLane
            key={status}
            status={status}
            tasks={lanes[status]}
            scrollRef={(el) => { scroll.current[status] = el; }}
            savedScroll={savedScroll}
            showAll={status === 'done' && doneOpen}
            label={status === 'done' && doneToday ? 'Done today' : STATUS_LABELS[status]}
            onShowAll={setDoneOpen}
            onClick={onClick}
            onQuickAdd={onQuickAdd}
            onToggleImportant={onToggleImportant}
            onToggleDone={onToggleDone}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 220, easing: EASE }}>
        {(source) => {
          const task = source.data?.task as Task | undefined;
          if (!task) return null;
          return (
            <div className="cursor-grabbing">
              {/* Lifted while dragging; settles flat as it drops into place. */}
              <div className={cn(
                'rounded-[14px] transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.2,0,0,1)]',
                source.isDropping ? 'rotate-0 scale-100 shadow-none' : 'rotate-[1.5deg] scale-[1.03] shadow-lg',
              )}>
                <CardBody task={task} lifted />
              </div>
            </div>
          );
        }}
      </DragOverlay>
    </DragDropProvider>
  );
}

// Done refuses a task with open subtasks (the server would, with a 409), so
// the cards there never make room for it.
const acceptsInto = (lane: Lane) => (source: { data?: unknown }) => {
  const task = (source.data as { task?: Task } | undefined)?.task;
  return !task || !boardMoveRefusal(task, lane);
};

function BoardLane({ status, tasks, scrollRef, savedScroll, showAll, onShowAll, label, onClick, onQuickAdd, onToggleImportant, onToggleDone }: {
  status: Lane;
  tasks: Task[];
  scrollRef: (el: HTMLDivElement | null) => void;
  savedScroll: React.RefObject<Partial<Record<Lane, number>>>;
  showAll: boolean;
  onShowAll: (open: boolean) => void;
  label: string;
  onClick: (t: Task) => void;
  onQuickAdd: (status: Lane, title: string) => Promise<void>;
  onToggleImportant: (id: number, important: boolean) => void;
  onToggleDone: (task: Task) => void;
}) {
  const accept = useMemo(() => acceptsInto(status), [status]);
  // The lane itself takes a drop below its cards (or when it's empty).
  const { ref, isDropTarget } = useDroppable({ id: `lane:${status}`, type: 'lane', accept, collisionPriority: 1, data: { status } });
  // While a card that can't go here is lifted, the lane says why.
  const { source } = useDragOperation();
  const dragged = (source?.data as { task?: Task } | undefined)?.task;
  const refusal = dragged ? boardMoveRefusal(dragged, status) : null;
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const scroller = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = savedScroll.current[status] ?? 0;
    // Only on mount: the redraw after a drop keeps the lane where it was.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
        'relative snap-start flex h-(--lane-h) min-h-80 flex-col rounded-[20px] bg-[hsl(var(--surface-container))] transition-[background-color,box-shadow] duration-200',
        isDropTarget && 'bg-[hsl(var(--surface-container-high))] shadow-[inset_0_0_0_2px_hsl(var(--primary)/0.45)]',
      )}
    >
      {refusal && (
        <p role="status" className="pointer-events-none absolute inset-x-1.5 bottom-1.5 z-10 rounded-[14px] bg-[hsl(var(--surface-container-highest))] px-3 py-2.5 text-center text-xs text-muted-foreground">
          {refusal}
        </p>
      )}
      <header className="flex h-13 shrink-0 items-center gap-2 pl-4 pr-2">
        <h3 className="text-[15px] font-semibold">{label}</h3>
        <span className="text-xs tabular-nums text-muted-foreground">{tasks.length}</span>
        <Button
          variant="ghost" size="icon-sm" className="ml-auto rounded-full"
          aria-label={`Add a task to ${STATUS_LABELS[status]}`}
          onClick={() => { setAdding(true); setDraft(''); }}
        >
          <Plus className="size-4" />
        </Button>
      </header>

      <div
        ref={(el) => { scroller.current = el; scrollRef(el); }}
        data-board-lane={status}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-2 pb-2"
      >
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
        {shown.map((task, index) => (
          <BoardCard
            key={task.id}
            task={task}
            index={index}
            lane={status}
            accept={accept}
            onClick={() => onClick(task)}
            onToggleImportant={onToggleImportant}
            onToggleDone={onToggleDone}
          />
        ))}
        {tasks.length === 0 && !adding && (
          <p className="py-6 text-center text-xs text-muted-foreground [[data-board-slot]~&]:hidden">
            {status === 'done' ? 'Nothing finished yet' : 'Nothing here'}
          </p>
        )}
      </div>

      <footer className="flex h-12 shrink-0 items-center px-2 pb-2">
        {folded ? (
          <button
            type="button"
            onClick={() => onShowAll(true)}
            className="h-9 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-[hsl(var(--on-surface)/0.06)] hover:text-foreground"
          >
            Show {tasks.length - DONE_PREVIEW} more
          </button>
        ) : status === 'done' && showAll && tasks.length > DONE_PREVIEW ? (
          <button
            type="button"
            onClick={() => onShowAll(false)}
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

function BoardCard({ task, index, lane, accept, onClick, onToggleImportant, onToggleDone }: {
  task: Task;
  index: number;
  lane: Lane;
  accept: (source: { data?: unknown }) => boolean;
  onClick: () => void;
  onToggleImportant: (id: number, important: boolean) => void;
  onToggleDone: (task: Task) => void;
}) {
  const { ref, isDragSource } = useSortable({
    id: task.id, index, group: lane, type: 'task', accept, transition: SHIFT, data: { task },
  });
  return (
    <div ref={ref as React.Ref<HTMLDivElement>} className="relative shrink-0" data-board-slot={task.id}>
      {isDragSource && (
        <div aria-hidden className="absolute inset-0 rounded-[14px] border-2 border-dashed border-[hsl(var(--outline-variant))]" />
      )}
      <div className={cn(isDragSource && 'invisible')}>
        <CardBody task={task} onClick={onClick} onToggleImportant={onToggleImportant} onToggleDone={onToggleDone} />
      </div>
    </div>
  );
}

// CardBody is one task: status box, priority/colour dot, title on up to two
// lines and the star, then (if any) one row of badges in the list's order
// (date, repeat, steps, subtasks, blocked) right under it.
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
  // Badges sit right under the title, from the card's edge; a card with
  // none is just its title, so no card carries an empty row.
  const blocked = task.status === 'blocked';
  const dueToday = Boolean(task.due_date && !done && isToday(parseISO(task.due_date)));
  const hasNotes = Boolean(task.description?.trim());
  const images = task.attachment_count ?? 0;
  const reminder = Boolean(task.remind && task.scheduled_at && !task.reminded_at && !done);
  const hasBadges = Boolean(
    (task.parent_task_id != null && task.parent_task_title) || task.due_date || task.week_of || task.month_of
    || repeats(task.recurrence) || steps > 0 || subs > 0 || hasNotes || images > 0 || reminder,
  );
  // Only the date is a pill (its colour means overdue or today); the rest
  // are quiet icons with counts, as on Trello.
  const pill = 'inline-flex h-6 shrink-0 items-center rounded-full px-2 text-xs leading-none';
  const neutral = 'bg-[hsl(var(--on-surface)/0.06)] text-muted-foreground';
  const mark = 'inline-flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground';

  return (
    <div
      data-board-card={task.id}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
      className={cn(
        'group flex flex-col gap-2.5 rounded-[14px] px-3.5 py-3 text-left outline-none',
        !task.color && 'bg-[hsl(var(--surface-container-lowest))]',
        'transition-shadow duration-150 focus-visible:ring-2 focus-visible:ring-ring/45',
        // State layer, not a new surface: a faint wash on hover.
        lifted ? 'cursor-grabbing' : 'cursor-pointer hover:shadow-[inset_0_0_0_100vmax_hsl(var(--on-surface)/0.035)]',
      )}
      // A coloured task is tinted with its colour (a wash, not a stripe).
      style={task.color ? { backgroundColor: `color-mix(in srgb, ${task.color} 10%, hsl(var(--surface-container-lowest)))` } : undefined}
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
              : blocked ? 'border-destructive/70 bg-[hsl(var(--error-container))] text-destructive'
                : !task.color && PRIORITY_RING[task.priority],
          )}
          // The task's own colour, when it has one, rings it instead.
          style={!done && !blocked && task.color ? { borderColor: task.color } : undefined}
          >
            {/* Blocked: the box itself says so; the lane already does too. */}
            {blocked && <Ban className="size-3" />}
            {done && (
              <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 6.5L5 9L10 3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
        </button>
        <span className={cn(
          'line-clamp-4 min-w-0 flex-1 text-sm font-medium leading-5 [overflow-wrap:anywhere]',
          done && 'text-muted-foreground line-through',
        )}>
          {task.title}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleImportant?.(task.id, !task.important); }}
          // Shown on starred tasks; on the rest only on hover or focus.
          className={cn(
            '-m-1 shrink-0 rounded-full p-1 transition-[opacity,color]',
            task.important ? 'text-[hsl(var(--tertiary))]'
              : 'text-muted-foreground opacity-0 hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-60 group-focus-visible:opacity-60',
          )}
          aria-label={task.important ? 'Remove from Important' : 'Mark important'}
        >
          <Star className={cn('size-4', task.important && 'fill-current')} />
        </button>
      </div>

      {blocked && task.blocked_by_task_title && (
        <p className="flex items-start gap-1.5 rounded-[10px] bg-[hsl(var(--error-container)/0.7)] px-2 py-1.5 text-xs leading-4 text-[hsl(var(--on-error-container))]">
          <Ban className="mt-px size-3.5 shrink-0 text-destructive" />
          <span className="min-w-0 [overflow-wrap:anywhere]">Waiting on <strong className="font-semibold">{task.blocked_by_task_title}</strong></span>
        </p>
      )}

      {hasBadges && (
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
        {task.parent_task_id != null && task.parent_task_title && (
          <span className={cn(mark, 'min-w-0 max-w-36 shrink')} title={`Subtask of ${task.parent_task_title}`}>
            <CornerDownRight className="size-3.5 shrink-0" /><span className="truncate">{task.parent_task_title}</span>
          </span>
        )}
        {task.due_date ? (
          <span className={cn(pill, overdue ? 'bg-[hsl(var(--error-container))] text-[hsl(var(--on-error-container))]'
            : dueToday ? 'bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))]' : neutral)}>
            {dueToday ? 'Today' : format(parseISO(task.due_date), 'MMM d')}
          </span>
        ) : task.week_of ? (
          <span className={cn(pill, neutral)}>Wk {format(parseISO(task.week_of), 'MMM d')}</span>
        ) : task.month_of ? (
          <span className={cn(pill, neutral)}>{format(parseISO(task.month_of), 'MMMM')}</span>
        ) : null}
        {repeats(task.recurrence) && <span className={mark} title="Repeats"><Repeat className="size-3.5" /></span>}
        {steps > 0 && <span className={mark} title="Steps"><ListChecks className="size-3.5" />{stepsDone}/{steps}</span>}
        {subs > 0 && <span className={mark} title="Subtasks"><CornerDownRight className="size-3.5" />{task.subtasks_done ?? 0}/{subs}</span>}
        {reminder && <span className={mark} title="Reminder set"><Bell className="size-3.5" /></span>}
        {hasNotes && <span className={mark} title="Has notes"><AlignLeft className="size-3.5" /></span>}
        {images > 0 && <span className={mark} title={`${images} image${images === 1 ? '' : 's'}`}><ImageIcon className="size-3.5" />{images}</span>}
      </div>
      )}
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

