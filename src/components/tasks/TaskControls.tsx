import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Task } from '@/types';
import { Check, RotateCcw } from '@/components/ui/icons';
import { FlowFill } from '@/components/ui/flow-fill';
import { PRIORITIES, PRIORITY_HUE, PRIORITY_LABEL, STATUS_TONE, doneColors, maxColors, maxGradient } from './look';
import { cn } from '@/lib/utils';

// The task dialog's controls, as on the phone (Android TaskControls.kt) but
// with buttons for the mouse: the status row, the priority slider and Mark
// done.

const ROW: Array<'todo' | 'in_progress' | 'blocked'> = ['todo', 'in_progress', 'blocked'];
const ROW_LABEL = { todo: 'To do', in_progress: 'In progress', blocked: 'Blocked' } as const;

/** To do | In progress | Blocked as one connected row, the pick in its calm tone. Done comes from Mark done. */
export function StatusRow({ status, onChange }: { status: Task['status']; onChange: (s: Task['status']) => void }) {
  return (
    <div role="radiogroup" aria-label="Status" className="flex gap-[3px]">
      {ROW.map((s, i) => {
        const on = status === s;
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(s)}
            className={cn(
              'h-11 flex-1 text-sm transition-[background-color,color,border-radius] duration-200',
              on
                ? 'rounded-full font-semibold'
                : cn(
                    'bg-[hsl(var(--surface-container-highest))] text-foreground/85 hover:brightness-110',
                    i === 0
                      ? 'rounded-l-full rounded-r-[10px]'
                      : i === ROW.length - 1
                        ? 'rounded-l-[10px] rounded-r-full'
                        : 'rounded-[10px]',
                  ),
            )}
            style={on ? { background: STATUS_TONE[s].bg, color: STATUS_TONE[s].fg } : undefined}
          >
            {ROW_LABEL[s]}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Priority as a pill slider: the level's name above, a white thumb on four
 * stops, the fill in the level's colour (Max: its flowing wave). Click or
 * drag anywhere on the track; arrow keys step.
 */
export function PrioritySlider({
  priority,
  onChange,
}: {
  priority: Task['priority'];
  onChange: (p: Task['priority']) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const level = Math.max(0, PRIORITIES.indexOf(priority));
  const max = priority === 'max';
  const pick = (clientX: number) => {
    const el = track.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const inner = r.width - 12 - 40;
    const x = clientX - r.left - 6 - 20;
    const next = Math.min(3, Math.max(0, Math.round((x / inner) * 3)));
    if (PRIORITIES[next] !== priority) onChange(PRIORITIES[next]);
  };
  // The thumb's left edge and the fill's width, as shares of the free run.
  const at = `calc(6px + (100% - 52px) * ${level / 3})`;
  return (
    <div className="flex flex-col items-center gap-2">
      <span
        className="text-sm font-semibold"
        style={
          max
            ? {
                backgroundImage: maxGradient(),
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }
            : { color: priority === 'low' ? 'hsl(var(--foreground))' : PRIORITY_HUE[priority] }
        }
      >
        {PRIORITY_LABEL[priority]}
      </span>
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="Priority"
        aria-valuemin={0}
        aria-valuemax={3}
        aria-valuenow={level}
        aria-valuetext={PRIORITY_LABEL[priority]}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pick(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e.clientX);
        }}
        onKeyDown={(e) => {
          const step =
            e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
          if (!step) return;
          e.preventDefault();
          const next = Math.min(3, Math.max(0, level + step));
          if (next !== level) onChange(PRIORITIES[next]);
        }}
        className="relative h-[52px] w-full cursor-pointer touch-none rounded-full bg-[hsl(var(--surface-container-highest))] outline-none select-none focus-visible:shadow-[0_0_0_2px_hsl(var(--primary))]"
      >
        {level > 0 && (
          <motion.div
            className="absolute top-[6px] bottom-[6px] left-[6px] overflow-hidden rounded-full"
            initial={false}
            animate={{ width: `calc(40px + (100% - 52px) * ${level / 3})` }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            // Max's wave draws a frame after it mounts: its ember sits under the
            // canvas meanwhile, so the fill never blinks empty on the way in.
            style={{ background: PRIORITY_HUE[priority] }}
          >
            {/* Mounted from High up, so sliding between High and Max never
                builds a new canvas; it fades in and drifts only at Max. */}
            {level >= 2 && (
              <FlowFill
                colors={maxColors()}
                running={max}
                className={cn('transition-opacity duration-300', max ? 'opacity-100' : 'opacity-0')}
              />
            )}
          </motion.div>
        )}
        {[1, 2, 3].map((i) =>
          i > level ? (
            <span
              key={i}
              aria-hidden
              className="absolute top-1/2 size-2 -translate-y-1/2 rounded-full bg-[hsl(var(--on-surface-variant)/0.5)]"
              style={{ left: `calc(22px + (100% - 52px) * ${i / 3})` }}
            />
          ) : null,
        )}
        <motion.span
          aria-hidden
          className="absolute top-[6px] size-10 rounded-full bg-white shadow-sm"
          initial={false}
          animate={{ left: at }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        />
      </div>
    </div>
  );
}

/**
 * Mark done: a sage button. With open steps or subtasks it refuses and says
 * why. Clicked, the sage wave runs through it with "Done" for a beat, then
 * [onDone] saves and closes.
 */
export function MarkDone({ refusal, onDone }: { refusal: string | null; onDone: () => void }) {
  const [playing, setPlaying] = useState(false);
  const [shake, setShake] = useState(0);
  const [said, setSaid] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <motion.button
        type="button"
        key={shake}
        animate={shake ? { x: [0, -6, 6, -4, 4, 0] } : undefined}
        transition={{ duration: 0.32 }}
        aria-disabled={!!refusal}
        title={refusal ?? 'Mark done'}
        onClick={() => {
          if (playing) return;
          if (refusal) {
            setShake((n) => n + 1);
            setSaid(true);
            return;
          }
          setPlaying(true);
          window.setTimeout(onDone, 700);
        }}
        className={cn(
          'relative inline-flex h-11 shrink-0 items-center gap-2 overflow-hidden rounded-full px-5 text-sm font-semibold transition-[filter,opacity]',
          playing ? 'text-white' : 'bg-[var(--task-sage-c)] text-[var(--task-sage-on)] hover:brightness-110',
          refusal && 'opacity-60',
        )}
      >
        {playing && <FlowFill colors={doneColors()} />}
        <Check className="relative size-4" strokeWidth={3} />
        <span className="relative">{playing ? 'Done' : 'Mark done'}</span>
      </motion.button>
      <AnimatePresence>
        {refusal && said && (
          <motion.span
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="truncate text-xs text-[var(--task-sand)]"
          >
            {refusal}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

/** A done task's foot: it says so, and Reopen puts it back to To do. */
export function DoneFoot({ onReopen }: { onReopen: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--task-sage-c)] px-5 text-sm font-semibold text-[var(--task-sage-on)]">
        <Check className="size-4" strokeWidth={3} /> Done
      </span>
      <button
        type="button"
        onClick={onReopen}
        className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <RotateCcw className="size-4" /> Reopen
      </button>
    </div>
  );
}
